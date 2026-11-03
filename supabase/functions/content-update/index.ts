// Edits (or creates) a content_queue post from TasteForm HQ (admin only).
// Body: { id, create?: {date, slot}, fields: { title?, hooks?, visualHook?, script?, editNotes?, cta?, body?, ending?, caption?, linkedin?, slides?, format?, funnel?, angle?, hookStyle?, location?, effort?, sound?, platforms?, sourceIdea? } }
// If the post is already scheduled, caption / LinkedIn text / title changes are pushed to the live scheduled post first
// (Outstand: cancel + re-create with the change; bundle.social legacy: PATCH). A separate YouTube post (the
// licensed-music render, posting.youtubePostId) gets the caption / title change too. Sound changes need a re-render,
// so they flag reEditRequested.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { oGet, oRebuild, oReplace, remapIds } from "./outstand.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ALLOWED = ["title", "hooks", "visualHook", "script", "editNotes", "cta", "body", "ending", "caption", "linkedin", "slides", "format", "funnel", "angle", "hookStyle", "location", "effort", "sound", "platforms", "sourceIdea"];
const ARR = ["hooks", "body", "slides"];
const LONG = { script: 20000, editNotes: 10000, caption: 2200, linkedin: 3000 } as Record<string, number>;
const TF_URN = "urn:li:organization:144095374";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } }); }
// HQ stores LinkedIn mentions as @[TasteForm](urn:...) (bundle syntax). Outstand wants plain text + a mentions array.
function liForOutstand(t: string) {
  const mentions: { urn: string; text: string }[] = [];
  const text = t.replace(/@\[([^\]]+)\]\((urn:li:[a-z]+:[A-Za-z0-9_-]+)\)/g, (_m, name, urn) => { mentions.push({ urn, text: name }); return name; });
  if (!mentions.some((m) => m.urn === TF_URN) && /TasteForm/.test(text)) mentions.push({ urn: TF_URN, text: "TasteForm" });
  return { text, mentions };
}
const ytText = (c: string) => String(c).replace(/Link in my bio\b/g, "Link in my channel");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json(401, { error: "Sign in again." });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "Only the admin can edit posts." });

  let body: { id?: string; create?: Record<string, unknown>; fields?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) return json(400, { error: "Bad post id." });
  const raw = body.fields && typeof body.fields === "object" ? body.fields : {};
  const fields: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (!ALLOWED.includes(k)) return json(400, { error: `Can't edit "${k}" here.` });
    const v = raw[k];
    if (ARR.includes(k) || k === "platforms") { if (!Array.isArray(v)) return json(400, { error: `${k} must be a list.` }); fields[k] = v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 30); }
    else if (k === "sound") { if (v !== null && typeof v !== "object") return json(400, { error: "sound must be an object or null." }); fields[k] = v; }
    else {
      const s = String(v ?? "");
      fields[k] = ["script", "editNotes", "caption", "linkedin"].includes(k) ? s.replace(/\s+$/, "") : s.trim();
      const max = LONG[k] ?? 500;
      if ((fields[k] as string).length > max) return json(400, { error: `${k} is too long (max ${max.toLocaleString()} characters).` });
    }
  }
  // Every LinkedIn post tags the TasteForm page.
  if (typeof fields.linkedin === "string" && fields.linkedin && !/TasteForm/.test(fields.linkedin as string)) fields.linkedin = (fields.linkedin as string) + "\n\nI help men working 9-5s get into the best shape of their lives with TasteForm. Link in my profile.";
  if (!Object.keys(fields).length && !body.create) return json(400, { error: "Nothing to save." });

  const { data: row } = await admin.from("content_queue").select("data").eq("id", id).maybeSingle();
  let d = (row?.data || null) as Record<string, any> | null;
  if (!d) {
    const c = body.create || {}; const date = String(c.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(404, { error: "Post not found. To create one, send create.date (YYYY-MM-DD)." });
    const dt = new Date(date + "T00:00:00Z"), idx = (dt.getUTCDay() + 6) % 7; const ws = new Date(dt); ws.setUTCDate(ws.getUTCDate() - idx);
    const slot = ["high", "low", "carousel"].includes(String(c.slot)) ? String(c.slot) : "high";
    d = { weekStart: ws.toISOString().slice(0, 10), date, day: DAYS[idx], slot, status: "needs_script", createdByJordanAt: new Date().toISOString() };
  }
  const posting = { ...(d.posting || {}) } as Record<string, any>;
  const pst = String(posting.status || "");
  if (d.status === "posted" || ["posted", "posting", "publishing"].includes(pst)) return json(409, { error: "Already posted. Edit it on the platform instead." });
  if (fields.platforms && ["scheduled", "trialing"].includes(pst)) return json(409, { error: "Pull it from the schedule to change platforms; the pipeline re-schedules it." });

  let updatedInProvider = 0, warnings: string[] = [];
  const touchesPost = ["caption", "linkedin", "title"].some((k) => k in fields);
  if (pst === "scheduled" && posting.postId && touchesPost) {
    if (posting.scheduledFor && new Date(posting.scheduledFor).getTime() < Date.now() + 5 * 60 * 1000) return json(409, { error: "It posts in under 5 minutes, too late to edit." });
    if ((posting.provider || "bundle.social") === "outstand") {
      const { data: key } = await admin.rpc("outstand_api_key");
      if (!key) return json(500, { error: "Posting key missing." });
      const oldId = String(posting.postId);
      const g = await oGet(String(key), oldId);
      if (!g.ok) return json(502, { error: `Couldn't read the scheduled post from Outstand (${g.status}). Nothing was changed.` });
      if (g.post?.publishedAt) return json(409, { error: "Outstand says it's already published." });
      const nb = oRebuild(g.post); if (posting.processMedia) nb.processMedia = true;
      if ("caption" in fields && nb.containers?.[0]) nb.containers[0].content = fields.caption;
      if ("caption" in fields && nb.youtube) nb.youtube.content = ytText(String(fields.caption));
      if ("title" in fields && nb.youtube) nb.youtube.title = String(fields.title).slice(0, 100);
      if ("linkedin" in fields && nb.linkedin) { const li = liForOutstand(String(fields.linkedin)); nb.linkedin.content = li.text; nb.linkedin.mentions = li.mentions; }
      const r = await oReplace(String(key), oldId, nb, `${id}-edit-${Date.now()}`);
      if (!r.ok) return json(502, r);
      posting.postId = r.newId; posting.postIds = remapIds(posting, oldId, String(r.newId)); warnings = r.warnings; updatedInProvider = 1;
      // the separate YouTube post (licensed-music render) gets the same caption / title change
      const yt = posting.youtubePostId && String(posting.youtubePostId) !== oldId ? String(posting.youtubePostId) : null;
      if (yt && ("caption" in fields || "title" in fields)) {
        const gy = await oGet(String(key), yt);
        if (gy.ok && !gy.post?.publishedAt) {
          const yb = oRebuild(gy.post); yb.processMedia = true;
          if ("caption" in fields) { if (yb.containers?.[0]) yb.containers[0].content = String(fields.caption); if (yb.youtube) yb.youtube.content = ytText(String(fields.caption)); }
          if ("title" in fields && yb.youtube) yb.youtube.title = String(fields.title).slice(0, 100);
          const ry = await oReplace(String(key), yt, yb, `${id}-edit-yt-${Date.now()}`);
          if (ry.ok) { posting.youtubePostId = ry.newId; posting.postIds = { ...(posting.postIds || {}), YOUTUBE: ry.newId }; updatedInProvider++; }
          else warnings.push("The YouTube post wasn't updated: " + ry.error);
        }
      }
    } else {
      // legacy bundle.social path
      const { data: key } = await admin.rpc("bundle_api_key");
      const Hb = { "x-api-key": String(key), "Content-Type": "application/json" };
      const ids = new Set<string>([String(posting.postId), ...Object.values(posting.postIds || {}).map(String)]);
      for (const pid of ids) {
        const g = await fetch("https://api.bundle.social/api/v1/post/" + encodeURIComponent(pid), { headers: Hb });
        if (!g.ok) return json(502, { error: `Couldn't read the scheduled post (${g.status}). Nothing was changed.` });
        const post = await g.json(); const data = JSON.parse(JSON.stringify(post.data || {}));
        for (const plat of Object.keys(data)) { const pd = data[plat]; if (!pd) continue; if (plat === "LINKEDIN") { if ("linkedin" in fields) pd.text = fields.linkedin; continue; } if ("caption" in fields) pd.text = fields.caption; }
        const p: any = { data }; if ("title" in fields) p.title = fields.title || post.title;
        const r = await fetch("https://api.bundle.social/api/v1/post/" + encodeURIComponent(pid), { method: "PATCH", headers: Hb, body: JSON.stringify(p) });
        if (!r.ok) return json(502, { error: `bundle.social refused the edit (${r.status}). Nothing was changed.` });
        updatedInProvider++;
      }
    }
  }

  const now = new Date().toISOString();
  const scriptChanged = ["hooks", "body", "ending", "slides", "script", "visualHook", "editNotes"].some((k) => k in fields);
  const patch: Record<string, unknown> = { ...(row ? {} : d), ...fields, editedByJordanAt: now };
  if ("platforms" in fields) { posting.platforms = fields.platforms; delete patch.platforms; }
  if (updatedInProvider || "platforms" in fields) patch.posting = posting;
  if ((d.status === "needs_script" || !d.status) && String(fields.script ?? d.script ?? "").trim()) patch.status = "to_film";
  if (scriptChanged && ["edited", "awaiting_approval", "approved", "trialing", "scheduled"].includes(String(d.status))) patch.scriptChangedAfterEdit = true;
  // Music is mixed into the file now (Outstand can't attach platform sounds), so a sound change needs a re-render.
  if ("sound" in fields && ["edited", "awaiting_approval", "approved", "trialing", "scheduled"].includes(String(d.status))) patch.reEditRequested = true;
  const { error: me } = await admin.rpc("hq_merge", { tbl: "content_queue", rows: [{ id, data: patch }] });
  if (me) return json(500, { error: (updatedInProvider ? "Updated the scheduled post but couldn't save to HQ: " : "Couldn't save: ") + me.message });
  if (typeof fields.sourceIdea === "string" && fields.sourceIdea) {
    const { data: idea } = await admin.from("content_ideas").select("id").eq("id", fields.sourceIdea).maybeSingle();
    if (idea) await admin.rpc("hq_merge", { tbl: "content_ideas", rows: [{ id: fields.sourceIdea, data: { status: "planned", plannedFor: id, statusAt: now } }] });
  }
  return json(200, { ok: true, id, created: !row, updatedInProvider, warnings, saved: patch });
});
