/* PLANEA — tiny shared Supabase REST client for the portal (read + write).
   Reuses the same publishable key + browser session that planea-data.js reads.
   Exposes window.PlaneaSB so the diagnostic / patrimonio / metas editors can
   persist to the SAME tables the dashboard loader reads back. No session →
   loggedIn() is false and callers fall back to a local-only experience. */
(function () {
  'use strict';

  var SB_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co';
  var SB_KEY = 'sb_publishable_0dMP5Pof56t9H4fyCNJn9Q_NKGuorXc';

  function session() {
    try {
      var key = null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { key = k; break; }
      }
      if (!key) return null;
      var o = JSON.parse(localStorage.getItem(key));
      var s = o && o.access_token ? o : (o && o.currentSession) ? o.currentSession : null;
      return s && s.access_token ? s : null;
    } catch (e) { return null; }
  }
  function token() { var s = session(); return s ? s.access_token : null; }
  function user() { var s = session(); return s ? (s.user || null) : null; }

  function req(method, pathQuery, body, extra) {
    var t = token();
    var h = { apikey: SB_KEY, Authorization: 'Bearer ' + t, Accept: 'application/json' };
    if (body != null) h['Content-Type'] = 'application/json';
    if (extra) for (var k in extra) h[k] = extra[k];
    return fetch(SB_URL + '/rest/v1/' + pathQuery, {
      method: method,
      headers: h,
      body: body != null ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (txt) { throw new Error('sb ' + r.status + ' ' + txt); });
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  var _person = null;
  function person(force) {
    if (_person && !force) return Promise.resolve(_person);
    return req('GET', 'persons?select=id,user_id,full_name,score_data&limit=1')
      .then(function (rows) { _person = (rows && rows[0]) || null; return _person; });
  }

  window.PlaneaSB = {
    url: SB_URL, key: SB_KEY,
    session: session, token: token, user: user,
    loggedIn: function () { return !!token(); },
    get: function (pq) { return req('GET', pq); },
    patch: function (pq, body) { return req('PATCH', pq, body, { Prefer: 'return=representation' }); },
    post: function (path, body, upsert) {
      return req('POST', path, body, { Prefer: (upsert ? 'resolution=merge-duplicates,' : '') + 'return=representation' });
    },
    person: person
  };
})();
