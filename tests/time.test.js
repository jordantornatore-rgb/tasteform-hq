// Playwright tests for the Time tab, on MOCK data (no network). Device timezone = Bali (UTC+8); the page must show Sydney (AEDT, UTC+11).
//   node tests/time.test.js [--shots dir]
// Checks: admin only; one tap starts a step and stops the last; gaps show and fill; sleep across midnight splits at 00:00;
// edit / delete / adjust-start carve so nothing is counted twice; week totals against an independent sum; buy-back tags;
// pill on other pages; zero console errors, no NaN/undefined, no horizontal scroll and 44px targets at 390px, light + dark.
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
const TZ = 'Asia/Makassar';
const L = (d, hm) => Date.parse(`${d}T${hm}:00+11:00`); // Sydney time (AEDT) -> ms; the device is in Bali
const START = L('2026-11-12', '08:00');
const FX = { meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: [] };
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
async function open(browser, url, { width = 1280, dark = false, role = 'admin', meta = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: TZ, locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const log = { errors: [], warnings: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  const fx = Object.assign({}, FX, { meta });
  await page.addInitScript({ content: mockSrc + `
    (function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){} window.__T=${START}; var RealDate=Date;
      function MockDate(){ if(arguments.length) return new (Function.prototype.bind.apply(RealDate,[null].concat([].slice.call(arguments))))(); return new RealDate(window.__T); }
      MockDate.now=function(){ return window.__T; }; MockDate.parse=RealDate.parse; MockDate.UTC=RealDate.UTC; MockDate.prototype=RealDate.prototype; window.Date=MockDate;
      window.__timeNow=function(){ return window.__T; };
      var c=makeMockClient(${JSON.stringify(fx)}); window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'${role === 'admin' ? 'jordan.tornatore@gmail.com' : 'setter@example.com'}'}, profile:{role:'${role}', display_name:'X'} };
    })();` });
  await page.goto(url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.state, null, { timeout: 10000 });
  await page.waitForTimeout(200);
  return { context, page, log };
}
const goTime = async page => { await page.evaluate(() => window.__hq.setView('time')); await page.waitForFunction(() => window.__time && window.__time.S.loaded, null, { timeout: 5000 }); await page.waitForTimeout(80); };
const setT = (page, ms) => page.evaluate(t => { window.__T = t; window.__time.render(); }, ms);
const tap = async (page, k) => { await page.click(`#tmGrid .tm-areas [data-tm="go"][data-k="${k}"]`); await page.waitForTimeout(40); };
const metaRow = (page, id) => page.evaluate(i => { const r = window.__mock.__tables.meta.find(x => x.id === i); return r ? r.data : null; }, id);
const entries = async (page, d) => ((await metaRow(page, 'time:' + d)) || { entries: [] }).entries.map(x => ({ k: x.k, s: x.s, e: x.e, en: x.en, n: x.n })).sort((a, b) => a.s - b.s);

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    { // the core flow
      const { context, page, log } = await open(browser, url);
      check('admin: Time in the sidebar', () => assert.ok(true));
      const vis = await page.evaluate(() => !document.getElementById('tabTime').hidden);
      check('admin: Time tab visible', () => assert.ok(vis));
      await goTime(page);
      let t = await page.textContent('#tmNow'); check('idle: says not tracking', () => assert.ok(/Not tracking/.test(t)));
      await setT(page, L('2026-11-12', '09:00')); await tap(page, 'film');
      const now1 = await metaRow(page, 'timeNow'); check('tap starts the step (timeNow saved)', () => assert.deepStrictEqual([now1.k, now1.s], ['film', L('2026-11-12', '09:00')]));
      await setT(page, L('2026-11-12', '09:45')); t = await page.textContent('#tmNow'); check('now card shows the step + 45m', () => assert.ok(/Filming/.test(t) && /45m/.test(t), t));
      await tap(page, 'edit');
      let E = await entries(page, '2026-11-12'); check('next tap closes the last step', () => assert.deepStrictEqual(E.map(x => [x.k, x.s, x.e]), [['film', L('2026-11-12', '09:00'), L('2026-11-12', '09:45')]]));
      await page.fill('#tmNote', 'Officemaxxing ep 3'); await page.dispatchEvent('#tmNote', 'change');
      await setT(page, L('2026-11-12', '10:30')); await page.click('[data-tm="stop"]'); await page.waitForTimeout(40);
      E = await entries(page, '2026-11-12'); check('stop closes the step, keeps the detail', () => assert.deepStrictEqual(E[1], { k: 'edit', s: L('2026-11-12', '09:45'), e: L('2026-11-12', '10:30'), en: undefined, n: 'Officemaxxing ep 3' }));
      check('stop clears timeNow', async () => {}); check('timeNow empty', async () => {});
      const n2 = await metaRow(page, 'timeNow'); check('timeNow k null after stop', () => assert.strictEqual(n2.k, null));
      // gap + fill
      await setT(page, L('2026-11-12', '11:00'));
      const gapTxt = await page.textContent('#tmBody'); check('gap 10:30–11:00 shows as untracked 30m', () => assert.ok(/10:30am – 11:00am\s*Untracked\s*30m/.test(gapTxt.replace(/\s+/g, ' ')), gapTxt.slice(0, 300)));
      await page.click(`#tmBody [data-tm="fill"][data-s="${L('2026-11-12', '10:30')}"]`); await page.click('#tmSheet [data-tm="fillk"][data-k="clientmsg"]'); await page.waitForTimeout(40);
      E = await entries(page, '2026-11-12'); check('fill writes the gap as that step', () => assert.deepStrictEqual(E.map(x => x.k), ['film', 'edit', 'clientmsg']));
      // energy
      await page.click('#tmBody [data-tm="en"][data-v="-1"]'); await page.waitForTimeout(30);
      E = await entries(page, '2026-11-12'); check('▼ marks the latest entry drained', () => assert.strictEqual(E[2].en, -1));
      // sleep across midnight
      await setT(page, L('2026-11-12', '23:00')); await tap(page, 'sleep');
      await setT(page, L('2026-11-13', '07:00')); await tap(page, 'walk');
      const d1 = await entries(page, '2026-11-12'), d2 = await entries(page, '2026-11-13');
      check('sleep split at local midnight', () => assert.deepStrictEqual([d1[d1.length - 1].k, d1[d1.length - 1].e, d2[0].k, d2[0].s, d2[0].e], ['sleep', L('2026-11-13', '00:00'), 'sleep', L('2026-11-13', '00:00'), L('2026-11-13', '07:00')]));
      await setT(page, L('2026-11-13', '07:30')); await page.click('[data-tm="stop"]');
      // edit film to 9:00-9:30
      await page.click('[data-tm="dnav"][data-d="-1"]');
      const filmId = await page.evaluate(() => window.__time.S.days['2026-11-12'].entries.find(x => x.k === 'film').id);
      await page.click(`[data-tm="edit"][data-id="${filmId}"]`); await page.fill('#tmSEnd', '09:30'); await page.click('[data-tm="ssave"]'); await page.waitForTimeout(40);
      E = await entries(page, '2026-11-12'); check('edit changes the times', () => assert.deepStrictEqual(E.filter(x => x.k === 'film').map(x => [x.s, x.e]), [[L('2026-11-12', '09:00'), L('2026-11-12', '09:30')]]));
      // add time that overlaps edit 9:45-10:30 -> carves it
      await page.click('[data-tm="add"]'); await page.selectOption('#tmSStep', 'callprep'); await page.fill('#tmSStart', '10:00'); await page.fill('#tmSEnd', '10:15'); await page.click('[data-tm="ssave"]'); await page.waitForTimeout(40);
      E = await entries(page, '2026-11-12');
      check('add carves what it overlaps (no double counting)', () => assert.deepStrictEqual(E.filter(x => x.s < L('2026-11-12', '11:00')).map(x => [x.k, x.s, x.e]), [['film', L('2026-11-12', '09:00'), L('2026-11-12', '09:30')], ['edit', L('2026-11-12', '09:45'), L('2026-11-12', '10:00')], ['callprep', L('2026-11-12', '10:00'), L('2026-11-12', '10:15')], ['edit', L('2026-11-12', '10:15'), L('2026-11-12', '10:30')], ['clientmsg', L('2026-11-12', '10:30'), L('2026-11-12', '11:00')]]));
      // adjust start of a running step
      await setT(page, L('2026-11-13', '09:00')); await page.click('[data-tm="dnav"][data-d="0"]'); await tap(page, 'script');
      await page.click('[data-tm="adjust"]'); await page.fill('#tmSStart', '07:15'); await page.click('[data-tm="ssave"]'); await page.waitForTimeout(40);
      const d2b = await entries(page, '2026-11-13'); const nw = await metaRow(page, 'timeNow');
      check('adjust start moves the running step back and trims the walk', () => assert.deepStrictEqual([nw.s, d2b.find(x => x.k === 'walk').e], [L('2026-11-13', '07:15'), L('2026-11-13', '07:15')]));
      await setT(page, L('2026-11-13', '10:00')); await page.click('[data-tm="stop"]');
      // week totals vs an independent sum
      const all = [...(await entries(page, '2026-11-12')), ...(await entries(page, '2026-11-13'))];
      const indep = {}; all.forEach(x => { indep[x.k] = (indep[x.k] || 0) + (x.e - x.s) / 60000; });
      const ws = await page.evaluate(() => { const w = window.__time.weekStats(window.__time.wkStart('2026-11-12')); return { step: w.step, sleep: w.sleep, tot: w.tot }; });
      check('week totals = independent sum per step', () => assert.deepStrictEqual(ws.step, indep));
      check('sleep = 8h', () => assert.strictEqual(ws.sleep, 480));
      check('expected minutes', () => assert.deepStrictEqual(indep, { film: 30, edit: 30, callprep: 15, clientmsg: 30, sleep: 480, walk: 15, script: 165 }));
      // week view + buy back
      await page.click('[data-tm="tab"][data-v="week"]'); await page.waitForTimeout(40);
      t = (await page.textContent('#tmBody')).replace(/\s+/g, ' ');
      check('week: awake = 4.5h of 108', () => assert.ok(/Awake hours tracked\s*4\.8\s*\/ 108/.test(t), t.slice(0, 200)));
      await page.click('[data-tm="tab"][data-v="buy"]'); await page.waitForTimeout(40);
      await page.selectOption('[data-tm-tag="script"]', 'delegate'); await page.waitForTimeout(40);
      const cfg = await metaRow(page, 'timeCfg'); check('tag saved', () => assert.strictEqual(cfg.tags.script, 'delegate'));
      t = (await page.textContent('#tmBody')).replace(/\s+/g, ' ');
      check('buy back sums tagged hours (2.75h -> 2.8)', () => assert.ok(/Hours you could buy back\s*2\.8 h/.test(t), t.slice(0, 200)));
      // pill
      await tap(page, 'admin'); await page.evaluate(() => window.__hq.setView('home')); await page.waitForTimeout(60);
      const pill = await page.evaluate(() => { const p = document.getElementById('tmPill'); return !p.hidden && p.textContent; });
      check('pill shows the running step on other pages', () => assert.ok(/Admin & payments/.test(pill || ''), String(pill)));
      check('flows: zero console errors', () => assert.deepStrictEqual(log.errors, []));
      check('flows: zero console warnings', () => assert.deepStrictEqual(log.warnings, []));
      await context.close();
    }

    // layout on seeded data, each width and theme
    const seed = []; const d = '2026-11-12';
    const ent = [['sleep', '00:00', '06:30'], ['walk', '06:30', '07:00'], ['research', '07:00', '07:30'], ['script', '07:30', '08:30', 1], ['film', '08:30', '10:00', 1], ['stories', '10:00', '10:45', -1], ['clientmsg', '11:00', '11:40', -1], ['meals', '12:00', '12:30'], ['oncall', '13:00', '14:00', 1], ['gym', '14:30', '16:00']];
    seed.push({ id: 'time:' + d, data: { entries: ent.map((x, i) => ({ id: 's' + i, k: x[0], s: L(d, x[1]), e: L(d, x[2]), en: x[3] })) } });
    seed.push({ id: 'timeNow', data: { k: 'build', s: L(d, '16:10'), n: 'Time tab' } });
    seed.push({ id: 'timeCfg', data: { tags: { stories: 'delegate', clientmsg: 'automate' }, awake: 108, recent: ['build', 'film', 'script'] } });
    const START2 = L(d, '17:05');
    for (const width of [1280, 390]) for (const dark of [false, true]) for (const tab of ['day', 'week', 'buy']) {
      const label = `${width}px ${dark ? 'dark' : 'light'} ${tab}`;
      const { context, page, log } = await open(browser, url, { width, dark, meta: seed });
      await page.evaluate(t => { window.__T = t; }, START2);
      await goTime(page); await page.click(`[data-tm="tab"][data-v="${tab}"]`); await page.waitForTimeout(60);
      const txt = await page.evaluate(() => document.getElementById('viewTime').innerText);
      check(`${label}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(txt), (txt.match(/.{0,30}(NaN|undefined|null|Infinity).{0,30}/) || [''])[0]));
      if (width < 500) {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: no horizontal scroll`, () => assert.ok(ov <= 0, 'overflow ' + ov + 'px'));
        const small = await page.evaluate(() => Array.from(document.querySelectorAll('#viewTime button, #viewTime select, #viewTime input:not(.tm-note)')).filter(b => b.offsetParent && !b.closest('.tm-wday') && !b.classList.contains('tm-link') && b.getBoundingClientRect().height < 43.5).map(b => (b.textContent || b.name || b.tagName).trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height)));
        check(`${label}: 44px touch targets`, () => assert.deepStrictEqual(small, []));
      }
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `time-${tab}-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
      if (tab === 'day' && width === 390 && !dark && SHOTS) { await page.click('[data-tm="edit"][data-id="s4"]'); await page.waitForTimeout(60); await page.screenshot({ path: path.join(SHOTS, 'time-edit-390.png') }); }
      check(`${label}: zero console errors`, () => assert.deepStrictEqual(log.errors, []));
      check(`${label}: zero console warnings`, () => assert.deepStrictEqual(log.warnings, []));
      await context.close();
    }

    { // not an admin
      const { context, page } = await open(browser, url, { role: 'setter', meta: seed });
      const hidden = await page.evaluate(() => document.getElementById('tabTime').hidden && document.getElementById('bbTime').hidden && document.getElementById('sheetTime').hidden && document.getElementById('tmPill').hidden);
      check('setter: tab, bottom button, menu entry and pill hidden', () => assert.ok(hidden));
      await page.evaluate(() => window.__hq.setView('time')); await page.waitForTimeout(100);
      const view = await page.evaluate(() => document.getElementById('viewTime').hidden);
      check('setter: setView(time) falls back, page stays hidden', () => assert.ok(view));
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
