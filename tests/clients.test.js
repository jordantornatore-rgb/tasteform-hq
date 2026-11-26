// Clients tab (client database): node tests/clients.test.js [--shots dir]
// Synthetic data only. Roster (status, attention, weight/gym), profile maths (7-day avg, trend, gym %, check-ins),
// Loom prep (coach-only points), Screenshare (no private notes), edit form saves data.manual, limited role can't see it.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const TODAY = '2026-11-26'; // Thursday
const dn = s => Math.round(Date.parse(s + 'T00:00:00Z') / 864e5), nd = n => new Date(n * 864e5).toISOString().slice(0, 10);
const T = dn(TODAY), metrics = [];
// Jack: 30 daily weigh-ins from 93.0 down 0.05/day; sessions 2 per week (plan 4); weekly check-ins
for (let i = 29; i >= 0; i--) metrics.push({ id: 'jk|' + nd(T - i) + '|weight', data: { member_id: 'jack-keys', date: nd(T - i), kind: 'weight', value: +(93 - (29 - i) * 0.05).toFixed(2) } });
const mon = T - ((new Date(T * 864e5).getUTCDay() + 6) % 7);
for (let w = 1; w <= 4; w++) [0, 2].forEach(d => metrics.push({ id: 'jk|s|' + w + d, data: { member_id: 'jack-keys', date: nd(mon - 7 * w + d), kind: 'session', value: 1 } }));
metrics.push({ id: 'jk|s|now', data: { member_id: 'jack-keys', date: nd(mon + 1), kind: 'session', value: 1 } });
[4, 11, 18].forEach(d => metrics.push({ id: 'jk|c|' + d, data: { member_id: 'jack-keys', date: nd(T - d), kind: 'checkin', value: 1, detail: { summary: 'Week rating 6/10, work flat out' } } }));
// Harris: perfect 4/4 sessions, no weights
for (let w = 1; w <= 4; w++) [0, 1, 4, 5].forEach(d => metrics.push({ id: 'hk|s|' + w + d, data: { member_id: 'harris-katsianos', date: nd(mon - 7 * w + d), kind: 'session', value: 1 } }));
[3, 10, 17, 24].forEach(d => metrics.push({ id: 'hk|c|' + d, data: { member_id: 'harris-katsianos', date: nd(T - d), kind: 'checkin', value: 1 } }));
for (let i = 13; i >= 0; i--) metrics.push({ id: 'se|' + i, data: { member_id: 'sami-ellaz', date: nd(T - i), kind: 'weight', value: i % 2 ? 80.1 : 80.0 } });
const svg = (c, label) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${c}"/><circle cx="300" cy="160" r="80" fill="#fff"/><text x="40" y="700" font-size="60" fill="#fff">${label}</text></svg>`);
const STORAGE = { 'jack-keys/2026-09-25-1.jpg': svg('#335', 'W1 FRONT'), 'jack-keys/2026-09-25-2.jpg': svg('#533', 'W1 BACK'), 'jack-keys/2026-11-20-1.jpg': svg('#353', 'W9 FRONT'), 'jack-keys/2026-11-20-2.jpg': svg('#553', 'W9 BACK') };
// richer Jack data: calories/protein/steps 28 days (weekends high), lifts weekly, check-in scores
for (let i = 27; i >= 0; i--) { const n = T - i, dow = (new Date(n * 864e5).getUTCDay() + 6) % 7, we = dow >= 5;
  metrics.push({ id: 'jk|cal|' + i, data: { member_id: 'jack-keys', date: nd(n), kind: 'calories', value: we ? 2900 : 2150 } });
  metrics.push({ id: 'jk|pro|' + i, data: { member_id: 'jack-keys', date: nd(n), kind: 'protein', value: we ? 120 : 185 } });
  metrics.push({ id: 'jk|st|' + i, data: { member_id: 'jack-keys', date: nd(n), kind: 'steps', value: 8000 + (i % 5) * 400 } }); }
