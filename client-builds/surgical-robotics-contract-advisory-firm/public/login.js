/* =====================================================
   The handoff.

   /projects and this app are served from the SAME ORIGIN
   (aiagent.ringlypro.com), so the Projects Hub's CRM token in localStorage is
   directly readable here. That is the whole mechanism: no redirect dance, no
   secret in a URL, no third-party cookie, nothing for the user to type.

   Read it, post it once to the exchange, land in the app. If it is missing or
   rejected, send them to /projects to sign in and come back.

   The page states which of the three things happened rather than showing a
   spinner that means all of them.
   ===================================================== */

'use strict';

(function () {
  var BASE = document.body.getAttribute('data-base') || '';

  function $(id) { return document.getElementById(id); }

  function show(id) {
    ['gate-checking', 'gate-signedout', 'gate-denied', 'gate-error'].forEach(function (s) {
      var node = $(s);
      if (node) node.hidden = (s !== id);
    });
  }

  function signInUrl(fallback) {
    var url = fallback || '/projects';
    // Come back here once they have a Projects session.
    return url + '?next=' + encodeURIComponent(window.location.pathname);
  }

  // The Hub stores its CRM JWT under 'token'. Checked defensively: a browser
  // with localStorage disabled should land on "sign in", not on a thrown error.
  function projectsToken() {
    try {
      return window.localStorage.getItem('token');
    } catch (e) {
      return null;
    }
  }

  function toSignIn(url) {
    show('gate-signedout');
    var link = $('gate-signin-link');
    if (link) link.href = signInUrl(url);
  }

  function start() {
    show('gate-checking');

    var token = projectsToken();
    if (!token) { toSignIn(null); return; }

    fetch(BASE + '/api/v1/auth/sso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token: token })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (body) { return { status: r.status, body: body }; });
      })
      .then(function (r) {
        if (r.status === 200 && r.body.success) {
          window.location.replace(BASE + '/');
          return;
        }
        if (r.status === 403) {
          // A real Projects session that is not on the viewer list. Saying so
          // is accurate and lets them ask for access; it reveals nothing they
          // could not already infer from being signed in.
          show('gate-denied');
          var who = $('gate-denied-who');
          if (who && r.body.email_masked) who.textContent = r.body.email_masked;
          return;
        }
        if (r.status === 401) {
          // The stored token is stale. Clear it so the next visit does not
          // retry the same dead credential.
          try { window.localStorage.removeItem('token'); } catch (e) { /* ignore */ }
          toSignIn(r.body.sign_in_url);
          return;
        }
        show('gate-error');
        var msg = $('gate-error-msg');
        if (msg) msg.textContent = r.body.error || 'Sign-in failed.';
      })
      .catch(function () {
        show('gate-error');
        var msg = $('gate-error-msg');
        if (msg) msg.textContent = 'Could not reach the server.';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
