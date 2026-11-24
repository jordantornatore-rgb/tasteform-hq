// Check-in replies: node tests/checkins.test.js [--shots dir]
// Synthetic data only. HQ tab (admin only): make a reply (row saved, message copied with the r.html link), list shows
// opened / rating / wants 1:1 / question. Public page r.html: loads by token, Loom embedded, rating / question / 1:1
// call checkin_answer, Yes shows the booking calendar, bad token shows the "link doesn't work" message.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const now = Date.now(), iso = m => new Date(now - m * 60000).toISOString();
const FX = {
  checkin_replies: [
    { id: 'tok1', client_name: 'Alex Katsianos', member_id: 'alex-katsianos', loom_url: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef', note: null, created_at: iso(300), views: 2, last_viewed_at: iso(30), rating: 5, rated_at: iso(29), question: 'Can I swap rice for potatoes?', question_at: iso(28), wants_support: true, support_at: iso(27) },
    { id: 'tok2', client_name: 'Dom Socaciu', member_id: null, loom_url: 'https://www.loom.com/share/fedcba9876543210fedcba9876543210', created_at: iso(2000), views: 0 }
  ],
  challenge_members: [{ id: 'alex-katsianos', data: { name: 'Alex Katsianos', active: true } }, { id: 'jack-keys', data: { name: 'Jack Keys', active: true } }, { id: 'old', data: { name: 'Old Guy', active: false } }],
  meta: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_posts: [], ig_stories: []
};
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
const benign = t => /favicon|Failed to load resource/.test(t);

async function hq(browser, url, { width, dark, role }) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light', timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'text/css', body: '' }));
  const page = await context.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript({ content: mockSrc + `(function(){ try{ localStorage.setItem('hqTheme','${dark ? 'dark' : 'light'}'); }catch(e){} var c=makeMockClient(${JSON.stringify(FX)}); window.__mock=c; window.__HQ_TEST={ client:c, user:{id:'u1', email:'t@e.com'}, profile:{role:'${role}', display_name:'X'} }; })();` });
  await page.goto(url + '/index.html#checkins', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__checkins, null, { timeout: 10000 });
  await page.waitForTimeout(600);
  return { context, page, errors };
}

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  try {
    // ---- HQ tab
    for (const width of [1280, 390]) for (const dark of [false, true]) for (const role of ['admin', 'limited']) {
      const label = `HQ ${width}px ${dark ? 'dark' : 'light'} ${role}`;
      const { context, page, errors } = await hq(browser, url, { width, dark, role });
      const st = await page.evaluate(() => ({ tabHidden: document.getElementById('tabCheckins').hidden, viewHidden: document.getElementById('viewCheckins').hidden, list: document.getElementById('ckList').innerText, opts: document.querySelectorAll('#ckRoster option').length, scroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
      if (role === 'limited') {
        check(`${label}: tab hidden`, () => assert.ok(st.tabHidden));
        check(`${label}: view not shown`, () => assert.ok(st.viewHidden));
      } else {
        check(`${label}: tab visible`, () => assert.ok(!st.tabHidden || width < 500));
        check(`${label}: view open`, () => assert.ok(!st.viewHidden));
        check(`${label}: summary`, () => assert.ok(/2 sent · 1 opened · avg rating 5\.0\/5 from 1 · 1 wanted a 1:1/.test(st.list), st.list));
        check(`${label}: row chips`, () => assert.ok(/Opened 2×/.test(st.list) && /5\/5 helpful/.test(st.list) && /Wants a 1:1/.test(st.list) && /Not opened yet/.test(st.list), st.list));
        check(`${label}: question shown`, () => assert.ok(/Can I swap rice for potatoes\?/.test(st.list)));
        check(`${label}: roster = active only`, () => assert.strictEqual(st.opts, 2));
        check(`${label}: no horizontal scroll`, () => assert.ok(!st.scroll));
        const dis0 = await page.$eval('#ckAdd', b => b.disabled);
        await page.fill('#ckClient', 'Jack Keys'); await page.fill('#ckLoom', 'not a loom link');
        const dis1 = await page.$eval('#ckAdd', b => b.disabled);
        await page.fill('#ckLoom', 'https://www.loom.com/share/aaaabbbbccccddddeeeeffff00001111?sid=x'); await page.fill('#ckNote', 'Targets: 180g protein');
        const dis2 = await page.$eval('#ckAdd', b => b.disabled);
        check(`${label}: button needs client + loom`, () => assert.deepStrictEqual([dis0, dis1, dis2], [true, true, false]));
        await page.click('#ckAdd'); await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({ rows: window.__mock.__tables.checkin_replies, msg: document.getElementById('ckMsg').innerText, list: document.getElementById('ckList').innerText }));
        const nr = after.rows[after.rows.length - 1];
        check(`${label}: row saved`, () => { assert.strictEqual(after.rows.length, 3); assert.strictEqual(nr.client_name, 'Jack Keys'); assert.strictEqual(nr.member_id, 'jack-keys'); assert.strictEqual(nr.note, 'Targets: 180g protein'); assert.ok(/^[a-z0-9]{12}$/.test(nr.id), nr.id); });
        check(`${label}: message`, () => assert.ok(/Copied\. Paste it to Jack in 1FIT\./.test(after.msg), after.msg));
        check(`${label}: new row on top`, () => assert.ok(/^3 sent/.test(after.list) && after.list.indexOf('Jack Keys') < after.list.indexOf('Alex'), after.list));
        if (width === 1280) { const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null); if (clip !== null) check(`${label}: clipboard`, () => assert.ok(/^Hey Jack, here's your check-in reply 👇\nhttps:\/\/jordantornatore-rgb\.github\.io\/tasteform-hq\/r\.html\?k=[a-z0-9]{12}$/.test(clip), clip)); }
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hq-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: false });
      }
      check(`${label}: no console errors`, () => assert.deepStrictEqual(errors, []));
      await context.close();
    }
    // ---- public page
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
      const calls = [];
      await context.route(/supabase\.co\/rest\/v1\/rpc\/(\w+)/, async route => {
        const fn = route.request().url().match(/rpc\/(\w+)/)[1], body = JSON.parse(route.request().postData() || '{}'); calls.push({ fn, body });
        if (fn === 'checkin_open') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.k === 'good' ? { name: 'Alex', loom: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef', note: 'This week: 10k steps', rating: null, question: null, wants_support: null } : null) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      });
      await context.route(/^https?:\/\/(?!127\.0\.0\.1)(?!.*supabase\.co)/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errors.push(m.text()); });
      const L = `page ${width}px`;
      await page.goto(url + '/r.html?k=good'); await page.waitForSelector('#main:not([hidden])');
      const s1 = await page.evaluate(() => ({ h: document.getElementById('hello').innerText, src: document.getElementById('vid').src, note: document.getElementById('note').innerText, calHidden: document.getElementById('calWrap').hidden, scroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
      check(`${L}: greeting`, () => assert.ok(/alex/i.test(s1.h), s1.h));
      check(`${L}: loom embed`, () => assert.ok(/^https:\/\/www\.loom\.com\/embed\/0123456789abcdef0123456789abcdef/.test(s1.src), s1.src));
      check(`${L}: note`, () => assert.strictEqual(s1.note, 'This week: 10k steps'));
      check(`${L}: calendar hidden until asked`, () => assert.ok(s1.calHidden));
      check(`${L}: no horizontal scroll`, () => assert.ok(!s1.scroll));
      await page.click('[data-r="4"]'); await page.waitForTimeout(150);
      await page.fill('#q', 'How much water?'); await page.click('#qSend'); await page.waitForTimeout(150);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `page-${width}.png`), fullPage: true });
      await page.click('#sYes'); await page.waitForTimeout(200);
      const s2 = await page.evaluate(() => ({ calHidden: document.getElementById('calWrap').hidden, cal: document.getElementById('cal').src, asked: document.getElementById('asked').innerText, pressed: document.querySelector('[data-r="4"]').getAttribute('aria-pressed') }));
      const ans = calls.filter(c => c.fn === 'checkin_answer').map(c => c.body);
      check(`${L}: answers sent`, () => assert.deepStrictEqual(ans, [{ p_rating: 4, k: 'good' }, { p_question: 'How much water?', k: 'good' }, { p_wants_support: true, k: 'good' }]));
      check(`${L}: rating shown`, () => assert.strictEqual(s2.pressed, 'true'));
      check(`${L}: question echoed`, () => assert.strictEqual(s2.asked, 'You asked: How much water?'));
      check(`${L}: calendar after Yes`, () => { assert.ok(!s2.calHidden); assert.strictEqual(s2.cal, 'https://api.leadconnectorhq.com/widget/booking/2ie8EAWu8y2iJNpwzrxj'); });
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `page-${width}-yes.png`), fullPage: false });
      await page.goto(url + '/r.html?k=bad'); await page.waitForSelector('#missing:not([hidden])', { timeout: 3000 }).catch(() => {});
      const miss = await page.evaluate(() => !document.getElementById('missing').hidden);
      check(`${L}: bad token handled`, () => assert.ok(miss));
      check(`${L}: no console errors`, () => assert.deepStrictEqual(errors, []));
      await context.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
