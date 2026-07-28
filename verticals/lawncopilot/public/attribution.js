/* Lawn Co-Pilot — first-touch attribution (Phase 6 tracking).
 *
 * Runs on every marketing page. On the FIRST page a visitor lands on, it
 * records where they came from — the UTM tags, ad click ids, the landing path
 * and the external referrer — and keeps it for 30 days. FIRST TOUCH WINS: once
 * recorded it is never overwritten, so a visitor who arrives from an ad, browses,
 * and signs up a week later is still credited to that ad, not to "direct".
 *
 * Nothing is sent anywhere on its own. window.LCAttribution.attach(payload) folds
 * it into the signup request, and that is the only time it leaves the browser.
 */
(function () {
  'use strict';
  var KEY = 'lc_attribution_v1';
  var TTL = 30 * 24 * 60 * 60 * 1000;   // 30 days
  var cap = function (s, n) { return s == null ? null : String(s).slice(0, n || 255); };

  function load() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY));
      if (r && r.at && (Date.now() - r.at) < TTL) return r;
    } catch (e) { /* private mode / disabled storage */ }
    return null;
  }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  var existing = load();
  if (!existing) {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }
    var rec = {
      at: Date.now(),
      utm_source: cap(q.get('utm_source')),
      utm_medium: cap(q.get('utm_medium')),
      utm_campaign: cap(q.get('utm_campaign')),
      utm_content: cap(q.get('utm_content')),
      utm_term: cap(q.get('utm_term')),
      gclid: cap(q.get('gclid')),      // Google Ads click id
      fbclid: cap(q.get('fbclid')),    // Meta click id
      landing_path: cap(location.pathname),
      referrer: cap(document.referrer, 500)
    };
    save(rec);
    existing = rec;
  }

  window.LCAttribution = {
    get: function () { return load() || {}; },
    // Merge the first-touch record into an outgoing payload (e.g. signup).
    attach: function (payload) {
      var a = load() || {};
      payload = payload || {};
      payload.attribution = {
        utm_source: a.utm_source || null,
        utm_medium: a.utm_medium || null,
        utm_campaign: a.utm_campaign || null,
        utm_content: a.utm_content || null,
        utm_term: a.utm_term || null,
        gclid: a.gclid || null,
        fbclid: a.fbclid || null,
        landing_path: a.landing_path || null,
        referrer: a.referrer || null,
        first_touch_at: a.at || null
      };
      return payload;
    }
  };
})();
