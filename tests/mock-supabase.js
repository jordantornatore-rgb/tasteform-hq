// A tiny in-memory stand-in for the supabase-js client surface that index.html uses:
//   from(t).select('*')                          -> thenable {data: rows}
//   from(t).select('*').order('id').range(a, b)   -> thenable, paged
//   from(t).select('*').eq('id', x).maybeSingle() -> thenable {data: row|null}
//   from(t).select('*').like('id', 'routine:%')   -> thenable
//   from(t).upsert({id, data, updated_at})        -> promise {error:null}
// Rows are {id, data, updated_at}. Loaded into the page by the Playwright tests; never touches the network.
(function (root) {
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function makeMockClient(fixtures, opts) {
    opts = opts || {};
    var tables = {};
    Object.keys(fixtures || {}).forEach(function (t) { tables[t] = (fixtures[t] || []).map(function (r) { return { id: r.id, data: r.data, updated_at: r.updated_at || '2026-10-21T00:00:00Z' }; }); });
    var stats = { selects: 0, upserts: 0 };
    function from(t) {
      var filters = [], single = false, rng = null, ord = null, del = false;
      var q = {
        select: function () { return q; },
        eq: function (c, v) { var m = /^data->>(\w+)$/.exec(c); filters.push(m ? function (r) { var x = r.data && r.data[m[1]]; return x != null && String(x) === String(v); } : function (r) { return r[c] === v; }); return q; },
        like: function (c, p) { var re = new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'); filters.push(function (r) { return re.test(String(r[c])); }); return q; },
        maybeSingle: function () { single = true; return q; },
        order: function (c) { ord = c; return q; },
        range: function (a, b) { rng = [a, b]; return q; },
        then: function (res, rej) {
          stats.selects++;
          if (opts.failTables && opts.failTables.indexOf(t) >= 0) return Promise.resolve({ data: null, error: { message: 'mock failure for ' + t } }).then(res, rej);
          if (del) { stats.deletes = (stats.deletes || 0) + 1; tables[t] = (tables[t] || []).filter(function (r) { return !filters.every(function (f) { return f(r); }); }); return Promise.resolve({ data: null, error: null }).then(res, rej); }
          var rows = (tables[t] || []).filter(function (r) { return filters.every(function (f) { return f(r); }); });
          if (ord) rows = rows.slice().sort(function (x, y) { return String(x[ord]).localeCompare(String(y[ord])); });
          if (rng) rows = rows.slice(rng[0], rng[1] + 1);
          var out = single ? (rows[0] ? clone(rows[0]) : null) : rows.map(clone);
          return Promise.resolve({ data: out, error: null }).then(res, rej);
        },
        delete: function () { del = true; return q; },
        upsert: function (row) {
          stats.upserts++;
          var arr = tables[t] || (tables[t] = []), i = -1;
          for (var k = 0; k < arr.length; k++) if (arr[k].id === row.id) { i = k; break; }
          if (i >= 0) arr[i] = Object.assign({}, arr[i], clone(row)); else arr.push(clone(row));
          return Promise.resolve({ data: null, error: null });
        }
      };
      return q;
    }
    var calls = [];
    // edge functions: content-reschedule answers like the real one (date + plannedFor), everything else just echoes
    var functions = { invoke: function (name, opts) { var body = (opts && opts.body) || {}; calls.push({ name: name, body: body });
      if (name === 'content-reschedule') { var d = new Date(body.postDate); var key = new Date(d.getTime() + 11 * 3600000).toISOString().slice(0, 10); var row = (tables.content_queue || []).find(function (r) { return r.id === body.id; }); var posting = Object.assign({}, row && row.data.posting, { plannedFor: body.postDate, movedAt: new Date().toISOString() }); if (row) row.data = Object.assign({}, row.data, { date: key, posting: posting }); return Promise.resolve({ data: { ok: true, id: body.id, date: key, day: 'x', weekStart: key, posting: posting }, error: null }); }
      if (name === 'content-update' && body.create) { tables.content_queue = tables.content_queue || []; if (!tables.content_queue.find(function (r) { return r.id === body.id; })) tables.content_queue.push({ id: body.id, data: Object.assign({ date: body.create.date, slot: body.create.slot || 'high', status: String((body.fields || {}).script || '').trim() ? 'to_film' : 'needs_script' }, body.fields || {}) }); }
      return Promise.resolve({ data: { ok: true, saved: body.fields || {} }, error: null }); } };
    return { from: from, functions: functions, __calls: calls, __tables: tables, __stats: stats, auth: { signOut: function () { return Promise.resolve({}); } } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeMockClient: makeMockClient };
  root.makeMockClient = makeMockClient;
})(typeof globalThis !== 'undefined' ? globalThis : this);
