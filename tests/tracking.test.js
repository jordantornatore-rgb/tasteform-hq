// Tracking additions (13 Nov 2026): node tests/tracking.test.js
// YouTube long-form count per scorecard week, typed-in override, Stripe cash for any window, referrals on Delivery.
'use strict';
const assert = require('assert');
global.window = global; require('../hq-core.js'); const HQ = global.HQ;
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + e.message); } }
const yt = { lastSyncAt: '2026-11-17T00:00:00Z', videos: { a: { day: '2026-11-17' }, b: { day: '2026-11-19' }, c: { day: '2026-11-25' }, d: { day: '2026-07-14' } } };
check('youtube count in a week', () => assert.strictEqual(HQ.youtubeLongIn(yt, '2026-11-16', '2026-11-22'), 2));
check('youtube blank before first sync', () => assert.strictEqual(HQ.youtubeLongIn(null, '2026-11-16', '2026-11-22'), null));
check('youtube zero when synced and nothing posted', () => assert.strictEqual(HQ.youtubeLongIn(yt, '2026-12-01', '2026-12-07'), 0));
const now = Date.parse('2026-11-20T02:00:00Z');
const base = { meta: { youtubeSync: yt, scorecard: { weeks: {} } }, tfResponses: [], tfDaily: [], igAccount: [], adsDaily: [] };
let sc = HQ.scorecard(base, now);
check('scorecard long-form from YouTube', () => assert.strictEqual(sc.current.cells.longform.value, 2));
sc = HQ.scorecard(Object.assign({}, base, { meta: { youtubeSync: yt, scorecard: { weeks: { '2026-11-16': { longform: 5 } } } } }), now);
check('typed-in long-form still wins', () => assert.strictEqual(sc.current.cells.longform.value, 5));
check('long-form row no longer marked typed-in', () => assert.ok(!HQ.SCORE_ROWS.find(r => r.key === 'longform').manual));
const st = { meta: { stripeSync: { connected: true } }, stripe: { summary: { mrr: 1872, risks: [1, 2], avgLifetimeValue: 1587, refundedTotal: 50, revenueByMonth: [] }, customers: [{ status: 'Overdue', nextDue: '2026-11-10' }, { status: 'Overdue', nextDue: '2026-11-11', in1Fit: true }, { status: 'Overdue', nextDue: '2026-11-09', in1Fit: false }, { status: 'Active', nextDue: '2026-11-20' }] },
  stripeDaily: [{ date: '2026-11-15', amount: 400, payments: 1, newClients: 0 }, { date: '2026-11-18', amount: 442, payments: 1, newClients: 1 }, { date: '2026-11-05', amount: 100, payments: 1, newClients: 0 }],
  tfResponses: [], tfDaily: [], igPosts: [], appSessions: [] };
const P = HQ.computePillars(st, now, 7);
check('cash collected = Stripe payments in the window', () => assert.strictEqual(P.sales.headline.value, 842));
check('payments and first-time payers counted', () => { assert.strictEqual(P.sales.payments.value, 2); assert.strictEqual(P.sales.newPayers.value, 1); });
// overdue = current 1FIT clients past their usual date (the Revenue page's Overdue box), not every unpaid invoice
check('delivery money rows from Stripe', () => { assert.strictEqual(P.delivery.mrr.value, 1872); assert.strictEqual(P.delivery.failedPayments.value, 2); assert.strictEqual(P.delivery.ltv.value, 1587); });
check('refunds all time passed through', () => assert.strictEqual(P.sales.refundsAllTime, 50));

// past-client stay and spend from Stripe (checks the working 4.2 months / LTV)
{
  const R = HQ.stripeRetention([
    { status: 'Past client', firstPaid: '2026-01-01', lastPaid: '2026-03-02', paymentsCount: 3, totalPaid: 1500 },
    { status: 'Past client', firstPaid: '2026-05-01', lastPaid: '2026-05-01', paymentsCount: 1, totalPaid: 500 },
    { status: 'Active', firstPaid: '2025-01-01', lastPaid: '2026-11-01', paymentsCount: 22, totalPaid: 9000 }
  ]);
  check('stripe retention: past clients only, stay = first to last + one gap', () => { assert.strictEqual(R.n, 2); assert.strictEqual(R.avgPaid, 1000); assert.ok(R.avgMonths > 1.9 && R.avgMonths < 2.1, String(R.avgMonths)); });
  check('stripe retention: null without data', () => assert.strictEqual(HQ.stripeRetention(null), null));
}
{
  const U = HQ.unitEcon({ avgMonths: 4.1, avgPaid: 1630, n: 23 });
  check('LTV theoretical = $299 upfront + $125/wk x weeks past clients stayed; actual = Stripe', () => { assert.strictEqual(U.weeks, 17.8); assert.strictEqual(U.ltv, 2524); assert.strictEqual(U.actual, 1630); assert.strictEqual(U.cac, 1074); });
  check('LTV falls back to 4.2 months without Stripe', () => { const F = HQ.unitEcon(null); assert.strictEqual(F.months, 4.2); assert.strictEqual(F.actual, null); });
}
{
  const ghl = { connected: true, days: { '2026-10-19': { booked: 0, held: 4, showed: 0, noShow: 0, unmarked: 4, closed: 0, byFunnel: { unknown: { booked: 0, held: 3, showed: 0, noShow: 0, closed: 0 } } }, '2026-10-20': { held: 1, showed: 1, noShow: 0, unmarked: 0, closed: 0 } } };
  const G = HQ.applyGhlManual(ghl, { days: { '2026-10-19': { showed: 2, noShow: 2, closed: 1 }, '2026-10-20': { showed: 0, noShow: 1 }, '2026-10-30': { showed: 1 } } });
  check('manual call outcomes fill unmarked GHL days', () => { const d = G.days['2026-10-19']; assert.deepStrictEqual([d.showed, d.noShow, d.unmarked, d.closed, d.byFunnel.unknown.closed], [2, 2, 0, 1, 1]); });
  check('a day GHL already marked keeps GHL', () => assert.strictEqual(G.days['2026-10-20'].noShow, 0));
  check('a hand-entered call on a day GHL has none adds the call', () => { const d = G.days['2026-10-30']; assert.deepStrictEqual([d.held, d.showed, d.noShow], [1, 1, 0]); });
  const G2 = HQ.applyGhlManual(ghl, { calls: [{ date: '2026-10-19', showed: true, closed: true }, { date: '2026-10-19', showed: false }, { date: 'bad', showed: true }] });
  check('calls list: counted by date', () => { const d = G2.days['2026-10-19']; assert.deepStrictEqual([d.showed, d.noShow, d.closed, d.unmarked], [1, 1, 1, 2]); });
  check('ghl untouched without manual', () => assert.strictEqual(HQ.applyGhlManual(ghl, null), ghl));
}
{
  const cu = [{ status: 'Free (affiliate)' }, { status: 'Free (affiliate)' }, { status: 'Free (affiliate)', in1Fit: false }, { status: 'Active' }];
  check('paying clients = 1FIT active minus free coaching', () => { assert.strictEqual(HQ.freeClients(cu), 2); assert.strictEqual(HQ.payingActive({ active: 13 }, cu), 11); assert.strictEqual(HQ.payingActive({ active: 13 }, null), 13); assert.strictEqual(HQ.payingActive(null, cu), null); });
}
console.log(`tracking: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
