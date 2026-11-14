// Applications page on the apply page's data (app_sessions): node tests/apps.test.js [--shots dir]
// Synthetic data only. Checks: question-by-question reached / got past / left counts, the biggest leak flagged,
// time per question, answers vs applied, sources and devices, applicants list, test visits dropped,
// layout at 1280 and 390 px in light and dark, no console errors.
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

const now = Date.now(), iso = (msAgo) => new Date(now - msAgo).toISOString();
const ORDER = ['open', 'start', 'goal', 'tried', 'age', 'name', 'email', 'phone', 'submitted'];
let n = 0;
const S = (upto, o) => { const t0 = 2 * 86400000 + (n++) * 60000, steps = {}; ORDER.slice(0, ORDER.indexOf(upto) + 1).forEach((k, i) => { steps[k] = iso(t0 - i * 20000); });
  const d = Object.assign({ firstSeenAt: steps.open, lastSeenAt: steps[upto], steps, utm: { utm_source: 'ig', utm_medium: 'social', utm_content: 'link_in_bio' }, device: 'mobile', answers: {}, contact: {}, formVersion: 'v2' }, o || {});
  if (upto === 'submitted') { d.submitted = true; d.submittedAt = steps.submitted; }
  return { id: 's' + n, data: d }; };
const FX = {
  app_sessions: [
    S('open'), S('open'), S('open'), S('open'), // 4 never tap start
    S('start'), // 1 leaves at Q1
    S('goal', { answers: { goal: 'Fat loss' } }), S('goal', { answers: { goal: 'Build muscle' } }), // 2 leave at Q2
    S('tried', { answers: { goal: 'Fat loss', tried: 'Diets that didn’t work' } }), // 1 leaves at age
    S('submitted', { answers: { goal: 'Fat loss', tried: 'Gym on my own', age: '25-30' }, contact: { firstName: 'Sam', email: 'sam@example.com', phoneE164: '+61400000001' }, utm: { utm_source: 'instagram', utm_medium: 'story', utm_campaign: 'sticker', utm_content: '9_5_fat_loss' } }),
    S('submitted', { answers: { goal: 'Fat loss', tried: 'Diets that didn’t work', age: '18-24' }, contact: { firstName: 'Lee', email: 'lee@example.com', phoneE164: '+61400000002' }, device: 'desktop' }),
    S('submitted', { utm: { utm_source: 'claude', utm_medium: 'test', utm_content: 'live_test' }, contact: { firstName: 'Testy' } }) // test: ignored
  ],
  meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: [], cta_links: []
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
  await page.goto(url + '/index.html#apps', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.setView, null, { timeout: 10000 });
  await page.evaluate(() => window.__hq.setView('apps'));
  await page.waitForFunction(() => /Q6/.test((document.getElementById('apQ') || {}).textContent || ''), null, { timeout: 8000 });
  return { context, page, log };
}

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    for (const width of [1280, 390]) for (const dark of [false, true]) for (const role of ['admin']) {
      const label = `${width}px ${dark ? 'dark' : 'light'} ${role}`;
      const { context, page, log } = await open(browser, url, { width, dark, role });
      const q = await page.evaluate(() => [...document.querySelectorAll('#apQ .ap-row')].map(r => ({ t: r.textContent.replace(/\s+/g, ' '), worst: r.classList.contains('worst') })));
      check(`${label}: 8 rows, landing to submitted`, () => assert.strictEqual(q.length, 8));
      check(`${label}: landed = 10 real visits (test dropped)`, () => assert.ok(/^Landed on the page\s*10\s*opened/.test(q[0].t), q[0].t));
      check(`${label}: tapped start 6 of 10, 4 left`, () => assert.ok(/6 of 10.*4 left here \(40%\)/.test(q[1].t), q[1].t));
      check(`${label}: Q1 5 of 6, 1 left`, () => assert.ok(/Q1.*5 of 6.*1 left here/.test(q[2].t), q[2].t));
      check(`${label}: Q2 3 of 5, 2 left`, () => assert.ok(/Q2.*3 of 5.*2 left here \(40%\)/.test(q[3].t), q[3].t));
      check(`${label}: Q3 age 2 of 3`, () => assert.ok(/Q3.*2 of 3.*1 left here/.test(q[4].t), q[4].t));
      check(`${label}: submitted 2 of 2`, () => assert.ok(/Q6.*2 of 2.*nobody left here/.test(q[7].t), q[7].t));
      check(`${label}: time on a question shown`, () => assert.ok(/~20s/.test(q[2].t), q[2].t));
      check(`${label}: biggest leak flagged = start`, () => { assert.ok(q[1].worst); assert.strictEqual(q.filter(x => x.worst).length, 1); });
      const txt = (await page.textContent('#viewApps')).replace(/\s+/g, ' ');
      check(`${label}: kpis`, () => { assert.ok(/Opened the page\s*10/.test(txt)); assert.ok(/Applied\s*2/.test(txt)); assert.ok(/Open → apply\s*20%/.test(txt), txt.slice(0, 400)); assert.ok(/In market \(25–40\)\s*1/.test(txt)); });
      check(`${label}: leak note`, () => assert.ok(/Biggest leak: Start — 4 of 10 left there/.test(txt)));
      check(`${label}: answers vs applied`, () => assert.ok(/Fat loss\s*4\s*2\s*50%/.test(txt), txt));
      check(`${label}: sources`, () => { assert.ok(/Story CTA · 9 5 fat loss\s*1\s*1\s*1\s*100%/.test(txt), txt); assert.ok(/Link in bio · link in bio\s*9\s*5\s*1/.test(txt)); });
      check(`${label}: devices`, () => assert.ok(/Phone\s*9\s*5\s*1/.test(txt) && /Desktop\s*1\s*1\s*1/.test(txt)));
      check(`${label}: applicants listed, test left out`, () => { assert.ok(/Sam.*Fat loss.*Gym on my own.*25-30/.test(txt)); assert.ok(/Lee/.test(txt)); assert.ok(!/Testy/.test(txt)); });
      check(`${label}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(txt)));
      if (width < 500) {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: no horizontal scroll`, () => assert.ok(ov <= 0, 'overflow ' + ov + 'px'));
      }
      check(`${label}: no console errors`, () => assert.deepStrictEqual(log.errors, []));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `apps-${width}-${dark ? 'dark' : 'light'}-${role}.png`), fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`apps: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
