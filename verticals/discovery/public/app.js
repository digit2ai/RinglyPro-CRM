'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (url, opts) => {
  const r = await fetch('/discovery' + url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (r.status === 401) { location.href = '/discovery/login'; return null; }
  return r.json();
};

let STATE = null;

$('out').addEventListener('click', async e => {
  e.preventDefault(); await api('/api/v1/auth/logout', { method: 'POST' });
  location.href = '/discovery/login';
});

/* ── questions a capture cannot answer ────────────────────────────────────
 * Six required, plus a handful that sharpen the result. Deliberately short:
 * the full readiness interview asks about forty things, and better than thirty
 * of them are now measured. That reduction is the product. */
const FEARS = {
  cost: 'It will cost more than it returns', risk: 'Something will go wrong and I will own it',
  data: 'Our data is a mess', job_disruption: 'What it does to my people',
  vendor_lockin: 'Getting locked into a vendor', dont_know_where_to_start: 'I do not know where to start',
  been_oversold_before: 'I have been oversold this before', reputation: 'A public mistake in front of customers'
};
const RISKS = {
  security: 'Our data leaking out', compliance: 'Breaking a regulation',
  errors: 'The AI being confidently wrong', reputation: 'Embarrassing us in front of a customer',
  job_disruption: 'Damaging morale or losing people', vendor_lockin: 'Not being able to leave',
  ip_leakage: 'Our know-how training someone else\'s model', bad_decisions: 'Someone acting on a wrong answer'
};
const REGIMES = { none: 'None', hipaa: 'HIPAA', gdpr: 'GDPR', ccpa: 'CCPA', pci: 'PCI', sox: 'SOX', glba: 'GLBA', local_data_residency: 'Data residency', industry_specific: 'Industry-specific' };

