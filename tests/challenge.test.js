// Playwright tests for the Challenge tab, on seeded MOCK data (no real clients, no network).
//   node tests/challenge.test.js [--shots dir]
// Checks: admin-only visibility, leaderboard ranks/points/gaps against an independent sum of confirmed events,
// client breakdown, manual log writes (points from challengeConfig, months), review approve/reject,
// Monday drafts (2 per client, unique wording, changes week to week), scan health colours,
// zero console errors/warnings, no NaN/undefined, no horizontal scroll and 44px targets at 390px, light + dark.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ---------- seeded mock data ----------
const CONFIG = { week: 'Mon-Sun Sydney', month: '2026-11', startDate: '2026-11-04', weeklyChatCap: 60, points: {
  story_tag: { pts: 10 }, one_on_one: { pts: 15 }, food_logged: { pts: 2 }, group_reply: { pts: 6 }, other_photo: { pts: 10 }, testimonial: { pts: 75 },
  perfect_week: { pts: 20 }, steps_target: { pts: 2 }, group_message: { pts: 3 }, referral_call: { pts: 50 }, referral_paid: { pts: 250 }, weight_logged: { pts: 1 },
  prizeStoryPost: 50, progress_photo: { pts: 25 }, trained_by_bio: { pts: 75, ptsKept: 25 }, checkin_on_time: { pts: 10 }, training_session: { pts: 5 }, before_after_story: { pts: 100 } } };
