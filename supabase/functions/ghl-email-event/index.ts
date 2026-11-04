// TasteForm HQ — receives GoHighLevel workflow webhooks for the email sequences.
// GHL posts here from a "Webhook" action placed after each email (event=sent), and from
// separate workflows triggered by "Email Events: Opened" and "Customer Replied" (event=opened /
// replied). Each webhook carries Custom Data: event, step (an email_steps id) and key.
// The key must match the GHL_WEBHOOK_KEY function secret; without it every call is refused.
// Writes one email_events row per contact + step + event (re-opens only bump count/lastAt),
// so every number on the Email tab is a count of real rows.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const EVENTS = new Set(["enrolled", "sent", "opened", "clicked", "replied", "bounced", "unsubscribed"]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
// deno-lint-ignore no-explicit-any
function pick(o: any, ...keys: string[]): string {
  for (const k of keys) { const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o); if (v != null && v !== "") return String(v); }
  return "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const want = (Deno.env.get("GHL_WEBHOOK_KEY") || "").trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!want) return json(503, { error: "GHL_WEBHOOK_KEY is not set" });
  const url = new URL(req.url);
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "JSON body required" }); }
  const cd = body.customData || body.custom_data || {};
  const key = String(url.searchParams.get("key") || cd.key || "").trim();
  if (key !== want) return json(401, { error: "bad key" });

  const event = (cd.event || url.searchParams.get("event") || "").toLowerCase();
  const step = cd.step || url.searchParams.get("step") || "";
  const contactId = pick(body, "contact_id", "contactId", "contact.id", "id");
  if (!EVENTS.has(event) || !step || !contactId) return json(400, { error: "need event, step and contact id", event, step, contactId });

  const now = new Date().toISOString();
  const tags = Array.isArray(body.tags) ? body.tags : String(body.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
  const id = `${contactId}:${step}:${event}`;
  const cur = await sb.from("email_events").select("data").eq("id", id).maybeSingle();
  const prev = cur.data?.data || null;
  const data = prev
    ? { ...prev, count: (prev.count || 1) + 1, lastAt: now, tags: tags.length ? tags : prev.tags }
    : {
        contactId, step, event, at: now, lastAt: now, count: 1, tags,
        firstName: pick(body, "first_name", "firstName", "contact.first_name"),
        country: pick(body, "country", "contact.country"),
        workflow: pick(body, "workflow.name", "workflow.id"),
      };
  const up = await sb.from("email_events").upsert({ id, data, updated_at: now });
  if (up.error) return json(500, { error: up.error.message });
  await sb.from("meta").upsert({ id: "emailSync", data: { connected: true, lastEventAt: now, lastEvent: event, fromAddress: "jordan@tasteform.com.au" }, updated_at: now });
  return json(200, { ok: true, id });
});
