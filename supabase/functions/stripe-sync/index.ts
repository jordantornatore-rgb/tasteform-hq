// TasteForm HQ — Stripe read-only sync. Runs hourly from pg_cron.
// READ ONLY: this file only ever issues GET requests to Stripe. It never creates or changes
// charges, refunds, payouts, customers, subscriptions or invoices. The key lives in Supabase
// Vault (`stripe_restricted_key`, a restricted key with read access only) and is read through
// public.stripe_secret(), which only the service role may call. Nothing is estimated: every
// number is a sum of what Stripe returns.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://api.stripe.com/v1";
const TZ = "Australia/Sydney";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function sydDay(sec: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(sec * 1000));
}
// deno-lint-ignore no-explicit-any
async function stripeGet(key: string, path: string, params: Record<string, string | number> = {}): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const r = await fetch(API + path + (qs ? "?" + qs : ""), { method: "GET", headers: { Authorization: "Bearer " + key } });
  if (!r.ok) throw new Error(`Stripe ${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}
// deno-lint-ignore no-explicit-any
async function listAll(key: string, path: string, params: Record<string, string | number>): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  let out: any[] = [], after: string | null = null;
  for (let i = 0; i < 50; i++) {
    const p: Record<string, string | number> = { ...params, limit: 100 };
    if (after) p.starting_after = after;
    const page = await stripeGet(key, path, p);
    out = out.concat(page.data || []);
    if (!page.has_more || !page.data?.length) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}
// deno-lint-ignore no-explicit-any
function monthlyAmount(sub: any): { amount: number; currency: string } {
  let total = 0, currency = "aud";
  for (const it of sub.items?.data || []) {
    const price = it.price || it.plan; if (!price) continue;
    currency = price.currency || currency;
    const unit = (price.unit_amount ?? price.amount ?? 0) * (it.quantity || 1);
    const n = price.recurring?.interval_count || price.interval_count || 1;
    const iv = price.recurring?.interval || price.interval || "month";
    const perMonth = iv === "month" ? unit / n : iv === "year" ? unit / (12 * n) : iv === "week" ? unit * 4.345 / n : iv === "day" ? unit * 30.44 / n : unit;
    total += perMonth;
  }
  return { amount: Math.round(total) / 100, currency: currency.toUpperCase() };
}
async function writeMeta(patch: Record<string, unknown>) {
  const cur = await sb.from("meta").select("data").eq("id", "stripeSync").maybeSingle();
  const merged = { ...(cur.data?.data || {}), ...patch };
  await sb.from("meta").upsert({ id: "stripeSync", data: merged, updated_at: new Date().toISOString() });
}

async function run() {
  const startedAt = new Date().toISOString();
  const { data: key, error: keyErr } = await sb.rpc("stripe_secret");
  if (keyErr) throw new Error("stripe_secret() failed: " + keyErr.message);
  if (!key) {
    await writeMeta({ connected: false, lastAttemptAt: startedAt, lastAttemptOk: true, note: "No stripe_restricted_key in Vault yet. Add a READ-ONLY restricted key to connect." });
    return { ok: true, connected: false };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const subs = await listAll(key, "/subscriptions", { status: "all", "expand[]": "data.customer" });
  const customers: Record<string, { name: string | null; email: string | null }> = {};
  for (const s of subs) { const c = s.customer; if (c && typeof c === "object") customers[c.id] = { name: c.name || null, email: c.email || null }; }
  const invoices = await listAll(key, "/invoices", { "created[gte]": nowSec - 400 * 86400 });
  const balance = await stripeGet(key, "/balance");
  const livemode = subs.length ? !!subs[0].livemode : (invoices.length ? !!invoices[0].livemode : null);

  const monthKey = sydDay(nowSec).slice(0, 7);
  let mrr = 0, currency = "AUD", activeCount = 0, pastDueCount = 0, trialingCount = 0, newThisMonth = 0, churnedThisMonth = 0;
  // deno-lint-ignore no-explicit-any
  const subRows: any[] = []; const risks: any[] = []; const renewals: any[] = [];
  for (const s of subs) {
    const cid = typeof s.customer === "object" ? s.customer.id : s.customer;
    const who = customers[cid] || { name: null, email: null };
    const m = monthlyAmount(s); currency = m.currency || currency;
    const startedAtSec = s.start_date || s.created, endedSec = s.ended_at || s.canceled_at || null;
    const lifetimeMonths = ((endedSec || nowSec) - startedAtSec) / (30.44 * 86400);
    if (s.status === "active") { activeCount++; mrr += m.amount; }
    if (s.status === "past_due") { pastDueCount++; mrr += m.amount; }
    if (s.status === "trialing") trialingCount++;
    if (sydDay(startedAtSec).slice(0, 7) === monthKey) newThisMonth++;
    if (endedSec && sydDay(endedSec).slice(0, 7) === monthKey && (s.status === "canceled" || s.status === "ended")) churnedThisMonth++;
    if (s.status === "past_due" || s.status === "unpaid") risks.push({ name: who.name, email: who.email, status: s.status, amount: m.amount, currency: m.currency, since: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null, subscriptionId: s.id });
    if ((s.status === "active" || s.status === "trialing") && s.current_period_end && s.current_period_end > nowSec && s.current_period_end < nowSec + 14 * 86400 && !s.cancel_at_period_end) renewals.push({ name: who.name, email: who.email, at: new Date(s.current_period_end * 1000).toISOString(), amount: m.amount, currency: m.currency });
    subRows.push({ id: s.id, data: { name: who.name, email: who.email, status: s.status, monthly: m.amount, currency: m.currency, startedAt: new Date(startedAtSec * 1000).toISOString(), endedAt: endedSec ? new Date(endedSec * 1000).toISOString() : null, cancelAtPeriodEnd: !!s.cancel_at_period_end, currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null, lifetimeMonths: Math.round(lifetimeMonths * 10) / 10, syncedAt: startedAt } });
  }
  // failed / uncollectible invoices (last 400 days) that are still unpaid
  for (const inv of invoices) {
    if (inv.status === "open" && inv.attempted && inv.attempt_count > 0) {
      risks.push({ name: inv.customer_name || null, email: inv.customer_email || null, status: "failed payment", amount: (inv.amount_due || 0) / 100, currency: String(inv.currency || currency).toUpperCase(), since: inv.status_transitions?.finalized_at ? new Date(inv.status_transitions.finalized_at * 1000).toISOString() : null, invoiceId: inv.id });
    }
  }
  // revenue by month and by day (paid invoices, Sydney days)
  const byMonth: Record<string, number> = {}, byDay: Record<string, { amount: number; invoices: number }> = {};
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const paidAt = inv.status_transitions?.paid_at || inv.created;
    const day = sydDay(paidAt), amt = (inv.amount_paid || 0) / 100;
    byMonth[day.slice(0, 7)] = (byMonth[day.slice(0, 7)] || 0) + amt;
    const d = (byDay[day] ||= { amount: 0, invoices: 0 }); d.amount += amt; d.invoices++;
  }
  const revenueByMonth = Object.keys(byMonth).sort().map((m) => ({ month: m, amount: Math.round(byMonth[m] * 100) / 100 }));
  const summary = { mrr: Math.round(mrr * 100) / 100, currency, activeCount, pastDueCount, trialingCount, newThisMonth, churnedThisMonth, risks, upcomingRenewals: renewals.sort((a, b) => a.at.localeCompare(b.at)), revenueByMonth, balanceAvailable: (balance.available || []).map((b: { amount: number; currency: string }) => ({ amount: b.amount / 100, currency: b.currency.toUpperCase() })), livemode, syncedAt: startedAt };

  const upserts = [];
  upserts.push(sb.from("stripe_summary").upsert({ id: "current", data: summary, updated_at: startedAt }));
  if (subRows.length) upserts.push(sb.from("stripe_subscriptions").upsert(subRows.map((r) => ({ ...r, updated_at: startedAt }))));
  const dayRows = Object.keys(byDay).map((d) => ({ id: d, data: { date: d, ...byDay[d], amount: Math.round(byDay[d].amount * 100) / 100 }, updated_at: startedAt }));
  if (dayRows.length) upserts.push(sb.from("stripe_daily").upsert(dayRows));
  for (const u of upserts) { const r = await u; if (r.error) throw new Error("write failed: " + r.error.message); }
  await writeMeta({ connected: true, ok: true, error: null, lastSyncAt: startedAt, lastAttemptAt: startedAt, lastAttemptOk: true, livemode, subscriptions: subs.length, invoices: invoices.length, note: null });
  return { ok: true, connected: true, mrr: summary.mrr, subscriptions: subs.length, risks: risks.length };
}

Deno.serve(async () => {
  try {
    const out = await run();
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = String((e as Error)?.message || e).replace(/sk_\w+|rk_\w+/g, "[key]");
    try { await writeMeta({ ok: false, error: msg.slice(0, 300), lastAttemptAt: new Date().toISOString(), lastAttemptOk: false }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