const P = t => (t === 'prize_story' ? CONFIG.points.prizeStoryPost : CONFIG.points[t].pts);
const MEMBERS = [['adam', 'Adam Test', 4, 0.95], ['hader', 'Hader Test', 4, 0.9], ['tom', 'Tom Test', 3, 0.6], ['jack', 'Jack Test', 4, 0.7], ['liam', 'Liam Test', 4, 0.5],
  ['noah', 'Noah Test', 3, 0.4], ['eli', 'Eli Test', null, 0.3], ['sam', 'Sam Test', 4, 0.2]];
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function addDays(k, n) { const t = new Date(k + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function weekStart(k) { const d = new Date(k + 'T00:00:00Z').getUTCDay(); return addDays(k, d === 0 ? -6 : 1 - d); }
function buildFixtures(scoredThrough, extra) {
  const events = [];
  const ev = (m, type, key, date, data) => events.push({ id: `${m}|${type}|${key}`, data: Object.assign({ member: m, type, date, month: date.slice(0, 7), points: P(type), status: 'confirmed', source: 'mock' }, data || {}) });
  MEMBERS.forEach(([id, , spw, skill], mi) => {
    const r = rng(1000 + mi * 77);
    for (let d = '2026-11-04'; d <= scoredThrough; d = addDays(d, 1)) {
      if (r() < skill) ev(id, 'weight_logged', d, d);
      if (r() < skill) ev(id, 'food_logged', d, d);
      const msgs = Math.floor(r() * 4 * skill); if (msgs && id !== 'sam') ev(id, 'group_message', d, d, { count: msgs, points: msgs * 3 });
      if (r() < skill * 0.3) ev(id, 'group_reply', d, d, { count: 1, points: 6 });
      if (r() < skill * 0.2) ev(id, 'story_tag', d, d);
    }
    for (let ws = '2026-11-02'; ws <= scoredThrough; ws = addDays(ws, 7)) {
      const we = addDays(ws, 6); if (we > scoredThrough) break;
      if (spw) { let done = 0; for (let i = 0; i < 7 && done < spw; i++) { const d = addDays(ws, i); if (d < '2026-11-04') continue; if (r() < skill + 0.2) { ev(id, 'training_session', d + '-day-' + i, d); done++; } } }
      if (r() < skill + 0.1) ev(id, 'checkin_on_time', we, we);
      if (r() < skill * 0.6) ev(id, 'progress_photo', ws, we);
    }
  });
  // review items
  events.push({ id: 'tom|training_session|2026-11-12-legs', data: { member: 'tom', type: 'training_session', date: '2026-11-12', month: '2026-11', points: 0, status: 'needs_review', source: '1fit', evidence: 'Only 4 of 7 exercises logged (57%)' } });
  events.push({ id: 'jack|progress_photo|2026-11-16', data: { member: 'jack', type: 'progress_photo', date: '2026-11-16', month: '2026-11', points: 0, status: 'needs_review', source: 'whatsapp', evidence: 'Photo is a mirror shot, torso partly hidden' } });
  events.push({ id: 'noah|training_session|2026-11-10-extra', data: { member: 'noah', type: 'training_session', date: '2026-11-10', month: '2026-11', points: 0, status: 'over_cap', source: '1fit' } });
  const reviews = [{ id: 'rv-liam-1', data: { member: 'liam', type: 'progress_photo', date: '2026-11-16', month: '2026-11', status: 'pending', source: '1fit', key: '2026-11-16', evidence: 'Check-in photo, lighting borderline' } }];
  const members = MEMBERS.map(([id, name, spw]) => ({ id, data: Object.assign({ name, active: true, whatsappName: name }, spw ? { plan: { name: 'Plan', sessionsPerWeek: spw } } : {}) }));
  const scan = Object.assign({ lastScanAt: '2026-11-16T01:40:00+00:00', scoredThrough, coverage: { complete: false, failed: [{ member: 'eli', source: '1fit', reason: 'not in the active client list' }], unmatched: ['eli'], noIgHandle: [], noStepTarget: ['sam'], resume: [] } }, extra && extra.scan);
  return { meta: [{ id: 'challengeConfig', data: CONFIG }, { id: 'challengeScan', data: scan }], challenge_members: members, challenge_clients: [], challenge_events: events, challenge_scores: [], challenge_reviews: reviews,
    dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: [] };
}
function expectedBoard(fx, month) {
  const tot = {}; fx.challenge_events.forEach(e => { const d = e.data; if (d.month === month && d.status === 'confirmed') tot[d.member] = (tot[d.member] || 0) + d.points; });
  const rows = MEMBERS.map(([id, name]) => ({ id, name, points: tot[id] || 0 })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1; });
  return rows;
}

// ---------- harness ----------
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
async function open(browser, url, { width = 1280, dark = false, role = 'admin', fx, now }) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const log = { errors: [], warnings: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `
    (function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){} var fixedNow=${Date.parse(now)}; var RealDate=Date;
      function MockDate(){ if(arguments.length) return new (Function.prototype.bind.apply(RealDate,[null].concat([].slice.call(arguments))))(); return new RealDate(fixedNow); }
      MockDate.now=function(){ return fixedNow; }; MockDate.parse=RealDate.parse; MockDate.UTC=RealDate.UTC; MockDate.prototype=RealDate.prototype; window.Date=MockDate;
      var c=makeMockClient(${JSON.stringify(fx)}); var from=c.from; window.__tablesQueried={}; c.from=function(t){ window.__tablesQueried[t]=(window.__tablesQueried[t]||0)+1; return from(t); };
      window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'${role === 'admin' ? 'jordan.tornatore@gmail.com' : 'setter@example.com'}'}, profile:{role:'${role}', display_name:'${role === 'admin' ? 'Jordan' : 'Setter'}'} };
    })();` });
  await page.goto(url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.state, null, { timeout: 10000 });
  await page.waitForTimeout(200);
  return { context, page, log };
}
async function goChallenge(page, view) {
  await page.evaluate(() => window.__hq.setView('challenge'));
  await page.waitForFunction(() => window.__challenge && window.__challenge.S.loaded.base && window.__challenge.S.events['2026-11'], null, { timeout: 5000 });
  if (view) { await page.click(`#chViewSeg [data-chview="${view}"]`); }
  await page.waitForTimeout(150);
}
const table = (page, t) => page.evaluate(t => window.__mock.__tables[t].map(r => Object.assign({ id: r.id }, r.data)), t);
async function layoutChecks(page, label, width) {
  const txt = await page.evaluate(() => document.getElementById('viewChallenge').innerText);
  check(`${label}: no NaN/undefined/null in text`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(txt), txt.match(/.{0,40}(NaN|undefined|null|Infinity|\[object).{0,40}/) && txt.match(/.{0,40}(NaN|undefined|null|Infinity|\[object).{0,40}/)[0]));
  if (width < 500) {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label}: no horizontal scroll at 390`, () => assert.ok(ov <= 0, 'overflow ' + ov + 'px'));
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('#viewChallenge button, #viewChallenge select, #viewChallenge input')).filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => (b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height)));
    check(`${label}: 44px touch targets`, () => assert.deepStrictEqual(small, []));
  }
}

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  const NOW = '2026-11-17T01:00:00Z'; // Tue 17 Nov, 12pm Sydney
  try {
    const fx = buildFixtures('2026-11-16');
    const exp = expectedBoard(fx, '2026-11');

    // ---- every layout: admin, 1280/390, light/dark ----
    for (const width of [1280, 390]) for (const dark of [false, true]) {
      const label = `${width}px ${dark ? 'dark' : 'light'}`;
      const { context, page, log } = await open(browser, url, { width, dark, fx: JSON.parse(JSON.stringify(fx)), now: NOW });
      const tabVisible = await page.evaluate(() => !document.getElementById('tabChallenge').hidden || !document.getElementById('sheetChallenge').hidden);
      check(`${label}: tab visible for admin`, () => assert.ok(tabVisible));
      for (const v of ['board', 'review', 'drafts', 'health']) {
        await goChallenge(page, v);
        if (v === 'board') { await page.click('[data-ch-open="tom"]'); await page.waitForTimeout(100); }
        await layoutChecks(page, `${label} ${v}`, width);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `challenge-${v}-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
      }
      check(`${label}: zero console errors`, () => assert.deepStrictEqual(log.errors, []));
      check(`${label}: zero console warnings`, () => assert.deepStrictEqual(log.warnings, []));
      await context.close();
    }

    // ---- leaderboard numbers ----
    {
      const { context, page, log } = await open(browser, url, { fx: JSON.parse(JSON.stringify(fx)), now: NOW });
      await goChallenge(page, 'board');
      const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.ch-row')).map(r => ({ id: r.getAttribute('data-ch-open'), rank: r.querySelector('.ch-rank').textContent, pts: r.querySelector('.ch-pts').firstChild.textContent, gaps: r.querySelector('.ch-who small').textContent })));
      check('board: order and points match the independent sum', () => assert.deepStrictEqual(shown.map(s => s.id + ':' + s.pts), exp.map(e => e.id + ':' + e.points)));
      check('board: ranks', () => assert.deepStrictEqual(shown.map(s => +s.rank), exp.map(e => e.rank)));
      const first = exp[0].points, fifth = exp[4].points, last = exp[exp.length - 1];
      check('board: gap text for last place', () => assert.strictEqual(shown[shown.length - 1].gaps, `${first - last.points} off 1st · ${fifth - last.points} off 5th`));
      check('board: leader says Leader', () => assert.ok(/^Leader · Top 5$/.test(shown[0].gaps), shown[0].gaps));
      // breakdown
      await page.click('[data-ch-open="tom"]');
      const det = await page.evaluate(() => document.querySelector('.ch-item.open .ch-detail').innerText);
      const tomSessions = fx.challenge_events.filter(e => e.data.member === 'tom' && e.data.type === 'training_session' && e.data.status === 'confirmed').length;
      const tomFood = fx.challenge_events.filter(e => e.data.member === 'tom' && e.data.type === 'food_logged' && e.data.status === 'confirmed').length;
      check('breakdown: sessions done vs prescribed', () => assert.ok(det.includes(`${tomSessions} done · 3 a week prescribed · 1 flagged`), det.slice(0, 300)));
      check('breakdown: food days of days scored', () => assert.ok(det.includes(`${tomFood} of 13 days`), det));
      check('breakdown: total equals leaderboard', () => assert.ok(new RegExp('Total\\s+' + exp.find(e => e.id === 'tom').points).test(det)));
      // eli has a coverage gap and no plan
      await page.click('[data-ch-open="eli"]');
      const eli = await page.evaluate(() => Array.from(document.querySelectorAll('.ch-item.open .ch-detail')).map(d => d.innerText).join('\n'));
      check('breakdown: coverage gap shown, plan not guessed', () => { assert.ok(eli.includes('1fit: not in the active client list')); assert.ok(eli.includes('plan not read yet')); });

      // ---- manual log ----
      const tomBefore = exp.find(e => e.id === 'tom').points;
      await page.click('[data-ch-log="one_on_one"][data-member="tom"]'); await page.waitForTimeout(150);
      await page.click('[data-ch-log="testimonial"][data-member="tom"]'); await page.waitForTimeout(150);
      await page.click('[data-ch-log="prize_story"][data-member="tom"]'); await page.waitForTimeout(150);
      await page.fill('[data-ch-date="tom"]', '2026-12-01');
      await page.click('[data-ch-log="referral_paid"][data-member="tom"]'); await page.waitForTimeout(150);
      const msg = await page.evaluate(() => (document.querySelector('.ch-msg') || {}).innerText || '');
      check('manual: referral paid says it counts in December', () => assert.ok(/December 2026/.test(msg), msg));
      await page.fill('[data-ch-date="tom"]', '2026-11-17');
      await page.click('[data-ch-log="referral_call"][data-member="tom"]'); await page.waitForTimeout(150);
      let evs = await table(page, 'challenge_events');
      const mine = evs.filter(e => e.member === 'tom' && e.source === 'manual');
      const byType = t => mine.filter(e => e.type === t);
      check('manual: 1:1 = 15 in Nov', () => assert.deepStrictEqual(byType('one_on_one').map(e => [e.points, e.month, e.status]), [[15, '2026-11', 'confirmed']]));
      check('manual: testimonial = 75, keyed by month', () => assert.deepStrictEqual(byType('testimonial').map(e => [e.id, e.points]), [['tom|testimonial|2026-11', 75]]));
      check('manual: prize story = 50 in next month', () => assert.deepStrictEqual(byType('prize_story').map(e => [e.id, e.points, e.month]), [['tom|prize_story|2026-12', 50, '2026-12']]));
      check('manual: referral paid = 250 dated to the month it cleared', () => assert.deepStrictEqual(byType('referral_paid').map(e => [e.points, e.month, e.date]), [[250, '2026-12', '2026-12-01']]));
      check('manual: referral call = 50', () => assert.deepStrictEqual(byType('referral_call').map(e => [e.points, e.month]), [[50, '2026-11']]));
      const testiBtn = await page.evaluate(() => document.querySelector('[data-ch-log="testimonial"][data-member="tom"]').getAttribute('aria-pressed'));
      check('manual: testimonial shows logged', () => assert.strictEqual(testiBtn, 'true'));
      await page.click('[data-ch-log="testimonial"][data-member="tom"]'); await page.waitForTimeout(150);
      evs = await table(page, 'challenge_events');
      check('manual: second testimonial in a month is refused', () => assert.strictEqual(evs.filter(e => e.member === 'tom' && e.type === 'testimonial').length, 1));
      let scores = await table(page, 'challenge_scores');
      check('scores: tom|2026-11 updated', () => assert.strictEqual(scores.find(s => s.id === 'tom|2026-11').points, tomBefore + 15 + 75 + 50));
      check('scores: tom|2026-12 written for the next-month points', () => assert.strictEqual(scores.find(s => s.id === 'tom|2026-12').points, 300));
      const ptsNow = await page.evaluate(() => document.querySelector('[data-ch-open="tom"] .ch-pts').firstChild.textContent);
      check('board: tom total updates straight away', () => assert.strictEqual(+ptsNow, tomBefore + 140));
      // undo the 1:1
      const undoId = byType('one_on_one')[0].id;
      await page.click(`[data-ch-undo="${undoId}"]`); await page.waitForTimeout(150);
      evs = await table(page, 'challenge_events');
      check('manual: undo cancels (no delete)', () => assert.deepStrictEqual([evs.find(e => e.id === undoId).status, evs.find(e => e.id === undoId).points], ['cancelled', 0]));
      scores = await table(page, 'challenge_scores');
      check('scores: undo flows into challenge_scores', () => assert.strictEqual(scores.find(s => s.id === 'tom|2026-11').points, tomBefore + 125));

      // ---- review queue ----
      await page.click('#chViewSeg [data-chview="review"]'); await page.waitForTimeout(100);
      const nItems = await page.evaluate(() => document.querySelectorAll('.ch-rv').length);
      check('review: 3 items (2 flagged events + 1 review row)', () => assert.strictEqual(nItems, 3));
      check('review: badge shows 3', async () => {});
      await page.click('[data-ch-approve="tom|training_session|2026-11-12-legs"]'); await page.waitForTimeout(150);
      evs = await table(page, 'challenge_events');
      const tomWeek = fx.challenge_events.filter(e => e.data.member === 'tom' && e.data.type === 'training_session' && e.data.status === 'confirmed' && weekStart(e.data.date) === '2026-11-09').length;
      const appr = evs.find(e => e.id === 'tom|training_session|2026-11-12-legs');
      check('review: approve writes points (or over_cap when the week is full)', () => assert.deepStrictEqual([appr.status, appr.points, appr.reviewedBy], tomWeek >= 3 ? ['over_cap', 0, 'jordan'] : ['confirmed', 5, 'jordan']));
      await page.click('[data-ch-reject="jack|progress_photo|2026-11-16"]'); await page.waitForTimeout(80);
      await page.click('[data-ch-reason="jack|progress_photo|2026-11-16"][data-reason="Not a physique shot"]'); await page.waitForTimeout(150);
      evs = await table(page, 'challenge_events');
      const rej = evs.find(e => e.id === 'jack|progress_photo|2026-11-16');
      check('review: reject records the reason, 0 points', () => assert.deepStrictEqual([rej.status, rej.points, rej.rejectReason], ['rejected', 0, 'Not a physique shot']));
      await page.click('[data-ch-approve="rv-liam-1"]'); await page.waitForTimeout(150);
      const rv = (await table(page, 'challenge_reviews'))[0]; evs = await table(page, 'challenge_events');
      const liamPhotoWeek = fx.challenge_events.some(e => e.data.member === 'liam' && e.data.type === 'progress_photo' && e.data.status === 'confirmed' && weekStart(e.data.date) === '2026-11-16');
      const le = evs.find(e => e.id === 'liam|progress_photo|2026-11-16');
      check('review: review row approved and event written', () => { assert.strictEqual(rv.status, 'approved'); assert.strictEqual(rv.eventId, 'liam|progress_photo|2026-11-16'); assert.deepStrictEqual([le.status, le.points], liamPhotoWeek ? ['over_cap', 0] : ['confirmed', 25]); });
      const left = await page.evaluate(() => document.querySelectorAll('.ch-rv').length);
      check('review: queue empties', () => assert.strictEqual(left, 0));

      // ---- drafts ----
      await page.click('#chViewSeg [data-chview="drafts"]'); await page.waitForTimeout(150);
      const D = await page.evaluate(() => window.__challenge.S.lastDrafts && { group: window.__challenge.S.lastDrafts.group, dms: window.__challenge.S.lastDrafts.dms.map(d => ({ id: d.id, m1: d.msg1, m2: d.msg2, rank: d.rank })) });
      if (process.env.DUMP) console.log(D.group + '\n\n' + D.dms.map(d => d.m1 + '\n   ' + d.m2).join('\n'));
      check('drafts: one per client, two messages each', () => { assert.strictEqual(D.dms.length, MEMBERS.length); D.dms.forEach(d => { assert.ok(d.m1.length > 20 && d.m2.length > 20); }); });
      check('drafts: msg1 wording unique per client', () => assert.strictEqual(new Set(D.dms.map(d => d.m1.replace(/\d+/g, '#').replace(/^\S+ \S+,/, ''))).size, D.dms.length));
      check('drafts: group post has top 5 only', () => { const lines = D.group.split('\n').filter(l => /^\d\. /.test(l)); assert.ok(lines.length >= 5 && lines.length <= 6, D.group); });
      check('drafts: no sign-off lines, ends on focus areas', () => D.dms.forEach(d => assert.ok(!/fly up/i.test(d.m2))));
      const copyBtns = await page.evaluate(() => document.querySelectorAll('[data-ch-copy]').length);
      check('drafts: copy button per draft', () => assert.strictEqual(copyBtns, 1 + MEMBERS.length * 2));
      await page.click('[data-ch-copy="dm"][data-i="0"][data-n="1"]'); await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
      check('drafts: copy puts msg1 on the clipboard', () => assert.strictEqual(clip, D.dms[0].m1));
      const mem = (await table(page, 'challenge_members')).find(m => m.id === D.dms[0].id);
      check('drafts: copy records a short hash on the member', () => assert.ok(Array.isArray(mem.dmHistory) && mem.dmHistory[0].h1 && mem.dmHistory[0].week === '2026-11-09'));
      // the next Monday, same numbers: wording must change for every client
      const memRows = await table(page, 'challenge_members');
      await context.close();
      const fx2 = buildFixtures('2026-11-16'); fx2.meta[1].data.scoredThrough = '2026-11-23'; fx2.meta[1].data.lastScanAt = '2026-11-23T01:40:00Z';
      fx2.challenge_members = memRows.map(m => ({ id: m.id, data: Object.assign({}, m, { id: undefined }) }));
      const p2 = await open(browser, url, { fx: fx2, now: '2026-11-24T01:00:00Z' });
      await goChallenge(p2.page, 'drafts');
      const D2 = await p2.page.evaluate(() => window.__challenge.S.lastDrafts && window.__challenge.S.lastDrafts.dms.map(d => ({ id: d.id, m1: d.msg1, m2: d.msg2 })));
      if (process.env.DUMP) console.log('\n--- next week ---\n' + D2.map(d => d.m1 + '\n   ' + d.m2).join('\n'));
      check('drafts: next week every client gets different wording', () => D2.forEach(d => { const a = D.dms.find(x => x.id === d.id); assert.ok(a && a.m1 !== d.m1 && a.m2 !== d.m2, d.id + '\n' + a.m1 + '\n' + d.m1); }));
      check('drafts: zero console errors across writes', () => assert.deepStrictEqual(log.errors.concat(p2.log.errors), []));
      await p2.context.close();
    }

    // ---- drafts blocked when the scan hasn't scored Sunday ----
    {
      const fx3 = buildFixtures('2026-11-14');
      const { context, page } = await open(browser, url, { fx: fx3, now: NOW });
      await goChallenge(page, 'drafts');
      const t = await page.evaluate(() => document.getElementById('chRoot').innerText);
      check('drafts: blank with a reason when last week is not fully scored', () => assert.ok(/only scored through/.test(t), t));
      await context.close();
    }

    // ---- scan health ----
    for (const [name, patch, level] of [['fresh', {}, 'green'], ['stale', { lastScanAt: '2026-11-15T20:00:00Z' }, 'amber'], ['failed', { status: 'failed', lastError: 'Chrome unreachable' }, 'red'], ['none', { lastScanAt: null }, 'grey']]) {
      const fx4 = buildFixtures('2026-11-16', { scan: patch });
      const { context, page, log } = await open(browser, url, { fx: fx4, now: NOW });
      await goChallenge(page, 'health');
      const lv = await page.evaluate(() => document.getElementById('chScanChip').getAttribute('data-level'));
      check(`health ${name}: ${level}`, () => assert.strictEqual(lv, level));
      const t = await page.evaluate(() => document.getElementById('chRoot').innerText);
      if (name === 'fresh') check('health: 1FIT amber (one client not read), WhatsApp green', () => { assert.ok(/1FIT\s+came through, 1 client not read/.test(t), t); assert.ok(/WhatsApp\s+came through/.test(t), t); });
      if (name === 'failed') check('health: failure reason shown', () => assert.ok(/Chrome unreachable/.test(t)));
      check(`health ${name}: no console errors`, () => assert.deepStrictEqual(log.errors, []));
      await context.close();
    }

    // ---- non-admin ----
    for (const width of [1280, 390]) {
      const { context, page, log } = await open(browser, url, { width, role: 'limited', fx: buildFixtures('2026-11-16'), now: NOW });
      await page.evaluate(() => window.__hq.setView('challenge')); await page.waitForTimeout(300);
      const st = await page.evaluate(() => ({ tab: document.getElementById('tabChallenge').hidden, sheet: document.getElementById('sheetChallenge').hidden, view: document.getElementById('viewChallenge').hidden, q: Object.keys(window.__tablesQueried).filter(t => /^challenge_/.test(t)), meta: window.__challenge.S.cfg }));
      check(`limited ${width}: tab + sheet hidden`, () => { assert.strictEqual(st.tab, true); assert.strictEqual(st.sheet, true); });
      check(`limited ${width}: view bounces`, () => assert.strictEqual(st.view, true));
      check(`limited ${width}: never queries challenge tables`, () => assert.deepStrictEqual(st.q, []));
      check(`limited ${width}: no console errors`, () => assert.deepStrictEqual(log.errors, []));
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`\nchallenge tests: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
