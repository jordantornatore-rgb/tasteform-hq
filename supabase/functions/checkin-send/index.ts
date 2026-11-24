// checkin-send (24 Nov 2026): sends a client their check-in reply page link once Jordan has pasted the Loom.
// Called by the checkin_replies_send trigger (pg_net, x-pipeline-key = bundle_social_api_key from the Vault).
// Finds the client in GHL by email (creates the contact if missing), sends a plain-text email from Jordan and,
// when GHL has a mobile for them, an SMS. Writes the outcome back to checkin_replies (sent_at, send_result).
import { createClient } from "jsr:@supabase/supabase-js@2";
const GHL = "https://services.leadconnectorhq.com";
const LOC = "eeJATFo8DFPd1KxRMuDw";
const PAGE = "https://jordantornatore-rgb.github.io/tasteform-hq/r.html?k=";
const FROM_EMAIL = "jordan@tasteform.com.au";
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: key } = await admin.rpc("bundle_api_key");
  if (!key || req.headers.get("x-pipeline-key") !== key) return json({ error: "unauthorised" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { data: row } = await admin.from("checkin_replies").select("*").eq("id", String(body.id || "")).maybeSingle();
  if (!row) return json({ error: "no such reply" }, 404);
  if (!row.loom_url) return json({ error: "no loom yet" }, 409);
  if (row.sent_at && !body.force) return json({ ok: true, already: row.sent_at });
  const { data: tok } = await admin.rpc("ghl_write_secret");
  if (!tok) return json({ error: "ghl key missing" }, 500);
  const H = (v: string) => ({ Authorization: `Bearer ${tok}`, Version: v, Accept: "application/json", "Content-Type": "application/json" });
  const result: Record<string, unknown> = { at: new Date().toISOString() };
  const save = async (extra: Record<string, unknown>) => { await admin.from("checkin_replies").update({ send_result: { ...result, ...extra }, ...(extra.sentOk ? { sent_at: new Date().toISOString(), status: "sent" } : { status: "send_failed" }) }).eq("id", row.id); };

  // client email: the row, else the 1FIT roster (challenge_members)
  let email = row.client_email as string | null;
  if (!email && row.member_id) { const { data: m } = await admin.from("challenge_members").select("data").eq("id", row.member_id).maybeSingle(); email = m?.data?.email || null; }
  if (!email) { result.error = "no email for client"; await save({}); return json({ error: "no email" }, 422); }

  // GHL contact by email (create if missing)
  const u = new URL(GHL + "/contacts/search/duplicate"); u.searchParams.set("locationId", LOC); u.searchParams.set("email", email);
  let contact: any = null;
  { const r = await fetch(u, { headers: H("2021-07-28") }); const j = await r.json().catch(() => ({})); contact = r.ok && j.contact ? j.contact : null; }
  if (!contact) {
    const [first, ...rest] = String(row.client_name || "").split(" ");
    const r = await fetch(GHL + "/contacts/upsert", { method: "POST", headers: H("2021-07-28"), body: JSON.stringify({ locationId: LOC, email, firstName: first, lastName: rest.join(" ") || undefined, tags: ["client - active"] }) });
    const j = await r.json().catch(() => ({})); contact = j.contact || null;
    if (!contact) { result.error = "couldn't find or create GHL contact"; await save({}); return json({ error: "contact" }, 502); }
  }
  const first = String(row.client_name || "").split(" ")[0] || "mate";
  const link = PAGE + row.id;
  const text = `Hey ${first},\n\nHere's your check-in reply: ${link}\n\nWatch the video first. Underneath you can rate it, ask me anything, or book a 1:1 if you want extra support.\n\nJordan`;
  const html = text.split("\n").map((l) => l ? `<p style="margin:0 0 12px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(link, `<a href="${link}">${link}</a>`)}</p>` : "").join("");

  const send = async (msg: Record<string, unknown>) => { const r = await fetch(GHL + "/conversations/messages", { method: "POST", headers: H("2021-04-15"), body: JSON.stringify(msg) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, id: j.messageId || j.emailMessageId || null, err: r.ok ? null : (j.message || JSON.stringify(j).slice(0, 200)) }; };
  result.email = await send({ type: "Email", contactId: contact.id, subject: "your check-in reply", html, message: text, emailFrom: FROM_EMAIL, emailTo: email });
  if (contact.phone && !contact.dnd) {
    result.sms = await send({ type: "SMS", contactId: contact.id, message: `Hey ${first}, your check-in reply is ready. I've emailed it to you, check your inbox (or junk) 👊` });
  } else result.sms = { ok: false, skipped: contact.phone ? "dnd" : "no mobile in GHL" };
  const sentOk = !!((result.email as any)?.ok || (result.sms as any)?.ok);
  await save({ sentOk });
  return json({ ok: sentOk, ...result }, sentOk ? 200 : 502);
});