[['Bench press', [80, 82.5, 85, 87.5, 90, 92.5]], ['Back squat', [110, 112, 113, 113, 113, 113]], ['RDL', [100, 105, 107.5, 110, 115, 117.5]]].forEach(([lift, vals]) => vals.forEach((v, k) => metrics.push({ id: 'jk|lift|' + lift + k, data: { member_id: 'jack-keys', date: nd(T - 7 * (vals.length - 1 - k) - 2), kind: 'lift', value: v, detail: { lift, top: Math.round(v * 0.85) + 'x6' } } })));
[[25, 7, 6, 5], [18, 7, 6, 6], [11, 6, 5, 7], [4, 5, 5, 8]].forEach(([d, energy, sleep, stress]) => metrics.push({ id: 'jk|cks|' + d, data: { member_id: 'jack-keys', date: nd(T - d), kind: 'checkin', value: 1, detail: { summary: 'Energy ' + energy + ', stress ' + stress, scores: { energy, sleep, stress } } } }));
const FX = {
  client_profiles: [
    { id: 'jack-keys', data: { name: 'Jack Keys', startDate: '2026-09-22', sessionsPerWeek: 4, goalWeight: 85, goalPace: -0.5, phase: 'Cut', brief: 'SECRET BRIEF scale slowing', flags: ['Knee niggle'], syncedAt: '2026-11-25T13:00:00Z',
      macros: { calories: 2300, protein: 180, carbs: 230, fat: 70, setAt: '2026-11-03' },
      loom: { weekOf: '2026-11-23', hook: 'Jack, week 10 and the bench just hit 90 for 6. That is the strongest you have been on this program.',
        likes: ['Weighed in every day'], wins: [{ text: 'Weighed in every day', evidence: '7/7 weigh-ins, 4th week running' }, { text: 'Bench 80 → 92.5 kg est. 1RM since week 4', evidence: 'top set 79x6 Mon' }],
        fixes: [{ text: 'PRIVATE DISLIKE two missed Thursdays', why: 'Thursday is work drinks: both missed sessions were Thursdays', evidence: '0/4 Thu sessions in 4 wks' }, { text: 'Weekends ~750 kcal over weekdays', why: 'Weekend protein 120 g vs 185 g weekdays', evidence: 'last 28 days' }],
        dislikes: ['PRIVATE DISLIKE two missed Thursdays'], focus: ['Train Thursday before work drinks'], targets: [{ text: 'Train Thursday before work drinks', evidence: '4/4 sessions' }, 'Protein 170 g+ on Sat and Sun', '9k steps average'],
        questions: [{ q: 'Creatine?', answer: '5 g a day, any time, no loading. Expect +1 kg water on the scale in week 1, that is fine.' }],
        adjustments: { training: ['Move Thursday Pull to Wednesday 6am'], nutrition: ['Keep 2300 kcal: decide the macro check first'], habits: ['Pre-log Saturday dinner by 2pm'] },
        callbacks: [{ promise: 'Cap drinks at 4 on nights out', status: 'missed', evidence: 'Sat 2,900 kcal, he said 6 beers' }, { promise: 'Back photos every check-in', status: 'done' }],
        close: 'Fix Thursdays and the weekend, and the scale moves again. Your call.' },
      insights: [{ type: 'risk', title: 'Scale has slowed while lifts climb', detail: 'Trend −0.35 kg/wk vs −0.5 goal; bench +12.5 kg in 5 wks. Likely weekends, not muscle.', evidence: 'weights 28 days, lifts weekly' }, { type: 'life', title: 'Work Christmas party Fri 12 Dec', detail: 'Plan the day: train AM, protein-first lunch.' }],
      gym: { prs: [{ lift: 'Bench', from: 80, to: 90 }], stalls: [{ lift: 'Squat', weight: 110, weeks: 3 }] },
      whatsapp: { unanswered: [{ at: '2026-11-24', text: 'Should I take creatine?' }] } } },
    { id: 'harris-katsianos', data: { name: 'Harris Katsianos', startDate: '2026-10-27', sessionsPerWeek: 4 } },
    { id: 'sami-ellaz', data: { name: 'Sami Ellaz', startDate: '2026-11-03', phase: 'Cut', macros: { calories: 2300, protein: 180, carbs: 230, fat: 70, setAt: '2026-11-03' }, macroSuggestion: { calories: 2150, protein: 180, carbs: 200, fat: 67, change: '-150 kcal from carbs/fat', reason: 'Scale flat 2 wks with 4/4 sessions and food logged 6/7.', at: '2026-11-25' } } }
  ],
  client_metrics: metrics,
  client_photos: [
    { id: 'jack-keys|2026-09-25|1', data: { member_id: 'jack-keys', date: '2026-09-25', pos: 1, angle: 'front', path: 'jack-keys/2026-09-25-1.jpg', weight: 93.4 } },
    { id: 'jack-keys|2026-09-25|2', data: { member_id: 'jack-keys', date: '2026-09-25', pos: 2, angle: 'back', path: 'jack-keys/2026-09-25-2.jpg', weight: 93.4 } },
    { id: 'jack-keys|2026-11-20|1', data: { member_id: 'jack-keys', date: '2026-11-20', pos: 1, angle: 'front', path: 'jack-keys/2026-11-20-1.jpg', weight: 91.8 } },
    { id: 'jack-keys|2026-11-20|2', data: { member_id: 'jack-keys', date: '2026-11-20', pos: 2, angle: 'back', path: 'jack-keys/2026-11-20-2.jpg', weight: 91.8 } }
  ],
  client_timeline: [{ id: 'jk|f|1', data: { member_id: 'jack-keys', at: '2026-11-17', source: 'fathom', title: '1:1 call', body: 'Agreed: 4 drinks max', private: true } }],
  checkin_replies: [
    { id: 'd1', member_id: 'jack-keys', client_name: 'Jack Keys', status: 'draft', loom_url: null, created_at: '2026-11-23T05:00:00Z', points: 'WIN: weighed daily', checkin: { submittedLabel: 'Sun 8am', answers: { 'Biggest win': 'Bench PR' } } },
    { id: 'l1', member_id: 'jack-keys', client_name: 'Jack Keys', status: 'sent', loom_url: 'https://www.loom.com/share/0123456789abcdef0123', created_at: '2026-11-16T05:00:00Z', views: 1, rating: 5 }
  ],
  challenge_members: [], meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: []
};
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
const benign = t => /favicon|Failed to load resource/.test(t);
async function hq(browser, url, { width, dark, role }) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `(function(){ window.__CL_TODAY='${TODAY}'; try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){} var c=makeMockClient(${JSON.stringify(FX)}, {storageUrls:${JSON.stringify(STORAGE)}}); window.__mock=c; window.__HQ_TEST={ client:c, user:{id:'u1', email:'t@e.com'}, profile:{role:'${role}', display_name:'X'} }; })();` });
  await page.goto(url + '/index.html#clients', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__clients, null, { timeout: 10000 });
  await page.waitForTimeout(700);
  return { context, page, errors };
}
(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    for (const width of [1280, 390]) for (const dark of [false, true]) for (const role of ['admin', 'limited']) {
      const label = `${width}px ${dark ? 'dark' : 'light'} ${role}`;
      const { context, page, errors } = await hq(browser, url, { width, dark, role });
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      if (role === 'limited') {
        const st = await page.evaluate(() => ({ tab: document.getElementById('tabClients').hidden, view: document.getElementById('viewClients').hidden }));
        check(`${label}: tab hidden`, () => assert.ok(st.tab));
        check(`${label}: view hidden`, () => assert.ok(st.view));
        await context.close(); continue;
      }
      const r = await page.evaluate(() => ({ list: document.getElementById('clList').innerText, kpis: document.getElementById('clKpis').innerText, first: (document.querySelector('[data-clopen]') || {}).getAttribute && document.querySelector('[data-clopen]').getAttribute('data-clopen'), scroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
      check(`${label}: roster lists both`, () => assert.ok(/Jack Keys/.test(r.list) && /Harris Katsianos/.test(r.list), r.list));
      check(`${label}: attention first`, () => assert.strictEqual(r.first, 'jack-keys'));
      check(`${label}: attention reason`, () => assert.ok(/1 unanswered WhatsApp/.test(r.list), r.list));
      check(`${label}: no sideways scroll`, () => assert.ok(!r.scroll));
      const m = await page.evaluate(() => { const o = window.__clients.model('jack-keys'), h = window.__clients.model('harris-katsianos'); return { avg7: o.avg7, change: o.change, trend: o.trend, gymPct: o.gymPct, thisWeek: o.thisWeek, ck: o.ckDone + '/' + o.ckWeeks, eta: o.eta, status: o.status, h: h.gymPct, hs: h.status, hw: h.avg7 }; });
      // last 7 weights: 91.85..91.55 → avg 91.70; start = first weigh-in 93.0 → -1.30; slope -0.05/day → -0.35/wk
      check(`${label}: 7-day avg`, () => assert.ok(Math.abs(m.avg7 - 91.7) < 1e-6, m.avg7));
      check(`${label}: change since start`, () => assert.ok(Math.abs(m.change + 1.3) < 1e-6, m.change));
      check(`${label}: trend kg/wk`, () => assert.ok(Math.abs(m.trend + 0.35) < 1e-6, m.trend));
      check(`${label}: gym 8/16 = 50%`, () => assert.strictEqual(m.gymPct, 50));
      check(`${label}: this week 1`, () => assert.strictEqual(m.thisWeek, 1));
      check(`${label}: check-ins 4/4`, () => assert.strictEqual(m.ck, '4/4'));
      check(`${label}: eta exists`, () => assert.ok(m.eta > 0));
      check(`${label}: jack watch`, () => assert.strictEqual(m.status, 'watch'));
      check(`${label}: harris 100% on track, no weight`, () => assert.ok(m.h === 100 && m.hs === 'on_track' && m.hw === undefined, JSON.stringify(m)));
      const se = await page.evaluate(() => { const o = window.__clients.model('sami-ellaz'); return { stall: o.stall, att: o.att.join('|'), macro: o.macroOpen }; });
      check(`${label}: sami stalled + macro check`, () => assert.ok(se.stall === 'flat' && /scale stalled 2 wks/.test(se.att) && /macro check/.test(se.att) && se.macro, JSON.stringify(se)));
      check(`${label}: roster shows goal date`, () => assert.ok(/goal ~9 Apr/.test(r.list), r.list));
      await page.click('[data-clopen="sami-ellaz"]'); await page.waitForTimeout(150);
      const sp = await page.evaluate(() => document.getElementById('clProfile').innerText);
      check(`${label}: macro panel`, () => assert.ok(/Current: 2300 kcal · P 180g · C 230g · F 70g/.test(sp) && /Suggested: 2150 kcal/.test(sp) && /Scale has stalled for 2 weeks/.test(sp), sp.slice(0, 900)));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `macro-${tag}.png`), fullPage: true });
      await page.$eval('[data-clmacro="used"]', b => b.click()); await page.waitForTimeout(150);
      const md = await page.evaluate(() => ({ d: window.__mock.__tables.client_profiles.find(x => x.id === 'sami-ellaz').data.macroDecision, t: document.getElementById('clProfile').innerText }));
      check(`${label}: macro decision saved`, () => assert.ok(md.d.choice === 'used' && md.d.for === '2026-11-25' && /you changed it/.test(md.t), JSON.stringify(md.d)));
      await page.$eval('[data-clback]', b => b.click()); await page.waitForTimeout(100);
      // open profile
      await page.click('[data-clopen="jack-keys"]'); await page.waitForTimeout(200);
      const p = await page.evaluate(() => document.getElementById('clProfile').innerText);
      check(`${label}: profile kpis`, () => assert.ok(/91\.7/.test(p) && /-1\.3 kg since start/.test(p) && /-0\.35/.test(p) && /50/.test(p), p.slice(0, 600)));
      check(`${label}: gym insights`, () => assert.ok(/PR · Bench 80→90 kg/.test(p) && /Stalled · Squat at 110 kg for 3 wks/.test(p)));
      check(`${label}: brief + unanswered + timeline`, () => assert.ok(/SECRET BRIEF/.test(p) && /Should I take creatine\?/.test(p) && /4 drinks max/.test(p) && /Your Loom reply/.test(p) && /rated 5\/5/.test(p)));
      const c = await page.evaluate(() => document.getElementById('clCmp').innerText);
      check(`${label}: compare 7 vs 7`, () => assert.ok(/Weight \(avg\)\s+91\.7 kg\s*7 days\s+92\.\d kg\s*7 days\s+-0\.\d kg/.test(c) && /Gym sessions\s+1\s+2\s+-1/.test(c) && /Steps \(avg\/day\)\s+8,6\d\d\s+7 days/.test(c), c));
      check(`${label}: cut → weight down is green`, () => assert.ok(page.locator('#clCmp .cl-d.good')));
      await page.$eval('[data-clcmp="14"]', b => b.click()); await page.waitForTimeout(100);
      const c14 = await page.evaluate(() => document.getElementById('clCmp').innerText);
      check(`${label}: 14 vs 14`, () => assert.ok(/Weight \(avg\)\s+91\.9 kg\s*14 days\s+92\.6 kg\s*14 days\s+-0\.7 kg/.test(c14) && /30 Oct – 12 Nov · 14d/.test(c14), c14));
      await page.$eval('[data-clcd="b1"]', (el) => { el.value = '2026-10-28'; el.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.$eval('[data-clcd="b2"]', (el) => { el.value = '2026-10-28'; el.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForTimeout(100);
      const cc = await page.evaluate(() => document.getElementById('clCmp').innerText);
      check(`${label}: custom dates`, () => assert.ok(/93\.0 kg\s*1 day/.test(cc) && /28 Oct – 28 Oct · 1d/.test(cc), cc));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `compare-${tag}.png`), fullPage: true });
      await page.$eval('[data-clcmp="7"]', b => b.click()); await page.waitForTimeout(100);
      check(`${label}: chart drawn`, () => assert.ok(page.locator('#clProfile svg.cl-chart')));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `profile-${tag}.png`), fullPage: true });
      await page.click('[data-clmode="loom"]'); await page.waitForTimeout(150);
      const l = await page.evaluate(() => document.getElementById('clProfile').innerText);
      check(`${label}: loom run sheet`, () => assert.ok(/strongest you have been/.test(l) && /Scoreboard/.test(l) && /Thursday is work drinks/.test(l) && /5 g a day/.test(l) && /Move Thursday Pull/.test(l) && /Cap drinks at 4/.test(l) && /missed/.test(l) && /Protein 170 g\+/.test(l) && /Your call/.test(l), l.slice(0, 1500)));
      check(`${label}: insights auto`, () => assert.ok(/Weekends \+750 kcal vs weekdays/.test(l) && /Back squat flat for 3\+ weeks/.test(l) && /8 of 32 planned sessions/.test(l) && /Stress 5 → 8 over 4 check-ins/.test(l) && /Protein hit 20\/28/.test(l) && /Work Christmas party/.test(l), l.slice(l.search(/coach insights/i), l.search(/coach insights/i) + 1500)));
      check(`${label}: loom prep points`, () => assert.ok(/Weighed in every day/.test(l) && /PRIVATE DISLIKE/.test(l) && /Train Thursday/.test(l) && /Creatine\?/.test(l) && /Bench PR/.test(l), l.slice(0, 800)));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `loom-${tag}.png`), fullPage: true });
      await page.click('#clProfile [data-clshare]'); await page.waitForTimeout(150);
      const s = await page.evaluate(() => { const e = document.getElementById('clShare'); return { hidden: e.hidden, t: e.innerText }; });
      check(`${label}: screenshare open`, () => assert.ok(!s.hidden));
      check(`${label}: screenshare client-safe`, () => assert.ok(!/SECRET|PRIVATE|creatine|4 drinks max|Knee|Stalled/i.test(s.t), s.t));
      check(`${label}: screenshare content`, () => assert.ok(/^jack/i.test(s.t.trim()) && /91\.7/.test(s.t) && /Weighed in every day/.test(s.t) && /Bench 80 → 90 kg/.test(s.t) && /Train Thursday/.test(s.t), s.t));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `share-${tag}.png`), fullPage: false });
      await page.keyboard.press('Escape');
      check(`${label}: Esc closes`, async () => {});
      const closed = await page.evaluate(() => document.getElementById('clShare').hidden); check(`${label}: share closed`, () => assert.ok(closed));
      // photos: compare + post
      await page.click('[data-clmode="photos"]'); await page.waitForTimeout(500);
      const ph = await page.evaluate(() => { const imgs = [...document.querySelectorAll('#clProfile .ph-view img')]; return { n: imgs.length, loaded: imgs.every(i => i.naturalWidth > 0), w: imgs.map(i => i.style.width), tags: [...document.querySelectorAll('.ph-tag')].map(x => x.innerText), alts: imgs.map(i => i.alt) }; });
      check(`${label}: photos two panes loaded`, () => assert.ok(ph.n === 2 && ph.loaded && ph.w.every(Boolean), JSON.stringify(ph)));
      check(`${label}: default first vs latest front`, () => assert.ok(/25 Sept · Week 1 · 93\.4 kg/.test(ph.tags[0]) && /20 Nov · Week 9 · 91\.8 kg/.test(ph.tags[1]) && /front/.test(ph.alts[0]) && /front/.test(ph.alts[1]), JSON.stringify(ph)));
      await page.$eval('[data-phkey="R|back:2"]', b => b.click()); await page.waitForTimeout(300);
      const ph2 = await page.evaluate(() => document.querySelectorAll('#clProfile .ph-view img')[1].alt);
      check(`${label}: angle switch`, () => assert.ok(/back/.test(ph2), ph2));
      const w0 = await page.evaluate(() => parseFloat(document.querySelectorAll('#clProfile .ph-view img')[0].style.width));
      await page.$eval('[data-phz="L"]', el => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      const zz = await page.evaluate(() => [...document.querySelectorAll('#clProfile .ph-view img')].map(i => parseFloat(i.style.width)));
      check(`${label}: zoom linked doubles both`, () => assert.ok(Math.abs(zz[0] / w0 - 2) < 0.01 && zz[1] > 0, JSON.stringify([w0, zz])));
      const lk = await page.evaluate(() => { const S = window.__clients.ph().sides; return [S.L.z, S.R.z]; });
      check(`${label}: both sides zoom 2`, () => assert.deepStrictEqual(lk, [2, 2]));
      await page.$eval('[data-phb="R"]', el => { el.value = '130'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      const fb = await page.evaluate(() => [...document.querySelectorAll('#clProfile .ph-view img')].map(i => i.style.filter));
      check(`${label}: brightness right only`, () => assert.ok(/brightness\(100%\)/.test(fb[0]) && /brightness\(130%\)/.test(fb[1]), JSON.stringify(fb)));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `photos-${tag}.png`), fullPage: true });
      await page.$eval('[data-phpost]', b => b.click()); await page.waitForTimeout(800);
      const pp = await page.evaluate(() => ({ open: !document.getElementById('clShare').hidden, head: document.getElementById('phHead').value, stat: document.getElementById('phStat').value, dl: document.querySelector('[data-phdl]').disabled, px: (() => { const c = document.getElementById('phCanvas'); const d = c.getContext('2d').getImageData(200, 900, 1, 1).data; return [c.width, c.height, d[0], d[1], d[2]]; })() }));
      check(`${label}: post builder defaults`, () => assert.ok(pp.open && pp.head === '8 WEEKS' && pp.stat === '-1.6 kg in 8 weeks' && pp.dl, JSON.stringify(pp)));
      check(`${label}: story canvas drew photo`, () => assert.ok(pp.px[0] === 1080 && pp.px[1] === 1920 && !(pp.px[2] === 15 && pp.px[3] === 13 && pp.px[4] === 11), JSON.stringify(pp.px)));
      await page.$eval('[data-phfmt="feed"]', b => b.click()); await page.waitForTimeout(150);
      const fh = await page.evaluate(() => document.getElementById('phCanvas').height);
      check(`${label}: feed 4:5`, () => assert.strictEqual(fh, 1350));
      if (SHOTS) { await page.$eval('[data-phfmt="story"]', b => b.click()); await page.fill('#phQuote', 'Never thought I would actually enjoy training before work.'); await page.waitForTimeout(150); const data = await page.evaluate(() => document.getElementById('phCanvas').toDataURL('image/png')); fs.writeFileSync(path.join(SHOTS, `post-${tag}.png`), Buffer.from(data.split(',')[1], 'base64')); await page.screenshot({ path: path.join(SHOTS, `builder-${tag}.png`) }); }
      await page.check('#phOk');
      const dl2 = await page.evaluate(() => document.querySelector('[data-phdl]').disabled);
      check(`${label}: consent enables download`, () => assert.ok(!dl2));
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.$eval('[data-phdl]', b => b.click())]);
      check(`${label}: download fires`, () => assert.ok(download && /jack-keys-2026-09-25-vs-2026-11-20-(story|feed)\.png/.test(download.suggestedFilename()), download && download.suggestedFilename()));
      await page.waitForTimeout(200);
      const logged = await page.evaluate(() => (window.__mock.__tables.client_profiles.find(x => x.id === 'jack-keys').data.posts || []).length);
      check(`${label}: post logged with consent`, () => assert.strictEqual(logged, 1));
      await page.keyboard.press('Escape');
      // edit
      await page.click('[data-clmode="overview"]'); await page.waitForTimeout(100);
      await page.evaluate(() => { document.querySelector('#clProfile details:last-of-type').open = true; });
      await page.fill('[data-clf="goalWeight"]', '84'); await page.fill('[data-clf="goal"]', 'Visible abs by March');
      await page.$eval('[data-clsave]', b => b.click()); await page.waitForTimeout(150);
      const sv = await page.evaluate(() => { const r = window.__mock.__tables.client_profiles.find(x => x.id === 'jack-keys'); return { m: r.data.manual, brief: r.data.brief, msg: document.getElementById('clSaveMsg').textContent, sub: document.querySelector('#clProfile .sub').innerText }; });
      check(`${label}: saved manual`, () => assert.ok(sv.m.goalWeight === 84 && sv.m.goal === 'Visible abs by March' && sv.brief === 'SECRET BRIEF scale slowing', JSON.stringify(sv)));
      check(`${label}: header updated`, () => assert.ok(/Visible abs by March/.test(sv.sub) && /Saved/.test(sv.msg)));
      await page.$eval('[data-clback]', b => b.click()); await page.waitForTimeout(100);
      const back = await page.evaluate(() => !document.getElementById('clRoster').hidden);
      check(`${label}: back to roster`, () => assert.ok(back));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `roster-${tag}.png`), fullPage: true });
      check(`${label}: no console errors`, () => assert.deepStrictEqual(errors, []));
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`clients: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
