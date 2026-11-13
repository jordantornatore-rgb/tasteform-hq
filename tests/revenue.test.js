// Revenue tab (client payments): node tests/revenue.test.js [--shots dir]
// Synthetic data only. Checks: expected-in-30-days and overdue sums, next-payments order and labels,
// filter chips, payment history, admin-only, layout at 1280 and 390 px in light and dark, no console errors.
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

const D = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const C = (id, o) => ({ id, data: Object.assign({ name: id, payments: [{ date: D(-40), amount: 100 }, { date: D(-10), amount: 100 }], paymentsCount: 2, totalPaid: 200, firstPaid: D(-40), lastPaid: D(-10), daysSinceLast: 10, typicalAmount: 100, cadence: 'Monthly', cadenceDays: 30, nextDue: null, nextDueSource: null, paidInFull: null }, o) });
const FX = {
  meta: [{ id: 'stripeSync', data: { connected: true, ok: true, lastSyncAt: new Date().toISOString(), livemode: true } }],
  stripe_summary: [{ id: 'current', data: { mrr: 900, currency: 'AUD', rosterOk: true, rosterAt: new Date().toISOString(), activeCount: 2, pastDueCount: 1, lifetimeRevenue: 9000, refundedTotal: 50, risks: [{ name: 'Late Larry', status: 'past_due', amount: 433, currency: 'AUD' }], revenueByMonth: [{ month: '2026-09', amount: 3000 }, { month: '2026-10', amount: 3500 }, { month: '2026-11', amount: 2500 }] } }],
  stripe_customers: [
    C('Sub Sam', { in1Fit: true, status: 'Active', nextDue: D(3), nextDueSource: 'subscription', typicalAmount: 442 }),
    C('Pattern Pat', { in1Fit: true, status: 'Active', nextDue: D(10), nextDueSource: 'pattern', typicalAmount: 500, cadence: 'Every ~33 days', cadenceDays: 33 }),
    C('Late Larry', { in1Fit: true, status: 'Overdue', nextDue: D(-5), nextDueSource: 'pattern', typicalAmount: 400 }),
    C('Far Fiona', { in1Fit: true, status: 'Active', nextDue: D(40), nextDueSource: 'pattern', typicalAmount: 999 }),
    C('New Nina', { in1Fit: true, status: 'New', payments: [{ date: D(-3), amount: 45 }], paymentsCount: 1, totalPaid: 45, typicalAmount: 45, cadence: null, cadenceDays: null }),
    C('Upfront Uma', { in1Fit: true, status: 'Paid in full', paidInFull: { date: D(-60), amount: 2300 }, totalPaid: 2300, payments: [{ date: D(-60), amount: 2300 }] }),
    C('Gone Gary', { in1Fit: false, status: 'Past client', lastPaid: D(-90), daysSinceLast: 90, leftAt: '2026-11-11' }),
    C('Left Lenny', { in1Fit: false, status: 'Past client', nextDue: null, typicalAmount: 500 }),
    C('Aff Al', { in1Fit: true, memberId: 'aff-al', status: 'Free (affiliate)', payments: [], paymentsCount: 0, totalPaid: 0, firstPaid: null, lastPaid: null, daysSinceLast: null, typicalAmount: null, cadence: null, cadenceDays: null }),
    C('Newie Ned', { in1Fit: true, memberId: 'newie-ned', status: 'Not paying on Stripe', payments: [], paymentsCount: 0, totalPaid: 0, firstPaid: null, lastPaid: null, daysSinceLast: null, typicalAmount: null, cadence: null, cadenceDays: null }),
    C('Once Olly', { in1Fit: false, status: 'One-off' }),
  ],
  challenge_members: [{ id: 'newie-ned', data: { name: 'Newie Ned', active: true } }, { id: 'aff-al', data: { name: 'Aff Al', active: true, billing: 'affiliate' } }], stripe_subscriptions: [], stripe_daily: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: [], app_sessions: [], cta_links: []
};

function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }

