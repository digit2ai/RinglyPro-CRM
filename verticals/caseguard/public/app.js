'use strict';
/* CaseGuard SPA. Config-driven CRUD over every case module + an AI Analyst panel. */

const API = '/caseguard/api/v1';
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
let CASES = [], CASE = null, DATA = {}, TAB = 'overview';

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
async function api(path, opts) {
  const r = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  if (r.status === 401) { location.href = '/caseguard/login'; return; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
  return d;
}

// ── Module config: label, fields for the add-form, and how to render an item ──
const F = (name, label, type, opts) => ({ name, label, type: type || 'text', opts });
const MODULES = {
  overview:       { label: 'Overview', icon: '' },
  timeline:       { label: 'Timeline', add: [F('title', 'Event'), F('event_date', 'Date', 'date'), F('event_time', 'Time (approx)'), F('location', 'Location / provider'), F('category', 'Category', 'select', ['clinical', 'communication', 'imaging', 'escalation', 'admin']), F('detail', 'Detail', 'area')],
    render: r => `<h4>${esc(r.title)}</h4><div class="meta"><span>${esc(r.event_date || 'no date')}${r.event_time ? ' · ' + esc(r.event_time) : ''}</span><span class="pill">${esc(r.category)}</span>${r.location ? '<span>' + esc(r.location) + '</span>' : ''}</div>${r.detail ? '<p>' + esc(r.detail) + '</p>' : ''}` },
  evidence:       { label: 'Evidence', add: [F('label', 'Label'), F('kind', 'Kind', 'select', ['email', 'medical_record', 'mri', 'lab', 'photo', 'transcript', 'document', 'note', 'audio']), F('evidence_date', 'Date', 'date'), F('source', 'Source'), F('content', 'Content / description (paste text here for AI analysis)', 'area')],
    render: r => `<h4>${esc(r.label)} ${r.analyzed ? '<span class="pill ok">analyzed</span>' : ''}</h4><div class="meta"><span class="pill">${esc(r.kind)}</span><span>${esc(r.evidence_date || '')}</span>${r.source ? '<span>' + esc(r.source) + '</span>' : ''}</div>${r.content ? '<p>' + esc(String(r.content).slice(0, 600)) + (String(r.content).length > 600 ? '…' : '') + '</p>' : ''}<div class="row" style="margin-top:8px"><button class="btn sec sm" data-analyze="${r.id}">Analyze with AI</button></div>` },
  providers:      { label: 'Providers', add: [F('name', 'Name'), F('role', 'Role'), F('facility', 'Facility'), F('license_no', 'License #'), F('board', 'Board', 'select', ['', 'Board of Medicine', 'Board of Nursing', 'Other']), F('npi', 'NPI'), F('contact', 'Contact'), F('notes', 'Notes', 'area')],
    render: r => `<h4>${esc(r.name)}</h4><div class="meta">${r.role ? '<span>' + esc(r.role) + '</span>' : ''}${r.facility ? '<span>' + esc(r.facility) + '</span>' : ''}${r.license_no ? '<span>Lic ' + esc(r.license_no) + '</span>' : ''}${r.board ? '<span class="pill">' + esc(r.board) + '</span>' : ''}</div>${r.notes ? '<p>' + esc(r.notes) + '</p>' : ''}` },
  communications: { label: 'Communications', add: [F('comm_date', 'Date', 'date'), F('direction', 'Direction', 'select', ['outbound', 'inbound']), F('channel', 'Channel', 'select', ['phone', 'email', 'portal', 'in_person', 'letter', 'fax']), F('counterparty', 'Counterparty'), F('subject', 'Subject'), F('summary', 'Summary', 'area'), F('outcome', 'Outcome')],
    render: r => `<h4>${esc(r.subject || r.channel)} <span class="pill">${esc(r.direction)}</span></h4><div class="meta"><span>${esc(r.comm_date || '')}</span><span>${esc(r.channel)}</span>${r.counterparty ? '<span>' + esc(r.counterparty) + '</span>' : ''}</div>${r.summary ? '<p>' + esc(r.summary) + '</p>' : ''}${r.outcome ? '<p class="muted">Outcome: ' + esc(r.outcome) + '</p>' : ''}` },
  contradictions: { label: 'Contradictions', add: [F('title', 'Title'), F('severity', 'Severity', 'select', ['critical', 'high', 'medium', 'low']), F('description', 'Description', 'area'), F('statement_a', 'Statement A', 'area'), F('statement_b', 'Statement B', 'area')],
    render: r => `<h4>${esc(r.title)} <span class="pill ${esc(r.severity)}">${esc(r.severity)}</span></h4>${r.description ? '<p>' + esc(r.description) + '</p>' : ''}${r.statement_a ? '<p class="muted">A: ' + esc(r.statement_a) + '</p>' : ''}${r.statement_b ? '<p class="muted">B: ' + esc(r.statement_b) + '</p>' : ''}<div class="meta"><span class="pill">${esc(r.status)}</span><span>${esc(r.detected_by)}</span></div>` },
  policies:       { label: 'Knowledge Base', add: [F('authority', 'Authority'), F('category', 'Category', 'select', ['org_policy', 'statute', 'rule', 'accreditation', 'standard_of_care', 'contact']), F('title', 'Title'), F('citation', 'Citation'), F('source_url', 'Source URL'), F('body', 'Body', 'area'), F('relevance', 'Relevance', 'area')],
    render: r => `<h4>${esc(r.title)} ${r.verified ? '<span class="pill ok">verified</span>' : '<span class="pill medium">to verify</span>'}</h4><div class="meta"><span class="pill">${esc(r.authority)}</span><span>${esc(r.category)}</span>${r.citation ? '<span>' + esc(r.citation) + '</span>' : ''}</div>${r.body ? '<p>' + esc(String(r.body).slice(0, 500)) + (String(r.body).length > 500 ? '…' : '') + '</p>' : ''}${r.relevance ? '<p class="muted">Why: ' + esc(r.relevance) + '</p>' : ''}${r.source_url ? '<p><a href="' + esc(r.source_url) + '" target="_blank" rel="noopener">source</a></p>' : ''}` },
  comparisons:    { label: 'Care vs Standard', add: [F('topic', 'Topic'), F('severity', 'Severity', 'select', ['critical', 'high', 'medium', 'low']), F('care_received', 'Care received', 'area'), F('expected_standard', 'Expected standard', 'area'), F('gap', 'Gap', 'area')],
    render: r => `<h4>${esc(r.topic)} <span class="pill ${esc(r.severity)}">${esc(r.severity)}</span></h4><p><b>Received:</b> ${esc(r.care_received)}</p><p><b>Expected:</b> ${esc(r.expected_standard)}</p>${r.gap ? '<p class="muted">Gap: ' + esc(r.gap) + '</p>' : ''}` },
  questions:      { label: 'Open Questions', add: [F('text', 'Question', 'area'), F('directed_to', 'Directed to'), F('priority', 'Priority', 'select', ['high', 'medium', 'low']), F('status', 'Status', 'select', ['open', 'answered', 'obsolete']), F('answer', 'Answer (if any)', 'area')],
    render: r => `<h4>${esc(r.text)}</h4><div class="meta"><span class="pill ${r.priority === 'high' ? 'high' : r.priority}">${esc(r.priority)}</span><span class="pill">${esc(r.status)}</span>${r.directed_to ? '<span>→ ' + esc(r.directed_to) + '</span>' : ''}</div>${r.answer ? '<p class="muted">' + esc(r.answer) + '</p>' : ''}` },
  escalations:    { label: 'Escalations', add: [F('target', 'Target'), F('target_contact', 'Contact'), F('method', 'Method', 'select', ['letter', 'email', 'online_complaint', 'phone', 'portal']), F('status', 'Status', 'select', ['planned', 'drafted', 'sent', 'acknowledged', 'in_review', 'responded', 'closed']), F('sent_date', 'Sent date', 'date'), F('reference_no', 'Reference #'), F('next_action', 'Next action', 'area'), F('next_action_date', 'Next action date', 'date'), F('response_summary', 'Response summary', 'area')],
    render: r => `<h4>${esc(r.target)} <span class="pill">${esc(r.status)}</span></h4><div class="meta">${r.method ? '<span>' + esc(r.method) + '</span>' : ''}${r.sent_date ? '<span>sent ' + esc(r.sent_date) + '</span>' : ''}${r.reference_no ? '<span>ref ' + esc(r.reference_no) + '</span>' : ''}${r.target_contact ? '<span>' + esc(r.target_contact) + '</span>' : ''}</div>${r.next_action ? '<p><b>Next:</b> ' + esc(r.next_action) + (r.next_action_date ? ' (' + esc(r.next_action_date) + ')' : '') + '</p>' : ''}${r.response_summary ? '<p class="muted">Response: ' + esc(r.response_summary) + '</p>' : ''}` },
  correspondence: { label: 'Correspondence', add: [F('kind', 'Kind', 'select', ['complaint', 'records_request', 'demand', 'follow_up', 'inquiry', 'appeal']), F('target', 'Target'), F('subject', 'Subject'), F('tone', 'Tone', 'select', ['formal', 'firm', 'neutral']), F('status', 'Status', 'select', ['draft', 'final', 'sent']), F('body', 'Body', 'area')],
    render: r => `<h4>${esc(r.subject || r.kind)} <span class="pill">${esc(r.status)}</span></h4><div class="meta"><span class="pill">${esc(r.kind)}</span>${r.target ? '<span>→ ' + esc(r.target) + '</span>' : ''}</div>${r.body ? '<p>' + esc(String(r.body).slice(0, 700)) + (String(r.body).length > 700 ? '…' : '') + '</p>' : ''}<div class="row" style="margin-top:8px"><button class="btn sec sm" data-mail="${r.id}">Open in email</button><button class="btn sec sm" data-copy="${r.id}">Copy</button></div>` },
  analyst:        { label: 'AI Analyst', icon: '' }
};
const ORDER = ['overview', 'timeline', 'evidence', 'providers', 'communications', 'contradictions', 'policies', 'comparisons', 'questions', 'escalations', 'correspondence', 'analyst'];

// Shared form builder used by both Add and Edit. `values` (optional) pre-fills inputs.
function makeForm(fields, values) {
  const form = el('div', 'form two');
  const inputs = {};
  fields.forEach(f => {
    const wrap = el('div'); wrap.appendChild(el('label', '', esc(f.label)));
    let inp;
    if (f.type === 'area') { inp = el('textarea'); inp.rows = 3; wrap.style.gridColumn = '1 / -1'; }
    else if (f.type === 'select') { inp = el('select'); inp.innerHTML = f.opts.map(o => `<option value="${esc(o)}">${esc(o || '—')}</option>`).join(''); }
    else { inp = el('input'); inp.type = f.type; }
    if (values && values[f.name] != null && values[f.name] !== '') {
      let v = values[f.name];
      if (f.type === 'date' && typeof v === 'string') v = v.slice(0, 10);
      inp.value = v;
    }
    inputs[f.name] = inp; wrap.appendChild(inp); form.appendChild(wrap);
  });
  return { form, inputs };
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    const me = await api('/auth/me'); if (!me || !me.user) { location.href = '/caseguard/login'; return; }
  } catch (e) { location.href = '/caseguard/login'; return; }
  $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/caseguard/login'; };
  $('#newCase').onclick = createCase;
  $('#menu').onclick = () => $('#nav').classList.toggle('open');
  $('#caseSel').onchange = e => loadCase(e.target.value);
  await refreshCases();
})();

