// TasteForm HQ — GoHighLevel read-only pull. Runs hourly from pg_cron.
// READ ONLY: this file only issues GET requests to GHL. It never creates, moves or changes
// contacts, opportunities or appointments. The token lives in Supabase Vault (`ghl_readonly_token`)
// and is read through public.ghl_secret(), which only the service role may call.
// Writes meta/ghlSync: counts per Sydney day, no names, nothing estimated.
//   booked   = sales-call bookings made that day (calendar name contains "consult")
//   held     = sales calls that started that day and weren't cancelled
//   showed / noShow = calls marked that way in GHL; the rest of `held` is `unmarked`
//   closed   = opportunities moved into a Closed / Won stage that day (cookbook pipelines left out)
//   outreach = new opportunities in the Instagram Leads pipeline
//   replied  = Instagram Leads opportunities past "Outreach", dated by their last stage move
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://services.leadconnectorhq.com";
const LOCATION = "eeJATFo8DFPd1KxRMuDw";
const TZ = "Australia/Sydney";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const sydDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const ms = (s: unknown) => { const t = Date.parse(String(s || "")); return isNaN(t) ? null : t; };

// deno-lint-ignore no-explicit-any
async function get(tok: string, path: string, params: Record<string, string | number>, version = "2021-07-28"): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(API + path + "?" + qs, { method: "GET", headers: { Authorization: "Bearer " + tok, Version: version, Accept: "application/json" } });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`GHL ${path} -> ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return await r.json();
  }
  throw new Error(`GHL ${path} -> rate limited`);
}
async function writeMeta(data: Record<string, unknown>) {
  await sb.from("meta").upsert({ id: "ghlSync", data, updated_at: new Date().toISOString() });
}

const CLOSED = (name: string) => /(closed|won)/i.test(name) && !/(not closed|lost)/i.test(name);

async function run() {
  const startedAt = new Date().toISOString();
  const { data: tok, error } = await sb.rpc("ghl_secret");
  if (error) throw new Error("ghl_secret() failed: " + error.message);
  if (!tok) { await writeMeta({ connected: false, ok: true, lastAttemptAt: startedAt, note: "No ghl_readonly_token in Vault." }); return { ok: true, connected: false }; }

  const now = Date.now();
  // deno-lint-ignore no-explicit-any
  const days: Record<string, any> = {};
  const d = (k: string) => days[k] || (days[k] = { booked: 0, held: 0, showed: 0, noShow: 0, unmarked: 0, closed: 0, closeDaysSum: 0, closeDaysN: 0, outreach: 0, replied: 0 });

  // --- sales calls
  // deno-lint-ignore no-explicit-any
  const cals: any[] = (await get(tok, "/calendars/", { locationId: LOCATION })).calendars || [];
  const consult = cals.filter((c) => /consult/i.test(c.name || ""));
  let upcoming7 = 0;
  for (const c of consult) {
    // GHL caps the range per request, so walk it in 90-day steps (last ~13 months + next 30 days)
    for (let s = now - 390 * 86400000; s < now + 30 * 86400000; s += 90 * 86400000) {
      const e = Math.min(s + 90 * 86400000, now + 30 * 86400000);
      // deno-lint-ignore no-explicit-any
      const evs: any[] = (await get(tok, "/calendars/events", { locationId: LOCATION, calendarId: c.id, startTime: s, endTime: e }, "2021-04-15")).events || [];
      for (const x of evs) {
        if (x.deleted) continue;
        const st = String(x.appointmentStatus || "").toLowerCase();
        const start = ms(x.startTime), added = ms(x.dateAdded);
        if (start == null || start < s || start >= e) continue; // each event counted once
        if (added != null) d(sydDay(added)).booked++;
        if (st === "cancelled" || st === "invalid") continue;
        if (start > now) { if (start < now + 7 * 86400000) upcoming7++; continue; }
        const day = d(sydDay(start));
        day.held++;
        if (st === "showed") day.showed++; else if (st === "noshow") day.noShow++; else day.unmarked++;
      }
    }
  }

  // --- pipelines
  // deno-lint-ignore no-explicit-any
  const pipes: any[] = (await get(tok, "/opportunities/pipelines", { locationId: LOCATION })).pipelines || [];
  const stageName: Record<string, string> = {}, pipeName: Record<string, string> = {};
  for (const p of pipes) { pipeName[p.id] = p.name; for (const s of p.stages || []) stageName[s.id] = s.name; }
  const igPipe = pipes.find((p) => /instagram/i.test(p.name || ""));
  const igOutreach = igPipe ? (igPipe.stages || []).find((s: { name: string }) => /outreach/i.test(s.name))?.id : null;

  // deno-lint-ignore no-explicit-any
  let opps: any[] = [], after: Record<string, string> = {};
  for (let page = 0; page < 200; page++) {
    const r = await get(tok, "/opportunities/search", { location_id: LOCATION, limit: 100, ...after });
    const l = r.opportunities || []; opps = opps.concat(l);
    if (!l.length || !r.meta?.startAfterId) break;
    after = { startAfter: String(r.meta.startAfter), startAfterId: String(r.meta.startAfterId) };
  }
  for (const o of opps) {
    const pname = pipeName[o.pipelineId] || "", sname = stageName[o.pipelineStageId] || "";
    const created = ms(o.createdAt), moved = ms(o.lastStageChangeAt) ?? ms(o.lastStatusChangeAt);
    if (!/cookbook/i.test(pname) && (CLOSED(sname) || o.status === "won") && moved != null) {
      const day = d(sydDay(moved)); day.closed++;
      if (created != null && moved >= created) { day.closeDaysSum += (moved - created) / 86400000; day.closeDaysN++; }
    }
    if (igPipe && o.pipelineId === igPipe.id) {
      if (created != null) d(sydDay(created)).outreach++;
      if (o.pipelineStageId !== igOutreach && moved != null) d(sydDay(moved)).replied++;
    }
  }
  for (const k of Object.keys(days)) days[k].closeDaysSum = Math.round(days[k].closeDaysSum * 10) / 10;

  await writeMeta({
    connected: true, ok: true, lastSyncAt: new Date().toISOString(), locationId: LOCATION,
    salesCalendars: consult.map((c) => c.name.trim()), opportunities: opps.length, upcoming7, days,
    note: "Read-only. Sales calls = calendars named \"consult\". Show-ups only count when the call is marked Showed / No-show in GHL."
  });
  return { ok: true, connected: true, opportunities: opps.length, days: Object.keys(days).length };
}

Deno.serve(async () => {
  try { return Response.json(await run()); }
  catch (e) {
    const msg = String((e as Error)?.message || e);
    const cur = await sb.from("meta").select("data").eq("id", "ghlSync").maybeSingle();
    await writeMeta({ ...(cur.data?.data || {}), ok: false, error: msg, lastAttemptAt: new Date().toISOString() });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
