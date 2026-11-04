// Unit tests for hq-core.js (run: node tests/core.test.js [fixtureDir])
// Fixtures are anonymised exports of the Supabase tables (see tests/README.md).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const HQ = require('../hq-core.js');

const FIX = process.argv[2] || process.env.HQ_FIXTURES || path.join(__dirname, 'fixtures');
function load(t) { const p = path.join(FIX, t + '.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; }
function docs(t) { return load(t).map(r => Object.assign({ id: r.id }, r.data)); }

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }

// ---- Sydney calendar ----
test('sydney day keys are DST-aware and ignore the host TZ', () => {
  assert.strictEqual(HQ.sydDay('2026-10-20T14:30:00Z'), '2026-10-21'); // 01:30 AEDT next day
  assert.strictEqual(HQ.sydDay('2026-10-03T14:30:00Z'), '2026-10-04'); // 00:30 AEST (DST starts 4 Oct)
  assert.strictEqual(HQ.sydDay('2026-06-30T13:59:00Z'), '2026-06-30'); // 23:59 AEST
  assert.strictEqual(HQ.sydDay('2026-06-30T14:00:00Z'), '2026-07-01');
  assert.strictEqual(HQ.sydParts('2026-10-21T03:51:10Z').minutes, 14 * 60 + 51);
});
test('a missing timestamp is never "today"', () => {
  assert.strictEqual(HQ.sydDay(null), null); assert.strictEqual(HQ.sydDay(undefined), null); assert.strictEqual(HQ.sydDay('garbage'), null);
  const snap = HQ.funnelSnapshot({ dms: [{ id: 'a', category: 'lead', threadId: 't', direction: 'outbound', opener: 'other' }], dmLoaded: true, meta: {} }, Date.parse('2026-10-21T04:00:00Z'), 7);
  assert.strictEqual(snap.stages.find(s => s.key === 'replied').value, 0);
  assert.strictEqual(snap.stages.find(s => s.key === 'capture').value, 0);
});
test('sydMidnight returns the instant the Sydney day starts', () => {
  assert.strictEqual(new Date(HQ.sydMidnight('2026-10-21')).toISOString(), '2026-10-20T13:00:00.000Z');
  assert.strictEqual(new Date(HQ.sydMidnight('2026-07-01')).toISOString(), '2026-06-30T14:00:00.000Z');
  assert.strictEqual(new Date(HQ.sydMidnight('2026-10-04')).toISOString(), '2026-10-03T14:00:00.000Z'); // DST switch day
});
test('week starts on Monday; addDays crosses months', () => {
  assert.strictEqual(HQ.weekStart('2026-10-21'), '2026-10-19');
  assert.strictEqual(HQ.weekStart('2026-10-25'), '2026-10-19');
  assert.strictEqual(HQ.weekStart('2026-10-26'), '2026-10-26');
  assert.strictEqual(HQ.addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(HQ.daysBetween('2026-10-21', '2026-12-31'), 71);
});
test('formatting never prints NaN/undefined', () => {
  assert.strictEqual(HQ.num(undefined), '–'); assert.strictEqual(HQ.num(NaN), '–'); assert.strictEqual(HQ.num(null), '–');
  assert.strictEqual(HQ.num(1234), '1,234'); assert.strictEqual(HQ.pct(3, 0), null); assert.strictEqual(HQ.pctText(1, 4), '25%');
  assert.strictEqual(HQ.money(undefined), '–'); assert.strictEqual(HQ.fmtHours(NaN), '–');
  assert.strictEqual(HQ.relTime('nope'), null);
});
test('relTime handles the future', () => {
  const now = Date.parse('2026-10-21T04:00:00Z');
  assert.strictEqual(HQ.relTime('2026-10-21T08:00:00Z', now), 'in 4h');
  assert.strictEqual(HQ.relTime('2026-10-21T03:00:00Z', now), '1h ago');
});

// ---- Instagram dates ----
test('media ids decode to the exact posting time (checked against scan labels)', () => {
  assert.strictEqual(HQ.sydDay(HQ.igTimeFromId('3998233790055021633')), '2026-10-01');
  assert.strictEqual(HQ.sydDay(HQ.igTimeFromId('4006881757455411469')), '2026-10-13');
  assert.strictEqual(HQ.sydDay(HQ.igTimeFromId('DeOgi86BpE4')), '2026-10-08');
  assert.strictEqual(HQ.igTimeFromId('abc'), null);
  const at = HQ.igPostedAt({ id: '4006881757455411469', postedAtLabel: '13 Oct' });
  assert.strictEqual(at.day, '2026-10-13'); assert.strictEqual(at.exact, true); assert.strictEqual(at.source, 'id');
  assert.deepStrictEqual(HQ.igPostedAt({ id: 'x', postedAtLabel: null }), { iso: null, day: null, exact: false, source: 'none' });
  assert.strictEqual(HQ.igParseLabel('2d', Date.parse('2026-10-21T04:00:00Z')), '2026-10-19');
});

// ---- lead rules ----
const dms = docs('dm_threads'), daily = docs('dm_daily'), contacts = docs('contacts'), tfResponses = docs('tf_responses'), tfDaily = docs('tf_daily');
const igPosts = docs('ig_posts'), igStories = docs('ig_stories');
const metaRows = docs('meta'); const meta = {}; metaRows.forEach(m => { meta[m.id] = m; });
const NOW = Date.parse('2026-10-21T04:00:00Z'); // 3pm Sydney, 21 Oct
const state = { dms, daily, contacts, tfResponses, tfDaily, igPosts, igStories, meta, dmLoaded: true };

test('funnels never mix: magnet by opener, unread placeholders outside both', () => {
  const leads = HQ.leads(dms);
  const out = HQ.outboundLeads(dms), mag = HQ.magnetLeads(dms), unread = HQ.unreadLeads(dms);
  assert.strictEqual(out.length + mag.length + unread.length, leads.length);
  mag.forEach(d => assert.strictEqual(d.opener, 'magnet_delivery'));
  out.forEach(d => assert.notStrictEqual(d.opener, 'magnet_delivery'));
  unread.forEach(d => { assert.ok(/^pending-/.test(d.id)); assert.ok(!d.threadId); });
  // independent count straight from the rows
  const expUnread = leads.filter(d => /^pending-/.test(d.id) && !d.threadId).length;
  assert.strictEqual(unread.length, expUnread);
});
test('openers = direction outbound and not a magnet delivery', () => {
  const rr = HQ.replyRate(dms, NOW, 30);
  const exp = HQ.leads(dms).filter(d => !/^pending-/.test(d.id) || d.threadId).filter(d => d.opener !== 'magnet_delivery' && d.direction === 'outbound');
  const cur = exp.filter(d => { const h = (NOW - Date.parse(d.openerSentAt)) / 36e5; return !isNaN(h) && h >= 0 && h < 720; });
  const basis = cur.length ? cur : exp;
  assert.strictEqual(rr.openers, basis.length);
  assert.strictEqual(rr.replied, basis.filter(d => d.firstReplyAt).length);
  assert.strictEqual(rr.pct, Math.round(rr.replied / rr.openers * 100));
});
test('waiting excludes liked-only, non-active and personal chats', () => {
  const w = HQ.waiting(dms, NOW);
  w.forEach(x => { assert.strictEqual(x.d.category, 'lead'); assert.ok(!x.d.lastLeadMessageLiked); assert.ok(!x.d.status || x.d.status === 'active'); assert.strictEqual(x.d.lastSender, 'lead'); });
  for (let i = 1; i < w.length; i++) assert.ok((HQ.parseTs(w[i - 1].since) || NOW) <= (HQ.parseTs(w[i].since) || NOW));
  const exp = dms.filter(d => d.category === 'lead' && !d.notApplicable && !(/^pending-/.test(d.id) && (d.resolvedTo || d.unresolvable)) && d.lastSender === 'lead' && (!d.status || d.status === 'active') && !d.lastLeadMessageLiked).length;
  assert.strictEqual(w.length, exp);
});
test('follow-ups: outbound and magnet cadences are disjoint and bucketed by Sydney day', () => {
  const fu = HQ.followUps(dms, NOW, false), mfu = HQ.followUps(dms, NOW, true);
  const ids = new Set([...fu.over, ...fu.today, ...fu.soon, ...fu.later, ...fu.done].map(f => f.d.id));
  [...mfu.over, ...mfu.today, ...mfu.soon, ...mfu.later, ...mfu.done].forEach(f => assert.ok(!ids.has(f.d.id)));
  const start = HQ.sydMidnight('2026-10-21'), end = HQ.sydMidnight('2026-10-22');
  fu.over.forEach(f => assert.ok(f.due < start)); fu.today.forEach(f => assert.ok(f.due >= start && f.due < end));
  // independent recomputation of "due" count
  const CAD = HQ.CADENCE; let exp = 0;
  dms.forEach(d => {
    if (d.category !== 'lead' || d.notApplicable || d.opener === 'magnet_delivery' || (/^pending-/.test(d.id) && !d.threadId)) return;
    if (d.followUpStopped || HQ.STOP_STATUSES[d.status] || d.lastSender !== 'jordan') return;
    const seq = d.firstReplyAt ? 'convo' : 'cold', step = Math.max(0, d.followUpsSinceReply || 0);
    const base = Date.parse(d.lastJordanAt || d.lastMessageAt); if (isNaN(base) || step >= CAD[seq].length) return;
    if (base + CAD[seq][step] * 36e5 < end) exp++;
  });
  assert.strictEqual(fu.due, exp);
});
test('dm_daily: a missing day is unknown (has=false, o=null), never zero', () => {
  const s = HQ.dailySeries(daily, '2026-10-20', 14);
  const idx = HQ.dailyIndex(daily);
  s.forEach(d => { if (idx[d.key]) { assert.strictEqual(d.has, true); assert.strictEqual(d.o, +idx[d.key].openersSent || 0); } else { assert.strictEqual(d.has, false); assert.strictEqual(d.o, null); } });
  assert.strictEqual(HQ.groupRec({ openersSent: 3 }, 'recipe'), null); // pre-byGroup day
  assert.deepStrictEqual(HQ.groupRec({ byGroup: { recipe: { openersSent: 2 } } }, 'recipe'), { openersSent: 2 });
});

// ---- content ----
test('weekly scorecard reads meta/contentPlan and counts posts by stage, untagged listed', () => {
  const plan = meta.contentPlan;
  assert.ok(plan && plan.weeklyTargets && plan.weeklyTargets.top === 4);
  const w = HQ.contentWeek(igPosts, igStories, plan, '2026-10-13', NOW);
  assert.strictEqual(w.weekStart, '2026-10-12'); assert.strictEqual(w.weekEnd, '2026-10-18');
  assert.strictEqual(w.rows[0].plan, 4); assert.strictEqual(w.rows[3].label, 'Hard CTA'); assert.strictEqual(w.rows[3].plan, 1);
  const inWeek = igPosts.filter(p => { const d = HQ.igPostedAt(p, NOW).day; return d >= '2026-10-12' && d <= '2026-10-18'; });
  assert.strictEqual(w.items.length, inWeek.length);
  assert.strictEqual(w.untagged.length, inWeek.filter(p => !['top', 'mid', 'proof'].includes(String(p.stage || '').toLowerCase())).length);
  const empty = HQ.contentWeek([], [], plan, '2026-01-05', NOW);
  assert.strictEqual(empty.totalPosted, 0); assert.strictEqual(empty.behind.length, 4);
  const noPlan = HQ.contentWeek(igPosts, igStories, null, '2026-10-13', NOW);
  assert.strictEqual(noPlan.rows[0].plan, 4); // falls back to Jordan's stated plan
  const nullStage = HQ.contentWeek([{ id: '4006881757455411469', stage: null }], [], plan, '2026-10-13', NOW);
  assert.strictEqual(nullStage.untagged.length, 1);
});
test('story attribution is exact tag match only', () => {
  const rows = HQ.storyRows(igStories, tfResponses, NOW);
  rows.forEach(r => { if (r.stickerNorm) assert.strictEqual(r.matched, HQ.tagCounts(tfResponses)[r.stickerNorm] || 0); else assert.strictEqual(r.matched, null); });
  const m = HQ.storyRows([{ id: '4006129191162261612', linkStickerLabel: 'Link In Bio' }], tfResponses, NOW)[0];
  assert.strictEqual(m.stickerNorm, 'link_in_bio');
  assert.strictEqual(m.matched, tfResponses.filter(r => r.utm && r.utm.utm_content === 'link_in_bio').length);
});

// ---- typeform ----
test('tfSum and appsInRange use Sydney days; started === completed on this plan', () => {
  const t = HQ.tfSum(tfDaily, '2026-10-01', '2026-10-21');
  let v = 0, c = 0; tfDaily.forEach(d => { const k = d.date || d.id; if (k >= '2026-10-01' && k <= '2026-10-21') { v += +d.visits || 0; c += +d.completed || 0; } });
  assert.strictEqual(t.visits, v); assert.strictEqual(t.completed, c);
  tfDaily.forEach(d => assert.strictEqual(+d.started || 0, +d.completed || 0));
  const apps = HQ.appsInRange(tfResponses, '2026-10-01', '2026-10-21');
  assert.strictEqual(apps.length, tfResponses.filter(r => r.submittedAt && HQ.sydDay(r.submittedAt) >= '2026-10-01' && HQ.sydDay(r.submittedAt) <= '2026-10-21').length);
});

// ---- goal ----
test('goal maths uses only Jordan\'s inputs and shows null when current is unknown', () => {
  const g0 = HQ.goalMath({}, null, NOW);
  assert.strictEqual(g0.current, null); assert.strictEqual(g0.gap, null); assert.strictEqual(g0.clientsPerWeek, null); assert.strictEqual(g0.daysLeft, 71);
  const g = HQ.goalMath({ currentMonthly: 4150, clientValue: 450, showRate: 0.4, closeRate: 0.7 }, null, NOW);
  assert.strictEqual(g.gap, 5850); assert.strictEqual(g.clientsNeeded, 13);
  assert.ok(Math.abs(g.clientsPerWeek - 13 / (71 / 7)) < 1e-9);
  assert.ok(Math.abs(g.bookingsPerWeek - g.clientsPerWeek / 0.7 / 0.4) < 1e-9);
  const gs = HQ.goalMath({ currentMonthly: 4150 }, { mrr: 5000 }, NOW);
  assert.strictEqual(gs.current, 5000); assert.strictEqual(gs.currentSource, 'stripe');
});

// ---- health + today ----
test('health rows: stale → amber, incomplete → red, missing → grey', () => {
  const rows = HQ.healthRows(meta, NOW);
  const dm = rows.find(r => r.name === 'DM scan'); assert.strictEqual(dm.chip, 'red'); // coverage.complete=false in fixture
  const ads = rows.find(r => /Meta Ads/.test(r.name)); assert.strictEqual(ads.chip, 'grey');
  const tf = rows.find(r => /Typeform/.test(r.name)); assert.ok(['green', 'amber'].includes(tf.chip));
  const stale = HQ.healthRows({ scan: { lastScanAt: '2026-10-10T00:00:00Z' } }, NOW).find(r => /Likes/.test(r.name)); assert.strictEqual(stale.chip, 'amber');
  const fail = HQ.healthRows({ typeformSync: { lastSyncAt: '2026-10-21T03:00:00Z', ok: false, error: 'boom' } }, NOW).find(r => /Typeform/.test(r.name)); assert.strictEqual(fail.chip, 'red');
  assert.strictEqual(HQ.healthRows({}, NOW).every(r => r.chip === 'grey'), true);
});
test('computeToday: ranked actions from real data only, every number labelled or null', () => {
  const t = HQ.computeToday(state, NOW);
  assert.ok(t.actions.length <= 7);
  t.actions.forEach(a => { assert.ok(a.title && a.why && a.go); });
  assert.strictEqual(t.counts.waiting, HQ.waiting(dms, NOW).length);
  assert.strictEqual(t.counts.followUpsDue, HQ.followUps(dms, NOW, false).due);
  t.yesterday.forEach(y => assert.ok(y.value === null || typeof y.value === 'number'));
  t.funnel7.stages.forEach(s => { assert.ok(s.value === null || typeof s.value === 'number'); if (s.value === null) assert.ok(s.reason); });
  const slack = HQ.formatSlack(t);
  assert.ok(/TASTEFORM \| /.test(slack)); assert.ok(!/NaN|undefined/.test(slack));
  // empty everything must not throw and must produce no actions
  const e = HQ.computeToday({ meta: {} }, NOW);
  assert.strictEqual(e.actions.length, 0); assert.ok(e.health.every(r => r.chip === 'grey'));
  assert.ok(!/NaN|undefined/.test(JSON.stringify(e)));
});
test('edge cases: null fields, missing plan, no dates, very long captions', () => {
  const weird = [{ id: 'pending-x', category: 'lead', stage: null, lastSender: 'lead' }, { id: 'y', category: 'lead', threadId: 't', direction: 'outbound', opener: 'recipe_offer_a', lastSender: 'jordan', lastMessageAt: 'not a date' }, { id: null, category: 'lead' }];
  assert.doesNotThrow(() => HQ.computeToday({ dms: weird, igPosts: [{ id: 'zzz', caption: 'x'.repeat(5000), stage: null, views: NaN }], meta: { contentPlan: null } }, NOW));
  assert.strictEqual(HQ.fuState(weird[1], NOW), null);
  assert.strictEqual(HQ.stageLabel({ stage: 'nope' }), 'Opener sent');
});

// ---- Email sequences ----
test('email stats count distinct contacts, only among people sent that email', () => {
  const steps = [
    { id: 's1', order: 1, sequence: 'a', delayDays: 0 }, { id: 's2', order: 2, sequence: 'a', delayDays: 2 }, { id: 's3', order: 3, sequence: 'a', delayDays: 2 }];
  const T0 = '2026-11-04T00:00:00Z', T1 = '2026-11-05T00:00:00Z';
  const ev = [
    { contactId: 'c1', step: 's1', event: 'enrolled', at: T0, tags: ['recipe: hsp', 'country: au', 'vip'] },
    { contactId: 'c1', step: 's1', event: 'sent', at: T0, tags: ['recipe: hsp', 'country: au'] },
    { contactId: 'c1', step: 's1', event: 'opened', at: T0, count: 3 },
    { contactId: 'c2', step: 's1', event: 'enrolled', at: T0, tags: ['recipe: wrap', 'country: uk'] },
    { contactId: 'c2', step: 's1', event: 'sent', at: T0 },
    { contactId: 'c2', step: 's1', event: 'replied', at: T1 },
    { contactId: 'c3', step: 's1', event: 'enrolled', at: T1 },
    { contactId: 'c4', step: 's1', event: 'opened', at: T1 }, // opened with no sent row: ignored
    { contactId: 'c5', step: 's1', event: 'enrolled', at: T0 }, { contactId: 'c5', step: 's1', event: 'sent', at: T0 }, { contactId: 'c5', step: 's1', event: 'unsubscribed', at: T0 }];
  const NOW = Date.parse('2026-11-06T12:00:00Z');
  const r = HQ.emailStats(steps, ev, NOW);
  const p1 = r.perStep[0];
  assert.strictEqual(p1.sent, 3); assert.strictEqual(p1.opened, 1); assert.strictEqual(p1.replied, 1); assert.strictEqual(p1.unsubscribed, 1);
  assert.strictEqual(p1.openRate, 33); assert.strictEqual(p1.replyRate, 33);
  assert.strictEqual(r.perStep[1].sent, 0); assert.strictEqual(r.perStep[1].replyRate, null);
  // up next: c3 enrolled, nothing sent -> s1 due now; c1 sent s1 at T0, s2 due T0+2d (<= NOW); c2 replied, c5 unsubscribed -> out
  assert.strictEqual(r.upNext[0].dueNow, 1); assert.strictEqual(r.upNext[1].dueNow, 1); assert.strictEqual(r.upNext[1].later, 0);
  assert.strictEqual(r.upNext[2].dueNow + r.upNext[2].later, 0);
  // tag splits only use "group: value" tags
  assert.deepStrictEqual(p1.byGroup.recipe.map(x => x.value).sort(), ['hsp', 'wrap']);
  assert.strictEqual(p1.byGroup.country.find(x => x.value === 'uk').replyRate, 100);
  assert.strictEqual(r.sentLog.length, 3); assert.strictEqual(r.totals.repliedContacts, 1);
  const e = HQ.emailStats([], [], NOW); assert.strictEqual(e.totals.replyRate, null); assert.ok(!/NaN|undefined/.test(JSON.stringify(e)));
});

test('Instagram analytics: windows, deltas, medians, account rows, scatter fallback, heatmap', () => {
  const P = (id, day, type, views, inter, extra) => Object.assign({ id, postedAtDate: day + 'T19:00:00+11:00', postedAtExact: true, mediaType: type, views, interactions: inter }, extra || {});
  const posts = [
    P('a', '2026-11-03', 'reel', 1000, 50), P('b', '2026-10-25', 'reel', 3000, 90), P('c', '2026-10-10', 'carousel', 18000, 900, { saves: 40, shares: 10 }),
    P('d', '2026-09-30', 'reel', 2000, 40), P('e', '2026-09-20', 'reel', 1000, 10),
    { id: 'x', mediaType: 'reel', views: 5, postedAtDate: '2026-11-01T10:00:00+11:00', postedAtExact: false }];
  const acc = [{ id: '2026-11-04', date: '2026-11-04', followers: 1300, p30: { reached: 9000, follows: 60, unfollows: 40 } },
    { id: '2026-10-05', date: '2026-10-05', followers: 1250, p30: { reached: 6000, follows: 30, unfollows: 30 } }, { id: '2026-10-04', date: '2026-10-04', followers: 1240 }];
  const a = HQ.igAnalytics(posts, acc, '2026-11-04', 30);
  assert.strictEqual(a.curFrom, '2026-10-06'); assert.strictEqual(a.prevTo, '2026-10-05');
  assert.strictEqual(a.cur.posts, 3); assert.strictEqual(a.prev.posts, 2); assert.strictEqual(a.undated, 1);
  assert.strictEqual(a.cur.views, 22000); assert.strictEqual(a.prev.views, 3000); assert.strictEqual(a.change.posts, 50);
  assert.strictEqual(a.cur.typicalReel, 2000); assert.strictEqual(a.cur.engPer1k, Math.round(1040 / 22000 * 10000) / 10);
  assert.strictEqual(a.cur.saves, 40); assert.strictEqual(a.cur.watchTimeSec, null);
  assert.deepStrictEqual(a.byType.map(t => t.type + ':' + t.typical), ['reel:2000', 'carousel:18000']);
  assert.strictEqual(a.top[0].id, 'c');
  assert.strictEqual(a.account.cur.reached, 9000); assert.strictEqual(a.account.change.reached, 50);
  assert.strictEqual(a.account.netFollowers, 1300 - 1250); // follower count at end minus the day before the window
  assert.strictEqual(a.scatter.yKey, 'engPer1k'); assert.strictEqual(a.scatter.points.length, 5);
  assert.strictEqual(a.heat.length, 91); assert.strictEqual(a.heat.filter(h => h.count).length, 5);
  assert.strictEqual(a.daysSincePost, 1);
  // missing account data stays null, never 0
  const b = HQ.igAnalytics(posts, [], '2026-11-04', 7);
  assert.strictEqual(b.account.cur, null); assert.strictEqual(b.account.netFollowers, null); assert.ok(!/NaN|Infinity/.test(JSON.stringify(b)));
  // with watch numbers on 3+ reels the scatter switches to retention
  const w = posts.map(p => p.mediaType === 'reel' && p.postedAtExact ? Object.assign({}, p, { avgWatchSec: 4, watchTimeSec: 100 }) : p);
  const c = HQ.igAnalytics(w, [], '2026-11-04', 30);
  assert.strictEqual(c.scatter.yKey, 'avgWatchSec'); assert.strictEqual(c.cur.watchTimeSec, 200); assert.strictEqual(c.cur.watchHave, 2);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
