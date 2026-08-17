/* =====================================================
   The gate page.

   Deliberately thin. It reports whether sign-in is configured at all, posts the
   address and the access code together, and follows the returned link.

   It never distinguishes "wrong address" from "wrong code" in what it shows,
   because the server does not distinguish them either — doing so would make
   this page an oracle for which addresses are provisioned.
   ===================================================== */

'use strict';

(function () {
  var BASE = document.body.getAttribute('data-base') || '';

  function $(id) { return document.getElementById(id); }

  function api(path, options) {
    var opts = options || {};
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json()
        .catch(function () { return {}; })
        .then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    });
  }

  function say(message, kind) {
    var out = $('gate-result');
    out.textContent = message;
    out.className = 'note' + (kind ? ' ' + kind : '');
  }

  // Configuration state, so the owner is told why sign-in is impossible rather
  // than being handed a form that can only ever fail.
  api('/api/v1/auth/status').then(function (r) {
    if (!r.body) return;
    if (r.body.access_configured === false) {
      $('gate-unconfigured').hidden = false;
      $('gate-submit').disabled = true;
    } else if (r.body.access_code_weak) {
      $('gate-weak').hidden = false;
    }
  });

  $('gate-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = $('gate-email').value.trim();
    var code = $('gate-code').value;
    if (!email || !code) { say('Enter both the address and the access code.', 'error'); return; }

    $('gate-submit').disabled = true;
    say('Checking...');

    api('/api/v1/auth/magic-link', { method: 'POST', body: { email: email, access_code: code } })
      .then(function (r) {
        if (r.status === 429) {
          say(r.body.error || 'Too many attempts. Try again later.', 'error');
          return;
        }
        if (!r.ok || !r.body.success || !r.body.verify_url) {
          say(r.body.error || 'Could not sign in.', 'error');
          $('gate-code').value = '';
          return;
        }
        say('Signing in...', 'ok');
        // The link is single-use and consumed by this navigation.
        window.location.href = r.body.verify_url + '&redirect=1';
      })
      .catch(function () { say('Could not reach the server.', 'error'); })
      .then(function () { $('gate-submit').disabled = false; });
  });
})();
