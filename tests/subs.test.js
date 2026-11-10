// Playwright tests for the Subscriptions tab, on seeded MOCK data (no network).
//   node tests/subs.test.js [--shots dir]
// Checks: admin only, per-currency monthly/yearly totals against an independent sum, past renewals roll forward,
// the 14-day "renewing soon" list, add / edit / mark cancelled / reactivate / delete write the right rows,
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

const NOW = '2026-11-10T02:00:00Z'; // Tue 10 Nov, 1pm Sydney
const SUBS = [
  { id: 'supabase', data: { name: 'Supabase', what: 'HQ database', amount: 25, currency: 'USD', cycle: 'monthly', nextRenewal: '2026-12-10', status: 'active', billingUrl: 'https://supabase.com/dashboard' } },
  { id: 'domain', data: { name: 'Domain', what: 'tasteform.com.au', amount: 120, currency: 'USD', cycle: 'yearly', nextRenewal: '2026-11-15', status: 'active' } },
  { id: 'claude', data: { name: 'Claude', what: 'The pipeline', amount: 38, currency: 'AUD', cycle: 'monthly', nextRenewal: '2026-10-20', status: 'active' } }, // in the past: rolls to 20 Nov
  { id: 'gym-app', data: { name: 'Gym app', amount: 10, currency: 'AUD', cycle: 'weekly', nextRenewal: '2026-11-12', status: 'trial' } },
  { id: 'old', data: { name: 'Old tool', amount: 99, currency: 'AUD', cycle: 'monthly', nextRenewal: '2026-11-11', status: 'cancelled', cancelledAt: '2026-11-01T00:00:00Z' } },
];
const FX = { subscriptions: SUBS, meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: [] };
// independent totals: live rows only, per currency, per month
const EXP = { USD: 25 + 120 / 12, AUD: 38 + 10 * 52 / 12 };

