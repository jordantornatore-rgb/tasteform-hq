// Data door for the Mac Mini autopost pipeline (no Supabase MCP there). Authenticated by the bundle.social key,
// which the Mac holds in its Keychain and the database holds in the Vault (bundle_api_key()).
// Body: { op: "merge", table, rows:[{id,data}] } | { op: "select", table, ids?:[], since?, limit? } | { op: "get", table, id }
//     | { op: "previewUpload", path: "<rowId>/<file>.mp4|jpg" } -> a signed upload URL in the private content-previews bucket
//     | { op: "footageRemove", rowId, paths:[...] } -> deletes uploaded footage from content-footage once the Mac has its own copy
//       (Jordan, 10 Nov 2026). Only paths the row itself lists in an upload or batch that is already marked pulledAt.
// merge goes through hq_merge, so only the fields sent are changed. Tables are limited to the content set.
// Deploy: supabase functions deploy content-pipeline   (verify_jwt stays on; the Mac sends the public anon key as the bearer)
import { createClient } from "jsr:@supabase/supabase-js@2";

const TABLES = ["content_queue", "content_ideas", "content_creators", "content_sounds", "meta", "ig_posts"];
const READ_ONLY = ["ads_daily", "ads_campaigns"]; // ad-candidate cross-check; never written from the Mac
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
  if (body.op === "previewUpload") {
    const p = String(body.path || "");
    if (!/^[A-Za-z0-9_-]{3,120}\/[A-Za-z0-9._-]{1,120}\.(mp4|jpg)$/.test(p)) return json(400, { error: "path must be <rowId>/<file>.mp4|jpg" });
    const { data, error } = await admin.storage.from("content-previews").createSignedUploadUrl(p, { upsert: true });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, path: p, signedUrl: data.signedUrl, token: data.token });
  }
  if (body.op === "footageRemove") {
    const rowId = String(body.rowId || ""), paths = Array.isArray(body.paths) ? body.paths.map(String) : [];
    if (!/^[A-Za-z0-9_-]{3,120}$/.test(rowId) || !paths.length || paths.length > 200) return json(400, { error: "footageRemove needs rowId and 1-200 paths" });
    const { data: row, error: rerr } = await admin.from("content_queue").select("id,data").eq("id", rowId).maybeSingle();
    if (rerr) return json(500, { error: rerr.message });
    if (!row) return json(404, { error: "Post not found: " + rowId });
    const d = (row.data || {}) as Record<string, any>, pulled = new Set<string>();
    const add = (files: any[]) => (Array.isArray(files) ? files : []).forEach((f) => { if (f && f.path) pulled.add(String(f.path)); (Array.isArray(f && f.parts) ? f.parts : []).forEach((pt: any) => { if (pt && pt.path) pulled.add(String(pt.path)); }); });
    if (d.footageUpload && d.footageUpload.pulledAt) add(d.footageUpload.files);
    (Array.isArray(d.footageAdds) ? d.footageAdds : []).forEach((b: any) => { if (b && b.pulledAt) add(b.files); });
    const bad = paths.filter((p: string) => !p.startsWith(rowId + "/") || !pulled.has(p));
    if (bad.length) return json(403, { error: "Not pulled to the Mac yet (or not this reel's): " + bad.slice(0, 5).join(", ") });
    const { data, error } = await admin.storage.from("content-footage").remove(paths);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, removed: (data || []).map((o: any) => o.name) });
  }
  const table = String(body.table || "");
  if (!TABLES.includes(table) && !READ_ONLY.includes(table)) return json(400, { error: "Table not allowed: " + table });
  if (READ_ONLY.includes(table) && body.op === "merge") return json(403, { error: "Read-only table: " + table });

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
  return json(400, { error: "op must be merge, get, select, previewUpload or footageRemove" });
});
