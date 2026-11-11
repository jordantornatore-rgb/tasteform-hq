// Playwright checks for Home + the four area pages (Traffic, Leads, Sales, Delivery).
//   node tests/pillars.test.js [--shots dir] [--fixtures realDir]
// Synthetic data is committed below; --fixtures adds a run on an anonymised export (not committed).
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const REAL = args.includes('--fixtures') ? args[args.indexOf('--fixtures') + 1] : null;
const NOW = process.env.HQ_NOW || '2026-11-11T02:00:00Z', TODAY = '2026-11-11';
function addDays(k, n) { const t = new Date(k + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

function synthetic() {
  const posts = [];
  for (let i = 0; i < 40; i++) {
    const day = addDays(TODAY, -(1 + i * 2)), views = 3000 + i * 211;
    posts.push({ id: String(5000000000000000000 + i), data: { mediaType: 'reel', postedAtDate: day + 'T19:10:00+11:00', postedAtExact: true, title: 'Synthetic reel ' + (i + 1), views, likes: 60 + i, comments: 4, saves: 9 + i, shares: 3, follows: 5 + (i % 7), viewersNonFollowersPct: 80 + (i % 10), shortcode: 'SYN' + i } });
  }
  const acc = [];
  for (let i = 6; i >= 0; i--) { const day = addDays(TODAY, -i); acc.push({ id: day, data: { date: day, followers: 1000 + (6 - i) * 7, p7: { reached: 20000, views: 40000, profileVisits: 400, externalLinkTaps: 12 }, p30: { reached: 90000, views: 160000, profileVisits: 1500, externalLinkTaps: 40 } } }); }
  const tfd = [], tfr = [];
  for (let i = 0; i < 60; i++) { const day = addDays(TODAY, -i); tfd.push({ id: day, data: { date: day, visits: 2 + (i % 3), started: i % 9 === 0 ? 1 : 0, completed: i % 9 === 0 ? 1 : 0, bySource: { link_in_bio: { visits: 2, completed: 0 } } } }); }
  for (let i = 0; i < 9; i++) tfr.push({ id: 'r' + i, data: { submittedAt: addDays(TODAY, -(i * 6)) + 'T03:00:00Z', source: i % 3 ? 'link_in_bio' : 'unknown', fit: null } });
  return {
    ig_posts: posts, ig_account_daily: acc, tf_daily: tfd, tf_responses: tfr,
    ig_stories: [{ id: 's1', data: { postedAtDate: addDays(TODAY, -2) + 'T10:00:00+11:00', views: 140 } }],
    content_queue: [{ id: 'q1', data: { status: 'awaiting_approval' } }, { id: 'q2', data: { status: 'to_film' } }],
    meta: [{ id: 'ghlSync', data: { connected: false } }, { id: 'stripeSync', data: { connected: false } }, { id: 'routineCalls', data: { dates: { [TODAY]: { count: 1 }, [addDays(TODAY, 1)]: { count: 4 } } } }]
  };
}
const DELIVERY = { active: 13, joined: 14, left: 3, avgWeeks: 1.1, withJoinDate: 14, checkinsOnTime: 3 };
const BASE = { dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_stories: [], posts: [], script_reviews: [], content_queue: [], meta: [] };
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : (f.endsWith('.html') ? 'text/html' : 'application/octet-stream') }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1', () => res({ srv, url: 'http://127.0.0.1:' + srv.address().port })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
async function open(browser, url, { width, dark, role, fx, hash }) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500, deviceScaleFactor: SHOTS ? 2 : 1 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const log = { errors: [], warnings: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `
    (function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); localStorage.removeItem('hqPeriod'); }catch(e){} var fixedNow=${Date.parse(NOW)}; var RealDate=Date;
      function MockDate(){ if(arguments.length) return new (Function.prototype.bind.apply(RealDate,[null].concat([].slice.call(arguments))))(); return new RealDate(fixedNow); }
      MockDate.now=function(){ return fixedNow; }; MockDate.parse=RealDate.parse; MockDate.UTC=RealDate.UTC; MockDate.prototype=RealDate.prototype; window.Date=MockDate;
      var c=makeMockClient(${JSON.stringify(fx)}, { rpc:{ hq_delivery_counts:${JSON.stringify(DELIVERY)} } }); window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'x@example.com'}, profile:{role:'${role}', display_name:'T'} };
    })();` });
  await page.goto(url + '/index.html' + (hash || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.state && window.__hq.state.loaded.igPosts && window.__hq.state.loaded.tfResponses, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return { context, page, log };
}
const VIEWS = [['home', 'viewHome'], ['traffic', 'viewTraffic'], ['leadflow', 'viewLeadflow'], ['sales', 'viewSales'], ['delivery', 'viewDelivery']];
(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  const sets = [['synthetic', Object.assign({}, BASE, synthetic())]];
  if (REAL) { const fx = Object.assign({}, BASE); fs.readdirSync(REAL).forEach(f => { fx[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(REAL, f), 'utf8')); }); sets.push(['real', fx]); }
  for (const [name, fx] of sets) for (const [width, dark, role] of [[1280, false, 'admin'], [390, true, 'admin'], [390, false, 'limited'], [1280, true, 'limited']]) {
    const { context, page, log } = await open(browser, url, { width, dark, role, fx });
    const label = `${name} ${width}${dark ? ' dark' : ''} ${role}`;
    const first = await page.evaluate(() => !document.getElementById('viewHome').hidden);
    check(`${label}: Home is the first page`, () => assert.ok(first));
    const cards = await page.evaluate(() => [...document.querySelectorAll('#plHome .pl-card .n')].map(e => e.firstChild.textContent));
    check(`${label}: cards`, () => assert.deepStrictEqual(cards, role === 'admin' ? ['Traffic', 'Leads', 'Sales', 'Delivery'] : ['Traffic', 'Leads', 'Delivery']));
    const todo = await page.evaluate(() => document.querySelectorAll('#plHome .pl-list .pl-row').length);
    check(`${label}: at most 3 to-dos`, () => assert.ok(todo >= 1 && todo <= 3, String(todo)));
    for (const per of ['7', '30', 'month']) {
      await page.evaluate(() => window.__hq.setView('home'));
      await page.click(`#viewHome [data-pl-period="${per}"]`); await page.waitForTimeout(120);
      for (const [v, id] of VIEWS) {
        await page.evaluate(v => window.__hq.setView(v), v); await page.waitForTimeout(80);
        const shown = await page.evaluate(id => ({ hidden: document.getElementById(id).hidden, txt: document.getElementById(id).innerText }), id);
        if (v === 'sales' && role !== 'admin') { check(`${label} ${per}: sales refused`, () => assert.ok(shown.hidden)); continue; }
        check(`${label} ${per} ${v}: shown`, () => assert.ok(!shown.hidden));
        check(`${label} ${per} ${v}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(shown.txt), (shown.txt.match(/.{0,40}(NaN|undefined|null|Infinity|\[object).{0,40}/) || [''])[0]));
        check(`${label} ${per} ${v}: no DM numbers while the scan is off`, () => assert.ok(!/DMs waiting|From DMs|New conversations/.test(shown.txt)));
        if (width < 500) {
          const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          check(`${label} ${per} ${v}: no horizontal scroll`, () => assert.ok(ov <= 1, 'overflow ' + ov));
          const small = await page.evaluate(id => [...document.querySelectorAll('#' + id + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 32).map(b => b.textContent.trim().slice(0, 20)), id);
          check(`${label} ${per} ${v}: tap targets`, () => assert.deepStrictEqual(small, []));
        }
        if (SHOTS && per === '30') await page.screenshot({ path: path.join(SHOTS, `${name}-${width}${dark ? '-dark' : ''}-${role}-${v}.png`), fullPage: true });
      }
      // independent count: applications in the window
      const n = per === 'month' ? null : +per, from = n ? addDays(TODAY, -(n - 1)) : TODAY.slice(0, 8) + '01';
      const syd = iso => new Date(new Date(iso).getTime()).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      const exp = (fx.tf_responses || []).filter(r => r.data.submittedAt && syd(r.data.submittedAt) >= from && syd(r.data.submittedAt) <= TODAY).length;
      await page.evaluate(() => window.__hq.setView('home')); await page.waitForTimeout(60);
      const got = await page.evaluate(() => document.querySelectorAll('#plHome .pl-card .v')[1].textContent.replace(/[^0-9]/g, ''));
      check(`${label} ${per}: applications card = independent count`, () => assert.strictEqual(+got, exp));
    }
    // a card opens its page; the Delivery numbers come from the RPC
    await page.evaluate(() => window.__hq.setView('home')); await page.click('#plHome .pl-card[data-go="delivery"]'); await page.waitForTimeout(80);
    const dv = await page.evaluate(() => ({ hidden: document.getElementById('viewDelivery').hidden, txt: document.getElementById('plDelivery').innerText }));
    check(`${label}: Delivery card opens Delivery`, () => assert.ok(!dv.hidden));
    check(`${label}: active clients from hq_delivery_counts`, () => assert.ok(/Active clients\s*13/.test(dv.txt), dv.txt.slice(0, 80)));
    check(`${label}: zero console errors`, () => assert.deepStrictEqual(log.errors, []));
    check(`${label}: zero console warnings`, () => assert.deepStrictEqual(log.warnings, []));
    await context.close();
  }
  await browser.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
