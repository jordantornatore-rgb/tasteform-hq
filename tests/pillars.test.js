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
    ig_stories: [{ id: 's1', data: { postedAtDate: addDays(TODAY, -2) + 'T10:00:00+11:00', views: 140, linkClicks: 6 } }],
    app_sessions: [
      ['story', 'nine_to_five', true, '31\u201335'], ['story', 'nine_to_five', false, null], ['bio', 'link_in_bio', true, '18\u201324'],
      ['referral', 'nik', true, '25\u201330'], ['bio', 'link_in_bio', false, null], [null, 'claude_test', true, '25\u201330']
    ].map((x, i) => ({ id: 'as' + i, data: { firstSeenAt: addDays(TODAY, -i) + 'T01:00:00Z', submitted: x[2] || undefined, submittedAt: x[2] ? addDays(TODAY, -i) + 'T01:05:00Z' : undefined, steps: x[2] ? { open: 1, start: 1, submitted: 1 } : { open: 1 }, answers: x[3] ? { age: x[3] } : {}, utm: x[0] ? { utm_medium: x[0], utm_content: x[1] } : { utm_content: x[1] } } })),
    content_queue: [{ id: 'q1', data: { status: 'awaiting_approval' } }, { id: 'q2', data: { status: 'to_film' } }],
    hq_leads: [
      { id: 'L1', data: { name: 'Sam Waiting', email: 's@x.co', phone: '+61400000001', funnel: 'story', applications: [{ at: addDays(TODAY, -5) + 'T01:00:00Z', funnel: 'story' }], calls: [{ start: addDays(TODAY, -3) + 'T01:00:00Z', booked: addDays(TODAY, -5) + 'T02:00:00Z', status: 'showed' }], opps: [], conv: { lastAt: addDays(TODAY, -2) + 'T01:00:00Z', lastDir: 'inbound' }, status: 'open', nurture: true, convOk: true } },
      { id: 'L2', data: { name: 'Pat Applied', email: 'p@x.co', phone: '+64210000002', funnel: 'bio', applications: [{ at: addDays(TODAY, -4) + 'T01:00:00Z', funnel: 'bio' }], calls: [], opps: [], conv: { lastAt: addDays(TODAY, -4) + 'T02:00:00Z', lastDir: 'outbound' }, status: 'open', nurture: false, convOk: true } },
      { id: 'L3', data: { name: 'Far Away', phone: '+919800000003', funnel: 'unknown', applications: [], calls: [], opps: [{ pipeline: 'Instagram Leads', stage: 'Outreach', created: addDays(TODAY, -6) + 'T01:00:00Z' }], conv: null, status: 'open', nurture: false, convOk: true } },
      { id: 'L4', data: { name: 'Cleo Client', email: 'c@x.co', funnel: 'story', applications: [{ at: addDays(TODAY, -20) + 'T01:00:00Z', funnel: 'story' }], calls: [], opps: [{ pipeline: 'Sales', stage: 'Closed', status: 'won' }], conv: { lastAt: addDays(TODAY, -9) + 'T01:00:00Z', lastDir: 'inbound' }, status: 'client', nurture: false, convOk: true } }
    ],
    meta: [{ id: 'ghlSync', data: { connected: true, upcoming7: 1, days: { [addDays(TODAY, -3)]: { booked: 2, held: 1, showed: 1, noShow: 0, unmarked: 0, closed: 1, closeDaysN: 1, closeDaysSum: 12, outreach: 5, replied: 2, paidLeads: 1, byFunnel: { story: { booked: 1, held: 1, showed: 1, noShow: 0, closed: 1 }, unknown: { booked: 1, held: 0, showed: 0, noShow: 0, closed: 0 } } } } } }, { id: 'stripeSync', data: { connected: false } }, { id: 'ghlLeads', data: { connected: true, ok: true, lastSyncAt: NOW, complete: true, conversations: true } }, { id: 'routineCalls', data: { dates: { [TODAY]: { count: 1 }, [addDays(TODAY, 1)]: { count: 4 } } } }]
  };
}
const DELIVERY = { active: 13, joined: 14, left: 3, avgWeeks: 1.1, withJoinDate: 14, checkinsOnTime: 3 };
const BASE = { cta_links: [], app_sessions: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_stories: [], posts: [], script_reviews: [], content_queue: [], meta: [] };
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
      var c=makeMockClient(${JSON.stringify(fx)}, { rpc:{ hq_delivery_counts:${JSON.stringify(DELIVERY)}, hq_delivery_by_day:{} } }); window.__mock=c;
      window.__HQ_TEST={ client:c, user:{id:'u1', email:'x@example.com'}, profile:{role:'${role}', display_name:'T'} };
    })();` });
  await page.goto(url + '/index.html' + (hash || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hq && window.__hq.state && window.__hq.state.loaded.igPosts && window.__hq.state.loaded.tfResponses, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return { context, page, log };
}
const VIEWS = [['home', 'viewHome'], ['traffic', 'viewTraffic'], ['leadflow', 'viewLeadflow'], ['people', 'viewPeople'], ['sales', 'viewSales'], ['delivery', 'viewDelivery'], ['scorecard', 'viewScorecard'], ['links', 'viewLinks']];
const FUNNEL_KEYS = ['story', 'bio', 'offplatform', 'paid_direct', 'paid_indirect', 'all'];
(async () => {
  // scorecard maths, no browser
  const HQ = require(path.join(ROOT, 'hq-core.js'));
  const ghl = { connected: true, days: { '2026-11-17': { booked: 3, held: 2, showed: 1, noShow: 1, closed: 1, paidLeads: 2, byFunnel: {} }, '2026-11-24': { booked: 1, held: 0, showed: 0, noShow: 0, closed: 0, paidLeads: 0 } } };
  const scState = { meta: { ghlSync: ghl, scorecard: { weeks: { '2026-11-16': { hours: 48, longform: 0 } } } }, tfResponses: [{ id: 't1', submittedAt: '2026-11-18T01:00:00Z', source: 'link_in_bio' }], appSessions: [{ id: 'a1', submitted: true, submittedAt: '2026-11-19T01:00:00Z', firstSeenAt: '2026-11-19T00:59:00Z', utm: { utm_medium: 'referral', utm_content: 'nik' }, answers: { age: '31\u201335' } }], igAccount: [{ date: '2026-11-15', followers: 1000 }, { date: '2026-11-22', followers: 1080 }], deliveryByDay: { '2026-11-20': { joined: 1, left: 1 } } };
  const sc = HQ.scorecard(scState, Date.parse('2026-11-25T03:00:00Z'));
  const w1 = sc.weeks[0].cells;
  check('scorecard: week 1 done, week 2 current', () => { assert.strictEqual(sc.weeks[0].state, 'done'); assert.strictEqual(sc.weeks[1].state, 'current'); assert.strictEqual(sc.current.n, 2); });
  check('scorecard: leads = applications + instant forms', () => assert.strictEqual(w1.leads.value, 4));
  check('scorecard: booked / show rate / sales', () => { assert.strictEqual(w1.booked.value, 3); assert.strictEqual(w1.showRate.value, 50); assert.strictEqual(w1.showRate.status, 'bad'); assert.strictEqual(w1.sales.value, 1); assert.strictEqual(w1.sales.status, 'good'); });
  check('scorecard: clients lost from delivery by day', () => { assert.strictEqual(w1.lost.value, 1); assert.strictEqual(w1.lost.status, 'bad'); });
  check('scorecard: referrals, typed-in hours, followers, fit', () => { assert.strictEqual(w1.referrals.value, 1); assert.strictEqual(w1.hours.value, 48); assert.strictEqual(w1.hours.status, 'good'); assert.strictEqual(w1.followers.value, 80); assert.strictEqual(w1.fit.value, 100); });
  check('scorecard: ad cost blank without Meta Ads', () => assert.strictEqual(w1.adCost.value, null));
  check('scorecard: current week not red for at-least targets', () => assert.strictEqual(sc.weeks[1].cells.sales.status, null));
  // CAC maths, no browser
  const cacGhl = { connected: true, days: { '2026-11-05': { booked: 4, showed: 3, noShow: 1, closed: 2, paidLeads: 2, byFunnel: { paid_direct: { booked: 3, held: 2, showed: 2, noShow: 1, closed: 1 }, story: { booked: 1, held: 1, showed: 1, noShow: 0, closed: 1 } } } } };
  const cacState = { meta: { ghlSync: cacGhl, costs: { months: { '2026-11': { byFunnel: { story: 20 }, shared: 100 } } } }, adsCampaigns: [{ name: 'TF FastTrack angle 1', daily: { '2026-11-03': { spend: 300 }, '2026-10-30': { spend: 999 } } }, { name: 'Boost', daily: { '2026-11-04': { spend: 50 } } }], appSessions: [] };
  const cac = HQ.computeCac(cacState, Date.parse('2026-11-20T03:00:00Z'), '2026-11');
  check('cac: ad spend split by campaign name, this month only', () => { assert.strictEqual(cac.funnels.paid_direct.adSpend, 300); assert.strictEqual(cac.funnels.paid_indirect.adSpend, 0); assert.strictEqual(cac.unassignedAds, 50); });
  check('cac: per funnel = cost / clients', () => { assert.strictEqual(cac.funnels.paid_direct.cac, 300); assert.strictEqual(cac.funnels.story.cac, 20); assert.strictEqual(cac.funnels.bio.cac, null); });
  check('cac: all funnels includes shared + unassigned ads', () => { assert.strictEqual(cac.total.cost, 470); assert.strictEqual(cac.total.clients, 2); assert.strictEqual(cac.total.cac, 235); });
  check('cac: work back from $250 on plan rates', () => { const b = cac.funnels.paid_direct.back; assert.strictEqual(b.showed, 125); assert.strictEqual(b.booked, 88); assert.strictEqual(b.lead, 50); assert.strictEqual(b.rates.close.own, false); });
  check('cac: per lead counts instant forms', () => assert.strictEqual(cac.funnels.paid_direct.perLead, 150));
  check('cac: blank without costs or ads', () => { const c = HQ.computeCac({ meta: { ghlSync: cacGhl }, appSessions: [] }, Date.parse('2026-11-20T03:00:00Z'), '2026-11'); assert.strictEqual(c.total.cac, null); assert.strictEqual(c.funnels.story.cac, null); assert.strictEqual(c.funnels.paid_direct.cac, null); });
  check('adFunnelOf', () => { assert.strictEqual(HQ.adFunnelOf('Fast Track - A2'), 'paid_direct'); assert.strictEqual(HQ.adFunnelOf('fasttrack'), 'paid_direct'); assert.strictEqual(HQ.adFunnelOf('Compounding VSL'), 'paid_indirect'); assert.strictEqual(HQ.adFunnelOf('Retarget'), null); });
  // Lead list rules, no browser
  const LN = Date.parse('2026-11-11T02:00:00Z'), lrow = (d) => ({ id: 'x', data: Object.assign({ applications: [], calls: [], opps: [], conv: null, status: 'open', convOk: true }, d) });
  check('lead: messaged you, no reply', () => assert.strictEqual(HQ.leadView(lrow({ conv: { lastAt: '2026-11-10T01:00:00Z', lastDir: 'inbound' } }), LN).reason, 'waiting'));
  check('lead: inbound under 12h not flagged', () => assert.strictEqual(HQ.leadView(lrow({ conv: { lastAt: '2026-11-11T00:00:00Z', lastDir: 'inbound' } }), LN).reason, null));
  check('lead: applied, no call', () => assert.strictEqual(HQ.leadView(lrow({ applications: [{ at: '2026-11-08T01:00:00Z' }], conv: { lastAt: '2026-11-08T02:00:00Z', lastDir: 'outbound' } }), LN).reason, 'applied'));
  check('lead: applied and booked = fine', () => assert.strictEqual(HQ.leadView(lrow({ applications: [{ at: '2026-11-08T01:00:00Z' }], calls: [{ start: '2026-11-14T01:00:00Z', booked: '2026-11-08T03:00:00Z', status: 'confirmed' }], conv: { lastAt: '2026-11-08T02:00:00Z', lastDir: 'outbound' } }), LN).reason, null));
  check('lead: no-show not rebooked', () => assert.strictEqual(HQ.leadView(lrow({ calls: [{ start: '2026-11-09T01:00:00Z', booked: '2026-11-05T01:00:00Z', status: 'noshow' }], conv: { lastAt: '2026-11-09T02:00:00Z', lastDir: 'outbound' } }), LN).reason, 'noshow'));
  check('lead: no message yet', () => assert.strictEqual(HQ.leadView(lrow({ opps: [{ pipeline: 'Instagram Leads', created: '2026-11-08T01:00:00Z' }] }), LN).reason, 'untouched'));
  check('lead: you messaged 3+ days ago', () => assert.strictEqual(HQ.leadView(lrow({ opps: [{ pipeline: 'Instagram Leads', created: '2026-11-01T01:00:00Z' }], conv: { lastAt: '2026-11-06T01:00:00Z', lastDir: 'outbound' } }), LN).reason, 'quiet'));
  check('lead: clients and 90-day-old leads not flagged', () => { assert.strictEqual(HQ.leadView(lrow({ status: 'client', conv: { lastAt: '2026-11-01T01:00:00Z', lastDir: 'inbound' } }), LN).reason, null); assert.strictEqual(HQ.leadView(lrow({ conv: { lastAt: '2026-07-01T01:00:00Z', lastDir: 'inbound' } }), LN).reason, null); });
  check('lead: not a lead = cookbook only', () => assert.strictEqual(HQ.leadView(lrow({ opps: [{ pipeline: 'Cookbook', created: '2026-11-08T01:00:00Z' }] }), LN).isLead, false));
  check('lead: country', () => { assert.deepStrictEqual(['+61 412 345 678', '0412345678', '+64 21 1', '+44 7700', '+1 212 555', '+91 98', ''].map(HQ.leadCountry), ['AU', 'AU', 'NZ', 'UK', 'US/CA', 'other', null]); });
  const LB = HQ.leadBoard([lrow({ name: 'A', phone: '+919800', email: 'a@x', opps: [{ pipeline: 'Sales', created: '2026-11-08T01:00:00Z' }] }), lrow({ name: 'B', phone: '+15550000', opps: [{ pipeline: 'Sales', created: '2026-11-08T01:00:00Z' }] }), lrow({ name: 'C', email: 'c@x', nurture: true, opps: [{ pipeline: 'Sales', created: '2026-11-08T01:00:00Z' }] })], LN);
  check('leadBoard: outside market keeps +1, nurture list skips foreign + already in', () => { assert.deepStrictEqual(LB.outside.map(v => v.name), ['A']); assert.deepStrictEqual(LB.noNurture.map(v => v.name), ['B']); });
  check('dmFunnelOf is separate from the utm funnelOf (both exist, DM chats still sort into outbound)', () => { assert.strictEqual(typeof HQ.dmFunnelOf, 'function'); assert.notStrictEqual(HQ.dmFunnelOf, HQ.funnelOf); assert.ok(['outbound','magnet','unread'].includes(HQ.dmFunnelOf({}))); });
  check('funnelOf: tags', () => { assert.strictEqual(HQ.funnelOf({ utm_medium: 'paid', utm_campaign: 'compounding' }), 'paid_indirect'); assert.strictEqual(HQ.funnelOf({ utm_medium: 'paid', utm_campaign: 'fasttrack' }), 'paid_direct'); assert.strictEqual(HQ.funnelOf({ utm_medium: 'qr' }), 'offplatform'); assert.strictEqual(HQ.funnelOf(null, 'link_in_bio'), 'bio'); assert.strictEqual(HQ.funnelOf({ utm_content: 'claude_test' }), 'test'); });
  check('typeformFunnel: untagged Typeform from 12 Nov is the barbershop (off-platform)', () => { assert.strictEqual(HQ.typeformFunnel(null, null, '2026-11-13T02:00:00Z'), 'offplatform'); assert.strictEqual(HQ.typeformFunnel(null, null, '2026-11-01T02:00:00Z'), 'unknown'); assert.strictEqual(HQ.typeformFunnel(null, 'link_in_bio', '2026-11-13T02:00:00Z'), 'bio'); assert.strictEqual(HQ.typeformFunnel({ utm_content: 'claude_test' }, null, '2026-11-13T02:00:00Z'), 'test'); });
  check('allApplications: one per person', () => assert.strictEqual(HQ.allApplications({ tfResponses: [{ id: 'x', submittedAt: '2026-11-01T00:00:00Z', email: 'A@b.co' }], appSessions: [{ id: 'y', submitted: true, submittedAt: '2026-11-02T00:00:00Z', contact: { email: 'a@b.co' } }] }).length, 1));
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
    check(`${label}: cards`, () => assert.deepStrictEqual(cards, role === 'admin' ? ['1 · Seen', '2 · Leads', '3 · Cost per client', '4 · Staying'] : ['1 · Seen', '2 · Leads', '4 · Staying']));
    const todo = await page.evaluate(() => document.querySelectorAll('#plHome .pl-list .pl-row').length);
    check(`${label}: at most 3 to-dos`, () => assert.ok(todo >= 1 && todo <= 3, String(todo)));
    for (const per of ['7', '30', 'month']) {
      await page.evaluate(() => window.__hq.setView('home'));
      await page.click(`#viewHome [data-pl-period="${per}"]`); await page.waitForTimeout(120);
      for (const [v, id] of VIEWS) {
        await page.evaluate(v => window.__hq.setView(v), v); await page.waitForTimeout(80);
        const shown = await page.evaluate(id => ({ hidden: document.getElementById(id).hidden, txt: document.getElementById(id).innerText }), id);
        if ((v === 'sales' || v === 'people') && role !== 'admin') { check(`${label} ${per}: ${v} refused`, () => assert.ok(shown.hidden)); continue; }
        check(`${label} ${per} ${v}: shown`, () => assert.ok(!shown.hidden));
        // Lead list parked 13 Nov 2026 (leads live in GHL); re-enable with LEADLIST_ON in index.html
        if (false && v === 'people') check(`${label} ${per} people: follow-up list`, () => assert.ok(/Sam Waiting/.test(shown.txt) && /Pat Applied/.test(shown.txt) && !/Cleo Client/.test(shown.txt), shown.txt.slice(0, 600)));
        if (v === 'sales') check(`${label} ${per} sales: CAC by funnel + work-back`, () => assert.ok(/Cost per client \(CAC\)/i.test(shown.txt) && /Most you can pay per step/i.test(shown.txt) && /\$50/.test(shown.txt), shown.txt.slice(-600)));
        check(`${label} ${per} ${v}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(shown.txt), (shown.txt.match(/.{0,40}(NaN|undefined|null|Infinity|\[object).{0,40}/) || [''])[0]));
        check(`${label} ${per} ${v}: no DM numbers while the scan is off`, () => assert.ok(!/DMs waiting|From DMs|New conversations/.test(shown.txt)));
        if (width < 500) {
          const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          check(`${label} ${per} ${v}: no horizontal scroll`, () => assert.ok(ov <= 1, 'overflow ' + ov));
          const small = await page.evaluate(id => [...document.querySelectorAll('#' + id + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 32).map(b => b.textContent.trim().slice(0, 20)), id);
          check(`${label} ${per} ${v}: tap targets`, () => assert.deepStrictEqual(small, []));
        }
        if (SHOTS && per === '30') await page.screenshot({ path: path.join(SHOTS, `${name}-${width}${dark ? '-dark' : ''}-${role}-${v}.png`), fullPage: true });
        if (v === 'leadflow') for (const fk of FUNNEL_KEYS) {
          await page.click(`#viewLeadflow [data-pl-funnel="${fk}"]`); await page.waitForTimeout(80);
          const ft = await page.evaluate(() => document.getElementById('plLeads').innerText);
          check(`${label} ${per} funnel ${fk}: no NaN/undefined/null`, () => assert.ok(!/\bNaN\b|undefined|\bnull\b|Infinity|\[object/.test(ft), (ft.match(/.{0,40}(NaN|undefined|null|Infinity|\[object).{0,40}/) || [''])[0]));
          if (width < 500) { const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(`${label} ${per} funnel ${fk}: no horizontal scroll`, () => assert.ok(ov <= 1, 'overflow ' + ov)); }
          if (SHOTS && per === '30' && fk !== 'all') await page.screenshot({ path: path.join(SHOTS, `${name}-${width}${dark ? '-dark' : ''}-${role}-funnel-${fk}.png`), fullPage: true });
        }
      }
      // independent count: applications in the window
      const n = per === 'month' ? null : +per, from = n ? addDays(TODAY, -(n - 1)) : TODAY.slice(0, 8) + '01';
      const syd = iso => new Date(new Date(iso).getTime()).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      const inWin = iso => iso && syd(iso) >= from && syd(iso) <= TODAY;
      const exp = (fx.tf_responses || []).filter(r => inWin(r.data.submittedAt)).length + (fx.app_sessions || []).filter(r => r.data.submitted && !/test/.test((r.data.utm || {}).utm_content || '') && inWin(r.data.submittedAt)).length
        + (() => { const g = ((fx.meta || []).find(r => r.id === 'ghlSync') || {}).data; let t = 0; if (g && g.days) for (const [k, v] of Object.entries(g.days)) if (k >= from && k <= TODAY) t += v.paidLeads || 0; return t; })();
      await page.evaluate(() => window.__hq.setView('home')); await page.waitForTimeout(60);
      const got = await page.evaluate(() => document.querySelectorAll('#plHome .pl-card .v')[1].textContent.replace(/[^0-9]/g, ''));
      check(`${label} ${per}: leads card = applications + ad form leads`, () => assert.strictEqual(+got, exp));
    }
    // a card opens its page; the Delivery numbers come from the RPC
    await page.evaluate(() => window.__hq.setView('home')); await page.click('#plHome .pl-card[data-go="delivery"]'); await page.waitForTimeout(80);
    const dv = await page.evaluate(() => ({ hidden: document.getElementById('viewDelivery').hidden, txt: document.getElementById('plDelivery').innerText }));
    check(`${label}: Delivery card opens Delivery`, () => assert.ok(!dv.hidden));
    check(`${label}: active clients from hq_delivery_counts`, () => assert.ok(/Paying clients[\s\S]{0,80}?\b13\b/.test(dv.txt), dv.txt.slice(0, 80)));
    check(`${label}: zero console errors`, () => assert.deepStrictEqual(log.errors, []));
    check(`${label}: zero console warnings`, () => assert.deepStrictEqual(log.warnings, []));
    await context.close();
  }
  await browser.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