async function open(browser, url, { width = 1280, dark = false, role = 'admin' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const log = { errors: [], warnings: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `
    (function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){}
      var c=makeMockClient(${JSON.stringify(FX)}); window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'test@example.com'}, profile:{role:'${role}', display_name:'X'} };
    })();` });
  await page.goto(url + '/index.html#stripe', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__hq && window.__hq.setView ? window.__hq.setView('stripe') : null);
  await page.waitForFunction((r) => { const t = (document.getElementById('stripeRoot') || {}).textContent || ''; return r !== 'admin' ? true : /Next payments/.test(t); }, role, { timeout: 10000, polling: 200 });
  return { context, page, log };
}

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    for (const width of [1280, 390]) for (const dark of [false, true]) for (const role of ['admin', 'limited']) {
      const label = `${width}px ${dark ? 'dark' : 'light'} ${role}`;
      const { context, page, log } = await open(browser, url, { width, dark, role });
      const txt = await page.evaluate(() => document.getElementById('stripeRoot').textContent);
      if (role !== 'admin') {
        const hidden = await page.evaluate(() => ({ tab: document.getElementById('tabStripe').hidden, view: document.getElementById('viewStripe').hidden }));
        check(`${label}: admin only (tab hidden, no client data rendered)`, () => { assert.ok(hidden.tab && hidden.view); assert.ok(!/Sub Sam/.test(txt)); });
      } else {
        check(`${label}: expected next 30 days = sub + pattern, not the 40-day one or the overdue one`, () => assert.ok(/Expected in the next 30 days\s*\$942\s*2 payments/.test(txt), txt.slice(0, 300)));
        check(`${label}: overdue sum`, () => assert.ok(/Plus \$400 overdue from 1 client/.test(txt)));
        check(`${label}: client count comes from 1FIT`, () => assert.ok(/Clients in 1FIT\s*8\s*6 paying on Stripe · 1 free \(affiliate\) · 1 not paying/.test(txt)));
        const next = await page.evaluate(() => [...document.querySelectorAll('#stripeRoot .panel')[0].querySelectorAll('tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ')));
        check(`${label}: next payments sorted, overdue first, source labelled`, () => { assert.strictEqual(next.length, 4); assert.ok(/Late Larry.*5 days late.*overdue.*expected/.test(next[0]), next[0]); assert.ok(/Sub Sam.*in 3 days.*Stripe sub/.test(next[1]), next[1]); assert.ok(/Pattern Pat.*in 10 days.*Monthly.*expected/.test(next[2]), next[2]); });
        check(`${label}: paid in full panel`, () => assert.ok(/Paid in full[\s\S]*Upfront Uma[\s\S]*\$2,300/.test(txt)));
        check(`${label}: refunds note`, () => assert.ok(/\$50 refunded in total/.test(txt)));
        const rowsFor = () => page.evaluate(() => [...document.querySelectorAll('#stripeRoot .panel')].pop().querySelectorAll('tbody tr').length);
        const n1 = await rowsFor();
        check(`${label}: in-1FIT rows`, () => assert.strictEqual(n1, 8));
        await page.click('[data-rv="past"]'); const n2 = await rowsFor();
        const t2 = await page.evaluate(() => [...document.querySelectorAll('#stripeRoot .panel')].pop().textContent);
        check(`${label}: past clients filter`, () => { assert.strictEqual(n2, 2); assert.ok(/Gone Gary[\s\S]*left 1FIT 11 Nov/.test(t2), t2); assert.ok(/Left Lenny[\s\S]*not in 1FIT/.test(t2)); });
        await page.click('[data-rv="nostripe"]');
        const t4 = await page.evaluate(() => [...document.querySelectorAll('#stripeRoot .panel')].pop().textContent);
        check(`${label}: not on Stripe filter`, () => assert.ok(/Newie Ned[\s\S]*never paid on Stripe/.test(t4), t4));
        await page.click('[data-rv-free="newie-ned"]'); await page.waitForTimeout(200);
        const saved = await page.evaluate(() => (window.__mock.__tables.challenge_members.find(r => r.id === 'newie-ned') || {}).data);
        const t5 = await page.evaluate(() => document.getElementById('stripeRoot').textContent);
        check(`${label}: mark free saves billing on the 1FIT member and updates the page`, () => { assert.strictEqual(saved && saved.billing, 'affiliate'); assert.ok(saved.active === true && saved.name === 'Newie Ned'); assert.ok(/2 free \(affiliate\)/.test(t5), t5.slice(0, 600)); });
        await page.click('[data-rv="free"]');
        await page.click('[data-rv-unfree="newie-ned"]'); await page.waitForTimeout(200);
        const saved2 = await page.evaluate(() => window.__mock.__tables.challenge_members.find(r => r.id === 'newie-ned').data);
        check(`${label}: undo clears it`, () => assert.strictEqual(saved2.billing, null));
        await page.click('[data-rv="all"]'); const n3 = await rowsFor();
        check(`${label}: all filter`, () => assert.strictEqual(n3, 11));
        await page.click('[data-rv="paying"]');
        await page.click('#stripeRoot tbody tr:has-text("Upfront Uma") details summary');
        const hist = await page.evaluate(() => [...document.querySelectorAll('#stripeRoot details')].find(d => /Upfront Uma/.test(d.textContent)).textContent);
        check(`${label}: payment history opens`, () => assert.ok(/\$2,300/.test(hist), hist));
        await page.click('[data-rv="paying"]');
        const all = await page.evaluate(() => document.getElementById('viewStripe').textContent);
        check(`${label}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(all)));
      }
      if (width < 500) {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: no horizontal scroll`, () => assert.ok(ov <= 0, 'overflow ' + ov + 'px'));
      }
      check(`${label}: no console errors`, () => assert.deepStrictEqual(log.errors, []));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `revenue-${width}-${dark ? 'dark' : 'light'}-${role}.png`), fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`revenue: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
