// TasteForm HQ — every GoHighLevel lead, one row each, for the admin-only Lead list. Runs hourly from pg_cron.
// READ ONLY: GET requests to GHL only. Never creates, moves, tags or deletes anything in GHL.
// Token: Supabase Vault `ghl_readonly_token`, read through public.ghl_secret() (service role only).
// Writes public.hq_leads (admin-only RLS: names, emails and numbers live here) and meta/ghlLeads (counts only).
// Per lead: contact details, tags, the funnel they first applied through, applications, sales calls,
// pipeline stage, last message in/out, nurture (tag or pipeline named "nurture"), and country from the number.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://services.leadconnectorhq.com";
const LOCATION = "eeJATFo8DFPd1KxRMuDw";
const BUDGET_MS = 130000; // stop paging before the 150 s edge limit
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ms = (s: unknown) => { if (typeof s === "number") return s; const t = Date.parse(String(s || "")); return isNaN(t) ? null : t; };
const iso = (t: number | null) => (t == null ? null : new Date(t).toISOString());

// deno-lint-ignore no-explicit-any
async function get(tok: string, path: string, params: Record<string, string | number>, version = "2021-07-28"): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(API + path + "?" + qs, { method: "GET", headers: { Authorization: "Bearer " + tok, Version: version, Accept: "application/json" } });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); continue; }
    if (!r.ok) { const e = new Error(`GHL ${path} -> ${r.status}: ${(await r.text()).slice(0, 160)}`); (e as Error & { status?: number }).status = r.status; throw e; }
    return await r.json();
  }
  throw new Error(`GHL ${path} -> rate limited`);
}

// Keep in step with HQ.funnelOf in hq-core.js and ghl-sync
function funnelOf(utm: Record<string, string> | null, source?: string | null): string {
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
const normEmail = (e: unknown) => { const v = String(e || "").trim().toLowerCase(); return v.includes("@") ? v : null; };
const normPhone = (p: unknown) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-9) : null; };

type App = { at: string; funnel: string; from: string; keys: string[] };
async function applications(): Promise<Map<string, App[]>> {
  const all: App[] = [];
  // deno-lint-ignore no-explicit-any
  const page = async (table: string): Promise<any[]> => {
    // deno-lint-ignore no-explicit-any
    let out: any[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const r = await sb.from(table).select("data").range(from, from + 999);
      if (r.error) throw new Error(table + ": " + r.error.message);
      out = out.concat(r.data || []); if ((r.data || []).length < 1000) break;
    }
    return out;
  };
  for (const r of await page("app_sessions")) {
    const d = r.data || {}; if (!d.submitted) continue; const ct = d.contact || {};
    all.push({ at: String(d.submittedAt || d.firstSeenAt || ""), funnel: funnelOf(d.utm), from: "apply", keys: [normEmail(ct.email), normPhone(ct.phoneE164 || ct.phone)].filter(Boolean) as string[] });
  }
  for (const r of await page("tf_responses")) {
    const d = r.data || {};
    all.push({ at: String(d.submittedAt || ""), funnel: funnelOf(d.utm, d.source), from: "typeform", keys: [normEmail(d.email), normPhone(d.phone)].filter(Boolean) as string[] });
  }
  all.sort((a, b) => a.at.localeCompare(b.at));
  const map = new Map<string, App[]>();
  for (const a of all) { if (a.funnel === "test") continue; for (const k of a.keys) { const l = map.get(k) || []; l.push(a); map.set(k, l); } }
  return map;
}

const CLOSED = (name: string) => /(closed|won)/i.test(name) && !/(not closed|lost)/i.test(name);

