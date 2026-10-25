/*
 * Sends the RinglyPro login token with every same-site /api/ request the
 * copilot makes. Several of those routes now require it (a client's lead list,
 * its CRM keys, saving and exporting leads), because they used to answer anyone
 * who knew a client id. The token is the one the CRM login stores in
 * localStorage 'token'; the copilot is opened from the signed-in dashboard on
 * the same site, so it is already there.
 */
(function () {
  if (window.__rpAuthFetch) return;
  window.__rpAuthFetch = true;
  var orig = window.fetch.bind(window);
  var warned = false;
  function sameSiteApi(url) {
    try { var u = new URL(url, location.href); return u.origin === location.origin && u.pathname.indexOf('/api/') === 0; }
    catch (e) { return false; }
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var token = null;
    try { token = localStorage.getItem('token'); } catch (e) {}
    if (token && sameSiteApi(url)) {
      init = Object.assign({}, init || {});
      var h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + token);
      init.headers = h;
    }
    return orig(input, init).then(function (res) {
      if (res.status === 401 && sameSiteApi(url) && !warned) {
        warned = true;
        var bar = document.createElement('div');
        bar.setAttribute('role', 'alert');
        bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b91c1c;color:#fff;font:600 14px system-ui,sans-serif;padding:10px 16px;text-align:center';
        bar.innerHTML = 'Your session ended. <a href="/login" style="color:#fff;text-decoration:underline">Sign in again</a> to load your data.';
        (document.body || document.documentElement).appendChild(bar);
      }
      return res;
    });
  };
})();
