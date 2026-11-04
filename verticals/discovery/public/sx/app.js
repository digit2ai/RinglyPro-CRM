'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (url, opts) => {
  const r = await fetch('/discovery' + url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (r.status === 401) { location.href = '/discovery/login'; return null; }
  return r.json();
};

let STATE = null;

$('pdf').addEventListener('click', () => {
  // document.title becomes the default filename in the print dialog.
  const co = (STATE && STATE.account ? STATE.account.company_name : 'company')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const v = STATE && STATE.latest_evaluation ? STATE.latest_evaluation.version : 1;
  const prev = document.title;
  document.title = `hoja-de-ruta-ia-${co}-v${v}`;
  window.print();
  setTimeout(() => { document.title = prev; }, 1000);
});

$('out').addEventListener('click', async e => {
  e.preventDefault(); await api('/api/v1/auth/logout', { method: 'POST' });
  location.href = '/discovery/login';
});

/* ── questions a capture cannot answer ────────────────────────────────────
 * Six required, plus a handful that sharpen the result. Deliberately short:
 * the full readiness interview asks about forty things, and better than thirty
 * of them are now measured. That reduction is the product. */
const FEARS = {
  cost: 'Va a costar más de lo que devuelve', risk: 'Algo saldrá mal y la responsabilidad será mía',
  data: 'Nuestros datos son un desorden', job_disruption: 'Lo que le hace a mi gente',
  vendor_lockin: 'Quedar atado a un proveedor', dont_know_where_to_start: 'No sé por dónde empezar',
  been_oversold_before: 'Ya me vendieron esto antes con promesas exageradas', reputation: 'Un error público frente a los clientes'
};
const RISKS = {
  security: 'Que se filtren nuestros datos', compliance: 'Incumplir una regulación',
  errors: 'Que la IA se equivoque con total seguridad', reputation: 'Quedar mal frente a un cliente',
  job_disruption: 'Dañar la moral o perder gente', vendor_lockin: 'No poder salirnos',
  ip_leakage: 'Que nuestro conocimiento entrene el modelo de otro', bad_decisions: 'Que alguien actúe con una respuesta equivocada'
};
const REGIMES = { none: 'Ninguna', hipaa: 'HIPAA', gdpr: 'GDPR', ccpa: 'CCPA', pci: 'PCI', sox: 'SOX', glba: 'GLBA', local_data_residency: 'Residencia de datos', industry_specific: 'Propias de la industria' };
/* Display labels only: the option values sent to the API stay in English. */
const LEVEL_ES = { low: 'bajo', medium: 'medio', high: 'alto', zero: 'cero', unionized: 'sindicalizado' };
const INTENT_ES = { no_reductions: 'sin recortes', redeploy: 'reubicar', attrition_only: 'solo por bajas naturales', undecided: 'sin decidir' };
const STATUS_ES = { proposed: 'propuesto', confirmed: 'confirmado', rejected: 'descartado' };
const CONF_ES = { high: 'alta', medium: 'media', low: 'baja', stated: 'declarada' };
const RATING_ES = { green: 'Verde', yellow: 'Amarillo', red: 'Rojo' };
const RISK_ES = { low: 'riesgo bajo', medium: 'riesgo medio', high: 'riesgo alto' };