async function refreshCases(preferId) {
  const d = await api('/cases'); CASES = d.cases || [];
  const sel = $('#caseSel'); sel.innerHTML = CASES.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('');
  if (!CASES.length) { $('#main').innerHTML = '<div class="empty">No cases yet. Create one with + Case.</div>'; $('#nav').innerHTML = ''; return; }
  const keep = preferId && CASES.some(c => c.id == preferId) ? preferId : CASES[0].id;
  await loadCase(keep);
}

async function loadCase(id) {
  const d = await api('/cases/' + id); CASE = d.case; DATA = d; $('#caseSel').value = id;
  renderNav(); render();
}

function renderNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  ORDER.forEach(k => {
    const m = MODULES[k];
    const b = el('button', TAB === k ? 'on' : '', esc(m.label) + (DATA.counts && DATA.counts[k] != null ? `<span class="cnt">${DATA.counts[k]}</span>` : ''));
    b.onclick = () => { TAB = k; $('#nav').classList.remove('open'); renderNav(); render(); };
    nav.appendChild(b);
  });
}

function render() {
  const main = $('#main');
  if (TAB === 'overview') return renderOverview(main);
  if (TAB === 'analyst') return renderAnalyst(main);
  return renderModule(main, TAB);
}

// ── Overview ────────────────────────────────────────────────────────────────
function renderOverview(main) {
  const c = CASE, cn = DATA.counts || {};
  main.innerHTML = '';
  const head = el('div', 'row'); head.style.cssText = 'justify-content:space-between;align-items:flex-start';
  const htext = el('div');
  htext.appendChild(el('h2', '', esc(c.title)));
  htext.appendChild(el('p', 'lead', esc(c.subject_org || '') + ' · ' + esc(c.status) + ' · priority ' + esc(c.priority)));
  const editCase = el('button', 'btn sec sm', 'Edit case');
  head.appendChild(htext); head.appendChild(editCase);
  main.appendChild(head);

  const CASE_FIELDS = [
    F('title', 'Title'), F('subject_org', 'Subject organization'),
    F('status', 'Status', 'select', ['open', 'escalating', 'resolved', 'closed']),
    F('priority', 'Priority', 'select', ['high', 'medium', 'low']),
    F('opened_at', 'Opened', 'date'),
    F('summary', 'Summary', 'area'), F('objective', 'Objective', 'area')
  ];
  editCase.onclick = () => {
    const { form, inputs } = makeForm(CASE_FIELDS, c);
    const save = el('button', 'btn sm', 'Save case'); save.style.gridColumn = '1 / -1';
    const cancel = el('button', 'btn sec sm', 'Cancel'); cancel.style.gridColumn = '1 / -1';
    save.onclick = async () => {
      const body = {}; Object.keys(inputs).forEach(k => { body[k] = inputs[k].value; });
      try { await api('/cases/' + c.id, { method: 'PATCH', body: JSON.stringify(body) }); toast('Case updated'); await refreshCases(c.id); }
      catch (e) { toast(e.message); }
    };
    cancel.onclick = () => render();
    form.appendChild(save); form.appendChild(cancel);
    const card = el('div', 'card'); card.appendChild(el('h4', '', 'Edit case')); card.appendChild(form);
    main.innerHTML = ''; main.appendChild(card);
  };
  const kpis = el('div', 'kpis');
  [['evidence', 'Evidence'], ['timeline', 'Timeline'], ['contradictions', 'Contradictions'], ['policies', 'KB entries'], ['questions', 'Questions'], ['escalations', 'Escalations']]
    .forEach(([k, l]) => kpis.appendChild(el('div', 'kpi', `<b>${cn[k] || 0}</b><span>${l}</span>`)));
  main.appendChild(kpis);
  if (c.summary) { const s = el('div', 'card'); s.appendChild(el('h4', '', 'Case summary')); s.appendChild(el('p', 'muted', esc(c.summary))); main.appendChild(s); }
  if (c.objective) { const o = el('div', 'card'); o.appendChild(el('h4', '', 'Objective')); o.appendChild(el('p', 'muted', esc(c.objective))); main.appendChild(o); }
  const ns = el('div', 'card');
  ns.appendChild(el('h4', '', 'AI next-step recommendations'));
  const btn = el('button', 'btn sm', 'Generate next steps'); const out = el('div');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Thinking...';
    try {
      const r = await api('/ai/next-steps', { method: 'POST', body: JSON.stringify({ case_id: CASE.id }) });
      out.innerHTML = `<div class="out">${esc(r.summary)}\n\n` + r.recommendations.map((x, i) => (i + 1) + '. ' + esc(x)).join('\n') + '</div>' + (r.ai ? '' : '<div class="sim">Heuristic fallback (no ANTHROPIC_API_KEY). Enable it for model-generated guidance.</div>');
    } catch (e) { out.innerHTML = '<div class="sim">' + esc(e.message) + '</div>'; }
    btn.disabled = false; btn.textContent = 'Regenerate';
  };
  ns.appendChild(btn); ns.appendChild(out); main.appendChild(ns);
}

