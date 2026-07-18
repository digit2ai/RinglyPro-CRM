/* PLANEA — portal data client.
   MIGRATED: this now talks to Planea's OWN backend (/planea/api/v1) on our
   Postgres — no third-party Supabase. It keeps the SAME window.PlaneaSB surface
   the editors use (loggedIn/user/person/get/patch/post) by TRANSLATING the old
   PostgREST-style calls (persons / persons_patrimony / persons_long_term_goals)
   into our session-scoped REST, so the diagnostic / patrimonio / metas editors
   work unchanged. Session = the JS-readable `planea_user` cookie set at login;
   the HttpOnly JWT rides along automatically (credentials:'include').
   No session → loggedIn() is false and callers fall back to a local-only view. */
(function () {
  'use strict';

  var API = '/planea/api/v1';

  function readUserCookie() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)planea_user=([^;]+)/);
      if (!m) return null;
      var v = m[1]; // tolerate single- or (legacy) double-URL-encoding
      for (var i = 0; i < 3; i++) {
        try { return JSON.parse(v); } catch (e) {}
        var d; try { d = decodeURIComponent(v); } catch (e) { break; }
        if (d === v) break; v = d;
      }
      return null;
    } catch (e) { return null; }
  }

  function req(method, path, body) {
    return fetch(API + path, {
      method: method,
      credentials: 'include',
      headers: body != null ? { 'Content-Type': 'application/json' } : {},
      body: body != null ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('planea ' + r.status + ' ' + t); });
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  // Cached profile (mirrors the old single-fetch person()).
  var _profile = null;
  function profile(force) {
    if (_profile && !force) return Promise.resolve(_profile);
    return req('GET', '/me/profile').then(function (p) { _profile = p || {}; return _profile; });
  }

  function u() { return readUserCookie(); }

  // ── PostgREST-shape translation ────────────────────────────────────────────
  // Only the specific shapes the editors emit are handled; everything is scoped
  // to the logged-in user server-side, so the ?...=eq.<id> filters are ignored.
  function get(pq) {
    var uid = (u() || {}).id;
    if (/^persons_patrimony/.test(pq)) {
      return profile(true).then(function (p) {
        return [{ person_id: uid, assets_data: p.assets_data || [], liabilities_data: p.liabilities_data || [] }];
      });
    }
    if (/^persons_long_term_goals/.test(pq)) {
      return profile(true).then(function (p) {
        return (p.goals || []).map(function (g, i) {
          return { id: i + 1, name: g.name, type: g.type, target_amount: g.target_amount, current_savings: g.current_savings, monthly_saving: g.monthly_saving };
        });
      });
    }
    // persons (self row)
    return profile(true).then(function (p) {
      return [{ id: uid, user_id: uid, full_name: p.full_name || '', score_data: p.score_data || null, progress_data: p.progress_data || null }];
    });
  }

  function patch(pq, body) {
    if (/^persons_patrimony/.test(pq)) {
      var pb = {};
      if (body.assets_data !== undefined) pb.assets_data = body.assets_data;
      if (body.liabilities_data !== undefined) pb.liabilities_data = body.liabilities_data;
      _profile = null;
      return req('PUT', '/me/profile', pb).then(function () { return [body]; });
    }
    // persons: score_data / full_name / progress_data. Return a row WITH an id
    // (= user id) so callers that chain on rows[0].id (e.g. the diagnostic's
    // first-meta creation) keep working — our data is session-scoped anyway.
    var upd = {};
    ['score_data', 'full_name', 'progress_data'].forEach(function (k) { if (body[k] !== undefined) upd[k] = body[k]; });
    _profile = null;
    var uid = (u() || {}).id;
    return req('PUT', '/me/profile', upd).then(function () { return [{ id: uid, user_id: uid }]; });
  }

  function post(path, body) {
    if (/persons_long_term_goals/.test(path)) {
      _profile = null;
      return req('POST', '/me/goals', body).then(function (r) { return [body]; });
    }
    if (/persons_patrimony/.test(path)) {
      var pb = {};
      if (body.assets_data !== undefined) pb.assets_data = body.assets_data;
      if (body.liabilities_data !== undefined) pb.liabilities_data = body.liabilities_data;
      _profile = null;
      return req('PUT', '/me/profile', pb).then(function () { return [body]; });
    }
    // persons_score_history (and anything else) → no-op on our backend
    return Promise.resolve(null);
  }

  function person(force) {
    return profile(force).then(function (p) {
      var uid = (u() || {}).id;
      return { id: uid, user_id: uid, full_name: p.full_name || '', score_data: p.score_data || null };
    });
  }

  window.PlaneaSB = {
    api: API,
    session: function () { return readUserCookie(); },
    token: function () { return null; }, // JWT is HttpOnly; sent automatically
    user: function () {
      var c = readUserCookie();
      if (!c) return null;
      return { id: c.id, email: c.email, user_metadata: { full_name: c.full_name || '' } };
    },
    loggedIn: function () { return !!readUserCookie(); },
    get: get,
    patch: patch,
    post: post,
    person: person,
    logout: function () { return req('POST', '/auth/logout').catch(function () {}); }
  };
})();
