// Playwright checks for the Sound picker's "Preview with my video" on voice-only versions (no music in the file).
//   node tests/sound-preview.test.js        (PLAYWRIGHT_PATH / HQ_CHROME as for the other tests)
// Mock data only: a row with music-baked v1 + voice-only v2/v3, a row with only baked versions, a row whose picked
// winner is baked, and one of Jordan's own finished edits (video.originalPreviewUrl, the old path).
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '..');
const NOW = '2026-11-13T02:00:00Z';
const BASE = { cta_links: [], app_sessions: [], dm_threads: [], dm_daily: [], contacts: [], tf_responses: [], tf_daily: [], ig_stories: [], ig_posts: [], ig_account_daily: [], posts: [], script_reviews: [], meta: [] };
const baked = (v, bet) => ({ v, diff: 'old pipeline ' + v, file: `video-projects/x/${v}-mix.mp4`, mediaUrl: `https://media.example/${v}-mix.mp4`, coverUrl: null, ...(bet ? { bet: true } : {}) });
const voice = (v, extra) => ({ v, diff: 'NEW SYSTEM ' + v, file: `exports/_stack-test/x/${v}.mp4`, mediaUrl: `https://media.example/${v}-voice.mp4`, voiceOnly: true, originalPreviewUrl: `https://media.example/${v}-voice.mp4`, voiceOnlyFile: `exports/_stack-test/x/${v}.mp4`, ...(extra || {}) });
const row = (id, video, extra) => ({ id, data: Object.assign({ status: 'awaiting_approval', date: '2026-11-16', weekStart: '2026-11-16', slot: 'high', title: 'Row ' + id, format: 'F7', sound: { bankId: 's1', title: 'Song One', musicVolume: 10, startS: 0 }, video: Object.assign({ previewUrl: video.variants && video.variants[0] ? video.variants[0].mediaUrl : null }, video) }, extra || {}) });
const FX = Object.assign({}, BASE, {
  content_sounds: [{ id: 's1', data: { title: 'Song One', artist: 'Band', previewPath: 'sounds/s1.m4a', durationS: 120 } }],
  content_queue: [
    row('vo', { variants: [baked('v1', true), voice('v2'), voice('v3')] }),
    row('baked', { variants: [baked('v1', true), baked('v2')] }),
    row('picked', { variants: [baked('v1', true), voice('v2')] }, { winnerPlan: { pick: 'v1' } }),
    row('mixed', { variants: [baked('v1', true), voice('v2', { mediaUrl: 'https://media.example/v2-music.mp4', mixedSound: { key: 's1|10|0', bankId: 's1', title: 'Song One' } })] }),
    row('edit', { jordanFinal: true, originalPreviewUrl: 'https://media.example/edit.mp4', variants: [{ v: 'v1', bet: true, mediaUrl: 'https://media.example/edit.mp4', originalPreviewUrl: 'https://media.example/edit.mp4' }] }),
  ],
});
function serve() { return new Promise(res => { const srv = http.createServer((req, r) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : (f.endsWith('.html') ? 'text/html' : 'application/octet-stream') }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1', () => res({ srv, url: 'http://127.0.0.1:' + srv.address().port })); }); }
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }

(async () => {
  const { srv, url } = await serve();
  const browser = await pw.chromium.launch(process.env.HQ_CHROME ? { executablePath: process.env.HQ_CHROME } : {});
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC', locale: 'en-AU', hasTouch: width < 500, isMobile: width < 500 });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: /\.js(\?|$)/.test(route.request().url()) ? 'application/javascript' : 'application/octet-stream', body: '' }));
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript({ content: mockSrc + `
      (function(){ var fixedNow=${Date.parse(NOW)}, RealDate=Date; function MockDate(){ if(arguments.length) return new (Function.prototype.bind.apply(RealDate,[null].concat([].slice.call(arguments))))(); return new RealDate(fixedNow); }
        MockDate.now=function(){ return fixedNow; }; MockDate.parse=RealDate.parse; MockDate.UTC=RealDate.UTC; MockDate.prototype=RealDate.prototype; window.Date=MockDate;
        var c=makeMockClient(${JSON.stringify(FX)}, { rpc:{} }); c.storage={ from:function(){ return { createSignedUrl:function(p){ return Promise.resolve({ data:{ signedUrl:'https://storage.example/'+p }, error:null }); } }; } };
        window.__mock=c; window.__HQ_TEST={ client:c, user:{id:'u1', email:'x@example.com'}, profile:{role:'admin', display_name:'T'} }; })();` });
    await page.goto(url + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__hq && window.__hq.state && window.__hq.state.loaded && window.__hq.state.loaded.contentQueue && window.__hq.state.loaded.contentSounds, null, { timeout: 15000 });
    await page.evaluate(() => window.__hq.setView('content'));
    await page.waitForTimeout(200);
    const L = `${width}:`;
    // open a row's Sound editor through the page's own click handlers
    async function soundEditor(id) {
      await page.evaluate((id) => { const b = document.createElement('button'); b.setAttribute('data-ce-open', id); b.id = '__open'; document.getElementById('viewContent').appendChild(b); }, id);
      await page.evaluate(() => { const b = document.getElementById('__open'); b.click(); b.remove(); });
      await page.waitForSelector('#ceSheet [data-ce-edit="sound"]', { timeout: 5000 });
      await page.click('#ceSheet [data-ce-edit="sound"]');
      await page.waitForSelector('#ceSheet [data-ce-editor="sound"]', { timeout: 5000 });
      return page.evaluate(() => { const ed = document.querySelector('#ceSheet [data-ce-editor="sound"]'); const n = ed.querySelector('[data-ce-sndsrc]'); return { mix: !!ed.querySelector('[data-ce-snd="mix"]'), note: n ? n.textContent : '', text: ed.textContent }; });
    }
    async function close() { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(100); }

    const vo = await soundEditor('vo');
    check(L + 'voice-only row offers the live preview', () => assert.ok(vo.mix));
    check(L + 'no pick: newest voice-only version, named in the note', () => { assert.ok(/no music yet/i.test(vo.note), vo.note); assert.ok(/plays v3 \(the newest version with no music\)/.test(vo.note), vo.note); assert.ok(/v2, v3/.test(vo.note)); assert.ok(/older versions keep their own music/.test(vo.note)); });
    await page.click('#ceSheet [data-ce-snd="mix"]');
    await page.waitForSelector('#ceSheet [data-ce-sndvideo]', { timeout: 5000 });
    const played = await page.evaluate(() => { const v = document.querySelector('#ceSheet [data-ce-sndvideo]'); return { src: v.getAttribute('src'), v: v.getAttribute('data-ce-sndv'), audio: !!document.querySelector('audio[data-ce-sndaudio]') }; });
    check(L + 'preview plays the voice-only file of v3 with the song', () => { assert.strictEqual(played.src, 'https://media.example/v3-voice.mp4'); assert.strictEqual(played.v, 'v3'); assert.ok(played.audio); });
    // volume slider still drives the song
    await page.evaluate(() => { const r = document.querySelector('#ceSheet [data-ce-f="volume"]'); r.value = '20'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    const vol = await page.evaluate(() => { const a = document.querySelector('audio[data-ce-sndaudio]'); return a ? a.volume : null; });
    check(L + 'volume slider sets the song volume live', () => assert.ok(Math.abs(vol - 0.2) < 0.001, String(vol)));
    await page.click('#ceSheet [data-ce-snd="stop"]');
    await close();

    // he watched v2 in Phone preview: the Sound preview follows it
    await page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-ce-play', 'vo'); b.id = '__play'; document.getElementById('viewContent').appendChild(b); });
    await page.evaluate(() => { const b = document.getElementById('__play'); b.click(); b.remove(); });
    await page.waitForSelector('#ceSheet [data-ce-pv="v2"]', { timeout: 5000 });
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#ceSheet [data-ce-pv]')].map(b => b.getAttribute('data-ce-pv') + ':' + /no music yet/.test(b.textContent)));
    check(L + 'phone preview tabs mark the versions with no music yet', () => assert.deepStrictEqual(tabs, ['v1:false', 'v2:true', 'v3:true']));
    await page.click('#ceSheet [data-ce-pv="v2"]');
    await close();
    const watched = await soundEditor('vo');
    check(L + 'the version he last watched is the one previewed', () => { assert.ok(watched.mix); assert.ok(/plays v2 \(the version you last watched\)/.test(watched.note), watched.note); });
    await close();

    const bk = await soundEditor('baked');
    check(L + 'music-baked versions never get the live preview', () => { assert.ok(!bk.mix); assert.strictEqual(bk.note, ''); });
    await close();
    const pk = await soundEditor('picked');
    check(L + 'a picked version with music in it: no live preview, says why', () => { assert.ok(!pk.mix); assert.ok(/v1 \(the version you picked to post\) already has music/.test(pk.note), pk.note); });
    await close();
    const mx = await soundEditor('mixed');
    check(L + 'already mixed: says which song is in it, still previews from the voice-only file', () => { assert.ok(mx.mix); assert.ok(/v2 has Song One from your last save/.test(mx.note), mx.note); });
    await page.click('#ceSheet [data-ce-snd="mix"]'); await page.waitForSelector('#ceSheet [data-ce-sndvideo]', { timeout: 5000 });
    const mxSrc = await page.evaluate(() => document.querySelector('#ceSheet [data-ce-sndvideo]').getAttribute('src'));
    check(L + 'mixed version previews the voice-only source, not the mix', () => assert.strictEqual(mxSrc, 'https://media.example/v2-voice.mp4'));
    await page.click('#ceSheet [data-ce-snd="stop"]'); await close();
    const ed = await soundEditor('edit');
    check(L + "Jordan's own finished edit keeps its preview", () => assert.ok(ed.mix));
    await close();
    check(L + 'no page errors', () => assert.deepStrictEqual(errors, []));
    await context.close();
  }
  await browser.close(); srv.close();
  console.log(`sound-preview: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
