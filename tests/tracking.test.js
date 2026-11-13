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
const st = { meta: { stripeSync: { connected: true } }, stripe: { summary: { mrr: 1872, risks: [1, 2], avgLifetimeValue: 1587, refundedTotal: 50, revenueByMonth: [] } },
  stripeDaily: [{ date: '2026-11-15', amount: 400, payments: 1, newClients: 0 }, { date: '2026-11-18', amount: 442, payments: 1, newClients: 1 }, { date: '2026-11-05', amount: 100, payments: 1, newClients: 0 }],
  tfResponses: [], tfDaily: [], igPosts: [], appSessions: [] };
const P = HQ.computePillars(st, now, 7);
check('cash collected = Stripe payments in the window', () => assert.strictEqual(P.sales.headline.value, 842));
check('payments and first-time payers counted', () => { assert.strictEqual(P.sales.payments.value, 2); assert.strictEqual(P.sales.newPayers.value, 1); });
check('delivery money rows from Stripe', () => { assert.strictEqual(P.delivery.mrr.value, 1872); assert.strictEqual(P.delivery.failedPayments.value, 2); assert.strictEqual(P.delivery.ltv.value, 1587); });
check('refunds all time passed through', () => assert.strictEqual(P.sales.refundsAllTime, 50));
console.log(`tracking: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