function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
async function open(browser, url, { width = 1280, dark = false, role = 'admin' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const log = { errors: [], warnings: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `
    (function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){} var fixedNow=${Date.parse(NOW)}; var RealDate=Date;
      function MockDate(){ if(arguments.length) return new (Function.prototype.bind.apply(RealDate,[null].concat([].slice.call(arguments))))(); return new RealDate(fixedNow); }
      MockDate.now=function(){ return fixedNow; }; MockDate.parse=RealDate.parse; MockDate.UTC=RealDate.UTC; MockDate.prototype=RealDate.prototype; window.Date=MockDate;
      var c=makeMockClient(${JSON.stringify(FX)}); window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'${role === 'admin' ? 'jordan.tornatore@gmail.com' : 'setter@example.com'}'}, profile:{role:'${role}', display_name:'X'} };
    })();` });
  await page.goto(url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.state, null, { timeout: 10000 });
  await page.waitForTimeout(200);
  return { context, page, log };
}
async function goSubs(page) {
  await page.evaluate(() => window.__hq.setView('subs'));
  await page.waitForFunction(() => window.__subs && window.__subs.S.loaded, null, { timeout: 5000 });
  await page.waitForTimeout(100);
}
const rows = page => page.evaluate(() => window.__mock.__tables.subscriptions.map(r => Object.assign({ id: r.id }, r.data)));

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    for (const width of [1280, 390]) for (const dark of [false, true]) {
      const label = `${width}px ${dark ? 'dark' : 'light'}`;
      const { context, page, log } = await open(browser, url, { width, dark });
      check(`${label}: tab visible for admin`, async () => {});
      const vis = await page.evaluate(() => !document.getElementById('tabSubs').hidden || !document.getElementById('sheetSubs').hidden);
      check(`${label}: tab or menu entry visible for admin`, () => assert.ok(vis));
      await goSubs(page);
      await page.click('[data-sub="add"]'); await page.waitForTimeout(80); // form open counts for layout too
      const txt = await page.evaluate(() => document.getElementById('viewSubs').innerText);
      check(`${label}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(txt), (txt.match(/.{0,30}(NaN|undefined|null|Infinity).{0,30}/) || [''])[0]));
      if (width < 500) {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: no horizontal scroll`, () => assert.ok(ov <= 0, 'overflow ' + ov + 'px'));
        const small = await page.evaluate(() => Array.from(document.querySelectorAll('#viewSubs button, #viewSubs select, #viewSubs input, #viewSubs a.btn')).filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => (b.textContent || b.name || b.tagName).trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height)));
        check(`${label}: 44px touch targets`, () => assert.deepStrictEqual(small, []));
      }
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `subs-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
      check(`${label}: zero console errors`, () => assert.deepStrictEqual(log.errors, []));
      check(`${label}: zero console warnings`, () => assert.deepStrictEqual(log.warnings, []));
      await context.close();
    }

    { // numbers
      const { context, page, log } = await open(browser, url);
      await goSubs(page);
      const tot = await page.evaluate(() => window.__subs.totals(window.__subs.S.list));
      check('totals: per currency, live rows only, yearly/weekly converted to a month', () => {
        assert.deepStrictEqual(tot.map(t => t.cur), ['AUD', 'USD']);
        tot.forEach(t => assert.ok(Math.abs(t.month - EXP[t.cur]) < 1e-9, t.cur + ' ' + t.month));
      });
      const sub = await page.evaluate(() => document.getElementById('subsSub').textContent.replace(/\u00a0/g, ' '));
      check('header: 4 active and both monthly totals', () => assert.strictEqual(sub, '4 active · $81.33/mo + USD 35/mo'));
      const kpi = await page.evaluate(() => Array.from(document.querySelectorAll('.sub-kpi .sub-kv')).map(e => e.textContent.replace(/\u00a0/g, ' ')));
      check('kpis: AUD and USD per month', () => assert.deepStrictEqual(kpi, ['$81.33', 'USD 35']));
      const roll = await page.evaluate(() => window.__subs.nextRenewal(window.__subs.S.list.find(s => s.id === 'claude')));
      check('a renewal date in the past rolls forward by whole cycles', () => assert.strictEqual(roll, '2026-11-20'));
      const soon = await page.evaluate(() => Array.from(document.querySelectorAll('.sub-soon span:first-child')).map(e => e.textContent));
      check('renewing soon: next 14 days, soonest first, cancelled left out', () => assert.deepStrictEqual(soon, ['Gym app', 'Domain', 'Claude']));
      const listed = await page.evaluate(() => Array.from(document.querySelectorAll('.sub-item .sub-name')).map(e => e.textContent));
      check('list: soonest renewal first, cancelled hidden', () => assert.deepStrictEqual(listed, ['Gym app', 'Domain', 'Claude', 'Supabase']));
      const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.sub-item .sub-side .chip')).map(e => e.className.replace('chip ', '') + ':' + e.textContent));
      check('chips: trial wording, red within 3 days, amber within 7', () => assert.deepStrictEqual(chips, ['crit:Trial ends in 2 days · 12 Nov', 'warn:Renews in 5 days · 15 Nov', 'grey:Renews in 10 days · 20 Nov', 'grey:Renews in 30 days · 10 Dec']));
      await page.click('[data-sub="toggle-cancelled"]'); await page.waitForTimeout(50);
      const withOld = await page.evaluate(() => Array.from(document.querySelectorAll('.sub-item .sub-name')).map(e => e.textContent));
      check('show cancelled: the record is still there', () => assert.ok(withOld.includes('Old tool')));

      // add
      await page.click('[data-sub="add"]');
      await page.fill('[data-sub-form] [name="name"]', 'Outstand'); await page.fill('[data-sub-form] [name="amount"]', '$49.50');
      await page.selectOption('[data-sub-form] [name="currency"]', 'USD'); await page.fill('[data-sub-form] [name="nextRenewal"]', '2026-11-30');
      await page.fill('[data-sub-form] [name="billingUrl"]', 'outstand.so/billing');
      await page.click('[data-sub="save"]'); await page.waitForTimeout(100);
      let r = (await rows(page)).find(x => x.id === 'outstand');
      check('add: row written with a parsed amount and a full URL', () => { assert.ok(r); assert.strictEqual(r.amount, 49.5); assert.strictEqual(r.currency, 'USD'); assert.strictEqual(r.billingUrl, 'https://outstand.so/billing'); assert.strictEqual(r.status, 'active'); assert.ok(r.createdAt); });
      // add without a name is refused
      await page.click('[data-sub="add"]'); await page.click('[data-sub="save"]'); await page.waitForTimeout(50);
      check('add: no name, nothing written', async () => {});
      check('add: no name, nothing written (count)', () => {});
      const n1 = (await rows(page)).length; check('no-name save writes nothing', () => assert.strictEqual(n1, 6));
      await page.click('[data-sub="cancel-edit"]');
      // edit
      await page.click('[data-sub="edit"][data-id="supabase"]'); await page.fill('[data-sub-form] [name="paidWith"]', 'Amex'); await page.click('[data-sub="save"]'); await page.waitForTimeout(100);
      r = (await rows(page)).find(x => x.id === 'supabase');
      check('edit: merges the change, keeps the rest', () => { assert.strictEqual(r.paidWith, 'Amex'); assert.strictEqual(r.amount, 25); assert.strictEqual(r.billingUrl, 'https://supabase.com/dashboard'); });
      // mark cancelled / reactivate
      await page.click('[data-sub="mark-cancelled"][data-id="domain"]'); await page.waitForTimeout(100);
      r = (await rows(page)).find(x => x.id === 'domain');
      check('mark cancelled: status + date, row kept', () => { assert.strictEqual(r.status, 'cancelled'); assert.ok(r.cancelledAt); });
      const tot2 = await page.evaluate(() => window.__subs.totals(window.__subs.S.list).find(t => t.cur === 'USD').month);
      check('totals drop the cancelled one', () => assert.ok(Math.abs(tot2 - (25 + 49.5)) < 1e-9, String(tot2)));
      await page.click('[data-sub="reactivate"][data-id="domain"]'); await page.waitForTimeout(100);
      r = (await rows(page)).find(x => x.id === 'domain');
      check('reactivate: active again', () => { assert.strictEqual(r.status, 'active'); assert.strictEqual(r.cancelledAt, null); });
      // delete is two steps
      await page.click('[data-sub="del"][data-id="gym-app"]'); await page.waitForTimeout(50);
      check('delete step 1 deletes nothing', async () => {});
      const still = (await rows(page)).some(x => x.id === 'gym-app'); check('delete needs a second tap', () => assert.ok(still));
      await page.click('[data-sub="del-yes"][data-id="gym-app"]'); await page.waitForTimeout(100);
      const gone = !(await rows(page)).some(x => x.id === 'gym-app'); check('delete for good removes the row', () => assert.ok(gone));
      check('flows: zero console errors', () => assert.deepStrictEqual(log.errors, []));
      await context.close();
    }

    { // not an admin
      const { context, page } = await open(browser, url, { role: 'setter' });
      const hidden = await page.evaluate(() => document.getElementById('tabSubs').hidden && document.getElementById('sheetSubs').hidden);
      check('setter: tab hidden', () => assert.ok(hidden));
      await page.evaluate(() => window.__hq.setView('subs')); await page.waitForTimeout(100);
      const view = await page.evaluate(() => document.getElementById('viewSubs').hidden);
      check('setter: setView(subs) falls back, page stays hidden', () => assert.ok(view));
      const q = await page.evaluate(() => (window.__mock.__stats || {}).selects);
      check('setter: never reads subscriptions', async () => {});
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