// ── Generic module (list + add) ───────────────────────────────────────────────
function renderModule(main, key) {
  const m = MODULES[key], items = DATA[key] || [];
  main.innerHTML = '';
  main.appendChild(el('h2', '', esc(m.label)));
  main.appendChild(el('p', 'lead', items.length + ' item' + (items.length === 1 ? '' : 's')));

  // Add form (collapsible)
  const addCard = el('div', 'card');
  const addBtn = el('button', 'btn sm', '+ Add');
  const formWrap = el('div'); formWrap.style.display = 'none';
  addBtn.onclick = () => { formWrap.style.display = formWrap.style.display === 'none' ? 'block' : 'none'; };
  const { form, inputs } = makeForm(m.add);
  const save = el('button', 'btn', 'Save'); save.style.gridColumn = '1 / -1';
  save.onclick = async () => {
    const body = {}; Object.keys(inputs).forEach(k => { const v = inputs[k].value; if (v !== '') body[k] = v; });
    if (!Object.keys(body).length) return toast('Nothing to save');
    try { await api(`/cases/${CASE.id}/${key}`, { method: 'POST', body: JSON.stringify(body) }); toast('Saved'); await loadCase(CASE.id); }
    catch (e) { toast(e.message); }
  };
  form.appendChild(save); formWrap.appendChild(form);
  addCard.appendChild(addBtn); addCard.appendChild(formWrap); main.appendChild(addCard);

  // Contradiction AI scan shortcut
  if (key === 'contradictions') {
    const scan = el('button', 'btn sec sm', 'AI scan evidence for contradictions'); scan.style.marginBottom = '12px';
    scan.onclick = async () => {
      scan.disabled = true; scan.textContent = 'Scanning...';
      try { const r = await api('/ai/scan-contradictions', { method: 'POST', body: JSON.stringify({ case_id: CASE.id, persist: true }) });
        toast(r.ai ? (r.persisted + ' found & added') : 'AI scan needs ANTHROPIC_API_KEY'); await loadCase(CASE.id); }
      catch (e) { toast(e.message); scan.disabled = false; scan.textContent = 'AI scan evidence for contradictions'; }
    };
    main.appendChild(scan);
  }

  // List
  if (!items.length) { main.appendChild(el('div', 'empty', 'No items yet.')); return; }
  items.forEach(r => {
    const it = el('div', 'item');
    const actions = el('div', 'row'); actions.style.cssText = 'justify-content:flex-end;gap:14px;margin-bottom:4px';
    const editBtn = el('button', 'del', 'Edit');
    const del = el('button', 'del', 'Delete');
    actions.appendChild(editBtn); actions.appendChild(del);
    const view = el('div'); view.innerHTML = m.render(r);
    it.appendChild(actions); it.appendChild(view);
    main.appendChild(it);

    del.onclick = async () => { if (!confirm('Delete this item?')) return; try { await api(`/${key}/${r.id}`, { method: 'DELETE' }); toast('Deleted'); await loadCase(CASE.id); } catch (e) { toast(e.message); } };
    editBtn.onclick = () => {
      const { form, inputs } = makeForm(m.add, r);
      const save = el('button', 'btn sm', 'Save changes'); save.style.gridColumn = '1 / -1';
      const cancel = el('button', 'btn sec sm', 'Cancel'); cancel.style.gridColumn = '1 / -1';
      save.onclick = async () => {
        const body = {}; Object.keys(inputs).forEach(k => { body[k] = inputs[k].value; });
        try { await api(`/${key}/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast('Updated'); await loadCase(CASE.id); }
        catch (e) { toast(e.message); }
      };
      cancel.onclick = () => render();
      form.appendChild(save); form.appendChild(cancel);
      it.innerHTML = ''; it.appendChild(form);
    };
  });

  // Wire item action buttons
  main.querySelectorAll('[data-analyze]').forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = 'Analyzing...';
    try { await api('/ai/analyze', { method: 'POST', body: JSON.stringify({ case_id: CASE.id, evidence_id: +b.dataset.analyze }) });
      toast('Analyzed — see AI Analyst tab'); await loadCase(CASE.id); }
    catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Analyze with AI'; }
  });
  main.querySelectorAll('[data-mail]').forEach(b => b.onclick = () => {
    const r = (DATA.correspondence || []).find(x => x.id == b.dataset.mail); if (!r) return;
    location.href = `mailto:?subject=${encodeURIComponent(r.subject || '')}&body=${encodeURIComponent(r.body || '')}`;
  });
  main.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const r = (DATA.correspondence || []).find(x => x.id == b.dataset.copy); if (!r) return;
    try { await navigator.clipboard.writeText((r.subject ? r.subject + '\n\n' : '') + (r.body || '')); toast('Copied'); } catch (e) { toast('Copy failed'); }
  });
}

// ── AI Analyst ──────────────────────────────────────────────────────────────
function renderAnalyst(main) {
  main.innerHTML = '';
  main.appendChild(el('h2', '', 'AI Analyst'));
  main.appendChild(el('p', 'lead', 'Analyze a document, research the regulatory knowledge base, or draft correspondence. Grounded in this case.'));

  // Analyze free text
  const a = el('div', 'card'); a.appendChild(el('h4', '', 'Analyze text'));
  const ta = el('textarea'); ta.rows = 5; ta.placeholder = 'Paste an email, record excerpt, or note...'; a.appendChild(ta);
  const ab = el('button', 'btn sm', 'Analyze'); ab.style.marginTop = '8px'; const aout = el('div');
  ab.onclick = async () => {
    if (!ta.value.trim()) return toast('Paste some text');
    ab.disabled = true; ab.textContent = 'Analyzing...';
    try { const r = await api('/ai/analyze', { method: 'POST', body: JSON.stringify({ case_id: CASE.id, text: ta.value }) });
      const an = r.analysis;
      aout.innerHTML = `<div class="out"><b>Summary</b>\n${esc(an.summary)}\n\n<b>Facts</b>\n${(an.facts || []).map(f => '• ' + esc(f.fact) + (f.date ? ' (' + esc(f.date) + ')' : '')).join('\n') || '—'}\n\n<b>Flags</b>\n${(an.flags || []).map(f => '• [' + esc(f.severity) + '] ' + esc(f.issue)).join('\n') || '—'}\n\n<b>Recommendations</b>\n${(an.recommendations || []).map(x => '• ' + esc(x)).join('\n') || '—'}</div>` + (an.is_simulated ? '<div class="sim">Heuristic fallback (no ANTHROPIC_API_KEY).</div>' : '');
      await loadCase(CASE.id); }
    catch (e) { aout.innerHTML = '<div class="sim">' + esc(e.message) + '</div>'; }
    ab.disabled = false; ab.textContent = 'Analyze';
  };
  a.appendChild(ab); a.appendChild(aout); main.appendChild(a);

  // Research KB
  const rc = el('div', 'card'); rc.appendChild(el('h4', '', 'Regulatory research'));
  const rq = el('input'); rq.placeholder = 'e.g. Which authority handles imaging-facility safety complaints in Florida?'; rc.appendChild(rq);
  const rb = el('button', 'btn sm', 'Research'); rb.style.marginTop = '8px'; const rout = el('div');
  rb.onclick = async () => {
    if (!rq.value.trim()) return toast('Enter a question');
    rb.disabled = true; rb.textContent = 'Researching...';
    try { const r = await api('/ai/research', { method: 'POST', body: JSON.stringify({ case_id: CASE.id, question: rq.value }) });
      rout.innerHTML = `<div class="out">${esc(r.answer)}${r.citations && r.citations.length ? '\n\nSources:\n' + r.citations.map(c => '• ' + esc(c.authority) + ' — ' + esc(c.title) + (c.url ? ' ' + esc(c.url) : '')).join('\n') : ''}</div>` + (r.ai ? '' : '<div class="sim">Keyword match (no ANTHROPIC_API_KEY). Enable it for a synthesized answer.</div>');
    } catch (e) { rout.innerHTML = '<div class="sim">' + esc(e.message) + '</div>'; }
    rb.disabled = false; rb.textContent = 'Research';
  };
  rc.appendChild(rb); rc.appendChild(rout); main.appendChild(rc);

  // Draft correspondence
  const dc = el('div', 'card'); dc.appendChild(el('h4', '', 'Draft correspondence'));
  const dform = el('div', 'form two');
  const kind = el('select'); kind.innerHTML = ['complaint', 'records_request', 'demand', 'follow_up', 'inquiry', 'appeal'].map(o => `<option>${o}</option>`).join('');
  const target = el('input'); target.placeholder = 'Recipient (e.g. FOI Corporate Compliance)'; target.value = 'FOI Corporate Compliance';
  const tone = el('select'); tone.innerHTML = ['formal', 'firm', 'neutral'].map(o => `<option>${o}</option>`).join('');
  const lang = el('select'); lang.innerHTML = '<option value="en">English</option><option value="es">Español</option>';
  [['Kind', kind], ['Target', target], ['Tone', tone], ['Language', lang]].forEach(([l, inp]) => { const w = el('div'); w.appendChild(el('label', '', l)); w.appendChild(inp); dform.appendChild(w); });
  dc.appendChild(dform);
  const db = el('button', 'btn sm', 'Draft & save'); db.style.marginTop = '10px'; const dout = el('div');
  db.onclick = async () => {
    db.disabled = true; db.textContent = 'Drafting...';
    try { const r = await api('/ai/draft', { method: 'POST', body: JSON.stringify({ case_id: CASE.id, kind: kind.value, target: target.value, tone: tone.value, lang: lang.value, save: true }) });
      dout.innerHTML = `<div class="out"><b>${esc(r.subject)}</b>\n\n${esc(r.body)}</div>` + (r.is_simulated ? '<div class="sim">Heuristic template (no ANTHROPIC_API_KEY).</div>' : '') + '<div class="row" style="margin-top:8px"><button class="btn sec sm" id="dmail">Open in email</button></div>';
      $('#dmail').onclick = () => { location.href = `mailto:?subject=${encodeURIComponent(r.subject || '')}&body=${encodeURIComponent(r.body || '')}`; };
      await loadCase(CASE.id); }
    catch (e) { dout.innerHTML = '<div class="sim">' + esc(e.message) + '</div>'; }
    db.disabled = false; db.textContent = 'Draft & save';
  };
  dc.appendChild(db); dc.appendChild(dout); main.appendChild(dc);

  // Recent analyses
  const an = DATA.analyses || [];
  if (an.length) {
    const h = el('div', 'card'); h.appendChild(el('h4', '', 'Saved analyses (' + an.length + ')'));
    an.slice(0, 10).forEach(x => h.appendChild(el('div', 'item', `<p>${esc(String(x.summary || '').slice(0, 400))}</p><div class="meta"><span>${(x.flags || []).length} flags</span><span>${(x.facts || []).length} facts</span>${x.is_simulated ? '<span class="pill medium">heuristic</span>' : '<span class="pill ok">' + esc(x.model || 'ai') + '</span>'}</div>`)));
    main.appendChild(h);
  }
}

async function createCase() {
  const title = prompt('New case title:'); if (!title) return;
  const subject_org = prompt('Subject organization (optional):') || '';
  try { const d = await api('/cases', { method: 'POST', body: JSON.stringify({ title, subject_org }) }); toast('Case created'); await refreshCases(); await loadCase(d.case.id); }
  catch (e) { toast(e.message); }
}
