// Outstand helpers shared by HQ functions. Outstand has no update endpoint for scheduled posts,
// so an edit = read the post, cancel it, re-create it with the change (same media + per-network config).
export const OBASE = "https://api.outstand.so/v1/";
const CFG_MAP: Record<string, string> = {
  instagramConfiguration: "instagram", youtubeConfiguration: "youtube", linkedinConfiguration: "linkedin",
  tiktokConfiguration: "tiktok", facebookConfiguration: "facebook", threadsConfiguration: "threads",
  xConfiguration: "x", pinterestConfiguration: "pinterest", blueskyConfiguration: "bluesky",
};
export async function oGet(key: string, id: string) {
  const r = await fetch(OBASE + "posts/" + encodeURIComponent(id), { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, post: j?.post ?? j?.data ?? j };
}
// Rebuild a create-post body from an existing post, then apply `mutate`.
export function oRebuild(post: any): any {
  const body: any = {
    accounts: (post.socialAccounts || []).map((a: any) => a.id),
    containers: (post.containers || []).map((c: any) => ({ content: c.content ?? "", media: (c.media || []).map((m: any) => ({ url: m.url, filename: m.filename })) })),
  };
  const cfg = post.networkOverrideConfiguration || {};
  for (const k of Object.keys(cfg)) { const net = CFG_MAP[k] || k.replace(/Configuration$/, ""); if (cfg[k] && typeof cfg[k] === "object") body[net] = JSON.parse(JSON.stringify(cfg[k])); }
  if (post.scheduledAt) body.scheduledAt = post.scheduledAt;
  return body;
}
export async function oReplace(key: string, oldId: string, body: any, idemKey: string) {
  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const c = await fetch(OBASE + "posts/", { method: "POST", headers: { ...H, "Idempotency-Key": idemKey }, body: JSON.stringify(body) });
  const cj = await c.json().catch(() => ({}));
  if (!c.ok || !cj?.post?.id) return { ok: false, error: `Outstand refused the new post (${c.status})`, detail: JSON.stringify(cj?.error ?? cj).slice(0, 300) };
  const d = await fetch(OBASE + "posts/" + encodeURIComponent(oldId), { method: "DELETE", headers: H });
  if (!d.ok) {
    // roll back the new one so nothing posts twice
    await fetch(OBASE + "posts/" + encodeURIComponent(cj.post.id), { method: "DELETE", headers: H });
    return { ok: false, error: `Couldn't cancel the old scheduled post (${d.status}). Nothing was changed.` };
  }
  return { ok: true, newId: cj.post.id as string, warnings: cj.warnings || [] };
}
// posting.postIds after the post `oldId` was re-created as `newId` (a separate YouTube post keeps its own id).
export function remapIds(posting: any, oldId: string, newId: string): Record<string, string> {
  const cur = posting.postIds && typeof posting.postIds === "object" ? posting.postIds : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cur)) out[k] = String(v) === oldId ? newId : String(v);
  if (!Object.keys(out).length) for (const p of (posting.platforms || [])) out[p] = newId;
  return out;
}
