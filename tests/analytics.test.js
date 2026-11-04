// Playwright checks for the Analytics tab (synthetic data, committed; no real data).
//   node tests/analytics.test.js [--shots dir] [--fixtures realDir]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const REAL = args.includes('--fixtures') ? args[args.indexOf('--fixtures') + 1] : null;
const NOW = '2026-11-04T01:00:00Z', TODAY = '2026-11-04';
function addDays(k, n) { const t = new Date(k + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

function synthetic() {
  const posts = [], types = ['reel', 'reel', 'reel', 'carousel', 'reel', 'post'];
  for (let i = 0; i < 30; i++) {
    const day = addDays(TODAY, -(1 + i * 3)), t = types[i % types.length], views = [1600, 2400, 4500, 18000, 2500, 4400][i % 6] + i * 37 + (i === 7 ? 150000 : 0);
    const d = { mediaType: t, postedAtDate: day + 'T19:10:00+11:00', postedAtExact: true, title: 'Synthetic post ' + (i + 1), views, likes: Math.round(views * 0.02), comments: 3, saves: 5 + i, shares: 2 + (i % 4), interactions: Math.round(views * 0.02) + 10 + i, follows: i % 3 };
    if (t === 'reel' && i % 2 === 0) { d.avgWatchSec = 3 + (i % 5) + (i === 4 ? 9 : 0); d.watchTimeSec = Math.round(views * d.avgWatchSec); }
    posts.push({ id: String(4000000000000000000 + i), data: d });
  }
  const acc = []; let f = 1200;
  for (let i = 40; i >= 0; i--) { const day = addDays(TODAY, -i); f += (i % 4) - 1; acc.push({ id: day, data: { date: day, followers: f, p7: { reached: 3000 + i * 10, views: 9000, follows: 20, unfollows: 15, interactions: 400 }, p30: { reached: 12000 + i * 50, views: 40000, follows: 70, unfollows: 52, interactions: 1500 }, p90: { reached: 30000, views: 120000, follows: 200, unfollows: 160 } } }); }
  return { ig_posts: posts, ig_account_daily: acc, meta: [{ id: 'igScan', data: { lastScanAt: '2026-11-04T04:36:30+11:00', lastAttemptOk: true } }] };
}
const BASE = { dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_stories: [], posts: [], script_reviews: [] };
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
async function open(browser, url, { width, dark, role, fx }) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const log = { errors: [], warnings: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `
    (function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){} var fixedNow=${Date.parse(NOW)}; var RealDate=Date;
      function MockDate(){ if(arguments.length) return new (Function.prototype.bind.apply(RealDate,[null].concat([].slice.call(arguments))))(); return new RealDate(fixedNow); }
      MockDate.now=function(){ return fixedNow; }; MockDate.parse=RealDate.parse; MockDate.UTC=RealDate.UTC; MockDate.prototype=RealDate.prototype; window.Date=MockDate;
      var c=makeMockClient(${JSON.stringify(fx)}); window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'x@example.com'}, profile:{role:'${role}', display_name:'T'} };
    })();` });
  await page.goto(url + '/index.html#analytics', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.state && window.__hq.state.loaded.igPosts, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return { context, page, log };
}
(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  const sets = [['synthetic', Object.assign({}, BASE, synthetic())]];
  if (REAL) { const fx = Object.assign({}, BASE); fs.readdirSync(REAL).forEach(f => { fx[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(REAL, f), 'utf8')); }); sets.push(['real', fx]); }
  for (const [name, fx] of sets) for (const [width, dark, role] of [[1280, false, 'admin'], [390, true, 'limited'], [1280, true, 'limited']]) {
    const { context, page, log } = await open(browser, url, { width, dark, role, fx });
    const label = `${name} ${width}${dark ? ' dark' : ''} ${role}`;
    check(`${label}: analytics view is shown`, () => true);
    for (const v of ['overview', 'posts', 'audience']) for (const per of ['7', '30', '90']) {
      await page.click(`#anViewSeg [data-anview="${v}"]`); await page.click(`#anPeriodSeg [data-anperiod="${per}"]`); await page.waitForTimeout(80);
      const txt = await page.evaluate(() => document.getElementById('viewAnalytics').innerText);
      check(`${label} ${v} ${per}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(txt), (txt.match(/.{0,40}(NaN|undefined|null|Infinity|\[object).{0,40}/) || [''])[0]));
      if (width < 500) { const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(`${label} ${v}: no horizontal scroll`, () => assert.ok(ov <= 1, 'overflow ' + ov)); }
      if (v === 'overview' && name === 'synthetic') {
        const shown = await page.evaluate(() => document.querySelector('#anRoot .kpi:nth-child(2) .value').textContent.replace(/[^0-9]/g, ''));
        const n = +per, from = addDays(TODAY, -(n - 1)), exp = fx.ig_posts.filter(p => { const d = p.data.postedAtDate.slice(0, 10); return d >= from && d <= TODAY; }).reduce((a, p) => a + p.data.views, 0);
        check(`${label} ${per}d: views KPI = independent sum`, () => assert.strictEqual(+shown, exp));
      }
      if (SHOTS && per === '30') await page.screenshot({ path: path.join(SHOTS, `${name}-${width}${dark ? '-dark' : ''}-${role}-${v}.png`), fullPage: true });
    }
    check(`${label}: zero console errors`, () => assert.deepStrictEqual(log.errors, []));
    check(`${label}: zero console warnings`, () => assert.deepStrictEqual(log.warnings, []));
    await context.close();
  }
  await browser.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
