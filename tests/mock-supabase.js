// A tiny in-memory stand-in for the supabase-js client surface that index.html uses:
//   from(t).select('*')                          -> thenable {data: rows}
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
      var filters = [], single = false;
      var q = {
        select: function () { return q; },
        eq: function (c, v) { filters.push(function (r) { return r[c] === v; }); return q; },
        like: function (c, p) { var re = new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'); filters.push(function (r) { return re.test(String(r[c])); }); return q; },
        maybeSingle: function () { single = true; return q; },
        then: function (res, rej) {
          stats.selects++;
          if (opts.failTables && opts.failTables.indexOf(t) >= 0) return Promise.resolve({ data: null, error: { message: 'mock failure for ' + t } }).then(res, rej);
          var rows = (tables[t] || []).filter(function (r) { return filters.every(function (f) { return f(r); }); });
          var out = single ? (rows[0] ? clone(rows[0]) : null) : rows.map(clone);
          return Promise.resolve({ data: out, error: null }).then(res, rej);
        },
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
    return { from: from, __tables: tables, __stats: stats, auth: { signOut: function () { return Promise.resolve({}); } } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeMockClient: makeMockClient };
  root.makeMockClient = makeMockClient;
})(typeof globalThis !== 'undefined' ? globalThis : this);
