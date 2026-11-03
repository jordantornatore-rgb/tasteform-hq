// Data door for the Mac Mini autopost pipeline (no Supabase MCP there). Authenticated by the bundle.social key,
// which the Mac holds in its Keychain and the database holds in the Vault (bundle_api_key()).
// Body: { op: "merge", table, rows:[{id,data}] } | { op: "select", table, ids?:[], since?, limit? } | { op: "get", table, id }
// merge goes through hq_merge, so only the fields sent are changed. Tables are limited to the content set.
// Deploy: supabase functions deploy content-pipeline   (verify_jwt stays on; the Mac sends the public anon key as the bearer)
import { createClient } from "jsr:@supabase/supabase-js@2";

const TABLES = ["content_queue", "content_ideas", "content_creators", "content_sounds", "meta", "ig_posts"];
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const given = req.headers.get("x-pipeline-key") || "";
  const { data: key } = await admin.rpc("bundle_api_key");
  if (!key || !given || !same(String(key), given)) return json(401, { error: "Not the pipeline." });

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const table = String(body.table || "");
  if (!TABLES.includes(table)) return json(400, { error: "Table not allowed: " + table });

  if (body.op === "merge") {
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows || !rows.length) return json(400, { error: "rows must be a non-empty array of {id, data}" });
    if (rows.length > 50) return json(400, { error: "at most 50 rows per call" });
    const { data, error } = await admin.rpc("hq_merge", { tbl: table, rows });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, merged: data });
  }
  if (body.op === "get") {
    const { data, error } = await admin.from(table).select("id,data,updated_at").eq("id", String(body.id || "")).maybeSingle();
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, row: data });
  }
  if (body.op === "select") {
    let q = admin.from(table).select("id,data,updated_at");
    if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.map(String));
    if (body.since) q = q.gte("updated_at", String(body.since));
    q = q.order("updated_at", { ascending: false }).limit(Math.min(2000, Number(body.limit) || 2000));
    const { data, error } = await q;
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, rows: data });
  }
  return json(400, { error: "op must be merge, get or select" });
});
