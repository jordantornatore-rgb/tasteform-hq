// Moves a content_queue post to a new date/time. Called from TasteForm HQ (admin only).
// Body: { id: string, postDate: ISO UTC string }
// Provider-aware: Outstand (current) cancels + re-creates the scheduled post at the new time (and the separate
// YouTube post, posting.youtubePostId, when there is one); bundle.social (legacy) PATCHes postDate.
// If not scheduled yet (including a reel whose trial reels are running), only the planned time is saved and the
// pipeline re-times the trials / the winner pick.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { oGet, oRebuild, oReplace, remapIds } from "./outstand.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function sydParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const day = p.weekday.toLowerCase().slice(0, 3);
  const idx = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(day);
  const base = new Date(date + "T00:00:00Z"); base.setUTCDate(base.getUTCDate() - idx);
  return { date, day, weekStart: base.toISOString().slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json(401, { error: "Sign in again." });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "Only the admin can move posts." });

  let body: { id?: string; postDate?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const id = String(body.id || "");
  const when = new Date(String(body.postDate || ""));
  if (!id || isNaN(when.getTime())) return json(400, { error: "Need a post id and a valid time." });
  const now = Date.now();
  if (when.getTime() < now + 5 * 60 * 1000) return json(409, { error: "Pick a time at least 5 minutes from now." });
  if (when.getTime() > now + 30 * 24 * 3600 * 1000) return json(409, { error: "Outstand only schedules up to 30 days ahead." });

  const { data: row } = await admin.from("content_queue").select("data").eq("id", id).maybeSingle();
  if (!row) return json(404, { error: "Post not found." });
  const d = (row.data || {}) as Record<string, any>;
  const posting = { ...(d.posting || {}) } as Record<string, any>;
  const pst = String(posting.status || "");
  if (d.status === "posted" || ["posted", "posting", "publishing"].includes(pst)) return json(409, { error: "Already posted. Posted times can't be changed." });
  const cur = posting.scheduledFor || posting.plannedFor;
  if (["scheduled", "trialing"].includes(pst) && cur && new Date(cur).getTime() < now + 5 * 60 * 1000) return json(409, { error: "It posts in under 5 minutes, too late to move." });
  const iso = when.toISOString();
  let moved = 0, warnings: string[] = [];

  if (pst === "scheduled" && posting.postId) {
    if ((posting.provider || "bundle.social") === "outstand") {
      const { data: key } = await admin.rpc("outstand_api_key");
      if (!key) return json(500, { error: "Posting key missing." });
      const oldId = String(posting.postId);
      const g = await oGet(String(key), oldId);
      if (!g.ok) return json(502, { error: `Couldn't read the scheduled post from Outstand (${g.status}). Nothing was changed.` });
      if (g.post?.publishedAt) return json(409, { error: "Outstand says it's already published." });
      const nb = oRebuild(g.post); nb.scheduledAt = iso; if (posting.processMedia) nb.processMedia = true;
      const r = await oReplace(String(key), oldId, nb, `${id}-move-${iso}`);
      if (!r.ok) return json(502, r);
      posting.postId = r.newId; posting.postIds = remapIds(posting, oldId, String(r.newId)); warnings = r.warnings; moved = 1;
      // the separate YouTube post moves with it
      const yt = posting.youtubePostId && String(posting.youtubePostId) !== oldId ? String(posting.youtubePostId) : null;
      if (yt) {
        const gy = await oGet(String(key), yt);
        if (gy.ok && !gy.post?.publishedAt) {
          const yb = oRebuild(gy.post); yb.scheduledAt = iso; yb.processMedia = true;
          const ry = await oReplace(String(key), yt, yb, `${id}-move-yt-${iso}`);
          if (ry.ok) { posting.youtubePostId = ry.newId; posting.postIds = { ...(posting.postIds || {}), YOUTUBE: ry.newId }; moved++; }
          else warnings.push("The YouTube post didn't move: " + ry.error);
        }
      }
    } else {
      const { data: key } = await admin.rpc("bundle_api_key");
      const ids = new Set<string>([String(posting.postId), ...Object.values(posting.postIds || {}).map(String)]);
      for (const pid of ids) {
        const r = await fetch(`https://api.bundle.social/api/v1/post/${encodeURIComponent(pid)}`, { method: "PATCH", headers: { "x-api-key": String(key), "Content-Type": "application/json" }, body: JSON.stringify({ postDate: iso, status: "SCHEDULED" }) });
        if (!r.ok) return json(502, { error: `bundle.social refused the move (${r.status}). Nothing was changed.` });
        moved++;
      }
    }
  }
  // Trial reels already out can't be moved; only the main post moves. The pipeline re-times the winner pick.
  const s = sydParts(when);
  if (moved) posting.scheduledFor = iso; else posting.plannedFor = iso;
  posting.movedAt = new Date().toISOString();
  delete posting.rescheduleTo; delete posting.moveError;
  const patch = { date: s.date, day: s.day, weekStart: s.weekStart, posting };
  const { error: me } = await admin.rpc("hq_merge", { tbl: "content_queue", rows: [{ id, data: patch }] });
  if (me) return json(500, { error: "Moved the post but couldn't save to HQ: " + me.message });
  return json(200, { ok: true, id, movedInProvider: moved, warnings, ...patch });
});
