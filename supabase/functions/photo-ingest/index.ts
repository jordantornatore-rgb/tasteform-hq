// photo-ingest (26 Nov 2026): stores one client progress photo in the private Storage bucket "progress-photos"
// and records it in client_photos. Called from the 1FIT gallery page by the nightly client sync (in-page fetch of the
// photo the coach can already see, resized to max 1600 px), so the image bytes never pass through the agent.
// Auth: x-ingest-key = Vault secret photo_ingest_key (narrow: this function only). CORS: coach.1fit.com only.
// POST /photo-ingest?member=<challenge_members.id>&date=YYYY-MM-DD&pos=<1..12>&angle=front|side|back|other[&weight=<kg>]
// body: the image (image/jpeg | image/png | image/webp, ≤ 8 MB)
import { createClient } from "jsr:@supabase/supabase-js@2";
const ORIGINS = ["https://coach.1fit.com"];
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.includes(o) ? o : ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-ingest-key",
  "Vary": "Origin",
});
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const H = { ...cors(origin), "Content-Type": "application/json" };
  const out = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: key } = await admin.rpc("photo_ingest_key");
  if (!key || req.headers.get("x-ingest-key") !== key) return out({ error: "unauthorised" }, 401);
  const u = new URL(req.url);
  const member = u.searchParams.get("member") || "", date = u.searchParams.get("date") || "";
  const pos = parseInt(u.searchParams.get("pos") || "1", 10), angle = (u.searchParams.get("angle") || "other").toLowerCase();
  const w = u.searchParams.get("weight"), weight = w != null && w !== "" && isFinite(+w) ? +w : null;
  if (!/^[a-z0-9-]{2,60}$/.test(member) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(pos >= 1 && pos <= 12) || !["front", "side", "back", "other"].includes(angle)) return out({ error: "bad params" }, 400);
  const { data: m } = await admin.from("challenge_members").select("id").eq("id", member).maybeSingle();
  if (!m) return out({ error: "unknown member" }, 404);
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[type];
  if (!ext) return out({ error: "image/jpeg, image/png or image/webp only" }, 415);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length < 1000 || bytes.length > 8 * 1024 * 1024) return out({ error: "size" }, 413);
  const path = `${member}/${date}-${pos}.${ext}`;
  const up = await admin.storage.from("progress-photos").upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) return out({ error: up.error.message }, 500);
  const id = `${member}|${date}|${pos}`;
  const { data: prev } = await admin.from("client_photos").select("data").eq("id", id).maybeSingle();
  const data = { ...(prev?.data || {}), member_id: member, date, pos, angle: prev?.data?.angleSetBy === "jordan" ? prev.data.angle : angle, path, bytes: bytes.length, source: "1fit", ingestedAt: new Date().toISOString(), ...(weight != null ? { weight } : {}) };
  const { error } = await admin.from("client_photos").upsert({ id, data, updated_at: new Date().toISOString() });
  if (error) return out({ error: error.message }, 500);
  return out({ ok: true, id, path, bytes: bytes.length });
});
