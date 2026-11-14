// Instant lead text for Typeform (barbershop QR) applications (14 Nov 2026, Jordan: "all leads that apply, instantly").
// Typeform posts here the moment a form is submitted. Nothing in the post is trusted: the response is re-read from the
// Typeform API with HQ's own token (tf_secret) by its token, and only a real, submitted response is texted.
// Setup mode (x-pipeline-key required): { setup: true } registers this URL as a webhook on every Typeform form with traffic.
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://api.typeform.com";
const SELF = "https://hucqdrekawzsrbbkczgj.supabase.co/functions/v1/typeform-hook";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
const val = (a: any) => a.type === "choice" ? (a.choice?.label ?? a.choice?.other ?? null) : a.type === "choices" ? (a.choices?.labels || []).join(", ") : (a[a.type] ?? null);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const { data: tok } = await sb.rpc("tf_secret");
  if (!tok) return json({ error: "typeform token missing" }, 500);
  const TF = (path: string, init: RequestInit = {}) => fetch(API + path, { ...init, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", ...(init.headers || {}) } });
  // deno-lint-ignore no-explicit-any
  let body: any = {}; try { body = await req.json(); } catch { /* ignore */ }

  if (body.setup) {
    const { data: key } = await sb.rpc("bundle_api_key");
    if (!key || req.headers.get("x-pipeline-key") !== key) return json({ error: "unauthorised" }, 401);
    const forms = ((await (await TF("/forms?page_size=200")).json()).items || []);
    const out = [];
    for (const f of forms) {
      const r = await TF(`/forms/${f.id}/webhooks/hq-instant`, { method: "PUT", body: JSON.stringify({ url: SELF, enabled: true, verify_ssl: true }) });
      out.push({ form: f.title, status: r.status, ok: r.ok, error: r.ok ? null : (await r.text()).slice(0, 160) });
    }
    return json({ ok: true, webhooks: out });
  }

  const fr = body.form_response; if (!fr || !fr.token || !fr.form_id) return json({ ok: true, ignored: true });
  // re-read the response from Typeform itself (the post is never trusted)
  const r = await TF(`/forms/${fr.form_id}/responses?included_response_ids=${encodeURIComponent(fr.token)}&page_size=1`);
  const it = r.ok ? ((await r.json()).items || [])[0] : null;
  if (!it || !it.submitted_at) return json({ ok: true, ignored: "not a submitted response" });
  const def = await (await TF(`/forms/${fr.form_id}`)).json().catch(() => ({}));
  // deno-lint-ignore no-explicit-any
  const fields: Record<string, any> = {}; const walk = (fs: any[] = []) => fs.forEach((x) => { fields[x.ref] = x; fields[x.id] = x; walk(x.properties?.fields); }); walk(def.fields);
  const c: Record<string, unknown> = {}, rest: string[] = [];
  for (const a of it.answers || []) {
    const t = String((fields[a.field?.ref] || fields[a.field?.id] || {}).title || "").trim(), v = val(a), tl = t.toLowerCase();
    if (a.type === "email") c.email = v; else if (a.type === "phone_number") c.phone = v;
    else if (tl === "first name") c.first = v; else if (tl === "last name") c.last = v;
    else if (v != null && rest.length < 4) rest.push(String(v).slice(0, 90));
  }
  const msg = ["HQ NEW LEAD (" + (def.title || "Typeform") + "): " + ([c.first, c.last].filter(Boolean).join(" ") || "(no name)"), c.phone || "no number", c.email || null, ...rest].filter(Boolean).join(" · ") + ". Call within the hour.";
  const { data: key } = await sb.rpc("bundle_api_key");
  const s = await fetch("https://hucqdrekawzsrbbkczgj.supabase.co/functions/v1/hq-notify", { method: "POST", headers: { "Content-Type": "application/json", "x-pipeline-key": key }, body: JSON.stringify({ kind: "sms", text: msg.slice(0, 600) }) });
  return json({ ok: s.ok });
});
