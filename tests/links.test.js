// Story links tab: node tests/links.test.js [--shots dir]
// Synthetic data only. Checks: slug matches the content scan's sticker normalisation, the link is built right,
// Add saves one cta_links row (re-adding the same text updates it), opened/applied counts come from story
// sessions only, layout holds at 1280 and 390 px in light and dark, no console errors.
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

const S = (id, medium, content, submitted) => ({ id, data: { utm: { utm_source: 'instagram', utm_medium: medium, utm_content: content }, submitted: !!submitted } });
const FX = {
  cta_links: [{ id: 'old_one', data: { label: 'Old one', slug: 'old_one', type: 'dm', url: 'https://tasteformcoaching.vercel.app/?utm_source=instagram&utm_medium=story&utm_campaign=dm&utm_content=old_one', createdAt: '2026-11-01T00:00:00Z' } }],
  app_sessions: [S('a1', 'story', 'old_one', true), S('a2', 'story', 'old_one', false), S('a3', 'story', 'old_one', false), S('a4', 'bio', 'old_one', true), S('a5', 'story', '9_5_fat_loss', false)],
  meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: []
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
  await page.goto(url + '/index.html#links', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__storyLinks, null, { timeout: 10000 });
  await page.evaluate(() => window.__hq && window.__hq.setView ? window.__hq.setView('links') : null);
  await page.waitForFunction(() => /opened/.test(document.getElementById('slList').innerText), null, { timeout: 5000 });
  return { context, page, log };
}

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    for (const width of [1280, 390]) for (const dark of [false, true]) for (const role of ['admin', 'limited']) {
      const label = `${width}px ${dark ? 'dark' : 'light'} ${role}`;
      const { context, page, log } = await open(browser, url, { width, dark, role });
      const norm = await page.evaluate(() => [window.__storyLinks.norm(' 9-5 Fat Loss! '), window.__storyLinks.norm("Dom's  client win")]);
      check(`${label}: slug normalisation`, () => assert.deepStrictEqual(norm, ['9_5_fat_loss', 'dom_s_client_win']));
      const visible = await page.evaluate(() => !document.getElementById('viewLinks').hidden);
      check(`${label}: tab opens`, () => assert.ok(visible));
      const first = await page.evaluate(() => document.getElementById('slList').innerText);
      check(`${label}: counts from story sessions only`, () => assert.ok(/3 opened · 1 applied/.test(first), first));
      // add a link, sticker type
      await page.fill('#slText', '9-5 Fat Loss');
      await page.click('[data-sltype="sticker"]');
      await page.click('#slAdd');
      await page.waitForTimeout(150);
      const rows = await page.evaluate(() => window.__mock.__tables.cta_links.map(r => Object.assign({ id: r.id }, r.data)));
      const row = rows.find(r => r.id === '9_5_fat_loss');
      check(`${label}: row saved`, () => assert.ok(row && row.label === '9-5 Fat Loss' && row.type === 'sticker'));
      check(`${label}: url built`, () => assert.strictEqual(row && row.url, 'https://tasteformcoaching.vercel.app/?utm_source=instagram&utm_medium=story&utm_campaign=sticker&utm_content=9_5_fat_loss'));
      // re-add same text: updates, no duplicate
      await page.fill('#slText', '9-5 fat loss'); await page.click('[data-sltype="dm"]'); await page.click('#slAdd'); await page.waitForTimeout(150);
      const n = await page.evaluate(() => window.__mock.__tables.cta_links.filter(r => r.id === '9_5_fat_loss').length);
      check(`${label}: no duplicate rows`, () => assert.strictEqual(n, 1));
      const txt = await page.evaluate(() => document.getElementById('viewLinks').innerText);
      check(`${label}: new link listed with its count`, () => assert.ok(/9-5 fat loss[\s\S]*DM ·[\s\S]*1 opened · 0 applied/.test(txt), txt));
      check(`${label}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(txt)));
      if (width < 500) {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: no horizontal scroll`, () => assert.ok(ov <= 0, 'overflow ' + ov + 'px'));
      }
      check(`${label}: no console errors`, () => assert.deepStrictEqual(log.errors, []));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `links-${width}-${dark ? 'dark' : 'light'}-${role}.png`), fullPage: false });
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`links: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
