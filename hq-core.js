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
  HQ.VERSION = '3.11.2';
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
  // A placeholder that was resolved to a real row (resolvedTo) is a duplicate of that row; one the scan could not find
  // in the inbox on 3 separate nights (unresolvable) is dead. Neither is a lead any more.
  HQ.isRetiredPlaceholder = function (d) { return !!d && /^pending-/i.test(d.id || '') && !!(d.resolvedTo || d.unresolvable); };
  HQ.isLead = function (d) { return !!d && d.category === 'lead' && !d.notApplicable && !HQ.isRetiredPlaceholder(d); };
  HQ.isMagnetOnly = function (d) { return !!d && d.opener === 'magnet_delivery'; };
  // "pending-" placeholders made from the inbox preview: no thread link, opener guessed → outside both funnels
  HQ.isUnverified = function (d) { return !!d && /^pending-/i.test(d.id || '') && !d.threadId; };
  HQ.dmFunnelOf = function (d) { return HQ.isUnverified(d) ? 'unread' : (HQ.isMagnetOnly(d) ? 'magnet' : 'outbound'); };
  HQ.openerGroupOf = function (d) { return HQ.OPENER_GROUPS[d && d.opener] || 'traditional'; };
  HQ.isApproxTime = function (d) { return !!(d && (d.unread || d.timesExact === false)); };
  HQ.isOutboundOpener = function (d) { return !!d && d.direction === 'outbound' && d.opener !== 'magnet_delivery'; };
  HQ.uname = function (x) { return String((x && (x.username || x.id)) || '').replace(/^@/, '').toLowerCase(); };
  // when the conversation started. firstSeenAt is when OUR scan first wrote it (can be weeks late) → last resort only
  HQ.leadStartedAt = function (d) { return d.openerSentAt || d.lastMessageAt || d.firstSeenAt || null; };
  HQ.displayName = function (d) { return (d && (d.displayName || d.username || d.id)) || '–'; };
  HQ.firstName = function (d) { var n = String((d && (d.displayName || d.username)) || '').trim().split(/\s+/)[0] || ''; return n.replace(/[^\w'-]/g, '') || 'mate'; };

  HQ.leads = function (dms) { return (dms || []).filter(HQ.isLead); };
  HQ.outboundLeads = function (dms) { return HQ.leads(dms).filter(function (d) { return HQ.dmFunnelOf(d) === 'outbound'; }); };
  HQ.magnetLeads = function (dms) { return HQ.leads(dms).filter(function (d) { return HQ.dmFunnelOf(d) === 'magnet'; }); };
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
      if (opts.stoppedEarly) { r.chip = 'red'; r.chipText = 'Stopped early'; r.why = opts.stoppedEarly; return r; }
      if (opts.incomplete) { r.chip = 'red'; r.chipText = 'Incomplete'; r.why = opts.incomplete; return r; }
      if (h != null && h > (opts.staleHours || 30)) { r.chip = 'amber'; r.chipText = 'Stale'; r.why = 'Last ran ' + HQ.relTime(when, now) + '; expected ' + (opts.schedule || 'sooner') + '.'; return r; }
      if (opts.partial) { r.chip = 'amber'; r.chipText = 'Partial'; r.why = opts.partial; return r; }
      r.chip = 'green'; r.chipText = 'OK'; r.why = 'Last ran ' + (HQ.relTime(when, now) || 'recently') + '.'; return r;
    }
    var rows = [];
    function early(m) { if (!m || m.stoppedEarly !== true) return null; return 'Last run stopped with ' + (HQ.isNum(m.queueRemaining) ? m.queueRemaining + ' rows' : 'work') + ' still queued after ' + (HQ.isNum(m.minutesUsed) ? m.minutesUsed + ' of ' + (m.budgetMin || '?') + ' min' : 'a short run') + '.'; }
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
    rows.push(row('DM scan', dm && dm.lastScanAt, { schedule: (dm && dm.schedule) || '6:07, 10:07, 14:07, 18:07, 22:07', staleHours: 9, stoppedEarly: early(dm), incomplete: dmIncomplete, partial: dmPartial, failed: dm && dm.lastAttemptOk === false ? (dm.lastAttemptNote || 'Last attempt failed.') : null, items: dm && HQ.isNum(dm.threadsRead) ? dm.threadsRead + ' threads read' : null, notRun: 'Runs in Chrome on the Mac mini. Nothing written yet.' }));
    var bl = meta.dmBacklog || null;
    rows.push(row('DM backlog (nightly deep pass)', bl && bl.lastScanAt, { schedule: (bl && bl.schedule) || 'nightly 22:40', staleHours: 30, stoppedEarly: early(bl), failed: bl && bl.lastAttemptOk === false ? (bl.lastAttemptNote || 'Last attempt failed.') : null, partial: bl && HQ.isNum(bl.staleRemaining) && bl.staleRemaining > 0 ? bl.staleRemaining + ' leads still older than 24 h; ' + (HQ.isNum(bl.pendingRemaining) ? bl.pendingRemaining + ' placeholders left' : '') : null, items: bl && bl.processed ? Object.keys(bl.processed).reduce(function (a, k) { return a + (HQ.isNum(bl.processed[k]) ? bl.processed[k] : 0); }, 0) + ' rows re-verified' : null, notRun: 'Runs in Chrome on the Mac mini at 22:40. Nothing written yet.' }));
    var sc = meta.scan || null;
    rows.push(row('Likes scan (warm leads)', sc && sc.lastScanAt, { schedule: (sc && sc.schedule) || 'daily 3:15am', staleHours: 30, stoppedEarly: early(sc), failed: sc && sc.lastAttemptOk === false ? (sc.lastAttemptNote || 'Last attempt failed.') : null, partial: sc && sc.partialPosts ? sc.partialPosts + ' big post(s) only partly readable' : null, items: sc && HQ.isNum(sc.windowPosts) ? sc.windowPosts + ' posts, ' + (HQ.isNum(sc.uniqueLikers) ? sc.uniqueLikers + ' likers' : '') : null, notRun: 'Runs in Chrome on the Mac mini. Nothing written yet.' }));
    var ig = meta.igScan || null;
    rows.push(row('Content scan (posts & stories)', ig && ig.lastScanAt, { schedule: (ig && ig.schedule) || 'daily 4:30am', staleHours: 30, stoppedEarly: early(ig), failed: ig && ig.lastAttemptOk === false ? (ig.lastAttemptNote || 'Last attempt failed.') : null, partial: ig && ig.backfillComplete === false ? '30-day backfill not finished yet, so older posts are missing.' : null, items: ig ? ((HQ.isNum(ig.postsStored) ? ig.postsStored + ' posts' : '') + (HQ.isNum(ig.storiesStored) ? ', ' + ig.storiesStored + ' stories' : '')) : null, notRun: 'Not scheduled yet.' }));
    var tf = meta.typeformSync || null;
    rows.push(row('Typeform sync (applications)', tf && tf.lastSyncAt, { schedule: 'hourly', staleHours: 3, failed: tf && tf.ok === false ? (tf.error || 'Sync failing.') : null, items: tf && HQ.isNum(tf.responsesStored) ? tf.responsesStored + ' applications' : null }));
    var rc = meta.routineCalls || null;
    rows.push(row('Google Calendar → calls', rc && rc.updatedAt, { schedule: '6:12, 9:12, 12:12, 15:12, 18:12', staleHours: 7, items: rc && rc.dates ? Object.keys(rc.dates).length + ' days' : null, notRun: 'Nothing written yet.' }));
    var mr = meta.morningReport || null;
    rows.push(row('Morning Slack report', mr && mr.sentAt, { schedule: 'daily 6:47am', staleHours: 26, failed: mr && mr.ok === false ? (mr.error || 'Failed to send.') : null, notRun: 'Will record here from the next run.' }));
    var ads = meta.adsSync || null;
    rows.push(row('Meta Ads sync', ads && ads.lastSyncAt, { schedule: 'daily', staleHours: 30, failed: ads && ads.ok === false ? (ads.error || 'Sync failing.') : null, notConnected: ads ? null : 'Meta Ads connector not added. Ads tab shows how.' }));
    var stp = meta.stripeSync || null;
    rows.push(row('Stripe sync (revenue)', stp && stp.lastSyncAt, { schedule: 'hourly', staleHours: 3, failed: stp && stp.ok === false && !stp.off ? (stp.error || 'Sync failing.') : null, notConnected: stp && stp.off ? 'Off: payments are moving to Newie.' : ((!stp || stp.connected === false) ? 'Read-only Stripe key not in Vault yet.' : null) }));
    var ghl = meta.ghlSync || null;
    rows.push(row('GoHighLevel pull (calls)', ghl && ghl.lastSyncAt, { schedule: 'hourly', staleHours: 3, failed: ghl && ghl.ok === false ? (ghl.error || 'Sync failing.') : null, notConnected: (!ghl || ghl.connected === false) ? 'No read-only GHL token yet. Answered / booked / showed / closed stay "–".' : null }));
    var order = { red: 0, amber: 1, grey: 2, green: 3 };
    rows.sort(function (a, b) { return order[a.chip] - order[b.chip]; });
    return rows;
  };
  HQ.dmCoverage = function (dmMeta) { if (!dmMeta || !dmMeta.lastScanAt) return null; return dmMeta.coverage ? dmMeta.coverage : { legacy: true, complete: false }; };

  // Clients who left in [from, to]. 1FIT's daily check only knows leavers it saw go (it started early Nov), so the leavers
  // Jordan confirmed (meta/deliveryManual.left, dates from 1FIT) count up to the list's cutoff, and the daily check's
  // per-day count (hq_delivery_by_day) after it. Without the list it's the check's own count for the window.
  HQ.leftIn = function (dc, manual, byDay, from, to) {
    if (!manual || !Array.isArray(manual.left) || !manual.cutoff) return dc && HQ.isNum(dc.left) ? dc.left : null;
    var n = manual.left.filter(function (x) { return x && x.date >= from && x.date <= to && x.date <= manual.cutoff; }).length;
    if (to > manual.cutoff) {
      if (!byDay) return dc && HQ.isNum(dc.left) ? Math.max(n, dc.left) : n;
      Object.keys(byDay).forEach(function (k) { if (k > manual.cutoff && k >= from && k <= to) n += +(byDay[k] && byDay[k].left) || 0; });
    }
    return n;
  };
  // clients in 1FIT on free coaching (marked "Free (affiliate)" on the Revenue page)
  HQ.freeClients = function (customers) {
    if (!Array.isArray(customers)) return null;
    return customers.filter(function (c) { return c && c.status === 'Free (affiliate)' && c.in1Fit !== false; }).length;
  };
  // 1FIT active minus free; without the Stripe list (non-admins) it stays 1FIT's count
  HQ.payingActive = function (deliveryCounts, customers) {
    var a = deliveryCounts && HQ.isNum(deliveryCounts.active) ? deliveryCounts.active : null;
    if (a == null) return null;
    var f = HQ.freeClients(customers);
    return f == null ? a : Math.max(0, a - f);
  };
  // Call outcomes Jordan gave by hand (meta/ghlManual), laid over GHL's days for calls never marked there. From 14 Nov
  // 2026 he marks new calls in GHL himself. manual.calls = [{ id, label, date, showed, closed }] (he can change dates
  // on the Leads page); manual.days = { day: { showed, noShow, closed } } is the older form. A day GHL already marked
  // keeps GHL's numbers; a hand-entered call on a day GHL has no call for adds the call.
  HQ.ghlManualDays = function (manual) {
    var out = {};
    if (!manual) return out;
    Object.keys(manual.days || {}).forEach(function (k) { var x = manual.days[k] || {}; out[k] = { showed: +x.showed || 0, noShow: +x.noShow || 0, closed: +x.closed || 0 }; });
    (manual.calls || []).forEach(function (c) {
      if (!c || !HQ.isDayKey(c.date)) return;
      var d = out[c.date] || (out[c.date] = { showed: 0, noShow: 0, closed: 0 });
      if (c.showed) d.showed++; else d.noShow++;
      if (c.showed && c.closed) d.closed++;
    });
    return out;
  };
  HQ.applyGhlManual = function (ghl, manual) {
    var md = HQ.ghlManualDays(manual);
    if (!ghl || !ghl.days || !Object.keys(md).length) return ghl;
    var days = {};
    Object.keys(ghl.days).forEach(function (k) { days[k] = ghl.days[k]; });
    Object.keys(md).forEach(function (k) {
      var g = days[k] || { booked: 0, held: 0, showed: 0, noShow: 0, unmarked: 0, closed: 0, byFunnel: {} }, x = md[k];
      if ((g.showed || 0) + (g.noShow || 0) > 0) return;
      var s = x.showed, ns = x.noShow, c = x.closed, d = Object.assign({}, g);
      d.held = Math.max(g.held || 0, s + ns); d.showed = s; d.noShow = ns; d.unmarked = Math.max(0, d.held - s - ns); d.closed = (g.closed || 0) + c;
      var bf = {}; Object.keys(g.byFunnel || {}).forEach(function (f) { bf[f] = Object.assign({}, g.byFunnel[f]); });
      var f = Object.keys(bf)[0] || 'unknown';
      bf[f] = Object.assign({ booked: 0, held: 0, showed: 0, noShow: 0, closed: 0 }, bf[f]);
      bf[f].showed += s; bf[f].noShow += ns; bf[f].closed += c; bf[f].held = Math.max(bf[f].held || 0, s + ns);
      d.byFunnel = bf; d.manual = true; days[k] = d;
    });
    return Object.assign({}, ghl, { days: days });
  };

  /* ---------- GoHighLevel day sums (meta/ghlSync.days, written by the ghl-sync function) ---------- */
  HQ.ghlSum = function (ghl, from, to) {
    if (!ghl || !ghl.connected || !ghl.days) return null;
    var o = { booked: 0, held: 0, showed: 0, noShow: 0, unmarked: 0, closed: 0, closeDaysSum: 0, closeDaysN: 0, outreach: 0, replied: 0, paidLeads: 0 };
    Object.keys(ghl.days).forEach(function (k) { if (k < from || k > to) return; var d = ghl.days[k] || {}; Object.keys(o).forEach(function (f) { if (HQ.isNum(+d[f])) o[f] += +d[f]; }); });
    return o;
  };

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
    var g = HQ.ghlSum(state.meta && state.meta.ghlSync, from, today), ghl = !!g;
    // group = sub-funnel; bars are scaled within a group and a conversion % is only shown inside a group (noConv breaks the chain)
    return { days: days, from: from, to: today, stages: [
      { key: 'reach', group: 'Content', label: 'Reach (post views)', value: igRan ? views : null, reason: igRan ? posts.length + ' post' + (posts.length === 1 ? '' : 's') + ' posted in this window' : 'content scan has not run', noConv: true },
      { key: 'stories', group: 'Content', label: 'Stories posted', value: igRan ? stories.length : null, reason: igRan ? '' : 'content scan has not run', noConv: true },
      { key: 'capture', group: 'Keyword / email capture', label: 'Recipe captures (lead-magnet DMs)', value: state.dmLoaded ? magnets : null, reason: 'magnet threads that started in this window; email list not connected', noConv: true },
      { key: 'openers', group: 'DM', label: 'Outbound openers sent', value: openers, reason: 'from the DM scan’s daily log', noConv: true },
      { key: 'replied', group: 'DM', label: 'Outbound leads who replied', value: state.dmLoaded ? dmReplied : null, reason: 'first reply received in this window' },
      { key: 'opens', group: 'Application', label: 'Application form opened', value: tf.visits, reason: 'Typeform', noConv: true },
      { key: 'applied', group: 'Application', label: 'Applications', value: tf.completed, reason: 'Typeform' },
      { key: 'answered', group: 'Call', label: 'Answered call', value: marked ? answered : null, reason: byHand },
      { key: 'booked', group: 'Call', label: 'Call booked', value: marked ? booked : (ghl ? g.booked : null), reason: marked ? byHand : (ghl ? 'GoHighLevel sales calendar' : byHand) },
      { key: 'showed', group: 'Call', label: 'Showed', value: marked ? showed : (ghl && (g.showed + g.noShow) ? g.showed : null), reason: marked ? byHand : (ghl ? (g.unmarked ? g.unmarked + ' call(s) not marked showed / no-show in GHL' : 'GoHighLevel') : byHand) },
      { key: 'closed', group: 'Call', label: 'Signed', value: marked ? won : (ghl ? g.closed : null), reason: marked ? byHand : (ghl ? 'GoHighLevel: moved to a Closed / Won stage' : byHand) }
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

  /* ---------- Email (GHL sequences) ----------
     steps:  email_steps rows {id, order, sequence, name, delayDays, subject, body, audience, status}
     events: email_events rows {contactId, step, event (enrolled|sent|opened|clicked|replied|bounced|unsubscribed), at, tags[], firstName, country}
     Every count is distinct contacts with a real event row. Rates are null (→ "–") until something is sent.
     Tags follow "group: value" (recipe: hsp, country: au, job: corporate) so the page can split by group. */
  HQ.EMAIL_TAG_GROUPS = ['recipe', 'job', 'country'];
  HQ.emailTagGroup = function (tag) {
    var m = /^\s*([a-z]+)\s*:\s*(.+?)\s*$/i.exec(String(tag || ''));
    return m && HQ.EMAIL_TAG_GROUPS.indexOf(m[1].toLowerCase()) >= 0 ? { group: m[1].toLowerCase(), value: m[2].toLowerCase() } : null;
  };
  HQ.emailStats = function (steps, events, nowMs) {
    nowMs = HQ.isNum(nowMs) ? nowMs : Date.now();
    steps = (steps || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    events = (events || []).filter(function (e) { return e && e.contactId && e.step && e.event; });
    var byKey = {}; // step|event -> {contactId: event}
    var contacts = {}; // contactId -> {firstName, tags, country, sent:{step:at}, replied:bool}
    events.forEach(function (e) {
      var k = e.step + '|' + e.event;
      (byKey[k] = byKey[k] || {})[e.contactId] = e;
      var c = contacts[e.contactId] = contacts[e.contactId] || { contactId: e.contactId, firstName: '', tags: [], country: '', sent: {}, enrolledAt: null, replied: false, stopped: false };
      if (e.firstName) c.firstName = e.firstName;
      if (e.country) c.country = e.country;
      if (e.tags && e.tags.length) c.tags = e.tags;
      if (e.event === 'sent') c.sent[e.step] = e.at;
      if (e.event === 'enrolled') c.enrolledAt = c.enrolledAt || e.at;
      if (e.event === 'replied') c.replied = true;
      if (e.event === 'unsubscribed' || e.event === 'bounced') c.stopped = true;
    });
    function who(step, ev) { return byKey[step + '|' + ev] || {}; }
    function countAmongSent(step, ev) { var s = who(step, 'sent'), x = who(step, ev), n = 0; Object.keys(x).forEach(function (id) { if (s[id]) n++; }); return n; }
    var perStep = steps.map(function (st) {
      var sent = Object.keys(who(st.id, 'sent')).length;
      var opened = countAmongSent(st.id, 'opened'), replied = countAmongSent(st.id, 'replied'), clicked = countAmongSent(st.id, 'clicked');
      var bounced = countAmongSent(st.id, 'bounced'), unsub = countAmongSent(st.id, 'unsubscribed');
      var groups = {};
      Object.keys(who(st.id, 'sent')).forEach(function (id) {
        (contacts[id].tags || []).forEach(function (t) {
          var g = HQ.emailTagGroup(t); if (!g) return;
          var row = ((groups[g.group] = groups[g.group] || {})[g.value] = groups[g.group][g.value] || { value: g.value, sent: 0, opened: 0, replied: 0 });
          row.sent++; if (who(st.id, 'opened')[id]) row.opened++; if (who(st.id, 'replied')[id]) row.replied++;
        });
      });
      Object.keys(groups).forEach(function (g) {
        groups[g] = Object.keys(groups[g]).map(function (v) { var r = groups[g][v]; r.openRate = HQ.pct(r.opened, r.sent); r.replyRate = HQ.pct(r.replied, r.sent); return r; })
          .sort(function (a, b) { return b.sent - a.sent || a.value.localeCompare(b.value); });
      });
      var lastSentAt = null; Object.keys(who(st.id, 'sent')).forEach(function (id) { var t = HQ.parseTs(who(st.id, 'sent')[id].at); if (t && (!lastSentAt || t > lastSentAt)) lastSentAt = t; });
      return { id: st.id, step: st, sent: sent, opened: opened, clicked: clicked, replied: replied, bounced: bounced, unsubscribed: unsub,
        openRate: HQ.pct(opened, sent), replyRate: HQ.pct(replied, sent), byGroup: groups, lastSentAt: lastSentAt };
    });
    // Up next: each contact still in a sequence moves to the step after the last one sent to them.
    var DAY = 86400000, seqs = {};
    steps.forEach(function (st) { (seqs[st.sequence || 'main'] = seqs[st.sequence || 'main'] || []).push(st); });
    var upNext = {}; steps.forEach(function (st) { upNext[st.id] = { id: st.id, step: st, dueNow: 0, later: 0, nextDueAt: null }; });
    Object.keys(contacts).forEach(function (id) {
      var c = contacts[id]; if (c.replied || c.stopped) return;
      Object.keys(seqs).forEach(function (sq) {
        var list = seqs[sq], lastIdx = -1, lastAt = null;
        list.forEach(function (st, i) { if (c.sent[st.id]) { lastIdx = i; lastAt = HQ.parseTs(c.sent[st.id]); } });
        var next = list[lastIdx + 1]; if (!next) return;
        var base = lastIdx < 0 ? HQ.parseTs(c.enrolledAt) : lastAt;
        if (!base) return; // never enrolled in this sequence
        var due = base + (lastIdx < 0 ? 0 : (next.delayDays || 0) * DAY);
        var u = upNext[next.id]; if (due <= nowMs) u.dueNow++; else u.later++;
        if (!u.nextDueAt || due < u.nextDueAt) u.nextDueAt = due;
      });
    });
    var sentLog = [];
    Object.keys(byKey).forEach(function (k) {
      if (!/\|sent$/.test(k)) return;
      var step = k.split('|')[0];
      Object.keys(byKey[k]).forEach(function (id) {
        var e = byKey[k][id], c = contacts[id];
        sentLog.push({ contactId: id, firstName: c.firstName, country: c.country, tags: c.tags, step: step, at: e.at,
          opened: !!who(step, 'opened')[id], replied: !!who(step, 'replied')[id] });
      });
    });
    sentLog.sort(function (a, b) { return (HQ.parseTs(b.at) || 0) - (HQ.parseTs(a.at) || 0); });
    var totSent = 0, totOpen = 0, totReply = 0;
    perStep.forEach(function (p) { totSent += p.sent; totOpen += p.opened; totReply += p.replied; });
    var repliedContacts = Object.keys(contacts).filter(function (id) { return contacts[id].replied; }).length;
    return { perStep: perStep, upNext: steps.map(function (st) { return upNext[st.id]; }), sentLog: sentLog,
      totals: { contacts: Object.keys(contacts).length, sent: totSent, opened: totOpen, replied: totReply, repliedContacts: repliedContacts,
        openRate: HQ.pct(totOpen, totSent), replyRate: HQ.pct(totReply, totSent) } };
  };


  /* ---------- Instagram analytics (Analytics tab) ----------
     Posts are bucketed by their exact Sydney posting day (postedAtDate, decoded from the media id by the scan);
     their numbers are lifetime totals as of the last scan, the same convention Instagram and Metricool use.
     Account-level numbers (followers, reach, follows/unfollows) come from ig_account_daily: one row per Sydney day
     with the profile follower count and Instagram's own "last 7 / 30 / 90 days" figures read that day, so the
     previous window is simply the row from N days earlier. Nothing is summed across days that Instagram de-duplicates. */
  HQ.IG_PERIODS = [7, 30, 90];
  HQ.median = function (arr) {
    var a = (arr || []).filter(HQ.isNum).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null; var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  HQ.pctChange = function (cur, prev) { return (HQ.isNum(cur) && HQ.isNum(prev) && prev > 0) ? Math.round(((cur - prev) / prev) * 100) : null; };
  HQ.igPostDay = function (p) { return p && p.postedAtDate && p.postedAtExact !== false ? HQ.sydDay(p.postedAtDate) : null; };
  HQ.igType = function (p) { var t = String(p && p.mediaType || '').toLowerCase(); return t === 'reel' || t === 'carousel' ? t : (t ? 'post' : null); };
  HQ.igInteractions = function (p) {
    if (HQ.isNum(p.interactions)) return p.interactions;
    var parts = [p.likes, p.comments, p.saves, p.shares];
    return parts.every(HQ.isNum) ? parts.reduce(function (a, b) { return a + b; }, 0) : null;
  };
  function sumField(list, f) {
    var have = list.filter(function (p) { return HQ.isNum(typeof f === 'function' ? f(p) : p[f]); });
    return { value: have.length ? have.reduce(function (a, p) { return a + (typeof f === 'function' ? f(p) : p[f]); }, 0) : null, have: have.length, of: list.length };
  }
  function postWindowStats(list) {
    var views = sumField(list, 'views'), inter = sumField(list, HQ.igInteractions);
    var reels = list.filter(function (p) { return HQ.igType(p) === 'reel'; });
    var watch = sumField(reels, 'watchTimeSec');
    // engagement per 1,000 views over the posts that have both numbers, so a missing field never dilutes it
    var both = list.filter(function (p) { return HQ.isNum(p.views) && p.views > 0 && HQ.isNum(HQ.igInteractions(p)); });
    var bv = both.reduce(function (a, p) { return a + p.views; }, 0), bi = both.reduce(function (a, p) { return a + HQ.igInteractions(p); }, 0);
    var avgW = reels.filter(function (p) { return HQ.isNum(p.avgWatchSec); });
    return {
      posts: list.length, views: views.value, viewsHave: views.have,
      interactions: inter.value, engPer1k: bv > 0 ? Math.round((bi / bv) * 10000) / 10 : null,
      saves: sumField(list, 'saves').value, shares: sumField(list, 'shares').value, follows: sumField(list, 'follows').value,
      reels: reels.length, typicalReel: HQ.median(reels.map(function (p) { return p.views; })),
      watchTimeSec: watch.value, watchHave: watch.have,
      avgWatchSec: avgW.length ? Math.round(avgW.reduce(function (a, p) { return a + p.avgWatchSec; }, 0) / avgW.length * 10) / 10 : null, avgWatchHave: avgW.length
    };
  }

  /* Follower change between two days from the profile follower count read each morning (exact).
     End = the latest reading on or up to 2 days before `to`; start = the reading on the day before `from`
     (or up to 3 days earlier). If tracking began inside the window, start = the first reading and `partial` is true,
     so the dashboard says "since <day>" instead of passing a shorter period off as the full one. */
  HQ.followerChange = function (byDay, from, to) {
    var endDay = null, startDay = null, i;
    for (i = 0; i < 3 && !endDay; i++) { var e = HQ.addDays(to, -i); if (byDay[e] && HQ.isNum(byDay[e].followers)) endDay = e; }
    for (i = 1; i <= 4 && !startDay; i++) { var b = HQ.addDays(from, -i); if (byDay[b] && HQ.isNum(byDay[b].followers)) startDay = b; }
    var partial = false;
    if (!startDay) {
      var inside = Object.keys(byDay).filter(function (k) { return k >= from && k <= to && HQ.isNum(byDay[k].followers); }).sort();
      if (inside.length) { startDay = inside[0]; partial = true; }
    }
    if (!endDay || !startDay || startDay >= endDay) return { net: null, startDay: startDay, endDay: endDay, partial: partial };
    return { net: byDay[endDay].followers - byDay[startDay].followers, startDay: startDay, endDay: endDay, partial: partial,
      startFollowers: byDay[startDay].followers, endFollowers: byDay[endDay].followers };
  };
  // accountDaily rows: {id/date: 'YYYY-MM-DD', followers, p7:{reached,views,follows,unfollows,interactions}, p30:{...}, p90:{...}}
  HQ.igAnalytics = function (posts, accountDaily, today, periodDays) {
    var N = HQ.IG_PERIODS.indexOf(periodDays) >= 0 ? periodDays : 30;
    var curFrom = HQ.addDays(today, -(N - 1)), prevTo = HQ.addDays(curFrom, -1), prevFrom = HQ.addDays(prevTo, -(N - 1));
    var dated = [], undated = 0;
    (posts || []).forEach(function (p) { var d = HQ.igPostDay(p); if (d) dated.push(Object.assign({}, p, { _day: d, _type: HQ.igType(p) })); else undated++; });
    var inR = function (a, b) { return dated.filter(function (p) { return p._day >= a && p._day <= b; }); };
    var cur = inR(curFrom, today), prev = inR(prevFrom, prevTo);
    var cs = postWindowStats(cur), ps = postWindowStats(prev);
    var keys = ['posts', 'views', 'interactions', 'engPer1k', 'saves', 'shares', 'follows', 'typicalReel', 'watchTimeSec', 'avgWatchSec'];
    var change = {}; keys.forEach(function (k) { change[k] = HQ.pctChange(cs[k], ps[k]); });
    // by type (current window)
    var byType = ['reel', 'carousel', 'post'].map(function (t) {
      var l = cur.filter(function (p) { return p._type === t; });
      return { type: t, count: l.length, views: sumField(l, 'views').value, typical: HQ.median(l.map(function (p) { return p.views; })) };
    }).filter(function (r) { return r.count > 0; });
    var top = cur.filter(function (p) { return HQ.isNum(p.views); }).sort(function (a, b) { return b.views - a.views; }).slice(0, 5);
    // account level: exact rows only
    var byDay = {}; (accountDaily || []).forEach(function (r) { var k = r.date || r.id; if (HQ.isDayKey(k)) byDay[k] = r; });
    var pk = 'p' + N, accNow = null, accNowDay = null;
    for (var i = 0; i < 3 && !accNow; i++) { var dk = HQ.addDays(today, -i); if (byDay[dk] && byDay[dk][pk]) { accNow = byDay[dk][pk]; accNowDay = dk; } }
    var accPrev = accNowDay && byDay[HQ.addDays(accNowDay, -N)] ? byDay[HQ.addDays(accNowDay, -N)][pk] || null : null;
    var account = { day: accNowDay, cur: accNow, prev: accPrev, change: {} };
    ['reached', 'views', 'follows', 'unfollows', 'interactions'].forEach(function (k) { account.change[k] = HQ.pctChange(accNow && accNow[k], accPrev && accPrev[k]); });
    // net followers in the window from the profile follower count (exact when both ends were read)
    var fEnd = null, fEndDay = null; for (var j = 0; j < 3 && fEnd == null; j++) { var ek = HQ.addDays(today, -j); if (byDay[ek] && HQ.isNum(byDay[ek].followers)) { fEnd = byDay[ek].followers; fEndDay = ek; } }
    var startKey = HQ.addDays(curFrom, -1), fStart = byDay[startKey] && HQ.isNum(byDay[startKey].followers) ? byDay[startKey].followers : null;
    account.followers = fEnd; account.followersDay = fEndDay;
    var fc = HQ.followerChange(byDay, curFrom, today);
    account.netFollowers = fc.net; account.netFrom = fc.startDay; account.netTo = fc.endDay; account.netPartial = fc.partial;
    if (account.netFollowers == null && accNow && HQ.isNum(accNow.follows) && HQ.isNum(accNow.unfollows)) account.netFollowers = accNow.follows - accNow.unfollows;
    var fcp = HQ.followerChange(byDay, prevFrom, prevTo); account.netPrev = fcp.partial ? null : fcp.net;
    // daily net change series (only days whose previous day was also read)
    var netSeries = HQ.dayRange(curFrom, today).map(function (d) {
      var a = byDay[HQ.addDays(d, -1)], b = byDay[d];
      return { day: d, net: a && b && HQ.isNum(a.followers) && HQ.isNum(b.followers) ? b.followers - a.followers : null, followers: b && HQ.isNum(b.followers) ? b.followers : null };
    });
    // scatter (90 days, independent of the period, like the reference): views vs a retention measure
    var from90 = HQ.addDays(today, -89), s90 = inR(from90, today).filter(function (p) { return HQ.isNum(p.views) && p.views > 0; });
    var withWatch = s90.filter(function (p) { return HQ.isNum(p.avgWatchSec); });
    var yKey = withWatch.length >= 3 ? 'avgWatchSec' : 'engPer1k';
    var pts = (yKey === 'avgWatchSec' ? withWatch : s90.filter(function (p) { return HQ.isNum(HQ.igInteractions(p)); })).map(function (p) {
      var y = yKey === 'avgWatchSec' ? p.avgWatchSec : Math.round(HQ.igInteractions(p) / p.views * 10000) / 10;
      return { id: p.id, title: p.title || '', type: p._type, day: p._day, x: p.views, y: y, shortcode: p.shortcode || null };
    });
    var mx = HQ.median(pts.map(function (q) { return q.x; })), my = HQ.median(pts.map(function (q) { return q.y; }));
    pts.forEach(function (q) { q.outlier = pts.length >= 4 && q.x >= 2 * mx && q.y >= my ? 'both' : (pts.length >= 4 && (q.x >= 3 * mx || q.y >= 1.5 * my) ? (q.x >= 3 * mx ? 'views' : 'retention') : null); });
    // posting heatmap: 13 full weeks (Mon-Sun) ending this week
    var hmStart = HQ.addDays(HQ.weekStart(today), -7 * 12), heat = [];
    HQ.dayRange(hmStart, HQ.addDays(HQ.weekStart(today), 6)).forEach(function (d) {
      heat.push({ day: d, future: d > today, count: dated.filter(function (p) { return p._day === d; }).length });
    });
    var hmPast = heat.filter(function (h) { return !h.future; }), daysPosted = hmPast.filter(function (h) { return h.count > 0; }).length;
    var lastPostDay = dated.reduce(function (m, p) { return !m || p._day > m ? p._day : m; }, null);
    return { period: N, curFrom: curFrom, prevFrom: prevFrom, prevTo: prevTo, cur: cs, prev: ps, change: change, byType: byType, top: top,
      undated: undated, account: account, netSeries: netSeries,
      scatter: { yKey: yKey, points: pts, medX: mx, medY: my, watchHave: withWatch.length, from: from90 },
      heat: heat, daysPosted: daysPosted, heatDays: hmPast.length, lastPostDay: lastPostDay,
      daysSincePost: lastPostDay ? HQ.daysBetween(lastPostDay, today) : null };
  };

  /* ---------- the four areas: Traffic, Leads, Sales, Delivery (Home + area pages) ----------
     period: 7 | 30 | 'month' (calendar month to date vs the same days of last month).
     Exact or blank, as everywhere: a number we can't measure is null.
     DM numbers are left out on purpose while the DM scan is being fixed (opts.dmScanOk). */
  HQ.PILLAR_PERIODS = [7, 30, 'month'];
  HQ.pillarRange = function (today, period) {
    if (period === 'month') {
      var from = today.slice(0, 8) + '01', n = HQ.daysBetween(from, today);
      var pf = HQ.addDays(from, -1).slice(0, 8) + '01', pt = HQ.addDays(pf, n);
      var pEnd = HQ.addDays(from, -1); if (pt > pEnd) pt = pEnd;
      return { from: from, to: today, prevFrom: pf, prevTo: pt, days: n + 1, label: 'this month' };
    }
    var N = period === 7 ? 7 : 30, f = HQ.addDays(today, -(N - 1)), ptt = HQ.addDays(f, -1);
    return { from: f, to: today, prevFrom: HQ.addDays(ptt, -(N - 1)), prevTo: ptt, days: N, label: 'last ' + N + ' days' };
  };
  HQ.computePillars = function (state, now, period, opts) {
    opts = opts || {}; state = state || {};
    var today = HQ.sydDay(now == null ? Date.now() : now), R = HQ.pillarRange(today, period);
    function m(cur, prev, extra) { return Object.assign({ value: HQ.isNum(cur) ? cur : null, prev: HQ.isNum(prev) ? prev : null, change: HQ.pctChange(cur, prev) }, extra || {}); }

    // --- Traffic: posts published in the window (their lifetime numbers), plus account-level 7/30-day totals
    var dated = [];
    (state.igPosts || []).forEach(function (p) { var d = HQ.igPostDay(p); if (d) dated.push(Object.assign({}, p, { _day: d })); });
    var inR = function (a, b) { return dated.filter(function (p) { return p._day >= a && p._day <= b; }); };
    var curPosts = inR(R.from, R.to), prevPosts = inR(R.prevFrom, R.prevTo);
    var cs = postWindowStats(curPosts), ps = postWindowStats(prevPosts);
    var likes = sumField(curPosts, 'likes').value, comments = sumField(curPosts, 'comments').value;
    var nf = curPosts.filter(function (p) { return HQ.isNum(p.viewersNonFollowersPct); });
    var stories = (state.igStories || []).filter(function (s) { var d = s.postedAtDate ? HQ.sydDay(s.postedAtDate) : null; return d && d >= R.from && d <= R.to; });
    var storyViews = sumField(stories, 'views');
    var byDay = {}; (state.igAccount || []).forEach(function (r) { var k = r.date || r.id; if (HQ.isDayKey(k)) byDay[k] = r; });
    var acc = null, accDay = null, pk = period === 7 ? 'p7' : (period === 30 ? 'p30' : null);
    if (pk) for (var i = 0; i < 3 && !acc; i++) { var dk = HQ.addDays(today, -i); if (byDay[dk] && byDay[dk][pk]) { acc = byDay[dk][pk]; accDay = dk; } }
    var accPrev = acc && byDay[HQ.addDays(accDay, -R.days)] ? byDay[HQ.addDays(accDay, -R.days)][pk] || null : null;
    var A = function (k) { return acc && HQ.isNum(acc[k]) ? acc[k] : null; }, AP = function (k) { return accPrev && HQ.isNum(accPrev[k]) ? accPrev[k] : null; };
    var fEnd = null; for (var j = 0; j < 3 && fEnd == null; j++) { var ek = HQ.addDays(today, -j); if (byDay[ek] && HQ.isNum(byDay[ek].followers)) fEnd = byDay[ek].followers; }
    var fStartRow = byDay[HQ.addDays(R.from, -1)], fStart = fStartRow && HQ.isNum(fStartRow.followers) ? fStartRow.followers : null;
    var accDays = Object.keys(byDay).sort();
    var tf = HQ.tfSum(state.tfDaily, R.from, R.to), tfp = HQ.tfSum(state.tfDaily, R.prevFrom, R.prevTo);
    var fc = HQ.followerChange(byDay, R.from, R.to), fcp = HQ.followerChange(byDay, R.prevFrom, R.prevTo);
    var top = curPosts.filter(function (p) { return HQ.isNum(p.follows); }).sort(function (a, b) { return b.follows - a.follows; })[0] || null;
    var apSum = function (a, b) { var o = HQ.applySessions(state, a, b), t = { opened: 0, started: 0, submitted: 0 }; Object.keys(o).forEach(function (k) { t.opened += o[k].opened; t.started += o[k].started; t.submitted += o[k].submitted; }); return t; };
    var apW = apSum(R.from, R.to), apP = apSum(R.prevFrom, R.prevTo);
    var traffic = {
      // headline = real follower growth from the daily follower count; post-credited follows are only the ones Instagram ties to a post
      headline: m(fc.net, fcp.partial ? null : fcp.net, { label: 'net new followers', since: fc.partial ? fc.startDay : null, from: fc.startDay, to: fc.endDay }),
      postFollows: m(cs.follows, ps.follows, { label: 'follows credited to posts' }),
      followersNow: fEnd, netFollowers: fc.net, netSince: fc.partial ? fc.startDay : null, followersSince: accDays[0] || null,
      views: m(cs.views, ps.views), reach: m(A('reached'), AP('reached')), accountViews: m(A('views'), AP('views')),
      accountLevel: !!pk,
      nonFollowerPct: nf.length ? Math.round(nf.reduce(function (a, p) { return a + p.viewersNonFollowersPct; }, 0) / nf.length) : null,
      posts: m(cs.posts, ps.posts), saves: m(cs.saves, ps.saves), shares: m(cs.shares, ps.shares),
      likes: m(likes, sumField(prevPosts, 'likes').value), comments: m(comments, sumField(prevPosts, 'comments').value),
      storyViews: m(storyViews.have ? storyViews.value : null, null), stories: stories.length,
      profileVisits: m(A('profileVisits'), AP('profileVisits')), linkTaps: m(A('externalLinkTaps'), AP('externalLinkTaps')),
      // form views = the apply page (link in bio and every tagged link) + Typeform (only the barbershop QR code now)
      formViews: m(apW.opened + (tf.days ? tf.visits : 0), apP.opened + (tfp.days ? tfp.visits : 0), { apply: apW.opened, typeform: tf.days ? tf.visits : 0 }),
      top: top ? { id: top.id, title: top.title || null, follows: top.follows, views: top.views, shortcode: top.shortcode || null, day: top._day } : null
    };

    // --- Leads: form views -> starts -> applications -> booked -> showed
    var apps = HQ.appsInRange(state.tfResponses, R.from, R.to);
    // every application (apply page + Typeform, one per person), counted by funnel
    var allApps = HQ.allApplications(state), inWin = function (a, b) { return allApps.filter(function (x) { return x.day >= a && x.day <= b; }); };
    var appsAll = inWin(R.from, R.to), appsPrev = inWin(R.prevFrom, R.prevTo);
    var bySrc = {}; appsAll.forEach(function (r) { var s = HQ.FUNNEL_LABEL[r.funnel] || r.funnel; bySrc[s] = (bySrc[s] || 0) + 1; });
    var fitKnown = apps.filter(function (r) { return r.fit === true || r.fit === false || r.fit === 'fit' || r.fit === 'not_fit'; });
    var fitYes = fitKnown.filter(function (r) { return r.fit === true || r.fit === 'fit'; }).length;
    // form starts come from the apply page only (Typeform is just the barbershop QR and its sync only sees finished forms)
    var ghl = state.meta && state.meta.ghlSync, ghlOn = !!(ghl && ghl.connected);
    var dmBooked = null;
    if (opts.dmScanOk) dmBooked = (state.daily || []).filter(function (d) { var k = d.date || d.id; return k >= R.from && k <= R.to; }).reduce(function (a, d) { return a + (+d.callsBooked || 0); }, 0);
    var G = HQ.ghlSum(ghl, R.from, R.to), GP = HQ.ghlSum(ghl, R.prevFrom, R.prevTo);
    var booked = G ? G.booked : null, marked = G ? G.showed + G.noShow : 0;
    var showNote = !G ? 'Needs GoHighLevel' : (G.unmarked ? G.unmarked + ' of ' + G.held + ' calls not marked showed / no-show in GHL' : (G.held ? null : 'No sales calls held in this window'));
    // a lead = an application (apply page or Typeform) or an instant-form lead from the ads, the same count the
    // Friday scorecard uses
    var paidL = G ? G.paidLeads || 0 : 0, paidLP = GP ? GP.paidLeads || 0 : 0;
    var leads = {
      headline: m(appsAll.length + paidL, appsPrev.length + paidLP, { label: 'leads', apps: appsAll.length, paid: paidL }),
      paidLeads: m(G ? paidL : null, GP ? paidLP : null),
      formViews: traffic.formViews,
      starts: m(apW.started, apP.started, { note: 'apply page; Typeform (barbershop QR) not counted' }),
      applications: m(appsAll.length, appsPrev.length, { bySource: bySrc, qualified: fitKnown.length ? fitYes : null, qualifiedOf: fitKnown.length }),
      booked: m(booked, GP ? GP.booked : null, { fromDms: dmBooked, note: ghlOn ? null : 'Needs GoHighLevel', held: G ? G.held : null, upcoming7: ghlOn && HQ.isNum(ghl.upcoming7) ? ghl.upcoming7 : null }),
      showed: m(G && marked ? G.showed : null, GP && (GP.showed + GP.noShow) ? GP.showed : null, { note: showNote, noShow: G && marked ? G.noShow : null }),
      outreach: m(G ? G.outreach : null, GP ? GP.outreach : null, { note: ghlOn ? null : 'Needs GoHighLevel' }),
      replied: m(G ? G.replied : null, GP ? GP.replied : null),
      costPerBooked: m(null, null, { note: 'Needs ad spend' }),
      rates: {
        viewToStart: apW.opened ? HQ.pct(apW.started, apW.opened) : null,
        viewToApply: traffic.formViews.value ? HQ.pct(appsAll.length, traffic.formViews.value) : null,
        applyToBooked: G && appsAll.length ? HQ.pct(G.booked, appsAll.length) : null, showRate: G && marked ? HQ.pct(G.showed, marked) : null,
        replyRate: G && G.outreach ? HQ.pct(G.replied, G.outreach) : null
      }
    };

    // --- Sales: admin only; all from Stripe + GHL, blank until they're connected
    var sum = state.stripe && state.stripe.summary, stripeOn = !!(state.meta && state.meta.stripeSync && state.meta.stripeSync.connected && sum);
    var sales = {
      connected: { stripe: stripeOn, ghl: ghlOn, stripeOff: !!(state.meta && state.meta.stripeSync && state.meta.stripeSync.off) },
      headline: m(null, null, { label: 'cash collected' }),
      // GHL only knows a sale once a lead is moved to Closed / Won; if nothing in the window was moved or marked, it isn't being kept up to date, so blank, not 0
      closed: m(G && (G.closed || marked) ? G.closed : null, GP && (GP.closed || GP.showed + GP.noShow) ? GP.closed : null, { note: G && !(G.closed || marked) ? 'No lead moved to Closed in GHL' : null }),
      // the plan's 'show to close': sales ÷ calls that showed (not ÷ every call held)
      closeRate: m(G && G.showed && (G.closed || marked) ? HQ.pct(G.closed, G.showed) : null, null),
      avgSale: m(null, null), cac: m(null, null),
      daysToClose: m(G && G.closeDaysN ? Math.round(G.closeDaysSum / G.closeDaysN * 10) / 10 : null, null),
      refunds: m(null, null)
    };
    if (stripeOn) {
      var mon = (Array.isArray(sum.revenueByMonth) ? sum.revenueByMonth : []).filter(function (x) { return x && x.month === today.slice(0, 7); })[0];
      if (period === 'month' && mon && HQ.isNum(mon.amount)) sales.headline.value = mon.amount;
      sales.currency = sum.currency || 'AUD';
      // any window: every successful Stripe payment by Sydney day (stripe_daily), net of refunds
      var sd = Array.isArray(state.stripeDaily) ? state.stripeDaily : null;
      if (sd && sd.length) {
        var cash = function (a, b) { var t = 0, n = 0, nc = 0; sd.forEach(function (r) { var d = r.date || r.id; if (d >= a && d <= b) { t += +r.amount || 0; n += +r.payments || 0; nc += +r.newClients || 0; } }); return { t: Math.round(t * 100) / 100, n: n, nc: nc }; };
        var c0 = cash(R.from, R.to), c1 = cash(R.prevFrom, R.prevTo);
        sales.headline = m(c0.t, c1.t, { label: 'cash collected' });
        sales.payments = m(c0.n, c1.n); sales.newPayers = m(c0.nc, c1.nc);
      }
      if (HQ.isNum(sum.refundedTotal)) sales.refundsAllTime = sum.refundedTotal;
    }

    // --- Delivery: client counts arrive from hq_delivery_counts (names stay admin only); money rows need Stripe
    var dc = state.deliveryCounts || null;
    var pastStay = HQ.stripeRetention(stripeOn ? state.stripe.customers : null), UE = HQ.unitEcon(pastStay);
    var delivery = {
      // paying clients only: 1FIT's active list minus the ones marked free coaching in Revenue (14 Nov 2026: Jordan doesn't
      // want non-paying clients in the client count, churn or plan progress)
      headline: m(HQ.payingActive(dc, stripeOn ? state.stripe.customers : null), null, { label: 'paying clients', free: HQ.freeClients(stripeOn ? state.stripe.customers : null) }),
      // challenge_members.joinedAt is the day the daily 1FIT scan first saw someone (most on its first run), not when
      // they started coaching, so "joined" and the average stay from it are wrong. Joined stays blank and the stay
      // is the working number until real 1FIT start dates are filled in (HQ.UNIT_ECON.realJoinDates).
      churned: m(HQ.leftIn(dc, state.meta && state.meta.deliveryManual, state.deliveryByDay, R.from, R.to), null), joined: m(dc && HQ.UNIT_ECON.realJoinDates ? dc.joined : null, null),
      avgWeeks: m(HQ.UNIT_ECON.realJoinDates ? (dc && dc.avgWeeks != null ? +dc.avgWeeks : null) : UE.weeks, null),
      checkinsOnTime: m(dc ? dc.checkinsOnTime : null, null),
      checkinReplyTime: m(null, null),
      referrals: m(appsAll.filter(function (x) { return String(x.medium || '').toLowerCase() === 'referral'; }).length, appsPrev ? appsPrev.filter(function (x) { return String(x.medium || '').toLowerCase() === 'referral'; }).length : null),
      mrr: m(stripeOn && HQ.isNum(sum.mrr) ? sum.mrr : null, null),
      // same count as the Revenue page's Overdue box: current 1FIT clients past their usual payment date
      // (sum.risks also holds every unpaid Stripe invoice of the last 400 days, past clients included)
      failedPayments: m(stripeOn && Array.isArray(state.stripe.customers) ? state.stripe.customers.filter(function (c) { return c && c.status === 'Overdue' && c.in1Fit !== false && c.nextDue; }).length : null, null),
      ltv: m(stripeOn && HQ.isNum(sum.avgLifetimeValue) ? sum.avgLifetimeValue : null, null),
      // what past clients really did, from Stripe (first to last payment plus one usual gap); checks the working numbers
      pastStay: pastStay, unit: UE
    };

    // --- the one line at the top: where people drop out between content and a call (facts only, no targets yet)
    var leak = null, reach = traffic.reach.value, taps = traffic.linkTaps.value, fv = traffic.formViews.value;
    if (HQ.isNum(reach) && HQ.isNum(taps) && reach > 0) {
      leak = { text: HQ.num(taps) + ' of ' + HQ.compact(reach) + ' people reached tapped your link' + (HQ.isNum(fv) ? ', ' + HQ.num(fv) + ' opened the form' : '') + ' and ' + HQ.num(appsAll.length) + ' applied.', stage: 'traffic-to-form' };
    } else if (HQ.isNum(fv) && fv > 0) {
      leak = { text: HQ.num(fv) + ' people opened the form and ' + HQ.num(appsAll.length) + ' applied.', stage: 'form' };
    }

    // --- Do today: at most 3 things
    var todo = [];
    var unworked = HQ.appsUnworked(state.tfResponses, now, 14);
    if (unworked.length) todo.push({ key: 'apps', label: 'Applications to call', count: unworked.length, go: 'apps' });
    var cq = (state.contentQueue || []).filter(function (q) { return q.status === 'awaiting_approval'; });
    if (cq.length) todo.push({ key: 'approve', label: 'Reels waiting for your approval', count: cq.length, go: 'content' });
    var rc = state.routineCalls && state.routineCalls.dates, calls = null;
    if (rc) { calls = 0; HQ.dayRange(today, HQ.addDays(today, 6)).forEach(function (d) { if (rc[d] && HQ.isNum(rc[d].count)) calls += rc[d].count; }); }
    if (opts.dmScanOk && opts.dmsWaiting) todo.unshift({ key: 'dms', label: 'DMs waiting on you', count: opts.dmsWaiting, go: 'dms' });
    // data jobs that keep the numbers honest: unmarked sales calls blank the show rate, unclosed wins blank sales and CAC
    if (G && G.unmarked) todo.splice(1, 0, { key: 'mark', label: 'Sales calls to mark Showed / No-show in GoHighLevel', count: G.unmarked, go: 'leadflow' });
    var np = sales.newPayers && sales.newPayers.value, gc = G ? G.closed || 0 : 0;
    if (HQ.isNum(np) && np > gc) todo.splice(1, 0, { key: 'close', label: 'New paying clients to move to Closed / Won in GoHighLevel', count: np - gc, go: 'sales', admin: true });
    if (calls) todo.push({ key: 'calls', label: 'Calls in the next 7 days', count: calls, go: null });

    // --- the business in four numbers (13 Nov 2026, "make the business simple"): people see the content, some become
    // leads, each client costs something to get, and they stay a while. Cost and stay use the working numbers
    // (HQ.UNIT_ECON) until real 1FIT start dates and closed sales in GoHighLevel can replace them.
    var U = UE, adsW = HQ.adsSum(state.adsDaily, R.from, R.to);
    var simple = {
      seen: traffic.views, newFollowers: traffic.headline.value,
      leads: leads.headline, viewsPerLead: HQ.isNum(traffic.views.value) && leads.headline.value ? Math.round(traffic.views.value / leads.headline.value) : null,
      cac: U.cac, cacTarget: HQ.CAC_PLAN.target, adSpend: adsW ? Math.round(adsW.spend) : null,
      active: delivery.headline.value, left: delivery.churned.value, stayMonths: U.months, ltv: U.ltv, actual: U.actual, ratio: U.ratio, actualRatio: U.actualRatio,
      cash: sales.headline.value
    };
    // churn = clients who left in the window ÷ clients at its start (active now + those who left); the plan's measure
    var act = delivery.headline.value, lft = delivery.churned.value;
    delivery.churnPct = { value: HQ.isNum(act) && HQ.isNum(lft) && act + lft > 0 ? Math.round(lft / (act + lft) * 100) : null, prev: null, change: null };
    simple.churnPct = delivery.churnPct.value;
    var pq = HQ.planQuarter(today);
    simple.plan = { leadsMonth: pq.leadsMonth, churnMax: pq.churnMax, clients: pq.clients, label: pq.label, followersDay: '10 to 15' };

    return { today: today, range: R, period: period, traffic: traffic, leads: leads, sales: sales, delivery: delivery, leak: leak, simple: simple, todo: todo.slice(0, 3) };
  };
  HQ.compact = function (v) {
    if (!HQ.isNum(v)) return '–'; var a = Math.abs(v);
    if (a >= 1e6) return (Math.round(v / 1e5) / 10).toString().replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return Math.round(v / 1e3) + 'k';
    if (a >= 1e3) return (Math.round(v / 100) / 10).toString().replace(/\.0$/, '') + 'k';
    return HQ.num(v);
  };


  /* ---------- 2027 Master Plan: funnels, targets and the Friday scorecard ----------
     Funnel = how a person first reached the apply page (or Typeform), read from the link's utm tags.
     Keep HQ.funnelOf in step with funnelOf() in supabase/functions/ghl-sync/index.ts. */
  HQ.FUNNELS = [
    { key: 'story', label: 'Story CTA' },
    { key: 'bio', label: 'Link in bio' },
    { key: 'offplatform', label: 'Off-platform' },
    { key: 'paid_direct', label: 'Paid ads · direct' },
    { key: 'paid_indirect', label: 'Paid ads · indirect' }
  ];
  HQ.FUNNEL_LABEL = { story: 'Story CTA', bio: 'Link in bio', offplatform: 'Off-platform', paid_direct: 'Paid ads · direct', paid_indirect: 'Paid ads · indirect', dm_outreach: 'DM outreach', unknown: 'No tag' };
  HQ.funnelOf = function (utm, source) {
    var u = utm || {};
    var m = String(u.utm_medium || '').toLowerCase(), s = String(u.utm_source || '').toLowerCase();
    var c = String(u.utm_content || source || '').toLowerCase(), camp = String(u.utm_campaign || '').toLowerCase();
    if (/test/.test(c)) return 'test';
    if (m === 'story') return 'story';
    if (m === 'bio' || c === 'link_in_bio') return 'bio';
    if (/^(paid|ads?|cpc|paid_social)$/.test(m) || /^(fb|facebook|meta)(_?ads?)?$/.test(s)) return /(vsl|training|email|youtube|compounding|indirect)/.test(camp + ' ' + c) ? 'paid_indirect' : 'paid_direct';
    if (/^(offline|qr|poster|referral|affiliate|collab|email|partner)$/.test(m)) return 'offplatform';
    return 'unknown';
  };
  // Typeform is only used at the barbershop since the tagged apply page went live (12 Nov 2026), so an untagged Typeform from then on is off-platform.
  HQ.TYPEFORM_OFFLINE_FROM = '2026-11-12';
  HQ.typeformFunnel = function (utm, source, at) {
    var f = HQ.funnelOf(utm, source);
    return f === 'unknown' && String(at || '') >= HQ.TYPEFORM_OFFLINE_FROM ? 'offplatform' : f;
  };
  // the corporate man: age 25 to 40 (the apply page asks age; the work question isn't on it yet)
  HQ.ageInMarket = function (age) {
    var a = String(age || '').replace(/[‒-―−]/g, '-').trim();
    if (!a) return null;
    return /^(25-30|31-35|36-40)$/.test(a);
  };

  // Every application, apply page and Typeform together, one per person (first one wins), test entries dropped.
  HQ.allApplications = function (state) {
    var out = [];
    (state.appSessions || []).forEach(function (r) {
      var d = r.data || r; if (!d.submitted) return;
      var ct = d.contact || {}, at = d.submittedAt || d.lastSeenAt || d.firstSeenAt;
      out.push({ id: 'a:' + (r.id || ''), at: at, day: at ? HQ.sydDay(at) : null, funnel: HQ.funnelOf(d.utm), medium: (d.utm && d.utm.utm_medium) || null, inMarket: HQ.ageInMarket(d.answers && d.answers.age), email: ct.email, phone: ct.phoneE164 || ct.phone, from: 'apply' });
    });
    (state.tfResponses || []).forEach(function (r) {
      var at = r.submittedAt;
      out.push({ id: 't:' + r.id, at: at, day: at ? HQ.sydDay(at) : null, funnel: HQ.typeformFunnel(r.utm, r.source, at), medium: (r.utm && r.utm.utm_medium) || null, inMarket: null, email: r.email, phone: r.phone, from: 'typeform' });
    });
    out.sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
    var seen = {};
    return out.filter(function (a) {
      if (a.funnel === 'test' || !a.day) return false;
      var keys = [a.email ? String(a.email).trim().toLowerCase() : null, a.phone ? String(a.phone).replace(/\D/g, '').slice(-9) : null].filter(function (k) { return k && k.length > 3; });
      var dup = keys.some(function (k) { return seen[k]; });
      keys.forEach(function (k) { seen[k] = 1; });
      return !dup;
    });
  };
  /* ---------- the apply page, question by question (tasteformcoaching.vercel.app/apply, app_sessions) ----------
     Each session records a timestamp per step it got past (steps.open/start/goal/tried/age/name/email) and submitted.
     "Reached" a screen = got past the one before it. Lost at a screen = reached it but never answered it. */
  HQ.APPLY_STEPS = [
    { k: 'open', label: 'Landed on the page', short: 'Landed' },
    { k: 'start', label: 'Tapped start', short: 'Start' },
    { k: 'goal', label: 'Q1 · What are you hoping to achieve in 90 days?', short: 'Q1 Goal' },
    { k: 'tried', label: 'Q2 · What have you tried that didn’t stick?', short: 'Q2 Tried before' },
    { k: 'age', label: 'Q3 · Age', short: 'Q3 Age' },
    { k: 'name', label: 'Q4 · First name', short: 'Q4 Name' },
    { k: 'email', label: 'Q5 · Email', short: 'Q5 Email' },
    { k: 'submitted', label: 'Q6 · Mobile → submitted', short: 'Q6 Mobile' }
  ];
  HQ.applyFunnel = function (state, from, to) {
    var S = HQ.APPLY_STEPS, sess = [];
    (state.appSessions || []).forEach(function (r) {
      var d = r.data || r, at = d.firstSeenAt; if (!at) return;
      var day = HQ.sydDay(at); if ((from && day < from) || (to && day > to)) return;
      if (HQ.funnelOf(d.utm) === 'test') return;
      var st = Object.assign({}, d.steps || {}); if (!st.open) st.open = at; if (d.submitted && !st.submitted) st.submitted = d.submittedAt || d.lastSeenAt || at;
      sess.push({ id: r.id, d: d, st: st, day: day });
    });
    var med = function (a) { if (!a.length) return null; var x = a.slice().sort(function (p, q) { return p - q; }), m = Math.floor(x.length / 2); return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
    var steps = S.map(function (s, i) {
      var done = sess.filter(function (x) { return !!x.st[s.k]; });
      var reached = i === 0 ? sess.length : sess.filter(function (x) { return !!x.st[S[i - 1].k]; }).length;
      var secs = i === 0 ? [] : done.map(function (x) { var a = Date.parse(x.st[S[i - 1].k]), b = Date.parse(x.st[s.k]); return (b - a) / 1000; }).filter(function (v) { return v >= 0 && v < 3600; });
      return { k: s.k, label: s.label, short: s.short, reached: reached, done: done.length, lost: Math.max(0, reached - done.length), lostPct: reached ? Math.round((reached - done.length) / reached * 100) : null, medianSecs: secs.length ? Math.round(med(secs)) : null, ofOpened: sess.length ? Math.round(done.length / sess.length * 100) : null };
    });
    // the biggest leak = most people lost at one screen (after landing)
    var worst = null; steps.forEach(function (x, i) { if (i === 0) return; if (x.lost > 0 && (!worst || x.lost > worst.lost)) worst = x; });
    // answers: everyone who answered vs those who then finished
    var ans = {};
    ['goal', 'tried', 'age'].forEach(function (q) {
      var m = {}; sess.forEach(function (x) { var v = x.d.answers && x.d.answers[q]; if (!v) return; var o = m[v] || (m[v] = { v: v, n: 0, sub: 0 }); o.n++; if (x.st.submitted) o.sub++; });
      ans[q] = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; });
    });
    var by = function (fn) { var m = {}; sess.forEach(function (x) { var k = fn(x) || 'unknown'; var o = m[k] || (m[k] = { k: k, opened: 0, started: 0, submitted: 0 }); o.opened++; if (x.st.start) o.started++; if (x.st.submitted) o.submitted++; }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.submitted - a.submitted || b.opened - a.opened; }); };
    var src = by(function (x) { var u = x.d.utm || {}; return HQ.funnelOf(u) + '|' + (u.utm_content || u.utm_campaign || ''); });
    var device = by(function (x) { return x.d.device; });
    var daily = {}; sess.forEach(function (x) { var o = daily[x.day] || (daily[x.day] = { opened: 0, submitted: 0 }); o.opened++; if (x.st.submitted) o.submitted++; });
    var applicants = sess.filter(function (x) { return x.st.submitted; }).map(function (x) { var c = x.d.contact || {}, a = x.d.answers || {}, u = x.d.utm || {}; return { id: x.id, at: x.st.submitted, firstName: c.firstName || '', email: c.email || '', phone: c.phoneE164 || c.phone || '', goal: a.goal || '', tried: a.tried || '', age: a.age || '', inMarket: HQ.ageInMarket(a.age), funnel: HQ.funnelOf(u), tag: u.utm_content || u.utm_campaign || '', device: x.d.device || '' }; })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    return { sessions: sess.length, steps: steps, worst: worst, answers: ans, sources: src, devices: device, daily: daily, applicants: applicants,
      opened: sess.length, started: steps[1].done, submitted: steps[steps.length - 1].done };
  };
  // apply-page visits (opened / started / submitted) per funnel, test entries dropped
  HQ.applySessions = function (state, from, to) {
    var o = {};
    (state.appSessions || []).forEach(function (r) {
      var d = r.data || r, at = d.firstSeenAt; if (!at) return;
      var day = HQ.sydDay(at); if (day < from || day > to) return;
      var f = HQ.funnelOf(d.utm); if (f === 'test') return;
      var x = o[f] || (o[f] = { opened: 0, started: 0, submitted: 0 });
      x.opened++; if (d.steps && d.steps.start) x.started++; if (d.submitted) x.submitted++;
    });
    return o;
  };
  HQ.ghlFunnelSum = function (ghl, from, to) {
    if (!ghl || !ghl.connected || !ghl.days) return null;
    var o = {};
    Object.keys(ghl.days).forEach(function (k) {
      if (k < from || k > to) return; var bf = (ghl.days[k] || {}).byFunnel || {};
      Object.keys(bf).forEach(function (f) { var x = o[f] || (o[f] = { booked: 0, held: 0, showed: 0, noShow: 0, closed: 0 }); Object.keys(x).forEach(function (g) { if (HQ.isNum(+bf[f][g])) x[g] += +bf[f][g]; }); });
    });
    return o;
  };
  HQ.adsSum = function (adsDaily, from, to) {
    var o = { days: 0, spend: 0, impressions: 0, linkClicks: 0, results: 0 };
    (adsDaily || []).forEach(function (r) { var k = r.date || r.id; if (!HQ.isDayKey(k) || k < from || k > to) return; o.days++; ['spend', 'impressions', 'linkClicks', 'results'].forEach(function (f) { if (HQ.isNum(+r[f])) o[f] += +r[f]; }); });
    return o.days ? o : null;
  };

  // Funnel view for the Leads page: one entry per funnel plus "all"
  HQ.computeFunnels = function (state, now, period) {
    var today = HQ.sydDay(now == null ? Date.now() : now), R = HQ.pillarRange(today, period);
    var apps = HQ.allApplications(state).filter(function (a) { return a.day >= R.from && a.day <= R.to; });
    var ses = HQ.applySessions(state, R.from, R.to);
    var ghl = state.meta && state.meta.ghlSync, G = HQ.ghlFunnelSum(ghl, R.from, R.to), g0 = HQ.ghlSum(ghl, R.from, R.to);
    // Typeform form opens by tag (old form, still live alongside the apply page)
    var tfOpen = {}; (state.tfDaily || []).forEach(function (d) { var k = d.date || d.id; if (!HQ.isDayKey(k) || k < R.from || k > R.to) return; var bs = d.bySource || {}; Object.keys(bs).forEach(function (s) { var f = HQ.funnelOf(null, s); if (f !== 'test') tfOpen[f] = (tfOpen[f] || 0) + (+bs[s].visits || 0); }); });
    var ads = HQ.adsSum(state.adsDaily, R.from, R.to);
    var stories = (state.igStories || []).filter(function (s) { var d = s.postedAtDate ? HQ.sydDay(s.postedAtDate) : null; return d && d >= R.from && d <= R.to; });
    var sumS = function (f) { var have = false, t = 0; stories.forEach(function (s) { if (HQ.isNum(s[f])) { have = true; t += s[f]; } }); return have ? t : null; };
    var keys = HQ.FUNNELS.map(function (f) { return f.key; }).concat(['dm_outreach', 'unknown']);
    var out = {};
    keys.forEach(function (k) {
      var a = apps.filter(function (x) { return x.funnel === k; }), s = ses[k] || null, gg = G && G[k] || null;
      var fit = a.filter(function (x) { return x.inMarket != null; });
      out[k] = {
        key: k, label: HQ.FUNNEL_LABEL[k],
        opened: (s || tfOpen[k] != null || state.appSessions) ? (s ? s.opened : 0) + (tfOpen[k] || 0) : null,
        started: s ? s.started : null, openedApply: s ? s.opened : (state.appSessions ? 0 : null),
        applications: a.length,
        inMarket: fit.length ? HQ.pct(fit.filter(function (x) { return x.inMarket; }).length, fit.length) : null, inMarketOf: fit.length,
        booked: G ? (gg ? gg.booked : 0) : null, held: G ? (gg ? gg.held : 0) : null,
        showed: G && gg && (gg.showed + gg.noShow) ? gg.showed : null, noShow: G && gg ? gg.noShow : null,
        closed: G ? (gg ? gg.closed : 0) : null,
        byMedium: a.reduce(function (o, x) { var m = x.medium || 'untagged'; o[m] = (o[m] || 0) + 1; return o; }, {})
      };
    });
    // funnel-specific inputs
    out.story.inputs = { stories: stories.length, views: sumS('views'), linkTaps: sumS('linkClicks'), stickerTaps: sumS('stickerTaps'), replies: sumS('replies') };
    out.paid_direct.inputs = { spend: ads ? ads.spend : null, clicks: ads ? ads.linkClicks : null, instantForms: g0 ? g0.paidLeads || 0 : null };
    out.paid_indirect.inputs = { spend: ads ? ads.spend : null };
    var paidClosed = (out.paid_direct.closed || 0) + (out.paid_indirect.closed || 0);
    out.paid_direct.inputs.costPerClient = ads && paidClosed ? Math.round(ads.spend / paidClosed) : null;
    var all = { key: 'all', label: 'All funnels', applications: apps.length, opened: 0, started: null, booked: g0 ? g0.booked : null, held: g0 ? g0.held : null, showed: g0 && (g0.showed + g0.noShow) ? g0.showed : null, noShow: g0 ? g0.noShow : null, closed: g0 ? g0.closed : null };
    keys.forEach(function (k) { all.opened += out[k].opened || 0; if (out[k].started != null) all.started = (all.started || 0) + out[k].started; });
    var fitAll = apps.filter(function (x) { return x.inMarket != null; });
    all.inMarket = fitAll.length ? HQ.pct(fitAll.filter(function (x) { return x.inMarket; }).length, fitAll.length) : null; all.inMarketOf = fitAll.length;
    out.all = all;
    return { range: R, funnels: out, ghl: !!G, ads: !!ads, untagged: out.unknown.applications };
  };

  /* ---------- the plan's numbers (2027 Master Plan, sections 1, 3, 10, 11) ---------- */
  HQ.PLAN = {
    start: '2026-11-16', weeks: 13,
    quarters: [
      { end: '2026-12-31', label: 'Dec 2026', clients: 14, income: 7000, salesMonth: 3, leadsMonth: 15, fit: null, churnMax: 10, adBudget: 750 },
      { end: '2027-03-31', label: 'Mar 2027', clients: 23, income: 13000, salesMonth: 5, leadsMonth: 25, fit: 50, churnMax: 7, adBudget: 1250 },
      { end: '2027-06-30', label: 'Jun 2027', clients: 34, income: 20000, salesMonth: 6, leadsMonth: 30, fit: 70, churnMax: 6, adBudget: 1500 },
      { end: '2027-09-30', label: 'Sep 2027', clients: 48, income: 28000, salesMonth: 7, leadsMonth: 35, fit: 70, churnMax: 6, adBudget: 1750 },
      { end: '2027-12-31', label: 'Dec 2027', clients: 60, income: 35000, salesMonth: 7, leadsMonth: 35, fit: 70, churnMax: 6, adBudget: 1750 }
    ],
    mainThing: ['Bio, highlights and pinned posts changed to the corporate man', 'Pre-call form live, work question first', 'Ads back on: 3 angles naming the corporate man', 'Weekly group call starts: Friday night, for fun', 'First long-form out, second by 28 Dec', 'Delivery only. Check-ins as normal', 'Delivery only. Check-ins as normal', 'Editor starts', 'Market check: your setter’s last 50 leads, tagged by job', 'First collab locked in', 'Filming day: long-form, plus static and B-roll for 3 ad angles', 'Fast Track live, budget set from the sales target', '90 day review: scorecard against the plan']
  };
  HQ.planQuarter = function (day) { var q = HQ.PLAN.quarters; for (var i = 0; i < q.length; i++) if (day <= q[i].end) return q[i]; return q[q.length - 1]; };
  // weekly targets; dir 'min' = at least, 'max' = at most, 'range' = between
  HQ.planTarget = function (key, weekStart) {
    var q3 = weekStart >= '2027-07-01';
    switch (key) {
      case 'leads': return { dir: 'min', v: q3 ? 8 : 4, text: (q3 ? 8 : 4) + '+' };
      case 'booked': return { dir: 'min', v: q3 ? 4 : 2, text: (q3 ? 4 : 2) + '+' };
      case 'showRate': return { dir: 'min', v: 70, text: '70%+' };
      case 'sales': return { dir: 'min', v: q3 ? 2 : 1, text: (q3 ? 2 : 1) + '+' };
      case 'lost': return { dir: 'max', v: 0, text: 'under 1' };
      case 'adCost': return { dir: 'max', v: 250, text: '$250 max' };
      case 'referrals': return { dir: 'none', text: '5% of clients a month' };
      case 'longform': return weekStart >= '2027-01-01' ? { dir: 'min', v: 1, text: '1 a week' } : { dir: 'none', text: 'from January' };
      case 'hours': return { dir: 'max', v: weekStart >= '2027-10-01' ? 45 : 50, text: (weekStart >= '2027-10-01' ? 45 : 50) + ' max' };
      case 'followers': return { dir: 'range', lo: 70, hi: 105, text: '70 to 105' };
      case 'fit': return weekStart >= '2027-06-01' ? { dir: 'min', v: 70, text: '70%+' } : (weekStart >= '2027-01-01' ? { dir: 'min', v: 50, text: '50% by March' } : { dir: 'none', text: '50% by March' });
    }
    return { dir: 'none', text: '' };
  };
  HQ.SCORE_ROWS = [
    { key: 'leads', label: 'Leads' }, { key: 'booked', label: 'Calls booked' }, { key: 'showRate', label: 'Show rate', fmt: 'pct' },
    { key: 'sales', label: 'Sales' }, { key: 'lost', label: 'Clients lost' }, { key: 'adCost', label: 'Ad cost per client', fmt: 'money' },
    { key: 'referrals', label: 'Referrals' }, { key: 'longform', label: 'Long-form videos', note: 'from YouTube' }, { key: 'hours', label: 'Your hours', note: 'from the Time page' },
    { key: 'followers', label: 'New followers' }, { key: 'fit', label: 'Right market fit', fmt: 'pct' }
  ];
  HQ.scoreStatus = function (t, v) {
    if (v == null || !t || t.dir === 'none') return null;
    if (t.dir === 'min') return v >= t.v ? 'good' : 'bad';
    if (t.dir === 'max') return v <= t.v ? 'good' : 'bad';
    if (t.dir === 'range') return v >= t.lo ? 'good' : 'bad'; // over 105 is fine
    return null;
  };
  // long-form YouTube uploads (Videos tab, Shorts excluded) dated in [from, to]; null until the sync has run once
  HQ.youtubeLongIn = function (yt, from, to) {
    if (!yt || !yt.lastSyncAt || !yt.videos) return null;
    return Object.keys(yt.videos).filter(function (k) { var d = yt.videos[k] && yt.videos[k].day; return d && d >= from && d <= to; }).length;
  };
  HQ.scorecard = function (state, now) {
    var today = HQ.sydDay(now == null ? Date.now() : now), P = HQ.PLAN;
    var meta = state.meta || {}, ghl = meta.ghlSync, manual = (meta.scorecard && meta.scorecard.weeks) || {};
    var apps = HQ.allApplications(state);
    var byDayAcc = {}; (state.igAccount || []).forEach(function (r) { var k = r.date || r.id; if (HQ.isDayKey(k) && HQ.isNum(r.followers)) byDayAcc[k] = r.followers; });
    var dl = state.deliveryByDay || null;
    var weeks = [];
    for (var i = 0; i < P.weeks; i++) {
      var ws = HQ.addDays(P.start, i * 7), we = HQ.addDays(ws, 6);
      var state_ = ws > today ? 'future' : (we >= today ? 'current' : 'done');
      var w = { n: i + 1, start: ws, end: we, state: state_, main: P.mainThing[i] || null, cells: {} };
      if (state_ !== 'future') {
        var to = we < today ? we : today;
        var a = apps.filter(function (x) { return x.day >= ws && x.day <= to; });
        var g = HQ.ghlSum(ghl, ws, to), gf = HQ.ghlFunnelSum(ghl, ws, to), ads = HQ.adsSum(state.adsDaily, ws, to);
        var paidSales = gf ? ((gf.paid_direct && gf.paid_direct.closed) || 0) + ((gf.paid_indirect && gf.paid_indirect.closed) || 0) : 0;
        var lost = null; if (dl) { lost = 0; Object.keys(dl).forEach(function (k) { if (k >= ws && k <= to) lost += +dl[k].left || 0; }); }
        var f0 = byDayAcc[HQ.addDays(ws, -1)], f1 = null; for (var j = 0; j < 3 && f1 == null; j++) { var kk = HQ.addDays(to, -j); if (kk >= ws && byDayAcc[kk] != null) f1 = byDayAcc[kk]; }
        var fit = a.filter(function (x) { return x.inMarket != null; });
        var mw = manual[ws] || {};
        var v = {
          leads: a.length + (g ? g.paidLeads || 0 : 0),
          booked: g ? g.booked : null,
          showRate: g && (g.showed + g.noShow) ? HQ.pct(g.showed, g.showed + g.noShow) : null,
          sales: g && (g.closed || g.showed + g.noShow) ? g.closed : null,
          lost: lost,
          adCost: ads && paidSales ? Math.round(ads.spend / paidSales) : null,
          referrals: a.filter(function (x) { return String(x.medium || '').toLowerCase() === 'referral'; }).length,
          longform: HQ.isNum(+mw.longform) && mw.longform !== '' && mw.longform != null ? +mw.longform : HQ.youtubeLongIn(meta.youtubeSync, ws, to),
          hours: mw.hours != null && mw.hours !== '' && HQ.isNum(+mw.hours) ? +mw.hours : (state.timeHours && HQ.isNum(state.timeHours[ws]) ? state.timeHours[ws] : null),
          followers: f0 != null && f1 != null ? f1 - f0 : null,
          fit: fit.length ? HQ.pct(fit.filter(function (x) { return x.inMarket; }).length, fit.length) : null
        };
        HQ.SCORE_ROWS.forEach(function (r) {
          var t = HQ.planTarget(r.key, ws), val = v[r.key];
          w.cells[r.key] = { value: val, target: t, status: state_ === 'current' && t.dir === 'min' && HQ.scoreStatus(t, val) === 'bad' ? null : HQ.scoreStatus(t, val) };
        });
      }
      weeks.push(w);
    }
    // three red weeks in a row (finished weeks only) makes it next week's main thing
    var flags = [];
    HQ.SCORE_ROWS.forEach(function (r) {
      var streak = 0; for (var i = weeks.length - 1; i >= 0; i--) { var w = weeks[i]; if (w.state !== 'done') continue; if (w.cells[r.key] && w.cells[r.key].status === 'bad') streak++; else break; }
      if (streak >= 3) flags.push({ key: r.key, label: r.label, weeks: streak });
    });
    var cur = weeks.filter(function (w) { return w.state === 'current'; })[0] || null;
    var q = HQ.planQuarter(today);
    return { today: today, weeks: weeks, current: cur, flags: flags, started: today >= P.start, quarter: q, nextWeek: weeks.filter(function (w) { return w.state === 'future'; })[0] || null };
  };

  /* ---------- CAC per funnel, and working back from the plan's target ----------
     Costs live in meta/costs: { months: { 'YYYY-MM': { byFunnel: { story: 0, bio: 0, offplatform: 120, ... }, shared: 300, items: [...] } } },
     written by Claude from Jordan's month-end bank statement (no editor cost). Ad spend comes from the Meta sync:
     campaigns named "fasttrack" go to Paid ads · direct, "compounding" to Paid ads · indirect.
     Clients = GHL leads moved to Closed / Won in that month, by funnel. Blank until both halves exist. */
  HQ.CAC_PLAN = { target: 250, closeRate: 50, showRate: 70, leadToSale: 20 }; // plan: $250 max ad cost per client, 50%+ show to close, 70%+ show rate, 5 leads make a sale
  // Working numbers Jordan set on 13 Nov 2026, used until 1FIT / Stripe / Newie history replaces them.
  // LTV = 4.2 months kept x $125 a week (pre price rise). Old CAC = Meta spend since 1 Jan 2026 (both ad accounts,
  // read in Ads Manager; earlier spend is sunk) / clients who came from ads (Ben R, Aaron A, Sami E, Laini G, Charbel Y).
  // 14 Nov 2026 (Jordan): theoretical LTV = $299 upfront + $125 a week x how long clients who LEFT stayed (past clients
  // only, so it's conservative); actual LTV = what those past clients really paid in Stripe. 4.2 months is the fallback
  // when Stripe isn't loaded (non-admins).
  HQ.UNIT_ECON = { retentionMonths: 4.2, pricePerWeek: 125, upfront: 299, set: '2026-11-14', realJoinDates: false,
    baseline: { from: '2026-01-01', to: '2026-11-13', adSpend: 5370, clients: 5 } };
  // Past clients in Stripe (status "Past client": paid before, no longer in 1FIT): how long they paid for and what
  // they paid in total. Stay = first to last payment plus one usual gap between payments (a month with one payment).
  HQ.stripeRetention = function (customers) {
    if (!Array.isArray(customers)) return null;
    var D = 86400000, rows = customers.filter(function (c) { return c && c.status === 'Past client' && c.firstPaid && c.lastPaid && HQ.isNum(c.totalPaid); });
    if (!rows.length) return null;
    var months = rows.map(function (c) {
      var a = Date.parse(c.firstPaid), b = Date.parse(c.lastPaid), n = +c.paymentsCount || 1;
      if (isNaN(a) || isNaN(b)) return null;
      var gap = n > 1 ? (b - a) / (n - 1) : 30.44 * D;
      return ((b - a) + gap) / (30.44 * D);
    }).filter(function (x) { return x != null; });
    var sorted = months.slice().sort(function (x, y) { return x - y; });
    var paid = rows.reduce(function (t, c) { return t + c.totalPaid; }, 0);
    return { n: months.length, avgMonths: Math.round(months.reduce(function (t, x) { return t + x; }, 0) / months.length * 10) / 10,
      medianMonths: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10, avgPaid: Math.round(paid / rows.length) };
  };
  HQ.unitEcon = function (pastStay) {
    var U = HQ.UNIT_ECON, b = U.baseline, real = !!(pastStay && HQ.isNum(pastStay.avgMonths));
    var months = real ? pastStay.avgMonths : U.retentionMonths;
    var weeks = Math.round(months * 52 / 12 * 10) / 10, ltv = Math.round(U.upfront + weeks * U.pricePerWeek);
    var actual = real && HQ.isNum(pastStay.avgPaid) ? pastStay.avgPaid : null;
    var cac = b.clients ? Math.round(b.adSpend / b.clients) : null, r = function (v) { return cac && v != null ? Math.round(v / cac * 10) / 10 : null; };
    return { months: months, weeks: weeks, fromStripe: real, pastClients: real ? pastStay.n : null, price: U.pricePerWeek, upfront: U.upfront,
      ltv: ltv, actual: actual, cac: cac, adSpend: b.adSpend, clients: b.clients, from: b.from, to: b.to,
      ratio: r(ltv), actualRatio: r(actual), planRatio: Math.round(ltv / HQ.CAC_PLAN.target * 10) / 10 };
  };
  HQ.adFunnelOf = function (name) {
    var n = String(name || '').toLowerCase();
    if (/fast\s*-?_?track/.test(n)) return 'paid_direct';
    if (/compounding/.test(n)) return 'paid_indirect';
    return null;
  };
  HQ.monthBounds = function (ym) {
    var from = ym + '-01', d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0));
    return { from: from, to: ym + '-' + String(d.getUTCDate()).padStart(2, '0') };
  };
  HQ.computeCac = function (state, now, ym) {
    var today = HQ.sydDay(now == null ? Date.now() : now);
    ym = ym || today.slice(0, 7);
    var B = HQ.monthBounds(ym), to = B.to < today ? B.to : today;
    var meta = state.meta || {}, ghl = meta.ghlSync;
    var costMonth = meta.costs && meta.costs.months && meta.costs.months[ym] || null;
    var G = HQ.ghlFunnelSum(ghl, B.from, to);
    // ad spend by funnel from campaign names; spend we can't place stays "ads, no funnel in the name"
    var ads = { paid_direct: 0, paid_indirect: 0, other: 0 }, haveAds = false;
    (state.adsCampaigns || []).forEach(function (c) {
      var f = HQ.adFunnelOf(c.name), daily = c.daily || {};
      Object.keys(daily).forEach(function (k) { if (k < B.from || k > to) return; var sp = +(daily[k] && daily[k].spend); if (!HQ.isNum(sp)) return; haveAds = true; ads[f || 'other'] += sp; });
    });
    if (!haveAds) { var tot = HQ.adsSum(state.adsDaily, B.from, to); if (tot) { haveAds = true; ads.other = tot.spend; } }
    // the funnel's own conversion rates over the last 90 days, if there's enough to go on; otherwise the plan's
    var r90 = HQ.ghlFunnelSum(ghl, HQ.addDays(today, -89), today), apps90 = HQ.allApplications(state).filter(function (a) { return a.day >= HQ.addDays(today, -89); });
    var apps = HQ.allApplications(state).filter(function (a) { return a.day >= B.from && a.day <= to; });
    var gAll = HQ.ghlSum(ghl, B.from, to);
    var P = HQ.CAC_PLAN, planBook = Math.round(P.leadToSale / (P.closeRate / 100 * P.showRate / 100));
    var out = {}, totalCost = costMonth ? (+costMonth.shared || 0) : null, totalClients = G ? 0 : null;
    var keys = HQ.FUNNELS.map(function (f) { return f.key; }).concat(['dm_outreach', 'unknown']);
    keys.forEach(function (k) {
      var g = G && G[k] || null, paid = k === 'paid_direct' || k === 'paid_indirect';
      var adSpend = paid && haveAds ? Math.round(ads[k]) : null;
      var listed = costMonth ? (+((costMonth.byFunnel || {})[k]) || 0) : null;
      var cost = listed == null && adSpend == null ? null : (listed || 0) + (adSpend || 0);
      var clients = G ? (g ? g.closed : 0) : null;
      var leads = apps.filter(function (a) { return a.funnel === k; }).length + (k === 'paid_direct' && gAll ? gAll.paidLeads || 0 : 0);
      var booked = G ? (g ? g.booked : 0) : null, showed = g && (g.showed + g.noShow) ? g.showed : null;
      // rates: own numbers when the 90 days hold at least 5 of the step's denominator
      var q = r90 && r90[k] || null, l90 = apps90.filter(function (a) { return a.funnel === k; }).length;
      var rate = function (n, d, plan) { return d >= 5 ? { v: HQ.pct(n, d), own: true } : { v: plan, own: false }; };
      var rc = rate(q ? q.closed : 0, q ? q.showed : 0, P.closeRate), rs = rate(q ? q.showed : 0, q ? q.showed + q.noShow : 0, P.showRate), rb = rate(q ? q.booked : 0, l90, Math.min(100, planBook));
      var target = paid ? P.target : null, back = null;
      if (target) {
        var perShow = target * rc.v / 100, perBook = perShow * rs.v / 100, perLead = perBook * rb.v / 100;
        back = { sale: target, showed: Math.round(perShow), booked: Math.round(perBook), lead: Math.round(perLead), rates: { close: rc, show: rs, book: rb } };
      }
      var per = function (n) { return cost != null && n ? Math.round(cost / n) : null; };
      out[k] = { key: k, label: HQ.FUNNEL_LABEL[k], paid: paid, adSpend: adSpend, listed: listed, cost: cost, clients: clients, leads: leads, booked: booked, showed: showed,
        cac: per(clients), perLead: per(leads), perBooked: per(booked), perShowed: per(showed), target: target, back: back };
      if (cost != null) totalCost = (totalCost || 0) + cost;
      if (G) totalClients += clients || 0;
    });
    if (haveAds && ads.other) totalCost = (totalCost || 0) + Math.round(ads.other);
    return { month: ym, from: B.from, to: to, costsIn: !!costMonth, haveAds: haveAds, unassignedAds: Math.round(ads.other), shared: costMonth ? (+costMonth.shared || 0) : null,
      ghl: !!G, funnels: out, total: { cost: costMonth ? totalCost : null, clients: totalClients, cac: costMonth && totalClients ? Math.round(totalCost / totalClients) : null } };
  };

  /* ---------- Lead list: who reached out and hasn't had a proper chance yet ----------
     Rows come from hq_leads (ghl-leads edge function, hourly, admin only). Clients and lost leads are never flagged.
     Only leads with something in the last 90 days are checked, so old cold contacts don't flood the list. */
  // country from the number: +61 AU, +64 NZ, +44 UK, +1 US / Canada (all kept). Local 04… numbers are Australian.
  HQ.leadCountry = function (phone) {
    var raw = String(phone || '').trim(); if (!raw) return null;
    var d = raw.replace(/[^\d+]/g, '');
    if (/^00/.test(d)) d = '+' + d.slice(2);
    if (d.charAt(0) !== '+') { var n = d.replace(/\D/g, ''); if (/^0[2-478]\d{8}$/.test(n) || /^4\d{8}$/.test(n)) return 'AU'; if (/^61\d{9}$/.test(n)) return 'AU'; return null; }
    if (/^\+61/.test(d)) return 'AU'; if (/^\+64/.test(d)) return 'NZ'; if (/^\+44/.test(d)) return 'UK'; if (/^\+1/.test(d)) return 'US/CA';
    return 'other';
  };
  HQ.LEAD_REASONS = {
    waiting: { label: 'Messaged you, no reply', order: 1 },
    noshow: { label: 'Missed the call, not rebooked', order: 2 },
    applied: { label: 'Applied, no call booked', order: 3 },
    untouched: { label: 'No message from you yet', order: 4 },
    quiet: { label: 'You messaged, no reply since', order: 5 }
  };
  HQ.leadView = function (row, now) {
    var d = row.data || row, t = now == null ? Date.now() : now, H = 3600000;
    var at = function (s) { var x = Date.parse(s || ''); return isNaN(x) ? null : x; };
    var apps = d.applications || [], calls = d.calls || [], conv = d.conv || null, opps = d.opps || [];
    var applied = apps.length ? at(apps[0].at) : null;
    var lastApp = apps.length ? at(apps[apps.length - 1].at) : null;
    var live = calls.filter(function (c) { return c.status !== 'cancelled' && c.status !== 'invalid'; });
    var lastCall = calls.length ? calls[calls.length - 1] : null;
    var upcoming = live.some(function (c) { return at(c.start) > t; });
    var salesOpp = opps.filter(function (o) { return !/cookbook/i.test(o.pipeline || ''); });
    var inbound = conv && conv.lastDir === 'inbound', lastMsg = conv ? at(conv.lastAt) : null;
    var isLead = !!(apps.length || calls.length || salesOpp.length || inbound);
    var times = [at(d.added), applied, lastApp, lastMsg, lastCall ? at(lastCall.start) : null].concat(salesOpp.map(function (o) { return at(o.moved) || at(o.created); })).filter(function (x) { return x != null; });
    var lastTouch = times.length ? Math.max.apply(null, times) : null;
    var v = { id: row.id, name: d.name || d.email || d.phone || 'No name', email: d.email || null, phone: d.phone || null, country: HQ.leadCountry(d.phone), funnel: d.funnel || 'unknown',
      status: d.status || 'open', isLead: isLead, nurture: !!d.nurture, applied: applied, lastTouch: lastTouch, lastMsg: lastMsg, lastDir: conv ? conv.lastDir : null,
      calls: calls.length, upcoming: upcoming, stage: salesOpp.length ? (salesOpp[salesOpp.length - 1].stage || null) : null, reason: null, since: null };
    if (!isLead || v.status !== 'open' || lastTouch == null || t - lastTouch > 90 * 24 * H) return v;
    var lastNoShow = lastCall && (lastCall.status === 'noshow' || lastCall.status === 'cancelled') && at(lastCall.start) < t;
    if (inbound && lastMsg != null && t - lastMsg > 12 * H) { v.reason = 'waiting'; v.since = lastMsg; }
    else if (lastNoShow && !upcoming) { v.reason = 'noshow'; v.since = at(lastCall.start); }
    else if (applied != null && !live.some(function (c) { return at(c.booked || c.start) >= applied - H; }) && t - lastApp > 24 * H) { v.reason = 'applied'; v.since = lastApp; }
    else if (!conv && !calls.length && d.convOk !== false && lastTouch != null && t - lastTouch > 24 * H) { v.reason = 'untouched'; v.since = lastTouch; }
    else if (conv && conv.lastDir === 'outbound' && !upcoming && lastMsg != null && t - lastMsg > 3 * 24 * H) { v.reason = 'quiet'; v.since = lastMsg; }
    return v;
  };
  HQ.leadBoard = function (rows, now) {
    var all = (rows || []).map(function (r) { return HQ.leadView(r, now); });
    var follow = all.filter(function (v) { return v.reason; }).sort(function (a, b) { return (HQ.LEAD_REASONS[a.reason].order - HQ.LEAD_REASONS[b.reason].order) || (a.since - b.since); });
    var byReason = {}; follow.forEach(function (v) { byReason[v.reason] = (byReason[v.reason] || 0) + 1; });
    var noNurture = all.filter(function (v) { return v.isLead && v.status === 'open' && !v.nurture && (v.email || v.phone) && v.country !== 'other'; });
    var outside = all.filter(function (v) { return v.country === 'other'; });
    return { all: all, leads: all.filter(function (v) { return v.isLead; }), follow: follow, byReason: byReason, noNurture: noNurture, outside: outside };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HQ;
  root.HQ = HQ;
})(typeof globalThis !== 'undefined' ? globalThis : this);
