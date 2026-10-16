/* HISPANOTEC alta de asociado -> cv-105 member signup (account + password in
   the digital ecosystem) -> HISPANOTEC's own Stripe Checkout. The page is
   usually framed inside digit2ai.com/hispanotec (GHL), and Stripe refuses to
   load in a frame, so when framed the payment opens in a new tab that is
   opened during the click itself (a tab opened after an await is blocked). */
(function () {
  var API = '/cv-105/api';
  var SLUG = 'cv-105';
  var framed = (function () { try { return window.top !== window.self; } catch (e) { return true; } })();
  var form = document.getElementById('hxSignup');
  if (!form) return;
  var msg = document.getElementById('hxMsg');
  var btn = document.getElementById('hxSubmit');
  function $(id) { return document.getElementById('hx-' + id); }
  function show(el, text, ok, linkHref, linkText) {
    el.hidden = false;
    el.className = 'hx-msg ' + (ok ? 'ok' : 'err');
    el.textContent = text;
    if (linkHref) {
      var a = document.createElement('a');
      a.href = linkHref; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = ' ' + linkText;
      el.appendChild(a);
    }
  }
  var qs = new URLSearchParams(location.search);
  if (qs.get('payment') === 'cancelled') show(msg, 'El pago se canceló. Tu solicitud está guardada: puedes completarla cuando quieras iniciando sesión con tu correo y contraseña.', false);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    msg.hidden = true;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if ($('password').value !== $('password_confirm').value) { show(msg, 'Las contraseñas no coinciden.', false); $('password_confirm').focus(); return; }
    var langs = Array.prototype.slice.call(form.querySelectorAll('input[name="languages"]:checked')).map(function (c) { return c.value; });
    var body = {
      first_name: $('first_name').value.trim(), last_name: $('last_name').value.trim(),
      email: $('email').value.trim(), password: $('password').value,
      phone: $('phone').value.trim() || null, country: $('country').value || null,
      sector: $('sector').value || null, company_name: $('company_name').value.trim() || null,
      years_experience: $('years_experience').value || null, sub_specialty: $('sub_specialty').value.trim() || null,
      bio: $('bio').value.trim() || null, languages: langs,
      website_url: $('website_url').value.trim() || null, linkedin_url: $('linkedin_url').value.trim() || null,
      return_path: '/hispatec/formulario-de-interes/'
    };
    var tab = framed ? window.open('', '_blank') : null;
    btn.disabled = true; btn.querySelector('.elementor-button-text').textContent = 'Enviando…';
    try {
      var res = await fetch(API + '/auth/signup-member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var data = await res.json().catch(function () { return {}; });
      if (!data.success) {
        if (tab) tab.close();
        var err = data.error || 'No se pudo completar la solicitud.';
        if (res.status === 409) err = 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.';
        show(msg, err, false);
        return;
      }
      var d = data.data || {};
      var url = d.checkout_url || d.redirect_url || ('/' + SLUG + '/dashboard/?welcome=1');
      if (d.token && !framed) { try { localStorage.setItem('cv_' + SLUG + '_token', d.token); } catch (e2) {} }
      if (d.payment_waived && framed) url = '/' + SLUG + '/login';
      if (tab) {
        tab.location.href = url;
        show(msg, d.checkout_url ? 'Solicitud guardada. Completa el pago en la pestaña que se abrió.' : 'Cuenta creada. Inicia sesión en la pestaña que se abrió.', true, url, 'Abrir de nuevo');
      } else if (framed) {
        show(msg, 'Solicitud guardada.', true, url, d.checkout_url ? 'Completar el pago' : 'Entrar a mi cuenta');
      } else {
        window.location.href = url;
      }
    } catch (err2) {
      if (tab) tab.close();
      show(msg, 'Error de conexión. Inténtalo de nuevo.', false);
    } finally {
      btn.disabled = false; btn.querySelector('.elementor-button-text').textContent = 'Solicitar adhesión';
    }
  });

  var fOpen = document.getElementById('hxForgotOpen');
  var fForm = document.getElementById('hxForgot');
  var fMsg = document.getElementById('hxForgotMsg');
  fOpen.addEventListener('click', function (e) { e.preventDefault(); fForm.hidden = !fForm.hidden; if (!fForm.hidden) $('forgot-email').focus(); });
  fForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!fForm.checkValidity()) { fForm.reportValidity(); return; }
    var b = fForm.querySelector('button'); b.disabled = true;
    try {
      var r = await fetch(API + '/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('forgot-email').value.trim() }) });
      var dj = await r.json().catch(function () { return {}; });
      show(fMsg, dj.success ? dj.message : (dj.error || 'No se pudo enviar el enlace.'), !!dj.success);
    } catch (e3) { show(fMsg, 'Error de conexión. Inténtalo de nuevo.', false); }
    finally { b.disabled = false; }
  });
})();
