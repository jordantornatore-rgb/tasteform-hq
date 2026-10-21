// TasteForm HQ — "Today" brief. Runs hourly from pg_cron (and on demand).
// Loads the same tables the dashboard loads, runs the SAME hq-core.js computeToday() (fetched from the
// live site, so there is exactly one copy of the maths), and writes the result to meta/todayBrief
// (JSON + the Slack text). The morning Slack routine reads that row, so the report and the dashboard
// can never disagree.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORE_URL = Deno.env.get("HQ_CORE_URL") || "https://jordantornatore-rgb.github.io/tasteform-hq/hq-core.js";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// deno-lint-ignore no-explicit-any
let core: any = null; let coreAt = 0;
async function loadCore() {
  if (core && Date.now() - coreAt < 10 * 60 * 1000) return core;
  const r = await fetch(CORE_URL + "?t=" + Date.now(), { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error("could not fetch hq-core.js (" + r.status + ") from " + CORE_URL);
  const src = await r.text();
  if (!/HQ\.computeToday/.test(src)) throw new Error("hq-core.js looks wrong (no computeToday)");
  new Function(src)();
  // deno-lint-ignore no-explicit-any
  core = (globalThis as any).HQ; coreAt = Date.now();
  if (!core || !core.computeToday) throw new Error("hq-core.js did not register HQ");
  return core;
}
async function table(name: string) {
  const { data, error } = await sb.from(name).select("id,data").limit(5000);
  if (error) throw new Error(name + ": " + error.message);
  // deno-lint-ignore no-explicit-any
  return (data || []).map((r: any) => ({ id: r.id, ...(r.data || {}) }));
}

Deno.serve(async () => {
  try {
    const HQ = await loadCore();
    const [dms, daily, contacts, tfResponses, tfDaily, igPosts, igStories, metaRows, stripeSummary] = await Promise.all([
      table("dm_threads"), table("dm_daily"), table("contacts"), table("tf_responses"), table("tf_daily"), table("ig_posts"), table("ig_stories"), table("meta"), table("stripe_summary"),
    ]);
    const meta: Record<string, unknown> = {};
    for (const m of metaRows) if (!String(m.id).startsWith("routine:") && m.id !== "todayBrief") meta[m.id] = m;
    const stripe = stripeSummary.find((r: { id: string }) => r.id === "current") || null;
    const state = { dms, daily, contacts, tfResponses, tfDaily, igPosts, igStories, meta, stripe: stripe ? { summary: stripe } : null, dmLoaded: !!(meta.dmScan && (meta.dmScan as { lastScanAt?: string }).lastScanAt) || dms.length > 0 };
    const now = Date.now();
    const today = HQ.computeToday(state, now);
    const slack = HQ.formatSlack(today);
    const doc = { generatedAt: new Date(now).toISOString(), coreVersion: HQ.VERSION, today, slack };
    const w = await sb.from("meta").upsert({ id: "todayBrief", data: doc, updated_at: new Date(now).toISOString() });
    if (w.error) throw new Error("write failed: " + w.error.message);
    return new Response(JSON.stringify({ ok: true, generatedAt: doc.generatedAt, coreVersion: HQ.VERSION, actions: today.actions.length, slackChars: slack.length }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    try { await sb.from("meta").upsert({ id: "todayBrief", data: { ok: false, error: msg.slice(0, 300), lastAttemptAt: new Date().toISOString() }, updated_at: new Date().toISOString() }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
