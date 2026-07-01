// =====================================================
// Cuenta + créditos (frontend compartido) — se incluye en el home y el juez.
//
// - Pinta el chip de saldo en la barra superior (#creditChip): "Créditos: N ·
//   Recargar" si hay sesión; "Iniciar sesión" si no.
// - Modal de recarga con los 6 montos ($10..$100) + tarjeta Stripe (Elements).
// - Expone window.ECPFAccount para que juez.js / app.js abran la recarga cuando
//   un análisis devuelve 402 (sin créditos) y refresquen el saldo.
//
// La sesión es una cookie HttpOnly same-origin, así que fetch la envía solo.
// =====================================================
(function () {
  'use strict';
  var I18N = window.__I18N || {}, BASE = window.__BASE || '/';
  var LANG = window.__LANG || 'es';
  var API = BASE + 'api/v1/account';
  var cfg = null, stripe = null, card = null, chosenAmount = null;

  function t(k, fb) { return I18N[k] != null ? I18N[k] : (fb || k); }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function getConfig() {
    return fetch(API + '/config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { cfg = j; return j; }).catch(function () { cfg = { logged_in: false }; return cfg; });
  }

  function renderChip() {
    var box = el('creditChip'); if (!box) return;
    if (cfg && cfg.logged_in) {
      box.innerHTML =
        '<span class="inline-flex items-center gap-2 text-xs">' +
        '<span class="mono px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-600/40">' + t('credits_label', 'Créditos') + ': <b id="creditCount">' + (cfg.credits != null ? cfg.credits : '—') + '</b></span>' +
        '<button id="rechargeBtn" class="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">' + t('recharge', 'Recargar') + '</button>' +
        '<a href="#" id="logoutBtn" class="text-slate-500 hover:text-slate-300 underline">' + t('logout', 'Salir') + '</a>' +
        '</span>';
      el('rechargeBtn').addEventListener('click', openRecharge);
      el('logoutBtn').addEventListener('click', function (e) { e.preventDefault(); logout(); });
    } else {
      box.innerHTML = '<a href="' + BASE + 'login?next=' + encodeURIComponent(location.pathname) + '" class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">' + t('login_cta', 'Iniciar sesión') + '</a>';
    }
  }

  function setCount(n) { var c = el('creditCount'); if (c) c.textContent = n; if (cfg) cfg.credits = n; }

  function logout() {
    fetch(API + '/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.reload(); });
  }

  // ---- Recharge modal -------------------------------------------------------
  function ensureModal() {
    if (el('rechargeModal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'rechargeModal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,20,.75);display:none;align-items:center;justify-content:center;z-index:60;padding:16px';
    wrap.innerHTML =
      '<div style="background:#0d1320;border:1px solid #243049;border-radius:16px;max-width:440px;width:100%;padding:22px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<h3 style="font-weight:700;font-size:18px">' + t('recharge_title', 'Recargar créditos') + '</h3>' +
          '<button id="rechargeClose" style="color:#64748b;font-size:20px;line-height:1">&times;</button></div>' +
        '<p style="color:#8a98b0;font-size:13px;margin-bottom:14px">' + t('recharge_sub', '1 crédito = $1 = 1 análisis. Elige un monto:') + '</p>' +
        '<div id="amountGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px"></div>' +
        '<div id="payArea" style="display:none">' +
          '<div id="cardElement" style="background:#0b1220;border:1px solid #243049;border-radius:10px;padding:12px;margin-bottom:10px"></div>' +
          '<div id="payMsg" style="color:#fda4af;font-size:12px;min-height:16px;margin-bottom:8px"></div>' +
          '<button id="payBtn" style="width:100%;background:#059669;color:#fff;font-weight:600;border-radius:10px;padding:12px">' + t('pay_now', 'Pagar') + '</button>' +
        '</div>' +
        '<div id="payDisabled" style="display:none;color:#fbbf24;font-size:13px">' + t('pay_unavailable', 'Pagos no configurados. Contacta al administrador.') + '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    el('rechargeClose').addEventListener('click', closeRecharge);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeRecharge(); });

    var grid = el('amountGrid');
    (cfg.packages || []).forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'amt';
      b.style.cssText = 'background:#1b2536;border:1px solid #243049;border-radius:10px;padding:12px;font-weight:700;color:#e9eef7';
      b.innerHTML = '$' + p.amount + '<div style="font-size:11px;color:#8a98b0;font-weight:500">' + p.credits + ' ' + t('credits_label', 'créditos') + '</div>';
      b.addEventListener('click', function () { selectAmount(p.amount, b); });
      grid.appendChild(b);
    });
  }

  function selectAmount(amount, btn) {
    chosenAmount = amount;
    document.querySelectorAll('#amountGrid .amt').forEach(function (x) { x.style.borderColor = '#243049'; });
    if (btn) btn.style.borderColor = '#6366f1';
    if (!cfg.payments_enabled) { el('payDisabled').style.display = 'block'; return; }
    el('payArea').style.display = 'block';
    mountStripe();
  }

  function loadStripeJs() {
    if (window.Stripe) return Promise.resolve();
    if (window.__stripeJsPromise) return window.__stripeJsPromise;
    window.__stripeJsPromise = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://js.stripe.com/v3/'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    return window.__stripeJsPromise;
  }

  function mountStripe() {
    if (card) return;
    loadStripeJs().then(function () {
      stripe = window.Stripe(cfg.publishable_key);
      var elements = stripe.elements();
      card = elements.create('card', { style: { base: { color: '#e9eef7', fontSize: '15px', '::placeholder': { color: '#64748b' } } } });
      card.mount('#cardElement');
      el('payBtn').addEventListener('click', pay);
    }).catch(function () { el('payMsg').textContent = t('stripe_load_error', 'No se pudo cargar Stripe.'); });
  }

  function pay() {
    if (!chosenAmount || !stripe || !card) return;
    var btn = el('payBtn'); btn.disabled = true; el('payMsg').textContent = '';
    btn.textContent = t('processing', 'Procesando…');
    fetch(API + '/credits/create-intent', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: chosenAmount }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (o) {
        if (!o.ok) throw new Error(o.j.error || 'error');
        return stripe.confirmCardPayment(o.j.client_secret, { payment_method: { card: card, billing_details: { email: cfg.email || undefined } } })
          .then(function (result) {
            if (result.error) throw new Error(result.error.message);
            if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
              return fetch(API + '/credits/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_intent_id: result.paymentIntent.id }) })
                .then(function (r) { return r.json(); })
                .then(function (j) { setCount(j.credits); onPaid(j.credits); });
            }
            throw new Error(t('payment_incomplete', 'Pago no completado.'));
          });
      })
      .catch(function (e) { el('payMsg').textContent = String(e.message || e); })
      .then(function () { btn.disabled = false; btn.textContent = t('pay_now', 'Pagar'); });
  }

  function onPaid(credits) {
    closeRecharge();
    // Pequeño aviso.
    var b = el('creditChip'); if (b) { var n = el('creditCount'); if (n) { n.textContent = credits; } }
    if (window.__onCreditsChanged) window.__onCreditsChanged(credits);
  }

  function openRecharge() {
    if (!cfg || !cfg.logged_in) { location.href = BASE + 'login?next=' + encodeURIComponent(location.pathname); return; }
    ensureModal(); el('rechargeModal').style.display = 'flex';
  }
  function closeRecharge() { var m = el('rechargeModal'); if (m) m.style.display = 'none'; }

  // Public API for the analysis pages.
  window.ECPFAccount = {
    isLoggedIn: function () { return !!(cfg && cfg.logged_in); },
    credits: function () { return cfg ? cfg.credits : null; },
    openRecharge: openRecharge,
    setCount: setCount,
    refresh: function () { return getConfig().then(renderChip); }
  };

  getConfig().then(renderChip);
})();
