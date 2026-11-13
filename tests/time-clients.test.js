// Time per client + Tell Claude (13 Nov 2026), on MOCK data. node tests/time-clients.test.js [--shots dir]
// Checks: client steps ask "who for?" (1FIT roster), the client rides on the saved block, non-client steps start straight away,
// fill and edit keep the client, Clients tab hours and $/hour, Tell Claude saves to meta/timeInbox, 390px light + dark, no errors.
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
const FX = { meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: [],
  challenge_members: [
    { id: 'dom-socaciu', data: { name: 'Dom Socaciu', active: true } },
    { id: 'jack-keys', data: { name: 'Jack Keys', active: true } },
    { id: 'george-paps', data: { name: 'George Paps', active: true, billing: 'affiliate' } },
    { id: 'gone-gary', data: { name: 'Gone Gary', active: false } }],
  stripe_customers: [{ id: 'cus_dom', data: { memberId: 'dom-socaciu', monthlyEquivalent: 433, status: 'Active' } }, { id: 'cus_jack', data: { memberId: 'jack-keys', monthlyEquivalent: 451, status: 'Active' } }] };
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
    {
      const { context, page, log } = await open(browser, url);
      await goTime(page);
      await page.waitForFunction(() => window.__time.S.roster.length === 3, null, { timeout: 5000 });
      const roster = await page.evaluate(() => window.__time.S.roster.map(r => r.name));
      check('roster names', () => assert.deepStrictEqual(roster, ['Dom Socaciu', 'George Paps', 'Jack Keys']));
      // client step asks who for
      await tap(page, 'cireview');
      let sheetOpen = await page.evaluate(() => !document.getElementById('tmSheet').hidden && /who for/.test(document.getElementById('tmSheetCard').textContent));
      check('check-in asks who for', () => assert.ok(sheetOpen));
      await page.click('[data-tm="pickc"][data-c="dom-socaciu"]'); await page.waitForTimeout(40);
      let nowTxt = await page.textContent('#tmNow');
      check('now card names the client', () => assert.ok(/Reviewing check-ins/.test(nowTxt) && /Dom Socaciu/.test(nowTxt), nowTxt));
      await setT(page, L('2026-11-12', '08:30'));
      await tap(page, 'clientmsg'); await page.click('[data-tm="pickc"][data-c="jack-keys"]'); await page.waitForTimeout(40);
      let e = await page.evaluate(() => window.__mock.__tables.meta.find(x => x.id === 'time:2026-11-12').data.entries);
      check('saved block carries the client', () => { assert.strictEqual(e.length, 1); assert.strictEqual(e[0].k, 'cireview'); assert.strictEqual(e[0].c, 'dom-socaciu'); assert.strictEqual(e[0].cn, 'Dom Socaciu'); assert.strictEqual(e[0].e - e[0].s, 30 * 60000); });
      // same step, different client = new block
      await setT(page, L('2026-11-12', '08:45'));
      await tap(page, 'clientmsg'); await page.click('[data-tm="pickc"][data-c="dom-socaciu"]'); await page.waitForTimeout(40);
      e = await page.evaluate(() => window.__mock.__tables.meta.find(x => x.id === 'time:2026-11-12').data.entries);
      check('switching client on the same step splits the block', () => { assert.strictEqual(e.length, 2); assert.strictEqual(e[1].c, 'jack-keys'); });
      // non-client step starts straight away
      await setT(page, L('2026-11-12', '09:00'));
      await tap(page, 'edit');
      sheetOpen = await page.evaluate(() => !document.getElementById('tmSheet').hidden);
      nowTxt = await page.textContent('#tmNow');
      check('editing starts with no client question', () => { assert.ok(!sheetOpen); assert.ok(/Editing/.test(nowTxt)); });
      // "Several" = no client
      await setT(page, L('2026-11-12', '10:00'));
      await tap(page, 'cifeedback'); await page.click('[data-tm="pickc"][data-c=""]'); await page.waitForTimeout(40);
      await setT(page, L('2026-11-12', '10:20'));
      await tap(page, 'edit');
      e = await page.evaluate(() => window.__mock.__tables.meta.find(x => x.id === 'time:2026-11-12').data.entries);
      const fb = e.find(x => x.k === 'cifeedback');
      check('several = no client on the block', () => assert.ok(fb && !fb.c));
      // day row shows the client
      const dayTxt = await page.textContent('#tmBody');
      check('day list shows client names', () => assert.ok(/Reviewing check-ins · Dom Socaciu/.test(dayTxt.replace(/\s+/g, ' ')), dayTxt.slice(0, 400)));
      // edit keeps / changes the client
      const domRow = e.find(x => x.k === 'cireview');
      await page.click(`[data-tm="edit"][data-id="${domRow.id}"]`);
      const sel = await page.evaluate(() => document.getElementById('tmSClient').value);
      check('edit sheet shows the client', () => assert.strictEqual(sel, 'dom-socaciu'));
      await page.selectOption('#tmSClient', 'jack-keys'); await page.click('[data-tm="ssave"]'); await page.waitForTimeout(40);
      e = await page.evaluate(() => window.__mock.__tables.meta.find(x => x.id === 'time:2026-11-12').data.entries);
      check('edit changes the client', () => assert.strictEqual(e.find(x => x.k === 'cireview').c, 'jack-keys'));
      // Clients tab
      await page.click('[data-tm="tab"][data-v="clients"]'); await page.waitForTimeout(60);
      const ct = (await page.textContent('#tmBody')).replace(/\s+/g, ' ');
      check('clients tab lists hours per client', () => { assert.ok(/Jack Keys.*0\.8 h/.test(ct), ct); assert.ok(/Dom Socaciu.*0\.3 h/.test(ct), ct); });
      check('clients tab: affiliate is free, not $', () => assert.ok(/George Paps.*free/.test(ct)));
      check('clients tab: untagged client time counted', () => assert.ok(/Not tagged to a client\s*0\.3/.test(ct), ct));
      // Jack: 45 min over the last 4 weeks = 11.25 min a week = 0.815 h a month -> $451 / 0.815 = $554
      check('$/hour = monthly ÷ monthly hours', () => assert.ok(/\$451\s*\$554/.test(ct), ct));
      check('no NaN/undefined', () => assert.ok(!/NaN|undefined|Infinity/.test(ct)));
      // Tell Claude
      await page.fill('#tmTellText', '2 to 3 filmed reels, then 20 min on Dom’s check-in');
      await page.click('[data-tm="tell"]'); await page.waitForTimeout(60);
      const inbox = await metaRow(page, 'timeInbox');
      check('tell claude saves to the inbox', () => { assert.ok(inbox && inbox.items.length === 1); assert.strictEqual(inbox.items[0].status, 'new'); assert.ok(/filmed reels/.test(inbox.items[0].text)); });
      const tt = await page.textContent('#tmTell');
      check('tell claude shows it waiting', () => assert.ok(/waiting for Claude/.test(tt)));
      // fill a gap with a client step asks who for, and logs with the client
      await page.click('[data-tm="tab"][data-v="day"]'); await page.waitForTimeout(40);
      await page.evaluate(() => window.__time.stop()); await setT(page, L('2026-11-12', '11:00'));
      await page.click('#tmBody [data-tm="fill"]'); await page.waitForTimeout(40);
      await page.click('[data-tm="fillk"][data-k="obcall"]'); await page.waitForTimeout(40);
      const asks = await page.evaluate(() => /who for/.test(document.getElementById('tmSheetCard').textContent));
      check('fill with a client step asks who for', () => assert.ok(asks));
      await page.click('[data-tm="pickc"][data-c="dom-socaciu"]'); await page.waitForTimeout(40);
      e = await page.evaluate(() => window.__mock.__tables.meta.find(x => x.id === 'time:2026-11-12').data.entries);
      check('filled block has the client', () => assert.ok(e.some(x => x.k === 'obcall' && x.c === 'dom-socaciu')));
      check('no console errors', () => assert.deepStrictEqual(log.errors, []));
      if (SHOTS) { await page.click('[data-tm="tab"][data-v="clients"]'); await page.waitForTimeout(60); await page.screenshot({ path: path.join(SHOTS, 'time-clients-1280.png'), fullPage: true }); }
      await context.close();
    }
    for (const dark of [false, true]) { // phone
      const { context, page, log } = await open(browser, url, { width: 390, dark });
      await goTime(page);
      await page.waitForFunction(() => window.__time.S.roster.length === 3, null, { timeout: 5000 });
      await tap(page, 'cicall');
      const ov1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`390 ${dark ? 'dark' : 'light'}: client sheet fits`, () => assert.ok(ov1 <= 0, 'overflow ' + ov1));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `time-who-390-${dark ? 'dark' : 'light'}.png`) });
      await page.click('[data-tm="pickc"][data-c="jack-keys"]');
      await page.click('[data-tm="tab"][data-v="clients"]'); await page.waitForTimeout(60);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`390 ${dark ? 'dark' : 'light'}: no horizontal scroll`, () => assert.ok(ov <= 0, 'overflow ' + ov));
      check(`390 ${dark ? 'dark' : 'light'}: no console errors`, () => assert.deepStrictEqual(log.errors, []));
      if (SHOTS) { await page.click('[data-tm="tab"][data-v="day"]'); await page.waitForTimeout(40); await page.screenshot({ path: path.join(SHOTS, `time-day-390-${dark ? 'dark' : 'light'}.png`), fullPage: true }); }
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`time-clients: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
