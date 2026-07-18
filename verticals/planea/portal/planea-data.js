/* PLANEA — real-data loader for the portal dashboard.
   Reads the authenticated user's REAL record from Supabase and renders it into
   every portal page, so the dashboard shows the same truth Maya sees (not the
   frozen demo mockup). Populates window.PLANEA_PROFILE (a superset consumed by
   both the dashboard hooks below AND maya-chat.js), then fires "planea:profile".

   Page-agnostic: it fills whatever hooks exist on the current page —
     [data-pl="KEY"]        scalar text (score, rango, nombre, *_total, ...)
     [data-pl-ring]         the score progress <circle> (stroke-dashoffset)
     [data-pl-bar="k"]      a bar .fill width (activos|pasivos)
     [data-pl-list="type"]  a list container rebuilt from real rows,
                            with data-pl-empty="msg" shown when there are none.

   No session (portal preview / not logged in) → does nothing, static demo stays. */
(function () {
  'use strict';

  var SB_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co';
  var SB_KEY = 'sb_publishable_0dMP5Pof56t9H4fyCNJn9Q_NKGuorXc';

  // Tell maya-chat.js this loader owns window.PLANEA_PROFILE (skip its own fetch).
  window.__planeaDataLoader = true;

  // ── helpers ────────────────────────────────────────────────────────────────
  function cop(n) {
    if (n == null || isNaN(n)) return '$0';
    var neg = n < 0, s = String(Math.round(Math.abs(n))), out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += '.';
      out += s[i];
    }
    return (neg ? '-' : '') + '$' + out;
  }
  function firstName(full, email) {
    var n = (full || '').trim().split(/\s+/)[0];
    if (n) return n;
    return email ? email.split('@')[0] : '';
  }
  function initials(full, email) {
    var parts = (full || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (email ? email.slice(0, 2) : 'PL').toUpperCase();
  }
  function rangoDe(s) {
    return s <= 30 ? 'Punto de partida' : s <= 50 ? 'Construyendo' : s <= 70 ? 'En camino' : s <= 85 ? 'Sólido' : 'Planeado';
  }
  function num(x) { var v = +x; return isNaN(v) ? 0 : v; }

  function sbSession() {
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
  function sbGet(pathQuery, token) {
    return fetch(SB_URL + '/rest/v1/' + pathQuery, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' }
    }).then(function (r) { if (!r.ok) throw new Error('sb ' + r.status); return r.json(); });
  }

  // Classify a patrimony asset into savings vs investment (best effort by type/name).
  var INV_RE = /invers|accion|acción|fondo|fic|cripto|bono|etf|cdt|portafol|renta/i;
  var SAV_RE = /ahorro|efectivo|cuenta|emergenc|cesant|caja|liquid|líquid/i;
  function assetBucket(a) {
    var s = ((a.type || '') + ' ' + (a.name || '')).toLowerCase();
    if (INV_RE.test(s)) return 'inversion';
    if (SAV_RE.test(s)) return 'ahorro';
    return 'otro';
  }

  // ── build the normalized profile from Supabase rows ─────────────────────────
  function buildProfile(sess) {
    var user = sess.user || {}, meta = user.user_metadata || {}, token = sess.access_token;
    return sbGet('persons?select=id,full_name,score_data,progress_data', token).then(function (rows) {
      var pr = (rows && rows[0]) || {};
      var personId = pr.id;
      var sd = pr.score_data || {};
      var prof = {
        loaded: true,
        logged_in: true,
        nombre: firstName(pr.full_name || meta.full_name, user.email),
        full_name: pr.full_name || meta.full_name || '',
        email: user.email || ''
      };
      if (sd && sd.score != null) {
        prof.planea_score = sd.score;
        prof.rango = rangoDe(sd.score);
        prof.escenario = sd.scenario || null;
        var pl = sd.pillars || {};
        // Maya-facing pillar percentages (already 0–100 in score_data.pillars).
        prof.score_pilares_pct = {
          fondo_emergencia: pl.emergency_fund != null ? pl.emergency_fund : null,
          flujo_caja: pl.cash_flow != null ? pl.cash_flow : null,
          salud_deuda: pl.debt_health != null ? pl.debt_health : null,
          estabilidad: pl.stability != null ? pl.stability : null
        };
      } else {
        prof.sin_diagnostico = true;
      }

      if (personId == null) { window.PLANEA_PROFILE = prof; return prof; }

      // Patrimony + goals, EXPLICITLY scoped by person_id (not RLS-only).
      var pat = sbGet('persons_patrimony?person_id=eq.' + personId + '&select=assets_data,liabilities_data', token).catch(function () { return null; });
      var goals = sbGet('persons_long_term_goals?person_id=eq.' + personId + '&select=name,type,target_amount,current_savings,monthly_saving&order=created_at.asc', token).catch(function () { return null; });

      return Promise.all([pat, goals]).then(function (res) {
        var pp = (res[0] && res[0][0]) || {};
        var assets = Array.isArray(pp.assets_data) ? pp.assets_data : [];
        var liab = Array.isArray(pp.liabilities_data) ? pp.liabilities_data : [];
        var at = assets.reduce(function (a, x) { return a + num(x.value); }, 0);
        var lt = liab.reduce(function (a, x) { return a + num(x.value); }, 0);

        prof.activos_total_cop = at;
        prof.pasivos_total_cop = lt;
        prof.patrimonio_neto_cop = at - lt;
        prof.activos = assets.map(function (x) { return { nombre: x.name, tipo: x.type, valor_cop: num(x.value), bucket: assetBucket(x) }; });
        prof.pasivos = liab.map(function (x) { return { nombre: x.name, tipo: x.type, valor_cop: num(x.value) }; });

        var goalRows = res[1] || [];
        prof.metas = goalRows.map(function (g) {
          return { nombre: g.name, tipo: g.type, objetivo_cop: num(g.target_amount), actual_cop: num(g.current_savings), aporte_mensual_cop: num(g.monthly_saving) };
        });

        window.PLANEA_PROFILE = prof;
        return prof;
      });
    });
  }

  // ── renderers ───────────────────────────────────────────────────────────────
  var C = 289; // ring circumference (r=46)

  function scalar(prof, key) {
    var sin = prof.sin_diagnostico;
    switch (key) {
      case 'nombre': return prof.nombre || '';
      case 'saludo': return prof.nombre ? 'Hola, ' + prof.nombre : 'Hola';
      case 'score': return sin || prof.planea_score == null ? '—' : String(prof.planea_score);
      case 'rango': return sin ? 'Sin diagnóstico' : (prof.rango || '—');
      case 'patrimonio_total':
      case 'patrimonio_neto': return cop(prof.patrimonio_neto_cop || 0);
      case 'activos_total': return cop(prof.activos_total_cop || 0);
      case 'pasivos_total':
      case 'deuda_total': return cop(prof.pasivos_total_cop || 0);
      case 'ahorro_total': return cop(sumBucket(prof, 'ahorro'));
      case 'inversion_total': return cop(sumBucket(prof, 'inversion'));
      case 'metas_count': return String((prof.metas || []).length);
      default: return null;
    }
  }
  function sumBucket(prof, bucket) {
    return (prof.activos || []).filter(function (a) { return a.bucket === bucket; })
      .reduce(function (s, a) { return s + a.valor_cop; }, 0);
  }

  function fillScalars(prof) {
    document.querySelectorAll('[data-pl]').forEach(function (el) {
      var v = scalar(prof, el.getAttribute('data-pl'));
      if (v != null) el.textContent = v;
    });
  }
  function fillRing(prof) {
    var score = prof.sin_diagnostico || prof.planea_score == null ? 0 : Math.max(0, Math.min(100, prof.planea_score));
    var off = Math.round(C * (1 - score / 100));
    document.querySelectorAll('[data-pl-ring]').forEach(function (c) { c.setAttribute('stroke-dashoffset', off); });
  }
  function fillBars(prof) {
    var at = prof.activos_total_cop || 0, lt = prof.pasivos_total_cop || 0;
    document.querySelectorAll('[data-pl-bar]').forEach(function (el) {
      var k = el.getAttribute('data-pl-bar'), w = 0;
      if (k === 'activos') w = at > 0 ? 100 : 0;
      else if (k === 'pasivos') w = at > 0 ? Math.min(100, Math.round(lt / at * 100)) : (lt > 0 ? 100 : 0);
      el.style.width = w + '%';
    });
  }

  var IC_TREND = '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>';
  var IC_GOAL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function pocket(name, tipo, valueTxt, w, rate) {
    return '<div class="pocket"><div class="r1"><div class="nm">' + esc(name) +
      (tipo ? ' <span class="m">· ' + esc(tipo) + '</span>' : '') +
      '</div><div class="amt' + (rate ? ' rate' : '') + '">' + valueTxt + '</div></div>' +
      '<div class="mini-track"><div class="mini-fill" style="width:' + w + '%"></div></div></div>';
  }
  function fund(name, valueTxt, metaTxt) {
    return '<div class="fund"><div class="top"><span class="ic">' + IC_TREND + '</span><div class="nm">' + esc(name) +
      '</div></div><div class="val">' + valueTxt + '</div><div class="meta">' + metaTxt + '</div></div>';
  }
  function metacard(m) {
    var pct = m.objetivo_cop > 0 ? Math.max(0, Math.min(100, Math.round(m.actual_cop / m.objetivo_cop * 100))) : 0;
    var rem = m.objetivo_cop - m.actual_cop;
    var months = m.aporte_mensual_cop > 0 && rem > 0 ? Math.ceil(rem / m.aporte_mensual_cop) : null;
    var right = months != null ? '<strong>' + months + ' meses</strong> restantes al ritmo actual'
      : (rem <= 0 ? 'Meta cumplida' : 'Define un aporte mensual');
    return '<div class="metacard"><div class="top"><span class="mi">' + IC_GOAL + '</span><div><div class="nm">' + esc(m.nombre) +
      '</div><div class="de">' + esc(m.tipo || 'Meta') + '</div></div><div class="cif"><div class="a">' + cop(m.actual_cop) +
      '</div><div class="o">de ' + cop(m.objetivo_cop) + '</div></div></div>' +
      '<div class="mini-track" style="margin-top:14px"><div class="mini-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="pie"><span><strong>' + pct + '%</strong> completado</span><span>' + right + '</span></div></div>';
  }
  function pilarRow(nombre, pct) {
    var p = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
    var alerta = p < 50 ? ' alerta' : '';
    return '<div class="pilar' + alerta + '"><div class="cab"><span class="nombre">' + esc(nombre) +
      '</span><span class="pct">' + (pct == null ? '—' : p + '%') + '</span></div>' +
      '<div class="track"><div class="fill" style="width:' + p + '%"></div></div></div>';
  }

  function fillLists(prof) {
    document.querySelectorAll('[data-pl-list]').forEach(function (box) {
      var type = box.getAttribute('data-pl-list');
      var empty = box.getAttribute('data-pl-empty') || 'Aún no hay datos registrados.';
      var html = '', rows;

      if (type === 'deuda') {
        rows = prof.pasivos || [];
        var maxL = rows.reduce(function (m, x) { return Math.max(m, x.valor_cop); }, 0) || 1;
        html = rows.map(function (x) { return pocket(x.nombre, x.tipo, cop(x.valor_cop), Math.round(x.valor_cop / maxL * 100), true); }).join('');
      } else if (type === 'ahorro' || type === 'inversion') {
        rows = (prof.activos || []).filter(function (a) { return a.bucket === type; });
        var tot = rows.reduce(function (s, a) { return s + a.valor_cop; }, 0) || 1;
        if (type === 'ahorro') {
          var maxA = rows.reduce(function (m, x) { return Math.max(m, x.valor_cop); }, 0) || 1;
          html = rows.map(function (x) { return pocket(x.nombre, x.tipo, cop(x.valor_cop), Math.round(x.valor_cop / maxA * 100)); }).join('');
        } else {
          html = rows.map(function (x) {
            var share = Math.round(x.valor_cop / tot * 100);
            return fund(x.nombre, cop(x.valor_cop), esc(x.tipo || 'Inversión') + ' · ' + share + '% del portafolio');
          }).join('');
        }
      } else if (type === 'activos') {
        rows = prof.activos || [];
        var maxV = rows.reduce(function (m, x) { return Math.max(m, x.valor_cop); }, 0) || 1;
        html = rows.map(function (x) { return pocket(x.nombre, x.tipo, cop(x.valor_cop), Math.round(x.valor_cop / maxV * 100)); }).join('');
      } else if (type === 'metas') {
        rows = prof.metas || [];
        html = rows.map(metacard).join('');
      } else if (type === 'pilares') {
        var pp = prof.score_pilares_pct;
        if (!prof.sin_diagnostico && pp) {
          html = pilarRow('Fondo de emergencia', pp.fondo_emergencia) +
            pilarRow('Flujo de caja', pp.flujo_caja) +
            pilarRow('Salud de la deuda', pp.salud_deuda) +
            pilarRow('Estabilidad', pp.estabilidad);
        }
      } else if (type === 'fondo_emergencia') {
        var goal = (prof.metas || []).filter(function (m) { return /emergen/i.test(m.nombre || ''); })[0];
        if (goal) {
          var pct = goal.objetivo_cop > 0 ? Math.max(0, Math.min(100, Math.round(goal.actual_cop / goal.objetivo_cop * 100))) : 0;
          var rem = goal.objetivo_cop - goal.actual_cop;
          var months = goal.aporte_mensual_cop > 0 && rem > 0 ? Math.ceil(rem / goal.aporte_mensual_cop) : null;
          html = '<div class="track" style="height:12px;margin-top:16px"><div class="fill" style="width:' + pct + '%"></div></div>' +
            '<div class="pie" style="display:flex;justify-content:space-between;margin-top:10px;font-size:13.5px;color:var(--mut)">' +
            '<span><strong style="color:var(--txt)">' + pct + '%</strong> completado</span>' +
            '<span><strong style="color:var(--txt)">' + (months != null ? months + ' meses' : cop(rem > 0 ? rem : 0)) + '</strong> ' +
            (months != null ? 'restantes al ritmo actual' : 'por completar') + '</span></div>';
        } else if (!prof.sin_diagnostico && prof.score_pilares_pct && prof.score_pilares_pct.fondo_emergencia != null) {
          var fp = Math.max(0, Math.min(100, Math.round(prof.score_pilares_pct.fondo_emergencia)));
          html = '<div class="track" style="height:12px;margin-top:16px"><div class="fill" style="width:' + fp + '%"></div></div>' +
            '<div class="pie" style="display:flex;justify-content:space-between;margin-top:10px;font-size:13.5px;color:var(--mut)">' +
            '<span><strong style="color:var(--txt)">' + fp + '%</strong> de tu meta de fondo</span></div>';
        }
      } else if (type === 'seguros' || type === 'retiro') {
        rows = []; // no dedicated Supabase source yet → always empty state
      }

      box.innerHTML = html || ('<div class="pl-empty" style="padding:22px 4px;color:var(--mut);font-size:14px">' + esc(empty) + '</div>');
    });
  }

  function updateNav(prof) {
    var tries = 0;
    (function apply() {
      var nm = document.querySelector('.dprofile .nm');
      var av = document.querySelector('.dprofile .av');
      if (nm) nm.textContent = prof.full_name || prof.nombre || nm.textContent;
      if (av) av.textContent = initials(prof.full_name, prof.email);
      if ((!nm || !av) && tries++ < 20) setTimeout(apply, 150); // nav injects async
    })();
  }

  // The "Maya sugiere" card on the dashboard — shows the survey's first insight
  // (scenario A–I goal + message) when present, else prompts the diagnostic.
  function fillInsight(prof) {
    var card = document.querySelector('[data-pl-insight]');
    if (!card) return;
    var goalEl = card.querySelector('[data-pl-insight-goal]');
    var msgEl = card.querySelector('[data-pl-insight-msg]');
    var ctaEl = card.querySelector('[data-pl-insight-cta]');
    var rec = prof.recommendation;
    if (rec && rec.goalText) {
      if (goalEl) goalEl.textContent = rec.goalText;
      if (msgEl) msgEl.textContent = rec.mayaMessage || '';
      if (ctaEl) { ctaEl.textContent = 'Ver con Maya →'; ctaEl.setAttribute('href', '#'); ctaEl.setAttribute('data-action', 'maya'); }
    } else if (prof.sin_diagnostico) {
      if (goalEl) goalEl.textContent = 'Haz tu diagnóstico Planea';
      if (msgEl) msgEl.textContent = 'Responde 8 preguntas y Maya te dice exactamente por dónde empezar.';
      if (ctaEl) { ctaEl.textContent = 'Empezar diagnóstico →'; ctaEl.setAttribute('href', '/planea/portal/diagnostico'); ctaEl.removeAttribute('data-action'); }
    }
  }

  function render(prof) {
    try { fillScalars(prof); } catch (e) {}
    try { fillRing(prof); } catch (e) {}
    try { fillBars(prof); } catch (e) {}
    try { fillLists(prof); } catch (e) {}
    try { fillInsight(prof); } catch (e) {}
    try { updateNav(prof); } catch (e) {}
    document.body.classList.add('pl-data-ready');
    try { window.dispatchEvent(new CustomEvent('planea:profile', { detail: prof })); } catch (e) {}
  }

  // ── Our own backend (Postgres) — preferred over Supabase ────────────────────
  function ourSession() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)planea_user=([^;]+)/);
      return m ? JSON.parse(decodeURIComponent(m[1])) : null;
    } catch (e) { return null; }
  }
  function buildProfileFromBackend(sess) {
    return fetch('/planea/api/v1/me/profile', { credentials: 'include' })
      .then(function (r) { if (!r.ok) throw new Error('me ' + r.status); return r.json(); })
      .then(function (d) {
        var prof = {
          loaded: true, logged_in: true,
          nombre: firstName(d.full_name, d.email),
          full_name: d.full_name || '',
          email: d.email || ''
        };
        var sd = d.score_data || {};
        if (sd && sd.score != null) {
          prof.planea_score = sd.score;
          prof.rango = rangoDe(sd.score);
          prof.escenario = sd.scenario || null;
          prof.recommendation = sd.recommendation || null;
          var pl = sd.pillars || {};
          prof.score_pilares_pct = {
            fondo_emergencia: pl.emergency_fund != null ? pl.emergency_fund : null,
            flujo_caja: pl.cash_flow != null ? pl.cash_flow : null,
            salud_deuda: pl.debt_health != null ? pl.debt_health : null,
            estabilidad: pl.stability != null ? pl.stability : null
          };
        } else {
          prof.sin_diagnostico = true;
        }
        var assets = Array.isArray(d.assets_data) ? d.assets_data : [];
        var liab = Array.isArray(d.liabilities_data) ? d.liabilities_data : [];
        var at = assets.reduce(function (a, x) { return a + num(x.value); }, 0);
        var lt = liab.reduce(function (a, x) { return a + num(x.value); }, 0);
        prof.activos_total_cop = at;
        prof.pasivos_total_cop = lt;
        prof.patrimonio_neto_cop = at - lt;
        prof.activos = assets.map(function (x) { return { nombre: x.name, tipo: x.type, valor_cop: num(x.value), bucket: assetBucket(x) }; });
        prof.pasivos = liab.map(function (x) { return { nombre: x.name, tipo: x.type, valor_cop: num(x.value) }; });
        prof.metas = (Array.isArray(d.goals) ? d.goals : []).map(function (g) {
          return { nombre: g.name, tipo: g.type, objetivo_cop: num(g.target_amount), actual_cop: num(g.current_savings), aporte_mensual_cop: num(g.monthly_saving) };
        });
        window.PLANEA_PROFILE = prof;
        return prof;
      });
  }

  // Clean, honest empty profile — NO demo. Used when nobody is logged in so the
  // portal never shows fabricated numbers (score/patrimonio/etc.).
  function emptyProfile() {
    return {
      loaded: true, logged_in: false, sin_diagnostico: true,
      nombre: '', full_name: '', email: '',
      planea_score: null, rango: null, score_pilares_pct: null,
      activos: [], pasivos: [], metas: [],
      activos_total_cop: 0, pasivos_total_cop: 0, patrimonio_neto_cop: 0
    };
  }

  function boot() {
    // Prefer OUR backend (Postgres). Fall back to legacy Supabase session.
    // Onboarding is NOT a forced redirect: the dashboard renders (empty, "Sin
    // diagnóstico") and the nav lock (planea-nav.js) leaves only Mi Puntaje
    // clickable, funnelling the user into the survey by choice.
    if (ourSession()) {
      buildProfileFromBackend().then(render).catch(function (e) {
        if (window.console) console.warn('[planea-data] backend load failed:', e && e.message);
        render(emptyProfile());
      });
      return;
    }
    var sess = sbSession();
    if (sess) {
      buildProfile(sess).then(render).catch(function (e) {
        if (window.console) console.warn('[planea-data] load failed:', e && e.message);
        render(emptyProfile());
      });
      return;
    }
    render(emptyProfile()); // not logged in → CLEAN empty state, never demo
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