function scale(id, label, val, why) {
  return `<label for="${id}">${esc(label)}</label>
    <select id="${id}">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${Number(val) === n ? ' selected' : ''}>${n}</option>`).join('')}
    <option value=""${!val ? ' selected' : ''}>—</option></select>
    ${why ? `<p class="faint" style="margin:5px 0 0">${esc(why)}</p>` : ''}`;
}

function renderQuestions(a) {
  const f = a.fears || {}, c = a.cost || {}, r = a.risk || {}, d = a.data || {};
  $('qform').innerHTML = `
    <h3>Qué es lo que realmente te frena</h3>
    <div class="checks" id="topfears">${Object.entries(FEARS).map(([k, v]) =>
      `<label class="chk${(f.top_fears || []).includes(k) ? ' on' : ''}"><input type="checkbox" data-fear="${k}"${(f.top_fears || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
    <label for="q-biggest">De esos, ¿cuál es el verdadero obstáculo? <span style="color:var(--bad)">*</span></label>
    <select id="q-biggest"><option value="">—</option>${Object.entries(FEARS).map(([k, v]) =>
      `<option value="${k}"${f.biggest_fear === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>

    <h3 style="margin-top:26px">Lo que puedes arriesgar con tranquilidad</h3>
    <label for="q-budget">¿Cuánto podrías gastar una sola vez en un piloto sin perder el sueño si no devolviera nada? (USD) <span style="color:var(--bad)">*</span></label>
    <input id="q-budget" type="number" min="0" value="${c.comfortable_pilot_budget_usd || ''}">
    <p class="faint" style="margin:5px 0 0">Es un techo, no una meta. La Fase 1 se dimensiona para caber debajo; si no cabe, se te dice, en lugar de estirarla hasta ahí.</p>
    <div class="grid g2">
      <div><label for="q-run">¿Y al mes para mantenerlo funcionando? (USD)</label><input id="q-run" type="number" min="0" value="${c.monthly_run_comfort_usd || ''}"></div>
      <div><label for="q-political">Si el piloto fracasara a la vista de todos, ¿cuánto te costaría internamente?</label>
        <select id="q-political">${['', 'low', 'medium', 'high'].map(v => `<option value="${v}"${c.political_cost_of_failure === v ? ' selected' : ''}>${v ? LEVEL_ES[v] : '—'}</option>`).join('')}</select></div>
    </div>
    <label for="q-leak">Una cifra que ya sabes que estás perdiendo, al año (USD)</label>
    <input id="q-leak" type="number" min="0" value="${c.known_leak_annual_usd || ''}">
    <p class="faint" style="margin:5px 0 0">Si la dejas en blanco, la omitimos. Nunca estimamos una pérdida por ti.</p>

    <h3 style="margin-top:26px">Lo que no puede salir mal</h3>
    <label>¿Cuáles de estos te quitan el sueño? <span style="color:var(--bad)">*</span></label>
    <div class="checks" id="riskbox">${Object.entries(RISKS).map(([k, v]) =>
      `<label class="chk${(r.risk_concerns || []).includes(k) ? ' on' : ''}"><input type="checkbox" data-risk="${k}"${(r.risk_concerns || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
    <label>¿Qué regulaciones te aplican?</label>
    <div class="checks" id="regbox">${Object.entries(REGIMES).map(([k, v]) =>
      `<label class="chk${(r.regulatory_regimes || []).includes(k) ? ' on' : ''}"><input type="checkbox" data-reg="${k}"${(r.regulatory_regimes || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
    <label for="q-worst">Describe el peor resultado realista, con tus propias palabras</label>
    <textarea id="q-worst" rows="2">${esc(r.worst_case || '')}</textarea>
    <p class="faint" style="margin:5px 0 0">Se cita textualmente en tu hoja de ruta junto a la salvaguarda que lo evita. Parafrasearlo quitaría el sentido de preguntarlo.</p>
    <div class="grid g2">
      <div><label for="q-intent">Tu intención real sobre la plantilla</label>
        <select id="q-intent">${['', 'no_reductions', 'redeploy', 'attrition_only', 'undecided'].map(v => `<option value="${v}"${r.headcount_intent === v ? ' selected' : ''}>${v ? INTENT_ES[v] : '—'}</option>`).join('')}</select>
        <p class="faint" style="margin:5px 0 0">Queda por escrito en la hoja de ruta. Si no se declara, cada empleado del edificio supone que es la peor.</p></div>
      <div><label for="q-sensitivity">¿Qué tan sensible es tu equipo a este tema?</label>
        <select id="q-sensitivity">${['', 'low', 'medium', 'high', 'unionized'].map(v => `<option value="${v}"${r.workforce_sensitivity === v ? ' selected' : ''}>${v ? LEVEL_ES[v] : '—'}</option>`).join('')}</select></div>
    </div>

    <h3 style="margin-top:26px">En qué estado están tus datos</h3>
    <p class="faint">Tus sistemas se obtuvieron de lo que la captura realmente vio, así que aquí no se preguntan. Estos cuatro son juicios que solo tú puedes hacer.</p>
    <div class="grid g2">
      <div>${scale('q-exists', '¿Los datos de esos procesos se registran en algún lado? (1–5)', d.data_exists)}</div>
      <div>${scale('q-quality', 'Si sacaras un reporte ahora mismo, ¿confiarías en él? (1–5) *', d.data_quality)}</div>
      <div>${scale('q-access', '¿Qué tan fácil es sacar datos de esos sistemas? (1–5) *', d.data_accessible, '5 significa una exportación sencilla o una API real.')}</div>
      <div>${scale('q-struct', '¿Estructurados, en lugar de PDF y notas? (1–5)', d.data_structured)}</div>
    </div>
    <div class="checks" style="margin-top:14px">
      <label class="chk${d.contains_pii ? ' on' : ''}"><input type="checkbox" id="q-pii"${d.contains_pii ? ' checked' : ''}><span>Contienen datos personales, de salud o de pagos <span style="color:var(--bad)">*</span></span></label>
      <label class="chk${d.dpa_in_place ? ' on' : ''}"><input type="checkbox" id="q-dpa"${d.dpa_in_place ? ' checked' : ''}><span>Tenemos acuerdos de tratamiento de datos con los proveedores actuales</span></label>
      <label class="chk${d.data_owner_exists ? ' on' : ''}"><input type="checkbox" id="q-owner"${d.data_owner_exists ? ' checked' : ''}><span>Una persona es responsable de la calidad de los datos</span></label>
      <label class="chk${d.retention_policy ? ' on' : ''}"><input type="checkbox" id="q-retention"${d.retention_policy ? ' checked' : ''}><span>Hay una política escrita de conservación o eliminación</span></label>
    </div>
    <div class="msg" id="qmsg"></div>
    <button class="btn primary" id="saveAnswers" style="margin-top:18px">Guardar respuestas</button>`;

  $('qform').querySelectorAll('.chk').forEach(l => l.addEventListener('click', () =>
    setTimeout(() => l.classList.toggle('on', l.querySelector('input').checked), 0)));
  $('saveAnswers').addEventListener('click', saveAnswers);
}

const num = v => { const n = Number(v); return Number.isFinite(n) && v !== '' ? n : null; };
const checked = sel => Array.from(document.querySelectorAll(sel)).filter(i => i.checked).map(i => i.dataset.fear || i.dataset.risk || i.dataset.reg);

async function saveAnswers() {
  const b = $('saveAnswers'); b.disabled = true; b.textContent = 'Guardando…';
  const payloads = {
    fears: { top_fears: checked('[data-fear]'), biggest_fear: $('q-biggest').value || null },
    cost: {
      comfortable_pilot_budget_usd: num($('q-budget').value),
      monthly_run_comfort_usd: num($('q-run').value),
      known_leak_annual_usd: num($('q-leak').value),
      political_cost_of_failure: $('q-political').value || null
    },
    risk: {
      risk_concerns: checked('[data-risk]'), regulatory_regimes: checked('[data-reg]'),
      worst_case: $('q-worst').value.trim() || null,
      headcount_intent: $('q-intent').value || null,
      workforce_sensitivity: $('q-sensitivity').value || null
    },
    data: {
      data_exists: num($('q-exists').value), data_quality: num($('q-quality').value),
      data_accessible: num($('q-access').value), data_structured: num($('q-struct').value),
      contains_pii: $('q-pii').checked, dpa_in_place: $('q-dpa').checked,
      data_owner_exists: $('q-owner').checked, retention_policy: $('q-retention').checked
    }
  };
  for (const [section, payload] of Object.entries(payloads)) {
    await api('/api/v1/answers/' + section, { method: 'PUT', body: JSON.stringify(payload) });
  }
  b.disabled = false; b.textContent = 'Guardar respuestas';
  $('qmsg').className = 'msg ok on'; $('qmsg').textContent = 'Guardado.';
  load();
}

/* ── processes ───────────────────────────────────────────────────────────── */
function renderProcesses(list) {
  if (!list.length) {
    $('proclist').innerHTML = '<div class="card"><p class="mut" style="margin:0">Todavía no se ha observado nada. <a href="/discovery/connect">Conecta una fuente</a>, trabaja normalmente unos días y luego presiona <b>Volver a leer las capturas</b>.</p></div>';
    return;
  }
  const order = { proposed: 0, confirmed: 1, rejected: 2 };
  list.sort((a, b) => (order[a.status] - order[b.status]) || (b.hours_per_week - a.hours_per_week));
  $('proclist').innerHTML = list.map(p => {
    const ev = p.evidence || {};
    const conf = ev.confidence || 'low';
    const confPill = conf === 'high' ? 'green' : conf === 'medium' ? 'yellow' : conf === 'stated' ? 'blue' : 'red';
    const measured = p.hours_source === 'measured';
    return `<div class="card" data-p="${p.id}" style="${p.status === 'rejected' ? 'opacity:.5' : ''}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:220px">
          <h3 style="margin:0">${esc(p.name)}</h3>
          <div class="row" style="gap:6px;margin-top:7px">
            <span class="pill ${p.status === 'confirmed' ? 'green' : p.status === 'rejected' ? '' : 'yellow'}">${esc(STATUS_ES[p.status] || p.status)}</span>
            <span class="pill ${confPill}">${measured ? 'medido' : 'declarado'} · ${esc(CONF_ES[conf] || conf)}</span>
            ${Number(p.loaded_hourly_cost) > 0 ? '<span class="pill green">con costo</span>' : '<span class="pill red">sin tarifa</span>'}
          </div>
          <p class="mut" style="font-size:13.5px;margin:10px 0 0">
            <b>${p.hours_per_week}</b> h/semana por persona · <b>${p.people}</b> ${p.people === 1 ? 'persona' : 'personas'}
            ${p.observed_runs ? ` · ${p.observed_runs} ${p.observed_runs === 1 ? 'ejecución observada' : 'ejecuciones observadas'} en ${p.observed_window_days} día${p.observed_window_days === 1 ? '' : 's'}` : ''}
            ${p.median_run_minutes ? ` · ejecución mediana ${p.median_run_minutes} min` : ''}
          </p>
          ${(p.apps || []).length ? `<p class="faint" style="margin:5px 0 0">${(p.apps || []).map(a => esc(a.app || a)).join(' · ')}</p>` : ''}
          ${(ev.caveats || []).map(c => `<p class="faint" style="margin:7px 0 0;color:var(--warn)">${esc(c)}</p>`).join('')}
        </div>
        <div class="row" style="gap:6px">
          ${p.status !== 'confirmed' ? `<button class="btn primary sm" data-act="confirm" data-id="${p.id}">Confirmar</button>` : ''}
          ${p.status !== 'rejected' ? `<button class="btn ghost sm" data-act="reject" data-id="${p.id}">No es un proceso</button>` : ''}
        </div>
      </div>
      ${p.status === 'rejected' ? '' : `<div class="grid g3" style="margin-top:14px">
        <div><label>Costo por hora con cargas (USD)</label>
          <input type="number" min="0" step="1" data-f="loaded_hourly_cost" data-id="${p.id}" value="${p.loaded_hourly_cost || ''}" placeholder="sin definir">
          <p class="faint" style="margin:5px 0 0">En blanco significa que este proceso aporta cero dólares y se lista como sin costo.</p></div>
        <div><label>Un cliente ve el resultado</label>
          <select data-f="customer_facing" data-id="${p.id}">
            <option value="">sin responder</option>
            <option value="true"${p.customer_facing === true ? ' selected' : ''}>sí</option>
            <option value="false"${p.customer_facing === false ? ' selected' : ''}>no</option></select></div>
        <div><label>Toca datos regulados o personales</label>
          <select data-f="involves_regulated_data" data-id="${p.id}">
            <option value="">sin responder</option>
            <option value="true"${p.involves_regulated_data === true ? ' selected' : ''}>sí</option>
            <option value="false"${p.involves_regulated_data === false ? ' selected' : ''}>no</option></select></div>
        <div><label>Costo de un error aquí</label>
          <select data-f="error_tolerance" data-id="${p.id}">
            <option value="">sin responder</option>
            ${['high', 'medium', 'low', 'zero'].map(v => `<option value="${v}"${p.error_tolerance === v ? ' selected' : ''}>${LEVEL_ES[v]}</option>`).join('')}</select></div>
      </div>`}
    </div>`;
  }).join('');

  $('proclist').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
    await api('/api/v1/processes/' + b.dataset.id, {
      method: 'PATCH', body: JSON.stringify({ status: b.dataset.act === 'confirm' ? 'confirmed' : 'rejected' })
    });
    load();
  }));
  $('proclist').querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', async () => {
    const f = el.dataset.f;
    let v = el.value;
    if (f === 'loaded_hourly_cost') v = v === '' ? null : Number(v);
    else if (f === 'customer_facing' || f === 'involves_regulated_data') v = v === '' ? null : v === 'true';
    else if (v === '') v = null;
    await api('/api/v1/processes/' + el.dataset.id, { method: 'PATCH', body: JSON.stringify({ [f]: v }) });
    load();
  }));
}

/* ── findings ────────────────────────────────────────────────────────────── */
function renderFindings(list) {
  $('findings').innerHTML = list.length ? list.map(f => `
    <div class="finding">
      <span class="sev ${esc(f.severity)}"></span>
      <div style="flex:1">
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.explanation)}</p>
        ${f.dollarImpact ? `<div class="impact">${esc(f.dollarImpact)}</div>` : ''}
        <p class="faint" style="margin-top:6px">${esc(f.code)} · fuente: ${esc(f.source)}</p>
      </div>
      ${f.treatment ? `<a class="btn ghost sm" href="${esc(f.treatment.href)}">${esc(f.treatment.label)}</a>` : ''}
    </div>`).join('') : '<p class="mut" style="margin:0">Nada todavía.</p>';
}


/** The verdict is our <h2>; the engine also closes its summary with it. Drop
 *  the echo here rather than editing the shared engine, whose own console
 *  renders the summary without a heading above it and needs that sentence. */
function trimEcho(summary, verdict) {
  if (!summary || !verdict) return summary || '';
  const s = String(summary).trim();
  const v = String(verdict).trim();
  return s.endsWith(v) ? s.slice(0, -v.length).trim() : s;
}

/* ── the roadmap ─────────────────────────────────────────────────────────── */
function renderRoadmap(ev) {
  if (!ev) { $('roadmapSec').classList.add('hide'); return; }
  $('roadmapSec').classList.remove('hide');
  const sc = ev.scorecard || {};

  $('verdict').innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-start">
    <div><span class="pill ${esc(sc.overall_rating)}">${esc(RATING_ES[sc.overall_rating] || sc.overall_rating || '')}</span>
      <h2 style="margin:10px 0 4px">${esc(sc.verdict_label || '')}</h2>
      <p class="mut" style="margin:0;font-size:14px">${esc(trimEcho(ev.executive_summary, sc.verdict_label))}</p></div>
  </div>`;

  $('lanes').innerHTML = (sc.lanes || []).map(l => `
    <div class="card"><div class="row" style="justify-content:space-between">
      <h3 style="margin:0">${esc(l.title)}</h3><span class="pill ${esc(l.rating)}">${l.score == null ? '—' : l.score}</span></div>
      <p class="faint" style="margin:4px 0 8px">${esc(l.question)}</p>
      <p class="mut" style="font-size:13.5px;margin:0">${esc(l.headline)}</p>
      ${(l.what_would_move_it || []).length ? `<p class="faint" style="margin:9px 0 0"><b>Para moverlo:</b> ${l.what_would_move_it.map(esc).join(' · ')}</p>` : ''}
    </div>`).join('');

  // Both layouts are rendered from the one JSON; CSS decides which is visible.
  // Rendering only on demand would risk the printed diagram being stale.
  $('diagram').innerHTML = window.DiscoveryDiagram.render(ev.diagram || {});
  $('diagramPrint').innerHTML = window.DiscoveryDiagram.renderVertical(ev.diagram || {});

  $('phases').innerHTML = (ev.phases || []).map(p => `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><span class="faint mono">FASE ${p.number}</span><h3 style="margin:3px 0 0">${esc(p.title)}</h3></div>
        <div class="row" style="gap:6px">
          ${p.risk_level ? `<span class="pill ${p.risk_level === 'low' ? 'green' : p.risk_level === 'medium' ? 'yellow' : 'red'}">${esc(RISK_ES[p.risk_level] || p.risk_level)}</span>` : ''}
          ${p.timeline_weeks ? `<span class="pill">${p.timeline_weeks} semanas</span>` : ''}
        </div>
      </div>
      <p class="mut" style="font-size:14px;margin:10px 0">${esc(p.objective || '')}</p>
      ${(p.scope || []).length ? `<p style="font-size:13.5px;margin:0 0 8px"><b>Dentro del alcance:</b> ${p.scope.map(esc).join(' · ')}</p>` : ''}
      ${(p.out_of_scope || []).length ? `<p class="faint" style="margin:0 0 8px"><b>Fuera del alcance:</b> ${p.out_of_scope.map(o => esc(o.name) + (o.why ? ` (${esc(o.why)})` : '')).join(' · ')}</p>` : ''}
      ${p.cost && (p.cost.build_usd_range || p.cost.run_monthly_usd) ? `<p class="mono" style="font-size:13px;margin:0 0 8px">
        construcción ${esc(p.cost.build_usd_range || '—')}${p.cost.run_monthly_usd ? ` · operación $${p.cost.run_monthly_usd}/mes` : ''}${p.cost.max_exposure_usd ? ` · lo máximo que puedes perder $${p.cost.max_exposure_usd}` : ''}</p>` : ''}
      ${p.number === 3 ? '<div class="note">Sin precio a propósito. Ponerle costo a una transformación llena de incógnitas produce una cifra inventada, y una cifra inventada es lo que enseña a los directivos a desconfiar de estos documentos.</div>' : ''}
      ${(p.success_metrics || []).length ? `<p class="faint" style="margin:8px 0 0"><b>Se mide con:</b> ${p.success_metrics.slice(0, 4).map(m => esc(typeof m === 'string' ? m : m.metric || m.criterion || JSON.stringify(m))).join(' · ')}</p>` : ''}
      ${p.gate ? `<div class="note" style="border-left-color:var(--violet)"><b>${esc(p.gate.title)}</b><br>${(p.gate.conditions || []).map(esc).join('<br>')}${p.gate.if_not_met ? `<br><span class="faint">${esc(p.gate.if_not_met)}</span>` : ''}</div>` : ''}
    </div>`).join('');

  const ns = ev.safe_next_step || {};
  $('nextstep').innerHTML = ns.title || ns.step ? `<div class="card" style="border-color:var(--blue);background:var(--grad-soft)">
    <span class="pill blue">Tu siguiente paso</span>
    <h3 style="margin:10px 0 6px">${esc(ns.title || ns.step)}</h3>
    <p class="mut" style="font-size:14px;margin:0">${esc(ns.why || ns.detail || ns.description || '')}</p>
    ${ns.cost_usd || ns.exposure_usd ? `<p class="mono" style="margin:8px 0 0">${esc(ns.cost_usd || ns.exposure_usd)}</p>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn primary sm" id="quote">Pedir cotización a Synthex SAI</button>
      ${ev.share_token ? `<a class="btn ghost sm" href="/discovery/r/${esc(ev.share_token)}">Enlace de solo lectura para compartir</a>` : ''}
    </div>
    <p class="faint" style="margin:10px 0 0">La evaluación y esta hoja de ruta son gratis y siguen siendo tuyas. La construcción se cotiza aparte, según su alcance.</p>
  </div>` : '';
  if ($('quote')) $('quote').addEventListener('click', async () => {
    await api('/api/v1/quote-request', { method: 'POST', body: JSON.stringify({}) });
    $('quote').textContent = 'Solicitada'; $('quote').disabled = true;
  });

  const cov = ev.coverage || {};
  $('coverage').innerHTML = `<div class="card"><h3>De dónde salió cada número</h3>
    <p class="mut" style="font-size:13.5px">Ya te han vendido promesas exageradas antes. Deberías poder comprobar esto, no solo recibir garantías.</p>
    <div class="scroll"><table><thead><tr><th>Dato</th><th>Origen</th><th>Detalle</th></tr></thead><tbody>
      <tr><td>Horas por semana</td><td><span class="pill green">medido</span></td>
        <td class="mut">${cov.hours ? `${cov.hours.runs || 0} ejecuciones observadas en ${cov.hours.window_days || '?'} días.${(cov.hours.low_confidence || []).length ? ' Confianza baja: ' + cov.hours.low_confidence.map(esc).join(', ') + '.' : ''}` : '—'}</td></tr>
      <tr><td>Tarifas por hora</td><td><span class="pill yellow">declarado por ti</span></td>
        <td class="mut">${cov.rates ? `${cov.rates.costed} con costo, ${cov.rates.uncosted} sin costo.${cov.rates.uncosted ? ' ' + esc(cov.rates.uncosted_effect) : ''}` : '—'}</td></tr>
      <tr><td>Sistemas</td><td><span class="pill blue">derivado</span></td>
        <td class="mut">${cov.systems ? 'Obtenidos de las aplicaciones que la captura realmente vio: ' + (cov.systems.derived || []).map(esc).join(', ') : '—'}</td></tr>
      <tr><td>Indicadores de cara al cliente / regulado</td><td><span class="pill yellow">declarado por ti</span></td>
        <td class="mut">${cov.process_attributes ? `${cov.process_attributes.answered} respondidos, ${cov.process_attributes.unanswered} sin responder. ${esc(cov.process_attributes.note)}` : '—'}</td></tr>
      <tr><td>Postura de datos</td><td><span class="pill yellow">declarado por ti</span></td>
        <td class="mut">${cov.data_posture ? `Puntaje ${cov.data_posture.score}, ${esc(RATING_ES[cov.data_posture.rating] || cov.data_posture.rating)}.` : '—'}</td></tr>
    </tbody></table></div>
    ${(cov.absent || []).length ? `<div class="warnbox"><b>No disponible y, por lo tanto, no usado:</b><br>${cov.absent.map(esc).join('<br>')}</div>` : ''}
  </div>`;
}

/* ── load ────────────────────────────────────────────────────────────────── */
async function load() {
  const d = await api('/api/v1/overview');
  if (!d) return;
  STATE = d;
  $('boot').classList.add('hide'); $('main').classList.remove('hide');

  $('co').textContent = d.account.company_name;
  $('sub').textContent = [d.account.industry, d.account.country, d.account.headcount ? d.account.headcount + ' personas' : null]
    .filter(Boolean).join(' · ');

  const s = d.steps;
  const steps = [
    ['1', 'Conecta una fuente', s.connected], ['2', 'Captura el trabajo', s.captured],
    ['3', 'Confirma los procesos', s.confirmed], ['4', 'Agrega tarifas por hora', s.costed],
    ['5', 'Responde seis preguntas', s.answered], ['6', 'Obtén tu hoja de ruta', s.evaluated]
  ];
  const nowIdx = steps.findIndex(x => !x[2]);
  $('stepper').innerHTML = steps.map(([n, t, done], i) =>
    `<div class="step${done ? ' done' : ''}${i === nowIdx ? ' now' : ''}"><div class="n">Paso ${n}</div><div class="t">${t}</div></div>`).join('');

  const c = d.captures;
  $('capstats').innerHTML = `
    <div class="card"><div class="faint">Ejecuciones observadas</div><h2 style="margin:4px 0 0">${c.count || 0}</h2>
      <p class="faint" style="margin:4px 0 0">${c.steps || 0} pasos · ${c.minutes || 0} minutos</p></div>
    <div class="card"><div class="faint">Ventana de observación</div><h2 style="margin:4px 0 0">${c.window_days || 0} día${c.window_days === 1 ? '' : 's'}</h2>
      <p class="faint" style="margin:4px 0 0">${(c.window_days || 0) >= 7 ? 'Una semana completa o más. Las tasas no llevan advertencia.' : 'Menos de una semana. Las tasas se reportan sin escalar, nunca multiplicadas.'}</p></div>
    <div class="card"><div class="faint">Personas distintas</div><h2 style="margin:4px 0 0">${c.people || 0}</h2>
      <p class="faint" style="margin:4px 0 0">Contadas por referencia cifrada. Nunca identificadas.</p></div>`;

  const r = c.redaction || {};
  const stripped = (r.text_values_dropped || 0) + (r.query_strings_dropped || 0) + (r.identifiers_masked || 0) + (r.fields_dropped || 0);
  $('redaction').innerHTML = stripped ? `<div class="note"><b>El límite de privacidad, contado.</b>
    Antes de guardar nada, el servidor descartó <b>${r.fields_dropped || 0}</b> campos no permitidos
    (de los cuales <b>${r.text_values_dropped || 0}</b> llevaban texto), eliminó completas <b>${r.query_strings_dropped || 0}</b> cadenas de consulta
    y enmascaró <b>${r.identifiers_masked || 0}</b> identificadores de ruta. Se cuenta en lugar de afirmarse, para que puedas comprobarlo en vez de confiar.</div>` : '';

  renderProcesses(d.processes || []);
  renderQuestions(d.answers || {});
  renderFindings(d.findings || []);
  renderRoadmap(d.latest_evaluation);

  const missing = d.missing_answers || [];
  $('missingBox').innerHTML = missing.length
    ? `<div class="warnbox"><b>${missing.length === 1 ? 'Falta 1 respuesta obligatoria' : `Faltan ${missing.length} respuestas obligatorias`}.</b>
       La evaluación no se ejecuta pasándolas por alto: las nombra. Esa negativa es la diferencia entre esto y el documento que te vendieron la última vez.<br>
       ${missing.map(m => '· ' + esc(m.question.es || m.question.en || m.question)).join('<br>')}</div>`
    : '<div class="msg ok on">Las seis están respondidas.</div>';

  const btn = $('runEval');
  btn.disabled = !d.can_evaluate;
  $('evalNote').textContent = d.can_evaluate
    ? (d.latest_evaluation ? `La versión ${d.latest_evaluation.version} se generó el ${new Date(d.latest_evaluation.created_at).toLocaleDateString('es')}. Ejecutarla de nuevo crea una versión nueva: una hoja de ruta que alguien ya leyó nunca cambia sin avisar.` : 'Gratis. Tarda un segundo.')
    : (!d.steps.confirmed ? 'Primero confirma al menos un proceso.' : 'Primero responde las seis preguntas.');
}

$('rederive').addEventListener('click', async () => {
  const b = $('rederive'); b.disabled = true; b.textContent = 'Leyendo…';
  await api('/api/v1/processes/derive', { method: 'POST' });
  b.disabled = false; b.textContent = 'Volver a leer las capturas'; load();
});

$('addManual').addEventListener('click', async () => {
  const name = prompt('¿Cómo se llama el proceso?'); if (!name) return;
  const hours = Number(prompt('Horas por semana, por persona')) || 0;
  const people = Number(prompt('¿Cuántas personas participan en él?')) || 1;
  await api('/api/v1/processes', { method: 'POST', body: JSON.stringify({ name, hours_per_week: hours, people }) });
  load();
});

$('runEval').addEventListener('click', async () => {
  const b = $('runEval'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Ejecutando…';
  const j = await api('/api/v1/evaluation/run', { method: 'POST', body: JSON.stringify({}) });
  b.innerHTML = 'Ejecutar la evaluación';
  if (j && j.success) {
    $('evalMsg').className = 'msg ok on';
    $('evalMsg').textContent = `Versión ${j.version} generada.`;
    await load();
    $('roadmapSec').scrollIntoView({ behavior: 'smooth' });
  } else {
    $('evalMsg').className = 'msg err on';
    $('evalMsg').textContent = (j && j.message) || 'No se pudo ejecutar.';
    b.disabled = false;
  }
});

load();
