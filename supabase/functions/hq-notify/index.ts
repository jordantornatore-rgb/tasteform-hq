// HQ notifications: the morning digest (email) and alert texts (SMS) to Jordan, sent through GoHighLevel with the
// full-access key he saved in the Vault (ghl_api_full, read via ghl_write_secret(), service role only).
// Recipient + sending number live in hq_settings/notify (admin only). Callers are the Mac's scheduled tasks; they
// authenticate with the same x-pipeline-key as content-pipeline (bundle_social_api_key in the Vault).
// Body: { kind: "check" } | { kind: "email", subject, html, text? } | { kind: "sms", text }
import { createClient } from "jsr:@supabase/supabase-js@2";

const GHL = "https://services.leadconnectorhq.com";
const LOC = "eeJATFo8DFPd1KxRMuDw";
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: key } = await admin.rpc("bundle_api_key");
  if (!key || req.headers.get("x-pipeline-key") !== key) return json({ error: "unauthorised" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { data: tok, error: te } = await admin.rpc("ghl_write_secret");
  if (te || !tok) return json({ error: "ghl key missing" }, 500);
  const { data: cfgRow } = await admin.from("hq_settings").select("data").eq("id", "notify").maybeSingle();
  const cfg = (cfgRow && cfgRow.data) || {};
  if (!cfg.email || !cfg.phone) return json({ error: "hq_settings/notify not set" }, 500);
  const H = (v: string) => ({ Authorization: `Bearer ${tok}`, Version: v, Accept: "application/json", "Content-Type": "application/json" });

  // Jordan's own contact in GHL (found by email, else by phone). Never creates one in check mode.
  const find = async (q: Record<string, string>) => {
    const u = new URL(GHL + "/contacts/search/duplicate"); u.searchParams.set("locationId", LOC);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    const r = await fetch(u, { headers: H("2021-07-28") }); const j = await r.json().catch(() => ({}));
    return r.ok && j.contact ? j.contact : null;
  };
  let contact = await find({ email: cfg.email }) || await find({ number: cfg.phone });
  if (body.kind === "check") return json({ ok: true, contactFound: !!contact, hasPhone: !!(contact && contact.phone), hasEmail: !!(contact && contact.email), dnd: contact ? !!contact.dnd : null });
  if (!contact) {
    if (!body.createContact) return json({ error: "no GHL contact for Jordan; call again with createContact: true" }, 409);
    const r = await fetch(GHL + "/contacts/", { method: "POST", headers: H("2021-07-28"), body: JSON.stringify({ locationId: LOC, firstName: "Jordan", lastName: "(HQ)", email: cfg.email, phone: cfg.phone, tags: ["hq-owner"] }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) return json({ error: "create contact failed", status: r.status, detail: j }, 502);
    contact = j.contact;
  }
  let msg: Record<string, unknown>;
  if (body.kind === "sms") {
    const text = String(body.text || "").slice(0, 600); if (!text) return json({ error: "text required" }, 400);
    msg = { type: "SMS", contactId: contact.id, message: text, ...(cfg.fromNumber ? { fromNumber: cfg.fromNumber } : {}), toNumber: cfg.phone };
  } else if (body.kind === "email") {
    if (!body.subject || !body.html) return json({ error: "subject and html required" }, 400);
    msg = { type: "Email", contactId: contact.id, subject: String(body.subject).slice(0, 200), html: String(body.html), emailTo: cfg.email, ...(body.text ? { message: String(body.text) } : {}) };
  } else return json({ error: "kind must be check, email or sms" }, 400);
  const r = await fetch(GHL + "/conversations/messages", { method: "POST", headers: H("2021-04-15"), body: JSON.stringify(msg) });
  const j = await r.json().catch(() => ({}));
  // log (no message text), newest 30
  try {
    const { data: m } = await admin.from("meta").select("data").eq("id", "notifyLog").maybeSingle();
    const log = ((m && m.data && m.data.sends) || []).slice(-29);
    log.push({ at: new Date().toISOString(), kind: body.kind, ok: r.ok, status: r.status, subject: body.kind === "email" ? String(body.subject).slice(0, 80) : null });
    await admin.from("meta").upsert({ id: "notifyLog", data: { sends: log, lastAt: new Date().toISOString() } });
  } catch (_) { /* logging never blocks a send */ }
  if (!r.ok) return json({ error: "send failed", status: r.status, detail: j }, 502);
  return json({ ok: true, kind: body.kind, messageId: j.messageId || j.emailMessageId || null });
});