async function run() {
  const t0 = Date.now(), startedAt = new Date(t0).toISOString();
  const { data: tok, error } = await sb.rpc("ghl_secret");
  if (error) throw new Error("ghl_secret() failed: " + error.message);
  if (!tok) { await sb.from("meta").upsert({ id: "ghlLeads", data: { connected: false, ok: true, lastAttemptAt: startedAt }, updated_at: startedAt }); return { ok: true, connected: false }; }
  const partial: string[] = [];
  const apps = await applications();

  // --- contacts (everyone in GHL)
  // deno-lint-ignore no-explicit-any
  let contacts: any[] = [], after: Record<string, string> = {}, contactsComplete = false;
  for (let p = 0; p < 500; p++) {
    if (Date.now() - t0 > BUDGET_MS * 0.5) { partial.push("contacts"); break; }
    const r = await get(tok, "/contacts/", { locationId: LOCATION, limit: 100, ...after });
    const l = r.contacts || []; contacts = contacts.concat(l);
    if (!l.length || !r.meta?.startAfterId) { contactsComplete = true; break; }
    after = { startAfter: String(r.meta.startAfter), startAfterId: String(r.meta.startAfterId) };
  }

  // --- pipelines + opportunities
  // deno-lint-ignore no-explicit-any
  const pipes: any[] = (await get(tok, "/opportunities/pipelines", { locationId: LOCATION })).pipelines || [];
  const stageName: Record<string, string> = {}, pipeName: Record<string, string> = {};
  for (const p of pipes) { pipeName[p.id] = p.name; for (const s of p.stages || []) stageName[s.id] = s.name; }
  // deno-lint-ignore no-explicit-any
  const oppsBy = new Map<string, any[]>(); let oa: Record<string, string> = {};
  for (let p = 0; p < 300; p++) {
    const r = await get(tok, "/opportunities/search", { location_id: LOCATION, limit: 100, ...oa });
    const l = r.opportunities || [];
    for (const o of l) if (o.contactId) { const x = oppsBy.get(o.contactId) || []; x.push(o); oppsBy.set(o.contactId, x); }
    if (!l.length || !r.meta?.startAfterId) break;
    oa = { startAfter: String(r.meta.startAfter), startAfterId: String(r.meta.startAfterId) };
  }

  // --- sales calls (calendars named "consult"), last ~13 months + next 30 days
  const now = Date.now();
  // deno-lint-ignore no-explicit-any
  const cals: any[] = (await get(tok, "/calendars/", { locationId: LOCATION })).calendars || [];
  // deno-lint-ignore no-explicit-any
  const callsBy = new Map<string, any[]>();
  for (const c of cals.filter((c) => /consult/i.test(c.name || ""))) {
    for (let s = now - 390 * 86400000; s < now + 30 * 86400000; s += 90 * 86400000) {
      const e = Math.min(s + 90 * 86400000, now + 30 * 86400000);
      // deno-lint-ignore no-explicit-any
      const evs: any[] = (await get(tok, "/calendars/events", { locationId: LOCATION, calendarId: c.id, startTime: s, endTime: e }, "2021-04-15")).events || [];
      for (const x of evs) {
        const start = ms(x.startTime); if (x.deleted || !x.contactId || start == null || start < s || start >= e) continue;
        const l = callsBy.get(x.contactId) || [];
        l.push({ start: iso(start), booked: iso(ms(x.dateAdded)), status: String(x.appointmentStatus || "").toLowerCase() || null, calendar: String(c.name || "").trim() });
        callsBy.set(x.contactId, l);
      }
    }
  }

  // --- conversations: the latest message each way (needs conversations.readonly on the token)
  // deno-lint-ignore no-explicit-any
  const convBy = new Map<string, any>(); let convOk = true, before: Record<string, string | number> = {};
  try {
    for (let p = 0; p < 300; p++) {
      if (Date.now() - t0 > BUDGET_MS) { partial.push("conversations"); break; }
      const r = await get(tok, "/conversations/search", { locationId: LOCATION, limit: 100, sort: "desc", sortBy: "last_message_date", ...before }, "2021-04-15");
      const l = r.conversations || [];
      for (const c of l) {
        if (!c.contactId) continue;
        const cur = convBy.get(c.contactId) || { lastAt: null, lastDir: null, lastType: null, unread: 0, channels: [] as string[] };
        const at = ms(c.lastMessageDate);
        if (at != null && (cur.lastAt == null || at > ms(cur.lastAt)!)) { cur.lastAt = iso(at); cur.lastDir = c.lastMessageDirection || null; cur.lastType = c.lastMessageType || null; }
        cur.unread += +c.unreadCount || 0;
        if (c.type && !cur.channels.includes(c.type)) cur.channels.push(c.type);
        convBy.set(c.contactId, cur);
      }
      const last = l[l.length - 1];
      const next = last && (Array.isArray(last.sort) ? last.sort[0] : last.lastMessageDate);
      if (l.length < 100 || next == null) break;
      before = { startAfterDate: next };
    }
  } catch (e) {
    if ((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403) convOk = false; else throw e;
  }

  // --- one row per contact
  const rows = contacts.map((c) => {
    const email = normEmail(c.email), phone = c.phone ? String(c.phone) : null;
    const keys = [email, normPhone(phone)].filter(Boolean) as string[];
    const seen = new Set<App>(); const myApps: App[] = [];
    for (const k of keys) for (const a of apps.get(k) || []) if (!seen.has(a)) { seen.add(a); myApps.push(a); }
    myApps.sort((a, b) => a.at.localeCompare(b.at));
    const opps = (oppsBy.get(c.id) || []).map((o) => ({ pipeline: pipeName[o.pipelineId] || null, stage: stageName[o.pipelineStageId] || null, status: o.status || null, created: iso(ms(o.createdAt)), moved: iso(ms(o.lastStageChangeAt) ?? ms(o.lastStatusChangeAt)), value: +o.monetaryValue || null }));
    const sales = opps.filter((o) => !/cookbook/i.test(o.pipeline || ""));
    const won = sales.some((o) => o.status === "won" || CLOSED(o.stage || ""));
    const lost = !won && sales.length > 0 && sales.every((o) => o.status === "lost" || o.status === "abandoned" || /lost|not closed|disqualif|not a fit/i.test(o.stage || ""));
    const tags: string[] = Array.isArray(c.tags) ? c.tags.map(String) : [];
    const nurture = tags.some((t) => /nu(r)?tur/i.test(t)) || opps.some((o) => /nu(r)?tur/i.test((o.pipeline || "") + " " + (o.stage || "")));
    let funnel = myApps.length ? myApps[0].funnel : null;
    if (!funnel) { const p = sales.map((o) => o.pipeline || "").join(" "); funnel = /ad form|paid lead/i.test(p) ? "paid_direct" : (/instagram/i.test(p) ? "dm_outreach" : "unknown"); }
    const calls = (callsBy.get(c.id) || []).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    return {
      id: c.id,
      data: {
        name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
        email: c.email || null, phone, tags, source: c.source || null,
        added: iso(ms(c.dateAdded)), lastActivity: iso(ms(c.lastActivity)),
        utm: c.attributionSource ? { medium: c.attributionSource.utmMedium || null, source: c.attributionSource.utmSource || null, campaign: c.attributionSource.campaign || c.attributionSource.utmCampaign || null } : null,
        funnel, applications: myApps.map((a) => ({ at: a.at, funnel: a.funnel, from: a.from })),
        opps, calls, conv: convBy.get(c.id) || null,
        status: won ? "client" : (lost ? "lost" : "open"), nurture, convOk
      },
      synced_at: startedAt
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const r = await sb.from("hq_leads").upsert(rows.slice(i, i + 500));
    if (r.error) throw new Error("hq_leads: " + r.error.message);
  }
  // contacts deleted in GHL drop out, but only after a full read
  if (contactsComplete) await sb.from("hq_leads").delete().lt("synced_at", startedAt);

  await sb.from("meta").upsert({ id: "ghlLeads", data: { connected: true, ok: true, lastSyncAt: new Date().toISOString(), contacts: rows.length, complete: contactsComplete, partial, conversations: convOk, seconds: Math.round((Date.now() - t0) / 1000) }, updated_at: new Date().toISOString() });
  return { ok: true, contacts: rows.length, complete: contactsComplete, conversations: convOk, partial };
}

Deno.serve(async () => {
  try { return Response.json(await run()); }
  catch (e) {
    const msg = String((e as Error)?.message || e);
    const cur = await sb.from("meta").select("data").eq("id", "ghlLeads").maybeSingle();
    await sb.from("meta").upsert({ id: "ghlLeads", data: { ...(cur.data?.data || {}), ok: false, error: msg, lastAttemptAt: new Date().toISOString() }, updated_at: new Date().toISOString() });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
