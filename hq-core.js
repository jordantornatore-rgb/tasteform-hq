/* TasteForm HQ — shared core (pure functions, no DOM, no network).
   Loaded by index.html (window.HQ), by the tests (Node), and by the hq-brief edge function
   (Deno), so the dashboard, the tests and the morning Slack report always use the SAME
   definitions. Rules that matter for every number on the page:
     - Exact or blank. A value we can't measure is null → rendered as "–", never estimated.
     - All "days" are Sydney days (Australia/Sydney, DST-aware), whatever the viewer's clock says.
     - Two DM funnels that never mix: outbound (Jordan/setter opened) and lead magnet
       (opener === 'magnet_delivery'). Unread "pending-" placeholders sit outside both.
*/
(function (root) {
  'use strict';
  var HQ = {};
  HQ.VERSION = '2.0.0';
  HQ.TZ = 'Australia/Sydney';

  /* ---------- text + number formatting ---------- */
  HQ.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  HQ.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  HQ.isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  // "–" for anything that isn't a real number. Never prints NaN/undefined/null.
  HQ.num = function (v, dp) {
    if (!HQ.isNum(v)) return '–';
    try { return Number(v).toLocaleString('en-AU', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }); }
    catch (e) { return String(Math.round(v)); }
  };
  HQ.pct = function (n, d) { return (HQ.isNum(n) && HQ.isNum(d) && d > 0) ? Math.round((n / d) * 100) : null; };
  HQ.pctText = function (n, d) { var p = HQ.pct(n, d); return p == null ? '–' : p + '%'; };
  HQ.money = function (v, cur, dp) {
    if (!HQ.isNum(v)) return '–';
    var d = dp == null ? 0 : dp;
    try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur || 'AUD', minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
    catch (e) { return '$' + Number(v).toFixed(d); }
  };
  HQ.plural = function (n, one, many) { return n === 1 ? one : (many || one + 's'); };

  /* ---------- time ---------- */
  HQ.parseTs = function (iso) {
    if (iso == null || iso === '') return null;
    if (iso instanceof Date) return isNaN(iso.getTime()) ? null : iso.getTime();
    if (typeof iso === 'number') return isFinite(iso) ? iso : null;
    var t = new Date(String(iso)).getTime();
    return isNaN(t) ? null : t;
  };
  HQ.hoursSince = function (iso, now) {
    var t = HQ.parseTs(iso); if (t == null) return null;
    return ((now != null ? now : Date.now()) - t) / 3600000;
  };
  HQ.fmtHours = function (h) {
    if (!HQ.isNum(h)) return '–';
    var a = Math.abs(h);
    if (a < 1) return Math.max(1, Math.round(a * 60)) + 'm';
    if (a < 48) return (a < 10 ? a.toFixed(1).replace(/\.0$/, '') : Math.round(a)) + 'h';
    return Math.round(a / 24) + 'd';
  };
  // "3h ago", "2d ago", or "in 4h" for a future time; null when unparseable.
  HQ.relTime = function (iso, now) {
    var h = HQ.hoursSince(iso, now); if (h == null) return null;
    if (h < 0) return 'in ' + HQ.fmtHours(-h);
    var m = Math.floor(h * 60);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (h < 24) return Math.floor(h) + 'h ago';
    var d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return Math.floor(d / 30) + 'mo ago';
  };

  /* ---------- Sydney calendar ---------- */
  var partsFmt = null;
  function sydFormatter() {
    if (!partsFmt) partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: HQ.TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' });
    return partsFmt;
  }
  var DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Sydney wall-clock parts of an instant: {y,m,d,h,min,s,dow,key}
  // null/invalid input → null (never silently "now": a missing timestamp must not count as today)
  HQ.sydParts = function (when) {
    var t = HQ.parseTs(when);
    if (t == null) return null;
    var p = {};
    sydFormatter().formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    var out = { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, dow: DOW[p.weekday] };
    if (out.h === 24) out.h = 0;
    out.key = out.y + '-' + HQ.pad(out.m) + '-' + HQ.pad(out.d);
    out.minutes = out.h * 60 + out.min;
    return out;
  };
  HQ.sydDay = function (when) { var p = HQ.sydParts(when); return p ? p.key : null; };
  HQ.sydNow = function (now) { return HQ.sydParts(now == null ? Date.now() : now); };
  HQ.isDayKey = function (k) { return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k); };
  // Calendar arithmetic on day keys is done in UTC so DST can never shift a day.
  HQ.addDays = function (key, n) {
    var t = new Date(key + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
    return t.getUTCFullYear() + '-' + HQ.pad(t.getUTCMonth() + 1) + '-' + HQ.pad(t.getUTCDate());
  };
  HQ.dowOf = function (key) { return new Date(key + 'T00:00:00Z').getUTCDay(); };
  HQ.weekStart = function (key) { var w = HQ.dowOf(key); return HQ.addDays(key, w === 0 ? -6 : 1 - w); }; // Monday
  HQ.daysBetween = function (a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); };
  HQ.dayRange = function (from, to) { var out = []; for (var k = from; k <= to; k = HQ.addDays(k, 1)) out.push(k); return out; };
  // The instant Sydney midnight starts on a given day key (DST-aware, no library needed).
  HQ.sydMidnight = function (key) {
    var guess = new Date(key + 'T00:00:00Z').getTime() - 10 * 3600000; // AEST
    for (var i = 0; i < 3; i++) {
      var p = HQ.sydParts(guess);
      var diff = (new Date(p.key + 'T00:00:00Z') - new Date(key + 'T00:00:00Z')) / 60000 + p.minutes;
      if (diff === 0) return guess;
      guess -= diff * 60000;
    }
    return guess;
  };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  HQ.MON = MON; HQ.DAYN = DAYN;
  HQ.fmtDay = function (key, style) {
    if (!HQ.isDayKey(key)) return '–';
    var t = new Date(key + 'T00:00:00Z'), d = t.getUTCDate(), m = MON[t.getUTCMonth()], wd = DAYN[t.getUTCDay()];
    if (style === 'short') return d + ' ' + m;
    if (style === 'dm') return d + '/' + (t.getUTCMonth() + 1);
    if (style === 'wd') return wd.slice(0, 3) + ' ' + d + ' ' + m;
    if (style === 'month') return m + ' ' + t.getUTCFullYear();
    return wd + ' ' + d + ' ' + m;
  };
  HQ.fmtTime = function (iso) {
    var p = HQ.sydParts(iso); if (!p) return '–';
    var h12 = p.h % 12 || 12; return h12 + ':' + HQ.pad(p.min) + (p.h >= 12 ? 'pm' : 'am');
  };
  HQ.fmtMinutes = function (min) { var h = Math.floor(min / 60), m = min % 60; return (h % 12 || 12) + ':' + HQ.pad(m) + (h >= 12 ? 'pm' : 'am'); };

  /* ---------- constants ---------- */
  HQ.STAGES = [
    ['opened', 'Opener sent'], ['replied', 'Replied'], ['goal', 'Goal'], ['situation', 'Current situation'],
    ['pain', 'Pain & timeline'], ['pitched', 'Call pitched'], ['link_sent', 'Link / video sent'],
    ['booked', 'Call booked'], ['call', 'Call held']
  ];
  HQ.STAGE_INDEX = {}; HQ.STAGES.forEach(function (s, i) { HQ.STAGE_INDEX[s[0]] = i; });
  HQ.REPLY_TARGET_PCT = 35;        // Setter Operating SOP target reply rate
  HQ.REPLY_TARGET_MIN_SAMPLE = 10; // never flag red on fewer openers than this
  HQ.OPENER_TARGET_PER_DAY = 20;
  HQ.OPENERS = {
    recipe_offer_a: 'Recipe offer — A (choice)', recipe_offer_b: 'Recipe offer — B (specific tease)',
    recipe_reactivation: 'Recipe re-engagement (past grab)', new_follower: 'New follower (legacy opener)',
    shopping_list: 'Shopping list offer', name_popped: 'Name popped up', magnet_delivery: 'Magnet delivery',
    inbound: 'Inbound (they messaged)', other: 'Other'
  };
  HQ.OPENER_ORDER = ['recipe_offer_a', 'recipe_offer_b', 'recipe_reactivation', 'new_follower', 'shopping_list', 'name_popped', 'magnet_delivery', 'inbound', 'other'];
  HQ.OPENER_GROUPS = { recipe_offer_a: 'recipe', recipe_offer_b: 'recipe', recipe_reactivation: 'recipe', new_follower: 'traditional', shopping_list: 'traditional', name_popped: 'traditional', inbound: 'traditional', other: 'traditional', magnet_delivery: 'magnet' };
  HQ.TIER = { SUPER: 'super_engaged', CLOSE: 'close_friends', PERSONAL: 'personal', INACTIVE: 'inactive' };
  var H = 1, D = 24;
  HQ.CADENCE = { cold: [48 * H, 30 * D, 90 * D, 365 * D], convo: [24 * H, 48 * H, 7 * D, 30 * D, 90 * D, 365 * D] };
  HQ.STOP_STATUSES = { closed_out: 1, won: 1, lost: 1, cancelled: 1, client: 1 };
  HQ.stepLabel = function (h) { return h < 48 ? h + 'h' : (h === 48 ? '48h' : (h === 7 * D ? '1 week' : (h === 30 * D ? '1 month' : (h === 90 * D ? '3 months' : '12 months')))); };
  // Application outcomes Jordan sets by hand on each row. 'called' is the legacy value of 'answered'.
  HQ.OUTCOMES = [['', 'New'], ['answered', 'Answered'], ['no_answer', 'No answer'], ['voicemail', 'Voicemail'], ['booked', 'Call booked'], ['showed', 'Showed'], ['won', 'Signed'], ['not_fit', 'Not a fit']];
  HQ.outcomeLabel = function (o) { if (o === 'called') o = 'answered'; for (var i = 0; i < HQ.OUTCOMES.length; i++) if (HQ.OUTCOMES[i][0] === o) return HQ.OUTCOMES[i][1]; return o || 'New'; };
  HQ.outcomeAnswered = function (o) { return o === 'answered' || o === 'called' || o === 'booked' || o === 'showed' || o === 'won'; };
  HQ.outcomeBooked = function (o) { return o === 'booked' || o === 'showed' || o === 'won'; };
  HQ.outcomeShowed = function (o) { return o === 'showed' || o === 'won'; };
  HQ.outcomeWon = function (o) { return o === 'won'; };
  HQ.outcomeTried = function (o) { return !!o && o !== ''; };

  /* ---------- lead classification (the 5 Oct rules, unchanged) ---------- */
  HQ.stageIdx = function (d) { var i = HQ.STAGE_INDEX[d && d.stage]; return i == null ? 0 : i; };
  HQ.stageLabel = function (d) { return (HQ.STAGES[HQ.stageIdx(d)] || HQ.STAGES[0])[1]; };
  HQ.isLead = function (d) { return !!d && d.category === 'lead' && !d.notApplicable; };
  HQ.isMagnetOnly = function (d) { return !!d && d.opener === 'magnet_delivery'; };
  // "pending-" placeholders made from the inbox preview: no thread link, opener guessed → outside both funnels
  HQ.isUnverified = function (d) { return !!d && /^pending-/i.test(d.id || '') && !d.threadId; };
  HQ.funnelOf = function (d) { return HQ.isUnverified(d) ? 'unread' : (HQ.isMagnetOnly(d) ? 'magnet' : 'outbound'); };
  HQ.openerGroupOf = function (d) { return HQ.OPENER_GROUPS[d && d.opener] || 'traditional'; };
  HQ.isApproxTime = function (d) { return !!(d && (d.unread || d.timesExact === false)); };
  HQ.isOutboundOpener = function (d) { return !!d && d.direction === 'outbound' && d.opener !== 'magnet_delivery'; };
  HQ.uname = function (x) { return String((x && (x.username || x.id)) || '').replace(/^@/, '').toLowerCase(); };
  // when the conversation started. firstSeenAt is when OUR scan first wrote it (can be weeks late) → last resort only
  HQ.leadStartedAt = function (d) { return d.openerSentAt || d.lastMessageAt || d.firstSeenAt || null; };
  HQ.displayName = function (d) { return (d && (d.displayName || d.username || d.id)) || '–'; };
  HQ.firstName = function (d) { var n = String((d && (d.displayName || d.username)) || '').trim().split(/\s+/)[0] || ''; return n.replace(/[^\w'-]/g, '') || 'mate'; };

  HQ.leads = function (dms) { return (dms || []).filter(HQ.isLead); };
  HQ.outboundLeads = function (dms) { return HQ.leads(dms).filter(function (d) { return HQ.funnelOf(d) === 'outbound'; }); };
  HQ.magnetLeads = function (dms) { return HQ.leads(dms).filter(function (d) { return HQ.funnelOf(d) === 'magnet'; }); };
  HQ.unreadLeads = function (dms) { return HQ.leads(dms).filter(HQ.isUnverified); };

  // Everyone whose last message is unanswered — every funnel, because anyone waiting needs a reply.
  // A message Jordan only liked doesn't count as a reply. Personal chats are never leads (category).
  HQ.waiting = function (dms, now) {
    now = now == null ? Date.now() : now;
    return HQ.leads(dms).filter(function (d) { return d.lastSender === 'lead' && (!d.status || d.status === 'active') && !d.lastLeadMessageLiked; })
      .map(function (d) { return { d: d, since: d.waitingSince || d.lastMessageAt || null, hours: HQ.hoursSince(d.waitingSince || d.lastMessageAt, now) }; })
      .sort(function (a, b) { return (HQ.parseTs(a.since) || now) - (HQ.parseTs(b.since) || now); });
  };

  // Outbound reply rate over openers sent in the last `windowDays` (falls back to all time when the window is empty)
  HQ.replyRate = function (dms, now, windowDays, groupFilter) {
    now = now == null ? Date.now() : now;
    var outbound = HQ.outboundLeads(dms).filter(HQ.isOutboundOpener).filter(function (d) { return !groupFilter || groupFilter === 'all' || HQ.openerGroupOf(d) === groupFilter; });
    var cur = windowDays ? outbound.filter(function (d) { var h = HQ.hoursSince(d.openerSentAt, now); return h != null && h >= 0 && h < windowDays * 24; }) : outbound;
    var basis = cur.length ? cur : outbound, allTime = !cur.length;
    var replied = basis.filter(function (d) { return !!d.firstReplyAt; }).length;
    var pct = HQ.pct(replied, basis.length);
    return { pct: pct, replied: replied, openers: basis.length, window: allTime ? 'all time' : 'last ' + windowDays + ' days', allTime: allTime,
      belowTarget: pct != null && basis.length >= HQ.REPLY_TARGET_MIN_SAMPLE && pct < HQ.REPLY_TARGET_PCT, enoughSample: basis.length >= HQ.REPLY_TARGET_MIN_SAMPLE };
  };

  /* ---------- follow-up cadence ---------- */
  HQ.fallbackDraft = function (d, seq, step) {
    var n = HQ.firstName(d);
    if (seq === 'cold' && step === 0) return 'Hey ' + n + ', not sure if this one got buried bro, you end up giving it a crack?';
    if (seq === 'convo' && step === 0) return 'Hey ' + n + ', just circling back on this bro';
    if (seq === 'convo' && step === 1) return n + '?';
    return 'Hey ' + n + ' brother, I just saw your name pop up - how is everything going my man?';
  };
  function fuCore(d, now) {
    if (d.followUpStopped || HQ.STOP_STATUSES[d.status]) return { kind: 'stopped', d: d };
    if (d.lastSender !== 'jordan') return null; // they're waiting on Jordan: that's the DMs tab
    var seq = d.firstReplyAt ? 'convo' : 'cold', steps = HQ.CADENCE[seq];
    var step = Math.max(0, d.followUpsSinceReply || 0);
    var base = HQ.parseTs(d.lastJordanAt || d.lastMessageAt);
    if (base == null) return null;
    if (step >= steps.length) return { kind: 'finished', d: d, seq: seq };
    var due = base + steps[step] * 3600000;
    return { kind: 'active', d: d, seq: seq, step: step, total: steps.length, gap: steps[step], due: due, overdueHours: (now - due) / 3600000, draft: d.draftFollowUp || HQ.fallbackDraft(d, seq, step) };
  }
  // outbound funnel only (magnet leads follow up on the Magnets tab, at every stage; unread placeholders never)
  HQ.fuState = function (d, now) {
    if (!HQ.isLead(d) || HQ.isMagnetOnly(d) || HQ.isUnverified(d)) return null;
    return fuCore(d, now == null ? Date.now() : now);
  };
  HQ.magnetFuState = function (d, now) {
    if (!HQ.isLead(d) || !HQ.isMagnetOnly(d) || HQ.isUnverified(d)) return null;
    return fuCore(d, now == null ? Date.now() : now);
  };
  // Buckets by Sydney day: overdue (due before today), today, soon (next 7 days), done (stopped/finished)
  HQ.followUps = function (dms, now, magnet) {
    now = now == null ? Date.now() : now;
    var todayKey = HQ.sydDay(now), start = HQ.sydMidnight(todayKey), end = HQ.sydMidnight(HQ.addDays(todayKey, 1)), week = HQ.sydMidnight(HQ.addDays(todayKey, 8));
    var out = { over: [], today: [], soon: [], later: [], done: [] };
    (dms || []).forEach(function (d) {
      var f = magnet ? HQ.magnetFuState(d, now) : HQ.fuState(d, now);
      if (!f) return;
      if (f.kind !== 'active') { out.done.push(f); return; }
      if (f.due < start) out.over.push(f); else if (f.due < end) out.today.push(f); else if (f.due < week) out.soon.push(f); else out.later.push(f);
    });
    var byDue = function (a, b) { return a.due - b.due; };
    out.over.sort(byDue); out.today.sort(byDue); out.soon.sort(byDue); out.later.sort(byDue);
    out.due = out.over.length + out.today.length;
    return out;
  };
  HQ.dueLabel = function (due, now) {
    now = now == null ? Date.now() : now;
    var ms = due - now, h = Math.abs(ms) / 3600000;
    var txt = h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : (h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd');
    return ms < 0 ? txt + ' overdue' : 'due in ' + txt;
  };

  /* ---------- dm_daily ---------- */
  HQ.dailyIndex = function (daily) { var m = {}; (daily || []).forEach(function (d) { m[d.date || d.id] = d; }); return m; };
  // a day's record narrowed to an opener group. Days logged before byGroup existed → null (= no data), never a made-up zero
  HQ.groupRec = function (r, group) {
    if (!r) return null;
    if (!group || group === 'all') return r;
    if (!r.byGroup) return null;
    return r.byGroup[group] || {};
  };
  // last N Sydney days ending `endKey` (inclusive): {key, o, f, rep, nc, booked, has}
  HQ.dailySeries = function (daily, endKey, n, group) {
    var idx = HQ.dailyIndex(daily), out = [];
    for (var i = n - 1; i >= 0; i--) {
      var k = HQ.addDays(endKey, -i), r = HQ.groupRec(idx[k], group);
      out.push({ key: k, has: !!r, o: r ? (+r.openersSent || 0) : null, f: r ? (+r.followUpsSent || 0) : null, rep: r ? (+r.repliesReceived || 0) : null, nc: r ? (+r.newConversations || 0) : null, booked: r ? (+r.callsBooked || 0) : null });
    }
    return out;
  };

  /* ---------- Instagram content ---------- */
  HQ.igNorm = function (s) { return String(s == null ? '' : s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); };
  var IG_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var IG_EPOCH = 1314220021721;
  // Instagram media ids / shortcodes encode the posting time: ms = (id >> 23) + 1314220021721.
  // Verified against the scan's own labels (1 Oct → 1 Oct 19:23 Sydney, 13 Oct → 13 Oct 18:45).
  HQ.igTimeFromId = function (id) {
    if (id == null) return null;
    var s = String(id);
    var big;
    try {
      if (/^\d{15,}$/.test(s)) big = BigInt(s);
      else if (/^[A-Za-z0-9_-]{10,}$/.test(s)) { big = BigInt(0); var code = s.slice(0, 11); for (var i = 0; i < code.length; i++) big = big * BigInt(64) + BigInt(IG_ALPHA.indexOf(code[i])); }
      else return null;
      var ms = Number(big >> BigInt(23)) + IG_EPOCH;
      if (ms < 1.3e12 || ms > 4e12) return null;
      return ms;
    } catch (e) { return null; }
  };
  var IG_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  // Instagram's relative label ("13 Oct", "2d", "5h") → Sydney day key; approximate by nature
  HQ.igParseLabel = function (label, now) {
    if (!label) return null;
    var s = String(label).trim().toLowerCase(), p = HQ.sydParts(now == null ? Date.now() : now);
    var m = s.match(/^(\d{1,2})\s*([a-z]{3})/);
    if (m && IG_MONTHS[m[2]] != null) {
      var key = p.y + '-' + HQ.pad(IG_MONTHS[m[2]] + 1) + '-' + HQ.pad(+m[1]);
      if (key > p.key) key = (p.y - 1) + key.slice(4); // no year on the label: never land in the future
      return key;
    }
    m = s.match(/^(\d+)\s*([hdw])$/);
    if (m) { var n = +m[1], unit = m[2]; var ms = unit === 'h' ? n * 3600e3 : unit === 'd' ? n * 864e5 : n * 7 * 864e5; return HQ.sydDay((now == null ? Date.now() : now) - ms); }
    return null;
  };
  // Best posting time for a post/story: exact date from the scan, else decoded from the id (exact), else the label (approx)
  HQ.igPostedAt = function (item, now) {
    if (!item) return { iso: null, day: null, exact: false, source: 'none' };
    if (item.postedAtDate) { var t = HQ.parseTs(item.postedAtDate); if (t != null) return { iso: new Date(t).toISOString(), day: HQ.sydDay(t), exact: item.postedAtExact !== false, source: 'scan' }; }
    if (item.postedAt && item.postedAtExact !== false) { var t2 = HQ.parseTs(item.postedAt); if (t2 != null) return { iso: new Date(t2).toISOString(), day: HQ.sydDay(t2), exact: true, source: 'scan' }; }
    var ms = HQ.igTimeFromId(item.mediaId || item.id);
    if (ms != null) return { iso: new Date(ms).toISOString(), day: HQ.sydDay(ms), exact: true, source: 'id' };
    var day = HQ.igParseLabel(item.postedAtLabel, now);
    if (day) return { iso: null, day: day, exact: false, source: 'label' };
    return { iso: null, day: null, exact: false, source: 'none' };
  };
  HQ.CONTENT_STAGES = ['top', 'mid', 'proof'];
  HQ.contentStage = function (p) { var s = String(p.stage || '').toLowerCase(); return HQ.CONTENT_STAGES.indexOf(s) >= 0 ? s : null; };
  HQ.contentCta = function (p) { var c = String(p.ctaType || '').toLowerCase(); return c === 'hard' || c === 'soft' || c === 'keyword' ? c : null; };
  HQ.defaultPlan = function () { return { weeklyTargets: { top: 4, mid: 3, proof: 2 }, hardCtaPerWeek: 1, postTimeSydney: '18:00', topSplit: { highEffort: 2, lowEffort: 2 } }; };
  // Actual vs plan for the Monday–Sunday Sydney week that contains `dayKey`. Posts and reels only; stories separate; untagged listed, never guessed.
  HQ.contentWeek = function (posts, stories, plan, dayKey, now) {
    plan = plan || HQ.defaultPlan();
    var ws = HQ.weekStart(dayKey), we = HQ.addDays(ws, 6);
    var tg = plan.weeklyTargets || {}, items = [], untagged = [], count = { top: 0, mid: 0, proof: 0 }, hard = 0, soft = 0, keyword = 0, highEffort = 0, lowEffort = 0;
    (posts || []).forEach(function (p) {
      var at = HQ.igPostedAt(p, now); if (!at.day || at.day < ws || at.day > we) return;
      var st = HQ.contentStage(p), cta = HQ.contentCta(p);
      var it = { id: p.id, title: p.title || p.caption || '(untitled)', day: at.day, exact: at.exact, stage: st, cta: cta, mediaType: p.mediaType || 'post', views: HQ.isNum(p.views) ? p.views : null, saves: HQ.isNum(p.saves) ? p.saves : null, shares: HQ.isNum(p.shares) ? p.shares : null, follows: HQ.isNum(p.follows) ? p.follows : null, keyword: p.keyword || null, effort: p.effort || null };
      items.push(it);
      if (st) count[st]++; else untagged.push(it);
      if (cta === 'hard') hard++; if (cta === 'soft') soft++; if (cta === 'keyword') keyword++;
      if (st === 'top' && p.effort === 'high') highEffort++; if (st === 'top' && p.effort === 'low') lowEffort++;
    });
    var storyItems = (stories || []).filter(function (s) { var at = HQ.igPostedAt(s, now); return at.day && at.day >= ws && at.day <= we; });
    var rows = HQ.CONTENT_STAGES.map(function (s) { return { key: s, label: s === 'top' ? 'Top of funnel' : (s === 'mid' ? 'Middle (value / carousel)' : 'Proof'), actual: count[s], plan: HQ.isNum(tg[s]) ? tg[s] : null }; });
    rows.push({ key: 'hard', label: 'Hard CTA', actual: hard, plan: HQ.isNum(plan.hardCtaPerWeek) ? plan.hardCtaPerWeek : null });
    var behind = rows.filter(function (r) { return r.plan != null && r.actual < r.plan; });
    return { weekStart: ws, weekEnd: we, rows: rows, items: items, untagged: untagged, stories: storyItems.length, hard: hard, soft: soft, keyword: keyword, highEffort: highEffort, lowEffort: lowEffort, behind: behind, totalPlanned: rows.reduce(function (a, r) { return a + (r.plan || 0); }, 0), totalPosted: items.length };
  };
  HQ.contentHistory = function (posts, stories, plan, now, weeks) {
    var today = HQ.sydDay(now == null ? Date.now() : now), ws = HQ.weekStart(today), out = [];
    for (var i = (weeks || 6) - 1; i >= 0; i--) out.push(HQ.contentWeek(posts, stories, plan, HQ.addDays(ws, -7 * i), now));
    return out;
  };
  // Exact story → application attribution: sticker label (normalised) equals the application's utm_content. Nothing else counts.
  HQ.tagCounts = function (tfResponses) {
    var m = {};
    (tfResponses || []).forEach(function (r) { var tag = r.utm && r.utm.utm_content ? HQ.igNorm(r.utm.utm_content) : ''; if (tag) m[tag] = (m[tag] || 0) + 1; });
    return m;
  };
  HQ.storyRows = function (stories, tfResponses, now) {
    var tags = HQ.tagCounts(tfResponses);
    return (stories || []).map(function (s) {
      var at = HQ.igPostedAt(s, now), label = s.linkStickerLabel || null, norm = s.linkStickerLabelNorm || (label ? HQ.igNorm(label) : null);
      return { id: s.id, caption: s.caption || '(untitled story)', day: at.day, iso: at.iso, exact: at.exact, views: HQ.isNum(s.views) ? s.views : null, linkClicks: HQ.isNum(s.linkClicks) ? s.linkClicks : null, profileVisits: HQ.isNum(s.profileVisits) ? s.profileVisits : null, replies: HQ.isNum(s.replies) ? s.replies : null, stickerLabel: label, stickerNorm: norm, matched: norm ? (tags[norm] || 0) : null };
    }).sort(function (a, b) { return String(b.day || '').localeCompare(String(a.day || '')) || (b.views || 0) - (a.views || 0); });
  };

  /* ---------- Typeform ---------- */
  HQ.tfSum = function (tfDaily, from, to) {
    var t = { visits: 0, started: 0, completed: 0, src: {}, days: 0 };
    (tfDaily || []).forEach(function (d) {
      var k = d.date || d.id; if (k < from || k > to) return;
      t.days++; t.visits += +d.visits || 0; t.started += +d.started || 0; t.completed += +d.completed || 0;
      var bs = d.bySource || {}; Object.keys(bs).forEach(function (s) { var x = t.src[s] || (t.src[s] = { visits: 0, completed: 0 }); x.visits += +bs[s].visits || 0; x.completed += +bs[s].completed || 0; });
    });
    return t;
  };
  HQ.appsInRange = function (tfResponses, from, to) {
    return (tfResponses || []).filter(function (r) { if (!r.submittedAt) return false; var k = HQ.sydDay(r.submittedAt); return k && k >= from && k <= to; });
  };
  // applications nobody has worked yet (no outcome) — newest first
  HQ.appsUnworked = function (tfResponses, now, days) {
    var today = HQ.sydDay(now == null ? Date.now() : now), from = HQ.addDays(today, -(days || 14));
    return HQ.appsInRange(tfResponses, from, today).filter(function (r) { return !HQ.outcomeTried(r.outcome); })
      .sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
  };

  /* ---------- goal: $10K/month recurring by 31 Dec 2026 ---------- */
  HQ.defaultGoal = function () { return { targetMonthly: 10000, deadline: '2026-12-31', currentMonthly: null, clientValue: 450, showRate: 0.4, closeRate: 0.7 }; };
  // Everything here is arithmetic on Jordan's own inputs. Rates are his estimates until GHL/Stripe give real ones.
  HQ.goalMath = function (goal, stripeSummary, now) {
    var g = Object.assign(HQ.defaultGoal(), goal || {});
    var today = HQ.sydDay(now == null ? Date.now() : now);
    var daysLeft = Math.max(0, HQ.daysBetween(today, g.deadline || '2026-12-31'));
    var weeksLeft = daysLeft / 7;
    var current = null, currentSource = 'none';
    if (stripeSummary && HQ.isNum(stripeSummary.mrr)) { current = stripeSummary.mrr; currentSource = 'stripe'; }
    else if (HQ.isNum(g.currentMonthly)) { current = g.currentMonthly; currentSource = 'manual'; }
    var target = HQ.isNum(g.targetMonthly) ? g.targetMonthly : 10000;
    var gap = current == null ? null : Math.max(0, target - current);
    var clientValue = HQ.isNum(g.clientValue) && g.clientValue > 0 ? g.clientValue : null;
    var clientsNeeded = (gap != null && clientValue) ? Math.ceil(gap / clientValue) : null;
    var perWeek = (clientsNeeded != null && weeksLeft > 0) ? clientsNeeded / weeksLeft : null;
    var showRate = HQ.isNum(g.showRate) && g.showRate > 0 ? g.showRate : null, closeRate = HQ.isNum(g.closeRate) && g.closeRate > 0 ? g.closeRate : null;
    var showsPerWeek = (perWeek != null && closeRate) ? perWeek / closeRate : null;
    var bookingsPerWeek = (showsPerWeek != null && showRate) ? showsPerWeek / showRate : null;
    return { target: target, current: current, currentSource: currentSource, gap: gap, daysLeft: daysLeft, weeksLeft: weeksLeft, deadline: g.deadline, clientValue: clientValue, clientsNeeded: clientsNeeded, clientsPerWeek: perWeek, showsPerWeek: showsPerWeek, bookingsPerWeek: bookingsPerWeek, showRate: showRate, closeRate: closeRate, ratesAreEstimates: true, pctOfTarget: current == null ? null : Math.min(100, Math.round(current / target * 100)) };
  };

  /* ---------- system health ---------- */
  // One row per scheduled task. green = ran recently and ok; amber = stale; red = failed or incomplete; grey = not connected / no record.
  HQ.healthRows = function (meta, now) {
    now = now == null ? Date.now() : now; meta = meta || {};
    function row(name, when, opts) {
      opts = opts || {};
      var h = HQ.hoursSince(when, now);
      var r = { name: name, lastAt: when || null, ageHours: h, schedule: opts.schedule || '', note: opts.note || '', items: opts.items == null ? null : opts.items, chip: 'grey', chipText: 'No record yet', why: opts.notRun || 'Has not written a result yet.' };
      if (opts.notConnected) { r.chip = 'grey'; r.chipText = 'Not connected'; r.why = opts.notConnected; return r; }
      if (when == null) return r;
      if (opts.failed) { r.chip = 'red'; r.chipText = 'Failed'; r.why = opts.failed; return r; }
      if (opts.incomplete) { r.chip = 'red'; r.chipText = 'Incomplete'; r.why = opts.incomplete; return r; }
      if (h != null && h > (opts.staleHours || 30)) { r.chip = 'amber'; r.chipText = 'Stale'; r.why = 'Last ran ' + HQ.relTime(when, now) + '; expected ' + (opts.schedule || 'sooner') + '.'; return r; }
      if (opts.partial) { r.chip = 'amber'; r.chipText = 'Partial'; r.why = opts.partial; return r; }
      r.chip = 'green'; r.chipText = 'OK'; r.why = 'Last ran ' + (HQ.relTime(when, now) || 'recently') + '.'; return r;
    }
    var rows = [];
    var dm = meta.dmScan || null, cov = dm && dm.coverage;
    var dmIncomplete = null, dmPartial = null;
    if (dm && dm.lastScanAt) {
      if (!cov) dmPartial = 'Old scan format: only the newest ~20 Primary threads were read.';
      else if (cov.skipped) dmIncomplete = 'Skipped: ' + (cov.reason || 'no reason given') + '.';
      else if (cov.complete === false) {
        var why = [], st = cov.stalled || {}, tabs = ['primary', 'general'].filter(function (t) { return st[t]; });
        if (tabs.length) why.push('Instagram stopped loading the ' + tabs.join(' and ') + ' inbox list');
        if (cov.unverified && cov.unverified.length) why.push(cov.unverified.length + ' item' + (cov.unverified.length === 1 ? '' : 's') + ' not checked');
        if (cov.resumeRemaining && cov.resumeRemaining.length) why.push(cov.resumeRemaining.length + ' queued for next run');
        dmIncomplete = 'Last run did not cover everything: ' + (why.join('; ') || 'see coverage') + '. Treat DM counts as a floor.';
      }
    }
    rows.push(row('DM scan', dm && dm.lastScanAt, { schedule: (dm && dm.schedule) || '5× a day (6:07, 10:07, 14:07, 18:07, 22:07)', staleHours: 9, incomplete: dmIncomplete, partial: dmPartial, failed: dm && dm.lastAttemptOk === false ? (dm.lastAttemptNote || 'Last attempt failed.') : null, items: dm && HQ.isNum(dm.threadsRead) ? dm.threadsRead + ' threads read' : null, notRun: 'Runs in Chrome on the Mac mini. Nothing written yet.' }));
    var sc = meta.scan || null;
    rows.push(row('Likes scan (warm leads)', sc && sc.lastScanAt, { schedule: (sc && sc.schedule) || 'daily 3:15am', staleHours: 30, failed: sc && sc.lastAttemptOk === false ? (sc.lastAttemptNote || 'Last attempt failed.') : null, partial: sc && sc.partialPosts ? sc.partialPosts + ' big post(s) only partly readable' : null, items: sc && HQ.isNum(sc.windowPosts) ? sc.windowPosts + ' posts, ' + (HQ.isNum(sc.uniqueLikers) ? sc.uniqueLikers + ' likers' : '') : null, notRun: 'Runs in Chrome on the Mac mini. Nothing written yet.' }));
    var ig = meta.igScan || null;
    rows.push(row('Content scan (posts & stories)', ig && ig.lastScanAt, { schedule: (ig && ig.schedule) || 'daily 4:30am', staleHours: 30, failed: ig && ig.lastAttemptOk === false ? (ig.lastAttemptNote || 'Last attempt failed.') : null, partial: ig && ig.backfillComplete === false ? '30-day backfill not finished yet, so older posts are missing.' : null, items: ig ? ((HQ.isNum(ig.postsStored) ? ig.postsStored + ' posts' : '') + (HQ.isNum(ig.storiesStored) ? ', ' + ig.storiesStored + ' stories' : '')) : null, notRun: 'Not scheduled yet.' }));
    var tf = meta.typeformSync || null;
    rows.push(row('Typeform sync (applications)', tf && tf.lastSyncAt, { schedule: 'hourly', staleHours: 3, failed: tf && tf.ok === false ? (tf.error || 'Sync failing.') : null, items: tf && HQ.isNum(tf.responsesStored) ? tf.responsesStored + ' applications' : null }));
    var rc = meta.routineCalls || null;
    rows.push(row('Google Calendar → calls', rc && rc.updatedAt, { schedule: '6:12, 9:12, 12:12, 15:12, 18:12', staleHours: 7, items: rc && rc.dates ? Object.keys(rc.dates).length + ' days' : null, notRun: 'Nothing written yet.' }));
    var mr = meta.morningReport || null;
    rows.push(row('Morning Slack report', mr && mr.sentAt, { schedule: 'daily 6:47am', staleHours: 26, failed: mr && mr.ok === false ? (mr.error || 'Failed to send.') : null, notRun: 'Will record here from the next run.' }));
    var ads = meta.adsSync || null;
    rows.push(row('Meta Ads sync', ads && ads.lastSyncAt, { schedule: 'daily', staleHours: 30, failed: ads && ads.ok === false ? (ads.error || 'Sync failing.') : null, notConnected: ads ? null : 'Meta Ads connector not added. Ads tab shows how.' }));
    var stp = meta.stripeSync || null;
    rows.push(row('Stripe sync (revenue)', stp && stp.lastSyncAt, { schedule: 'hourly', staleHours: 3, failed: stp && stp.ok === false ? (stp.error || 'Sync failing.') : null, notConnected: (!stp || stp.connected === false) ? 'Read-only Stripe key not in Vault yet.' : null }));
    var ghl = meta.ghlSync || null;
    rows.push(row('GoHighLevel pull (calls)', ghl && ghl.lastSyncAt, { schedule: 'hourly', staleHours: 3, failed: ghl && ghl.ok === false ? (ghl.error || 'Sync failing.') : null, notConnected: (!ghl || ghl.connected === false) ? 'No read-only GHL token yet. Answered / booked / showed / closed stay "–".' : null }));
    var order = { red: 0, amber: 1, grey: 2, green: 3 };
    rows.sort(function (a, b) { return order[a.chip] - order[b.chip]; });
    return rows;
  };
  HQ.dmCoverage = function (dmMeta) { if (!dmMeta || !dmMeta.lastScanAt) return null; return dmMeta.coverage ? dmMeta.coverage : { legacy: true, complete: false }; };

  /* ---------- funnel snapshot (last N days) ---------- */
  // Every stage is {label, value|null, reason} — null means "not measurable yet", and the reason is shown on the page.
  HQ.funnelSnapshot = function (state, now, days) {
    now = now == null ? Date.now() : now;
    var today = HQ.sydDay(now), from = HQ.addDays(today, -(days - 1));
    var igRan = !!(state.meta && state.meta.igScan && state.meta.igScan.lastScanAt);
    var posts = (state.igPosts || []).filter(function (p) { var d = HQ.igPostedAt(p, now).day; return d && d >= from && d <= today; });
    var stories = (state.igStories || []).filter(function (p) { var d = HQ.igPostedAt(p, now).day; return d && d >= from && d <= today; });
    var views = posts.reduce(function (a, p) { return a + (HQ.isNum(p.views) ? p.views : 0); }, 0);
    var magnets = HQ.magnetLeads(state.dms).filter(function (d) { var k = HQ.sydDay(HQ.leadStartedAt(d)); return k && k >= from && k <= today; }).length;
    var openers = HQ.dailySeries(state.daily, today, days).reduce(function (a, d) { return a + (d.has ? d.o : 0); }, 0);
    var dmReplied = HQ.outboundLeads(state.dms).filter(function (d) { var k = HQ.sydDay(d.firstReplyAt); return k && k >= from && k <= today; }).length;
    var tf = HQ.tfSum(state.tfDaily, from, today);
    var apps = HQ.appsInRange(state.tfResponses, from, today);
    var answered = apps.filter(function (r) { return HQ.outcomeAnswered(r.outcome); }).length;
    var booked = apps.filter(function (r) { return HQ.outcomeBooked(r.outcome); }).length;
    var showed = apps.filter(function (r) { return HQ.outcomeShowed(r.outcome); }).length;
    var won = apps.filter(function (r) { return HQ.outcomeWon(r.outcome); }).length;
    var marked = apps.filter(function (r) { return HQ.outcomeTried(r.outcome); }).length;
    var byHand = marked ? 'marked by hand on the Applications tab (' + marked + ' of ' + apps.length + ' applications have an outcome)' : 'no application in this window has an outcome marked yet; GoHighLevel is not connected';
    var ghl = state.meta && state.meta.ghlSync && state.meta.ghlSync.connected;
    // group = sub-funnel; bars are scaled within a group and a conversion % is only shown inside a group (noConv breaks the chain)
    return { days: days, from: from, to: today, stages: [
      { key: 'reach', group: 'Content', label: 'Reach (post views)', value: igRan ? views : null, reason: igRan ? posts.length + ' post' + (posts.length === 1 ? '' : 's') + ' posted in this window' : 'content scan has not run', noConv: true },
      { key: 'stories', group: 'Content', label: 'Stories posted', value: igRan ? stories.length : null, reason: igRan ? '' : 'content scan has not run', noConv: true },
      { key: 'capture', group: 'Keyword / email capture', label: 'Recipe captures (lead-magnet DMs)', value: state.dmLoaded ? magnets : null, reason: 'magnet threads that started in this window; email list not connected', noConv: true },
      { key: 'openers', group: 'DM', label: 'Outbound openers sent', value: openers, reason: 'from the DM scan’s daily log', noConv: true },
      { key: 'replied', group: 'DM', label: 'Outbound leads who replied', value: state.dmLoaded ? dmReplied : null, reason: 'first reply received in this window' },
      { key: 'opens', group: 'Application', label: 'Application form opened', value: tf.visits, reason: 'Typeform', noConv: true },
      { key: 'applied', group: 'Application', label: 'Applications', value: tf.completed, reason: 'Typeform' },
      { key: 'answered', group: 'Call', label: 'Answered call', value: marked ? answered : (ghl ? 0 : null), reason: byHand },
      { key: 'booked', group: 'Call', label: 'Call booked', value: marked ? booked : (ghl ? 0 : null), reason: byHand },
      { key: 'showed', group: 'Call', label: 'Showed', value: marked ? showed : (ghl ? 0 : null), reason: byHand },
      { key: 'closed', group: 'Call', label: 'Signed', value: marked ? won : (ghl ? 0 : null), reason: byHand }
    ] };
  };

  /* ---------- TODAY: everything the morning view and the Slack report share ---------- */
  HQ.computeToday = function (state, now) {
    now = now == null ? Date.now() : now;
    state = state || {};
    var meta = state.meta || {};
    var syd = HQ.sydNow(now), today = syd.key, yday = HQ.addDays(today, -1), tomorrow = HQ.addDays(today, 1);
    var dms = state.dms || [], dmReady = !!(meta.dmScan && meta.dmScan.lastScanAt) || dms.length > 0;
    var waiting = HQ.waiting(dms, now);
    var fu = HQ.followUps(dms, now, false), mfu = HQ.followUps(dms, now, true);
    var rr = HQ.replyRate(dms, now, 30);
    var warm = (state.contacts || []).filter(function (c) { return c.tier === HQ.TIER.SUPER || c.tier === HQ.TIER.CLOSE; });
    var byUser = {}; dms.forEach(function (d) { byUser[HQ.uname(d)] = d; });
    var neverMessaged = warm.filter(function (c) { return !byUser[HQ.uname(c)]; }).sort(function (a, b) { return (b.likeCount || 0) - (a.likeCount || 0); });
    var unworked = HQ.appsUnworked(state.tfResponses, now, 30);
    var calls = (meta.routineCalls && meta.routineCalls.dates) || {};
    var callsToday = (calls[today] && calls[today].calls) || [], callsTomorrow = (calls[tomorrow] && calls[tomorrow].calls) || [];
    var plan = meta.contentPlan || null, igRan = !!(meta.igScan && meta.igScan.lastScanAt);
    var week = HQ.contentWeek(state.igPosts, state.igStories, plan || HQ.defaultPlan(), today, now);
    var postedToday = igRan ? week.items.filter(function (i) { return i.day === today; }).length : null;
    var stripe = state.stripe || null;
    var risks = stripe && stripe.summary && Array.isArray(stripe.summary.risks) ? stripe.summary.risks : null;
    var winback = (state.tfResponses || []).filter(function (r) { var h = HQ.hoursSince(r.outcomeAt || r.submittedAt, now); return (r.outcome === 'no_answer' || r.outcome === 'voicemail') && h != null && h > 72 && h < 60 * 24; });
    var postTime = (plan && plan.postTimeSydney) || '18:00', postMin = (+postTime.split(':')[0]) * 60 + (+postTime.split(':')[1] || 0);

    var actions = [];
    function act(a) { if (actions.length < 7) actions.push(a); }
    // 1. calls today (Mon/Tue evenings are call days; real bookings come from Google Calendar)
    if (callsToday.length) act({ key: 'calls', title: callsToday.length + ' call' + (callsToday.length === 1 ? '' : 's') + ' today: ' + callsToday.map(function (c) { return (c.l || 'Call') + ' ' + HQ.fmtMinutes(c.s); }).join(', '), why: 'Booked in Google Calendar. Read each applicant’s answers before the call.', go: 'apps', count: callsToday.length, urgency: 'crit' });
    // 2. replies waiting on Jordan
    var old = waiting.filter(function (w) { return w.hours != null && w.hours > 24; });
    if (waiting.length) act({ key: 'replies', title: 'Reply to ' + waiting.length + ' lead' + (waiting.length === 1 ? '' : 's') + ' waiting on you', why: old.length ? old.length + ' waited over 24h. Oldest: ' + waiting.slice(0, 3).map(function (w) { return HQ.firstName(w.d) + ' ' + (HQ.isApproxTime(w.d) ? '≈' : '') + HQ.fmtHours(w.hours); }).join(', ') + '.' : 'Oldest: ' + waiting.slice(0, 3).map(function (w) { return HQ.firstName(w.d) + ' ' + HQ.fmtHours(w.hours); }).join(', ') + '.', go: 'dms', count: waiting.length, urgency: old.length ? 'crit' : 'warn' });
    // 3. applications nobody has called
    if (unworked.length) act({ key: 'apps', title: 'Call ' + unworked.length + ' applicant' + (unworked.length === 1 ? '' : 's') + ' nobody has called', why: 'Applied via Typeform, no outcome marked yet. Newest ' + HQ.relTime(unworked[0].submittedAt, now) + '. Tap Answered / No answer / Voicemail as you go.', go: 'apps', count: unworked.length, urgency: 'crit' });
    // 4. follow-ups due
    if (fu.due) act({ key: 'followups', title: fu.due + ' follow-up' + (fu.due === 1 ? '' : 's') + ' due' + (fu.over.length ? ' (' + fu.over.length + ' overdue)' : ''), why: 'Outbound cadence: 24h / 48h / 1 week / 1 month after your last message.', go: 'follow', count: fu.due, urgency: fu.over.length ? 'warn' : 'good' });
    if (mfu.due) act({ key: 'magnets', title: mfu.due + ' recipe follow-up' + (mfu.due === 1 ? '' : 's') + ' due', why: 'People who got a recipe and haven’t heard from you since (48–72h rule).', go: 'magnets', count: mfu.due, urgency: mfu.over.length ? 'warn' : 'good' });
    // 5. content due today
    if (plan && igRan) {
      var dueToday = syd.minutes < postMin + 180; // still worth posting until ~9pm
      if (week.behind.length && dueToday) act({ key: 'content', title: 'Post today by ' + HQ.fmtMinutes(postMin) + ': ' + week.behind.map(function (r) { return r.label.toLowerCase() + ' ' + r.actual + '/' + r.plan; }).join(', '), why: 'This week’s plan is ' + week.rows.map(function (r) { return r.plan + ' ' + r.label.toLowerCase(); }).join(', ') + '. ' + (postedToday ? postedToday + ' posted today already.' : 'Nothing posted today yet.'), go: 'funnel', count: week.behind.length, urgency: 'warn' });
    }
    // 6. warm leads never messaged (Jordan owns these)
    if (dmReady && neverMessaged.length) act({ key: 'warm', title: 'Open a conversation with ' + Math.min(3, neverMessaged.length) + ' warm lead' + (neverMessaged.length === 1 ? '' : 's'), why: neverMessaged.length + ' Super Engaged / Close Friends have never been messaged. Start with ' + neverMessaged.slice(0, 3).map(function (c) { return '@' + (c.username || c.id); }).join(', ') + '.', go: 'leads', count: neverMessaged.length, urgency: 'good' });
    // 7. payment risks (only once Stripe is connected)
    if (risks && risks.length) act({ key: 'stripe', title: risks.length + ' payment' + (risks.length === 1 ? '' : 's') + ' at risk', why: 'Failed or past-due in Stripe: ' + risks.slice(0, 3).map(function (r) { return r.name || r.email || 'client'; }).join(', ') + '.', go: 'stripe', count: risks.length, urgency: 'crit' });
    // 8. win-back candidates
    if (winback.length) act({ key: 'winback', title: 'Chase ' + winback.length + ' applicant' + (winback.length === 1 ? '' : 's') + ' you couldn’t reach', why: 'Marked No answer / Voicemail more than 3 days ago and nothing since.', go: 'apps', count: winback.length, urgency: 'good' });

    var ySeries = HQ.dailySeries(state.daily, yday, 1)[0];
    var tfY = HQ.tfSum(state.tfDaily, yday, yday);
    var postedY = igRan ? HQ.contentWeek(state.igPosts, state.igStories, plan || HQ.defaultPlan(), yday, now).items.filter(function (i) { return i.day === yday; }).length : null;
    var yesterday = [
      { key: 'openers', label: 'Openers sent', value: ySeries.has ? ySeries.o : null, target: HQ.OPENER_TARGET_PER_DAY, reason: ySeries.has ? '' : 'no DM scan logged ' + HQ.fmtDay(yday, 'short') },
      { key: 'reply', label: 'Reply rate (30d)', value: rr.pct, suffix: '%', target: HQ.REPLY_TARGET_PCT, reason: rr.openers ? rr.replied + ' of ' + rr.openers + ' openers' + (rr.allTime ? ' (all time)' : '') : 'no openers logged' },
      { key: 'apps', label: 'Applications', value: tfY.days ? tfY.completed : null, target: null, reason: tfY.days ? '' : 'Typeform has no record for ' + HQ.fmtDay(yday, 'short') },
      { key: 'opens', label: 'Form opens', value: tfY.days ? tfY.visits : null, target: null, reason: tfY.days ? '' : '' },
      { key: 'posts', label: 'Posts published', value: postedY, target: null, reason: igRan ? '' : 'content scan has not run' }
    ];

    var health = HQ.healthRows(meta, now);
    var coverage = HQ.dmCoverage(meta.dmScan);
    return {
      generatedAt: new Date(now).toISOString(), date: today, dateLabel: HQ.fmtDay(today), minutes: syd.minutes,
      goal: HQ.goalMath(meta.goal, stripe && stripe.summary, now),
      actions: actions,
      yesterday: yesterday,
      funnel7: HQ.funnelSnapshot(state, now, 7), funnel30: HQ.funnelSnapshot(state, now, 30),
      health: health,
      coverage: coverage,
      counts: { waiting: waiting.length, waitingOver24h: old.length, followUpsDue: fu.due, followUpsOverdue: fu.over.length, magnetDue: mfu.due, warm: warm.length, warmNeverMessaged: neverMessaged.length, unworkedApps: unworked.length, pendingNotRead: HQ.unreadLeads(dms).length, callsToday: callsToday.length, callsTomorrow: callsTomorrow.length, requestsWaiting: coverage && coverage.requests ? coverage.requests.count : null },
      replyRate: rr,
      waitingTop: waiting.slice(0, 3).map(function (w) { return { name: HQ.firstName(w.d), age: (HQ.isApproxTime(w.d) ? '≈' : '') + HQ.fmtHours(w.hours) }; }),
      openToday: neverMessaged.slice(0, 3).map(function (c) { return '@' + (c.username || c.id) + ' (' + (c.likeCount || 0) + ')'; }),
      week: { weekStart: week.weekStart, rows: week.rows, untagged: week.untagged.length, stories: week.stories },
      dmReady: dmReady
    };
  };

  // Slack mrkdwn for the morning report — built from computeToday() only, so Slack and HQ agree by construction.
  HQ.formatSlack = function (t) {
    var L = [];
    var bad = t.health.filter(function (h) { return h.chip === 'red' || h.chip === 'amber'; });
    var covTxt = t.coverage == null ? 'no DM scan yet' : (t.coverage.legacy ? 'DM partial (old scan)' : (t.coverage.skipped ? 'DM SKIPPED' : (t.coverage.complete === false ? 'DM INCOMPLETE' : 'DM complete')));
    L.push('*TASTEFORM | ' + t.dateLabel + '*');
    L.push((bad.length ? '⚠ ' : '') + 'Coverage: ' + covTxt + (t.counts.pendingNotRead ? ' · ' + t.counts.pendingNotRead + ' chats not read yet' : '') + (bad.length ? ' · ' + bad.map(function (h) { return h.name + ' ' + h.chipText.toLowerCase(); }).join(', ') : ' · all syncs OK'));
    var g = t.goal;
    L.push('Goal: ' + (g.current == null ? '–' : HQ.money(g.current)) + ' of ' + HQ.money(g.target) + '/mo' + (g.current == null ? ' (current recurring not set)' : ' · gap ' + HQ.money(g.gap)) + ' · ' + g.daysLeft + ' days left' + (g.clientsPerWeek != null ? ' · need ' + g.clientsPerWeek.toFixed(1) + ' new clients/week' + (g.bookingsPerWeek != null ? ' ≈ ' + g.bookingsPerWeek.toFixed(1) + ' bookings/week at your estimated show/close rates' : '') : ''));
    L.push('Do today:');
    if (!t.actions.length) L.push('  – nothing waiting. Go post a story.');
    t.actions.forEach(function (a, i) { L.push('  ' + (i + 1) + '. ' + a.title + ' — ' + a.why); });
    L.push('Yesterday: ' + t.yesterday.map(function (y) { return y.label + ' ' + (y.value == null ? '–' : y.value + (y.suffix || '')) + (y.target != null ? '/' + y.target + (y.suffix || '') : '') + (y.value == null && y.reason ? ' (' + y.reason + ')' : ''); }).join(' · '));
    var f = t.funnel7.stages;
    L.push('Funnel 7d: ' + f.map(function (s) { return s.label.replace(/ \(.*\)/, '') + ' ' + (s.value == null ? '–' : s.value); }).join(' · '));
    L.push('Dashboard: <https://jordantornatore-rgb.github.io/tasteform-hq/|TasteForm HQ>');
    return L.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HQ;
  root.HQ = HQ;
})(typeof globalThis !== 'undefined' ? globalThis : this);