function scale(id, label, val, why) {
  return `<label for="${id}">${esc(label)}</label>
    <select id="${id}">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${Number(val) === n ? ' selected' : ''}>${n}</option>`).join('')}
    <option value=""${!val ? ' selected' : ''}>—</option></select>
    ${why ? `<p class="faint" style="margin:5px 0 0">${esc(why)}</p>` : ''}`;
}

function renderQuestions(a) {
  const f = a.fears || {}, c = a.cost || {}, r = a.risk || {}, d = a.data || {};
  $('qform').innerHTML = `
    <h3>What is actually holding you back</h3>
    <div class="checks" id="topfears">${Object.entries(FEARS).map(([k, v]) =>
      `<label class="chk${(f.top_fears || []).includes(k) ? ' on' : ''}"><input type="checkbox" data-fear="${k}"${(f.top_fears || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
    <label for="q-biggest">Of those, which is the real blocker? <span style="color:var(--bad)">*</span></label>
    <select id="q-biggest"><option value="">—</option>${Object.entries(FEARS).map(([k, v]) =>
      `<option value="${k}"${f.biggest_fear === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>

    <h3 style="margin-top:26px">What you can comfortably risk</h3>
    <label for="q-budget">What could you spend once, on a pilot, and not lose sleep if it returned nothing? (USD) <span style="color:var(--bad)">*</span></label>
    <input id="q-budget" type="number" min="0" value="${c.comfortable_pilot_budget_usd || ''}">
    <p class="faint" style="margin:5px 0 0">A ceiling, not a target. Phase 1 is sized to fit under it; if it cannot, you are told that rather than being stretched to it.</p>
    <div class="grid g2">
      <div><label for="q-run">And per month to keep it running? (USD)</label><input id="q-run" type="number" min="0" value="${c.monthly_run_comfort_usd || ''}"></div>
      <div><label for="q-political">If the pilot visibly failed, what would that cost you internally?</label>
        <select id="q-political">${['', 'low', 'medium', 'high'].map(v => `<option value="${v}"${c.political_cost_of_failure === v ? ' selected' : ''}>${v || '—'}</option>`).join('')}</select></div>
    </div>
    <label for="q-leak">A number you already know you are losing, per year (USD)</label>
    <input id="q-leak" type="number" min="0" value="${c.known_leak_annual_usd || ''}">
    <p class="faint" style="margin:5px 0 0">Left blank we omit it. We never estimate a loss on your behalf.</p>

    <h3 style="margin-top:26px">What must not go wrong</h3>
    <label>Which of these keep you up at night? <span style="color:var(--bad)">*</span></label>
    <div class="checks" id="riskbox">${Object.entries(RISKS).map(([k, v]) =>
      `<label class="chk${(r.risk_concerns || []).includes(k) ? ' on' : ''}"><input type="checkbox" data-risk="${k}"${(r.risk_concerns || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
    <label>Which regulations apply to you?</label>
    <div class="checks" id="regbox">${Object.entries(REGIMES).map(([k, v]) =>
      `<label class="chk${(r.regulatory_regimes || []).includes(k) ? ' on' : ''}"><input type="checkbox" data-reg="${k}"${(r.regulatory_regimes || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
    <label for="q-worst">Describe the worst realistic outcome, in your own words</label>
    <textarea id="q-worst" rows="2">${esc(r.worst_case || '')}</textarea>
    <p class="faint" style="margin:5px 0 0">Quoted verbatim in your roadmap beside the guardrail that prevents it. Paraphrasing this loses the point of asking.</p>
    <div class="grid g2">
      <div><label for="q-intent">Your actual intent on headcount</label>
        <select id="q-intent">${['', 'no_reductions', 'redeploy', 'attrition_only', 'undecided'].map(v => `<option value="${v}"${r.headcount_intent === v ? ' selected' : ''}>${v ? v.replace(/_/g, ' ') : '—'}</option>`).join('')}</select>
        <p class="faint" style="margin:5px 0 0">Stated in writing in the roadmap. An unstated intent is assumed to be the worst one by every employee in the building.</p></div>
      <div><label for="q-sensitivity">How sensitive is your team to this topic?</label>
        <select id="q-sensitivity">${['', 'low', 'medium', 'high', 'unionized'].map(v => `<option value="${v}"${r.workforce_sensitivity === v ? ' selected' : ''}>${v || '—'}</option>`).join('')}</select></div>
    </div>

    <h3 style="margin-top:26px">What state your data is in</h3>
    <p class="faint">Your systems were read from what the capture actually saw, so they are not asked for here. These four are judgements only you can make.</p>
    <div class="grid g2">
      <div>${scale('q-exists', 'Is the data for those processes captured at all? (1–5)', d.data_exists)}</div>
      <div>${scale('q-quality', 'If you pulled a report right now, would you trust it? (1–5) *', d.data_quality)}</div>
      <div>${scale('q-access', 'How easy is it to get data out of those systems? (1–5) *', d.data_accessible, '5 means an easy export or a real API.')}</div>
      <div>${scale('q-struct', 'Structured, rather than PDFs and notes? (1–5)', d.data_structured)}</div>
    </div>
    <div class="checks" style="margin-top:14px">
      <label class="chk${d.contains_pii ? ' on' : ''}"><input type="checkbox" id="q-pii"${d.contains_pii ? ' checked' : ''}><span>It contains personal, health or payment data <span style="color:var(--bad)">*</span></span></label>
      <label class="chk${d.dpa_in_place ? ' on' : ''}"><input type="checkbox" id="q-dpa"${d.dpa_in_place ? ' checked' : ''}><span>We have data-processing agreements with current vendors</span></label>
      <label class="chk${d.data_owner_exists ? ' on' : ''}"><input type="checkbox" id="q-owner"${d.data_owner_exists ? ' checked' : ''}><span>One person owns data quality</span></label>
      <label class="chk${d.retention_policy ? ' on' : ''}"><input type="checkbox" id="q-retention"${d.retention_policy ? ' checked' : ''}><span>There is a written retention or deletion policy</span></label>
    </div>
    <div class="msg" id="qmsg"></div>
    <button class="btn primary" id="saveAnswers" style="margin-top:18px">Save answers</button>`;

  $('qform').querySelectorAll('.chk').forEach(l => l.addEventListener('click', () =>
    setTimeout(() => l.classList.toggle('on', l.querySelector('input').checked), 0)));
  $('saveAnswers').addEventListener('click', saveAnswers);
}

const num = v => { const n = Number(v); return Number.isFinite(n) && v !== '' ? n : null; };
const checked = sel => Array.from(document.querySelectorAll(sel)).filter(i => i.checked).map(i => i.dataset.fear || i.dataset.risk || i.dataset.reg);

async function saveAnswers() {
  const b = $('saveAnswers'); b.disabled = true; b.textContent = 'Saving…';
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
  b.disabled = false; b.textContent = 'Save answers';
  $('qmsg').className = 'msg ok on'; $('qmsg').textContent = 'Saved.';
  load();
}

/* ── processes ───────────────────────────────────────────────────────────── */
function renderProcesses(list) {
  if (!list.length) {
    $('proclist').innerHTML = '<div class="card"><p class="mut" style="margin:0">Nothing observed yet. <a href="/discovery/connect">Connect a source</a>, work normally for a few days, then press <b>Re-read captures</b>.</p></div>';
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
            <span class="pill ${p.status === 'confirmed' ? 'green' : p.status === 'rejected' ? '' : 'yellow'}">${esc(p.status)}</span>
            <span class="pill ${confPill}">${measured ? 'measured' : 'stated'} · ${esc(conf)}</span>
            ${Number(p.loaded_hourly_cost) > 0 ? '<span class="pill green">costed</span>' : '<span class="pill red">no rate</span>'}
          </div>
          <p class="mut" style="font-size:13.5px;margin:10px 0 0">
            <b>${p.hours_per_week}</b> h/week per person · <b>${p.people}</b> ${p.people === 1 ? 'person' : 'people'}
            ${p.observed_runs ? ` · ${p.observed_runs} observed run${p.observed_runs === 1 ? '' : 's'} over ${p.observed_window_days} day${p.observed_window_days === 1 ? '' : 's'}` : ''}
            ${p.median_run_minutes ? ` · median run ${p.median_run_minutes} min` : ''}
          </p>
          ${(p.apps || []).length ? `<p class="faint" style="margin:5px 0 0">${(p.apps || []).map(a => esc(a.app || a)).join(' · ')}</p>` : ''}
          ${(ev.caveats || []).map(c => `<p class="faint" style="margin:7px 0 0;color:var(--warn)">${esc(c)}</p>`).join('')}
        </div>
        <div class="row" style="gap:6px">
          ${p.status !== 'confirmed' ? `<button class="btn primary sm" data-act="confirm" data-id="${p.id}">Confirm</button>` : ''}
          ${p.status !== 'rejected' ? `<button class="btn ghost sm" data-act="reject" data-id="${p.id}">Not a process</button>` : ''}
        </div>
      </div>
      ${p.status === 'rejected' ? '' : `<div class="grid g3" style="margin-top:14px">
        <div><label>Loaded hourly cost (USD)</label>
          <input type="number" min="0" step="1" data-f="loaded_hourly_cost" data-id="${p.id}" value="${p.loaded_hourly_cost || ''}" placeholder="not set">
          <p class="faint" style="margin:5px 0 0">Blank means this process contributes zero dollars, and is listed as uncosted.</p></div>
        <div><label>A customer sees the output</label>
          <select data-f="customer_facing" data-id="${p.id}">
            <option value="">unanswered</option>
            <option value="true"${p.customer_facing === true ? ' selected' : ''}>yes</option>
            <option value="false"${p.customer_facing === false ? ' selected' : ''}>no</option></select></div>
        <div><label>Touches regulated or personal data</label>
          <select data-f="involves_regulated_data" data-id="${p.id}">
            <option value="">unanswered</option>
            <option value="true"${p.involves_regulated_data === true ? ' selected' : ''}>yes</option>
            <option value="false"${p.involves_regulated_data === false ? ' selected' : ''}>no</option></select></div>
        <div><label>Cost of an error here</label>
          <select data-f="error_tolerance" data-id="${p.id}">
            <option value="">unanswered</option>
            ${['high', 'medium', 'low', 'zero'].map(v => `<option value="${v}"${p.error_tolerance === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
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
        <p class="faint" style="margin-top:6px">${esc(f.code)} · source: ${esc(f.source)}</p>
      </div>
      ${f.treatment ? `<a class="btn ghost sm" href="${esc(f.treatment.href)}">${esc(f.treatment.label)}</a>` : ''}
    </div>`).join('') : '<p class="mut" style="margin:0">Nothing yet.</p>';
}

/* ── the roadmap ─────────────────────────────────────────────────────────── */
function renderRoadmap(ev) {
  if (!ev) { $('roadmapSec').classList.add('hide'); return; }
  $('roadmapSec').classList.remove('hide');
  const sc = ev.scorecard || {};

  $('verdict').innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-start">
    <div><span class="pill ${esc(sc.overall_rating)}">${esc(sc.overall_rating || '')}</span>
      <h2 style="margin:10px 0 4px">${esc(sc.verdict_label || '')}</h2>
      <p class="mut" style="margin:0;font-size:14px">${esc(ev.executive_summary || '')}</p></div>
  </div>`;

  $('lanes').innerHTML = (sc.lanes || []).map(l => `
    <div class="card"><div class="row" style="justify-content:space-between">
      <h3 style="margin:0">${esc(l.title)}</h3><span class="pill ${esc(l.rating)}">${l.score == null ? '—' : l.score}</span></div>
      <p class="faint" style="margin:4px 0 8px">${esc(l.question)}</p>
      <p class="mut" style="font-size:13.5px;margin:0">${esc(l.headline)}</p>
      ${(l.what_would_move_it || []).length ? `<p class="faint" style="margin:9px 0 0"><b>To move it:</b> ${l.what_would_move_it.map(esc).join(' · ')}</p>` : ''}
    </div>`).join('');

  $('diagram').innerHTML = window.DiscoveryDiagram.render(ev.diagram || {});

  $('phases').innerHTML = (ev.phases || []).map(p => `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><span class="faint mono">PHASE ${p.number}</span><h3 style="margin:3px 0 0">${esc(p.title)}</h3></div>
        <div class="row" style="gap:6px">
          ${p.risk_level ? `<span class="pill ${p.risk_level === 'low' ? 'green' : p.risk_level === 'medium' ? 'yellow' : 'red'}">${esc(p.risk_level)} risk</span>` : ''}
          ${p.timeline_weeks ? `<span class="pill">${p.timeline_weeks} weeks</span>` : ''}
        </div>
      </div>
      <p class="mut" style="font-size:14px;margin:10px 0">${esc(p.objective || '')}</p>
      ${(p.scope || []).length ? `<p style="font-size:13.5px;margin:0 0 8px"><b>In scope:</b> ${p.scope.map(esc).join(' · ')}</p>` : ''}
      ${(p.out_of_scope || []).length ? `<p class="faint" style="margin:0 0 8px"><b>Held out:</b> ${p.out_of_scope.map(o => esc(o.name) + (o.why ? ` (${esc(o.why)})` : '')).join(' · ')}</p>` : ''}
      ${p.cost && (p.cost.build_usd_range || p.cost.run_monthly_usd) ? `<p class="mono" style="font-size:13px;margin:0 0 8px">
        build ${esc(p.cost.build_usd_range || '—')}${p.cost.run_monthly_usd ? ` · run $${p.cost.run_monthly_usd}/mo` : ''}${p.cost.max_exposure_usd ? ` · most you can lose $${p.cost.max_exposure_usd}` : ''}</p>` : ''}
      ${p.number === 3 ? '<div class="note">Deliberately unpriced. Costing a transformation against unknowns produces a fabricated figure, and a fabricated figure is what teaches executives to distrust these documents.</div>' : ''}
      ${(p.success_metrics || []).length ? `<p class="faint" style="margin:8px 0 0"><b>Measured by:</b> ${p.success_metrics.slice(0, 4).map(m => esc(typeof m === 'string' ? m : m.metric || m.criterion || JSON.stringify(m))).join(' · ')}</p>` : ''}
      ${p.gate ? `<div class="note" style="border-left-color:var(--violet)"><b>${esc(p.gate.title)}</b><br>${(p.gate.conditions || []).map(esc).join('<br>')}${p.gate.if_not_met ? `<br><span class="faint">${esc(p.gate.if_not_met)}</span>` : ''}</div>` : ''}
    </div>`).join('');

  const ns = ev.safe_next_step || {};
  $('nextstep').innerHTML = ns.title || ns.step ? `<div class="card" style="border-color:var(--blue);background:var(--grad-soft)">
    <span class="pill blue">Your next step</span>
    <h3 style="margin:10px 0 6px">${esc(ns.title || ns.step)}</h3>
    <p class="mut" style="font-size:14px;margin:0">${esc(ns.why || ns.detail || ns.description || '')}</p>
    ${ns.cost_usd || ns.exposure_usd ? `<p class="mono" style="margin:8px 0 0">${esc(ns.cost_usd || ns.exposure_usd)}</p>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn primary sm" id="quote">Ask OrbUp to quote this</button>
      ${ev.share_token ? `<a class="btn ghost sm" href="/discovery/r/${esc(ev.share_token)}">Shareable read-only link</a>` : ''}
    </div>
    <p class="faint" style="margin:10px 0 0">The assessment and this roadmap are free and stay yours. A build is quoted to its scope, separately.</p>
  </div>` : '';
  if ($('quote')) $('quote').addEventListener('click', async () => {
    await api('/api/v1/quote-request', { method: 'POST', body: JSON.stringify({}) });
    $('quote').textContent = 'Requested'; $('quote').disabled = true;
  });

  const cov = ev.coverage || {};
  $('coverage').innerHTML = `<div class="card"><h3>Where every number came from</h3>
    <p class="mut" style="font-size:13.5px">You have been oversold before. You should be able to check this rather than be reassured about it.</p>
    <div class="scroll"><table><thead><tr><th>Input</th><th>Source</th><th>Detail</th></tr></thead><tbody>
      <tr><td>Hours per week</td><td><span class="pill green">measured</span></td>
        <td class="mut">${cov.hours ? `${cov.hours.runs || 0} observed runs over ${cov.hours.window_days || '?'} days.${(cov.hours.low_confidence || []).length ? ' Low confidence: ' + cov.hours.low_confidence.map(esc).join(', ') + '.' : ''}` : '—'}</td></tr>
      <tr><td>Hourly rates</td><td><span class="pill yellow">stated by you</span></td>
        <td class="mut">${cov.rates ? `${cov.rates.costed} costed, ${cov.rates.uncosted} uncosted.${cov.rates.uncosted ? ' ' + esc(cov.rates.uncosted_effect) : ''}` : '—'}</td></tr>
      <tr><td>Systems</td><td><span class="pill blue">derived</span></td>
        <td class="mut">${cov.systems ? 'Read from the applications the capture actually saw: ' + (cov.systems.derived || []).map(esc).join(', ') : '—'}</td></tr>
      <tr><td>Customer-facing / regulated flags</td><td><span class="pill yellow">stated by you</span></td>
        <td class="mut">${cov.process_attributes ? `${cov.process_attributes.answered} answered, ${cov.process_attributes.unanswered} unanswered. ${esc(cov.process_attributes.note)}` : '—'}</td></tr>
      <tr><td>Data posture</td><td><span class="pill yellow">stated by you</span></td>
        <td class="mut">${cov.data_posture ? `Score ${cov.data_posture.score}, ${esc(cov.data_posture.rating)}.` : '—'}</td></tr>
    </tbody></table></div>
    ${(cov.absent || []).length ? `<div class="warnbox"><b>Not present, and therefore not used:</b><br>${cov.absent.map(esc).join('<br>')}</div>` : ''}
  </div>`;
}

/* ── load ────────────────────────────────────────────────────────────────── */
async function load() {
  const d = await api('/api/v1/overview');
  if (!d) return;
  STATE = d;
  $('boot').classList.add('hide'); $('main').classList.remove('hide');

  $('co').textContent = d.account.company_name;
  $('sub').textContent = [d.account.industry, d.account.country, d.account.headcount ? d.account.headcount + ' people' : null]
    .filter(Boolean).join(' · ');

  const s = d.steps;
  const steps = [
    ['1', 'Connect a source', s.connected], ['2', 'Capture the work', s.captured],
    ['3', 'Confirm processes', s.confirmed], ['4', 'Add hourly rates', s.costed],
    ['5', 'Answer six questions', s.answered], ['6', 'Get your roadmap', s.evaluated]
  ];
  const nowIdx = steps.findIndex(x => !x[2]);
  $('stepper').innerHTML = steps.map(([n, t, done], i) =>
    `<div class="step${done ? ' done' : ''}${i === nowIdx ? ' now' : ''}"><div class="n">Step ${n}</div><div class="t">${t}</div></div>`).join('');

  const c = d.captures;
  $('capstats').innerHTML = `
    <div class="card"><div class="faint">Runs observed</div><h2 style="margin:4px 0 0">${c.count || 0}</h2>
      <p class="faint" style="margin:4px 0 0">${c.steps || 0} steps · ${c.minutes || 0} minutes</p></div>
    <div class="card"><div class="faint">Window</div><h2 style="margin:4px 0 0">${c.window_days || 0} day${c.window_days === 1 ? '' : 's'}</h2>
      <p class="faint" style="margin:4px 0 0">${(c.window_days || 0) >= 7 ? 'A full week or more. Rates are not caveated.' : 'Under a week. Rates are reported unscaled, never multiplied up.'}</p></div>
    <div class="card"><div class="faint">Distinct people</div><h2 style="margin:4px 0 0">${c.people || 0}</h2>
      <p class="faint" style="margin:4px 0 0">Counted by hashed reference. Never identified.</p></div>`;

  const r = c.redaction || {};
  const stripped = (r.text_values_dropped || 0) + (r.query_strings_dropped || 0) + (r.identifiers_masked || 0) + (r.fields_dropped || 0);
  $('redaction').innerHTML = stripped ? `<div class="note"><b>The privacy boundary, counted.</b>
    Before anything was stored the server discarded <b>${r.fields_dropped || 0}</b> disallowed fields
    (of which <b>${r.text_values_dropped || 0}</b> carried text), dropped <b>${r.query_strings_dropped || 0}</b> query strings whole,
    and masked <b>${r.identifiers_masked || 0}</b> path identifiers. Counted rather than asserted, so this can be checked instead of trusted.</div>` : '';

  renderProcesses(d.processes || []);
  renderQuestions(d.answers || {});
  renderFindings(d.findings || []);
  renderRoadmap(d.latest_evaluation);

  const missing = d.missing_answers || [];
  $('missingBox').innerHTML = missing.length
    ? `<div class="warnbox"><b>${missing.length} required answer${missing.length === 1 ? '' : 's'} still missing.</b>
       The evaluation will not run around them — it names them instead. That refusal is the difference between this and the document you were oversold last time.<br>
       ${missing.map(m => '· ' + esc(m.question.en || m.question)).join('<br>')}</div>`
    : '<div class="msg ok on">All six answered.</div>';

  const btn = $('runEval');
  btn.disabled = !d.can_evaluate;
  $('evalNote').textContent = d.can_evaluate
    ? (d.latest_evaluation ? `Version ${d.latest_evaluation.version} was produced ${new Date(d.latest_evaluation.created_at).toLocaleDateString()}. Running again writes a new version — a roadmap someone has read never silently changes underneath them.` : 'Free. Takes a second.')
    : (!d.steps.confirmed ? 'Confirm at least one process first.' : 'Answer the six questions first.');
}

$('rederive').addEventListener('click', async () => {
  const b = $('rederive'); b.disabled = true; b.textContent = 'Reading…';
  await api('/api/v1/processes/derive', { method: 'POST' });
  b.disabled = false; b.textContent = 'Re-read captures'; load();
});

$('addManual').addEventListener('click', async () => {
  const name = prompt('What is the process called?'); if (!name) return;
  const hours = Number(prompt('Hours per week, per person')) || 0;
  const people = Number(prompt('How many people touch it?')) || 1;
  await api('/api/v1/processes', { method: 'POST', body: JSON.stringify({ name, hours_per_week: hours, people }) });
  load();
});

$('runEval').addEventListener('click', async () => {
  const b = $('runEval'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Running…';
  const j = await api('/api/v1/evaluation/run', { method: 'POST', body: JSON.stringify({}) });
  b.innerHTML = 'Run the evaluation';
  if (j && j.success) {
    $('evalMsg').className = 'msg ok on';
    $('evalMsg').textContent = `Version ${j.version} produced.`;
    await load();
    $('roadmapSec').scrollIntoView({ behavior: 'smooth' });
  } else {
    $('evalMsg').className = 'msg err on';
    $('evalMsg').textContent = (j && j.message) || 'Could not run.';
    b.disabled = false;
  }
});

load();
