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
//   byFunnel = the same call / close counts split by the funnel the person first applied through
//              (apply page + Typeform tags, matched on email or phone here, so no contact details leave this function)
//   paidLeads = new opportunities in the ad pipelines (instant-form leads)
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

// Keep in step with HQ.funnelOf in hq-core.js
export function funnelOf(utm: Record<string, string> | null, source?: string | null): string {
  const u = utm || {};
  const m = String(u.utm_medium || "").toLowerCase(), s = String(u.utm_source || "").toLowerCase();
  const c = String(u.utm_content || source || "").toLowerCase(), camp = String(u.utm_campaign || "").toLowerCase();
  if (/test/.test(c)) return "test";
  if (m === "story") return "story";
  if (m === "bio" || c === "link_in_bio") return "bio";
  if (/^(paid|ads?|cpc|paid_social)$/.test(m) || /^(fb|facebook|meta)(_?ads?)?$/.test(s)) return /(vsl|training|email|youtube|compounding|indirect)/.test(camp + " " + c) ? "paid_indirect" : "paid_direct";
  if (/^(offline|qr|poster|referral|affiliate|collab|email|partner)$/.test(m)) return "offplatform";
  return "unknown";
}
// Typeform is only used at the barbershop since 12 Nov 2026: untagged Typeform from then on = off-platform (same as HQ.typeformFunnel)
const typeformFunnel = (utm: Record<string, string> | null, source: string | null | undefined, at: string) => { const f = funnelOf(utm, source); return f === "unknown" && at >= "2026-11-12" ? "offplatform" : f; };
const normEmail = (e: unknown) => { const v = String(e || "").trim().toLowerCase(); return v.includes("@") ? v : null; };
const normPhone = (p: unknown) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-9) : null; };

// email / phone -> funnel of their FIRST application (apply page or Typeform)
async function funnelMap(): Promise<Map<string, string>> {
  const firsts: { at: string; funnel: string; keys: string[] }[] = [];
  const page = async (table: string, cols: string) => {
    // deno-lint-ignore no-explicit-any
    let out: any[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const r = await sb.from(table).select(cols).range(from, from + 999);
      if (r.error) throw new Error(table + ": " + r.error.message);
      out = out.concat(r.data || []); if ((r.data || []).length < 1000) break;
    }
    return out;
  };
  for (const r of await page("app_sessions", "data")) {
    const d = r.data || {}; if (!d.submitted) continue;
    const ct = d.contact || {};
    firsts.push({ at: String(d.submittedAt || d.firstSeenAt || ""), funnel: funnelOf(d.utm), keys: [normEmail(ct.email), normPhone(ct.phoneE164 || ct.phone)].filter(Boolean) as string[] });
  }
  for (const r of await page("tf_responses", "data")) {
    const d = r.data || {};
    firsts.push({ at: String(d.submittedAt || ""), funnel: typeformFunnel(d.utm, d.source, String(d.submittedAt || "")), keys: [normEmail(d.email), normPhone(d.phone)].filter(Boolean) as string[] });
  }
  firsts.sort((a, b) => a.at.localeCompare(b.at));
  const map = new Map<string, string>();
  for (const f of firsts) { if (f.funnel === "test") continue; for (const k of f.keys) if (!map.has(k)) map.set(k, f.funnel); }
  return map;
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
  const d = (k: string) => days[k] || (days[k] = { booked: 0, held: 0, showed: 0, noShow: 0, unmarked: 0, closed: 0, closeDaysSum: 0, closeDaysN: 0, outreach: 0, replied: 0, paidLeads: 0, byFunnel: {} });
  const fd = (k: string, f: string) => { const x = d(k).byFunnel; return x[f] || (x[f] = { booked: 0, held: 0, showed: 0, noShow: 0, closed: 0 }); };
  const fmap = await funnelMap();
  // deno-lint-ignore no-explicit-any
  const contactCache = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  const contactOf = async (id: string): Promise<any> => {
    if (!id) return null; if (contactCache.has(id)) return contactCache.get(id);
    let c = null; try { c = (await get(tok, "/contacts/" + id, {})).contact || null; } catch { c = null; }
    contactCache.set(id, c); return c;
  };
  // pipeline each contact sits in (filled after the opportunities are read)
  const contactPipe = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  const funnelForContact = (c: any, contactId: string): string => {
    for (const k of [normEmail(c?.email), normPhone(c?.phone)]) if (k && fmap.has(k)) return fmap.get(k)!;
    const p = contactPipe.get(contactId) || "";
    if (/ad form|paid lead/i.test(p)) return "paid_direct";
    if (/instagram/i.test(p)) return "dm_outreach";
    return "unknown";
  };
  // deno-lint-ignore no-explicit-any
  const pendingEvents: any[] = [];

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
        pendingEvents.push({ contactId: x.contactId, added, start, st });
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
  for (const o of opps) if (o.contactId) { const p = pipeName[o.pipelineId] || ""; if (!contactPipe.has(o.contactId) || /ad form|paid lead/i.test(p)) contactPipe.set(o.contactId, p); }
  for (const o of opps) {
    const pname = pipeName[o.pipelineId] || "", sname = stageName[o.pipelineStageId] || "";
    const created = ms(o.createdAt), moved = ms(o.lastStageChangeAt) ?? ms(o.lastStatusChangeAt);
    if (!/cookbook/i.test(pname) && (CLOSED(sname) || o.status === "won") && moved != null) {
      const day = d(sydDay(moved)); day.closed++;
      fd(sydDay(moved), funnelForContact(o.contact || (await contactOf(o.contactId)), o.contactId)).closed++;
      if (created != null && moved >= created) { day.closeDaysSum += (moved - created) / 86400000; day.closeDaysN++; }
    }
    if (/ad form|paid lead/i.test(pname) && created != null) d(sydDay(created)).paidLeads++;
    if (igPipe && o.pipelineId === igPipe.id) {
      if (created != null) d(sydDay(created)).outreach++;
      if (o.pipelineStageId !== igOutreach && moved != null) d(sydDay(moved)).replied++;
    }
  }
  for (const e of pendingEvents) {
    const f = funnelForContact(await contactOf(e.contactId), e.contactId);
    if (e.added != null) fd(sydDay(e.added), f).booked++;
    if (e.st === "cancelled" || e.st === "invalid" || e.start > now) continue;
    const x = fd(sydDay(e.start), f); x.held++;
    if (e.st === "showed") x.showed++; else if (e.st === "noshow") x.noShow++;
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
