'use strict';

/**
 * CaseGuard — AI brain (the ONE external dependency: Claude).
 * Reuses ANTHROPIC_API_KEY. Model = CASEGUARD_MODEL (default Sonnet, because this
 * work is analytical/legal-adjacent and benefits from the stronger model).
 *
 *  - analyzeDocument(text, ctx)        -> { summary, facts[], flags[], recommendations[] }
 *  - detectContradictions(items, ctx)  -> [{ title, description, statement_a, statement_b, severity }]
 *  - recommendNextSteps(caseState)     -> { summary, recommendations[] }
 *  - draftCorrespondence(opts)         -> { subject, body }
 *  - researchAnswer(question, policies)-> { answer, citations[] }
 *
 * Every function has a deterministic ZERO-KEY heuristic fallback so the whole app
 * works end-to-end with no API key. The brain is an ADMINISTRATIVE/RESEARCH aid:
 * it organizes facts, flags inconsistencies, points at authorities, and drafts
 * correspondence. It does not assert legal conclusions as fact — it frames
 * concerns and next steps, and every drafted letter states it is the patient's
 * own account. Fallback output is marked is_simulated so nothing looks
 * authoritative that isn't a real model analysis.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.CASEGUARD_MODEL || 'claude-sonnet-5';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function activeModel() { return anthropic ? MODEL : 'heuristic-fallback'; }
function hasAI() { return !!anthropic; }

async function callClaude({ system, user, max_tokens = 1800 }) {
  const resp = await anthropic.messages.create({
    model: MODEL, max_tokens, system,
    messages: [{ role: 'user', content: user }]
  });
  return (resp.content || []).map(b => b.text || '').join('').trim();
}

function parseJson(raw) {
  const s = raw.indexOf('{'); const a = raw.indexOf('[');
  let start = s; if (a !== -1 && (a < s || s === -1)) start = a;
  const endObj = raw.lastIndexOf('}'); const endArr = raw.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  return JSON.parse(raw.slice(start, end + 1));
}

// ── Document analysis ───────────────────────────────────────────────────────
async function analyzeDocument(text, ctx = {}) {
  const clean = String(text || '').trim();
  if (!clean) return { summary: '', facts: [], flags: [], recommendations: [], is_simulated: true };
  if (!anthropic) return heuristicAnalyze(clean);

  const system =
    'You are an administrative case analyst helping a patient organize evidence in a health care ' +
    'administrative review. Extract facts neutrally, flag inconsistencies or gaps as CONCERNS (not ' +
    'legal conclusions), and suggest administrative next steps. Reply with ONLY a JSON object.';
  const user =
    `Case context: ${ctx.caseTitle || 'Health care administrative review'}${ctx.subjectOrg ? ' involving ' + ctx.subjectOrg : ''}.\n` +
    `Document/evidence text:\n"""${clean.slice(0, 24000)}"""\n\n` +
    `Return exactly:\n{\n  "summary": "3-6 sentence neutral summary",\n` +
    `  "facts": [{"fact":"...","date":"YYYY-MM-DD or ''","provider":"or ''"}],\n` +
    `  "flags": [{"issue":"a concern, gap, or inconsistency","severity":"low|medium|high|critical"}],\n` +
    `  "recommendations": ["concrete administrative next step"]\n}\n` +
    `Be precise, no emojis, do not overstate. If something is uncertain, say so in the flag text.`;
  try {
    const p = parseJson(await callClaude({ system, user }));
    return {
      summary: String(p.summary || '').slice(0, 4000),
      facts: arr(p.facts, 40).map(f => ({ fact: str(f.fact, 600), date: str(f.date, 20), provider: str(f.provider, 120) })),
      flags: arr(p.flags, 30).map(f => ({ issue: str(f.issue, 600), severity: sev(f.severity) })),
      recommendations: arr(p.recommendations, 20).map(r => str(r, 400)),
      is_simulated: false
    };
  } catch (e) {
    console.error('CaseGuard analyzeDocument error:', e.message);
    return heuristicAnalyze(clean);
  }
}

function heuristicAnalyze(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 4);
  const dateRe = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})/i;
  const concern = /(no |not |never |without|unavailable|denied|refused|failed|delay|discrepanc|inconsist|contradict|10\/10|severe|worse|deteriorat)/i;
  return {
    summary: sentences.slice(0, 4).join(' ').slice(0, 1200) || '(no content to analyze)',
    facts: sentences.filter(s => dateRe.test(s)).slice(0, 12).map(s => ({ fact: s.slice(0, 500), date: (s.match(dateRe) || [''])[0], provider: '' })),
    flags: sentences.filter(s => concern.test(s)).slice(0, 10).map(s => ({ issue: s.slice(0, 500), severity: /10\/10|severe|denied|refused|failed|deteriorat/i.test(s) ? 'high' : 'medium' })),
    recommendations: [
      'Preserve this document with its date and source in the evidence inventory.',
      'Cross-check the facts above against the timeline for gaps or conflicts.',
      'Add any unanswered points to the outstanding-questions log.'
    ],
    is_simulated: true
  };
}

// ── Contradiction detection across evidence ─────────────────────────────────
async function detectContradictions(items = [], ctx = {}) {
  const clean = (items || []).filter(i => i && (i.content || i.label)).slice(0, 40);
  if (clean.length < 2) return [];
  if (!anthropic) return heuristicContradictions(clean);

  const list = clean.map((i, n) =>
    `#${n} [${i.kind || 'item'}${i.evidence_date ? ' ' + i.evidence_date : ''}] ${i.label || ''}: ${String(i.content || '').slice(0, 1200)}`
  ).join('\n');
  const system =
    'You compare pieces of evidence in a health care administrative review and surface genuine ' +
    'inconsistencies or contradictions. Only report real conflicts, not mere differences. Reply with ONLY a JSON array.';
  const user =
    `Case: ${ctx.caseTitle || ''}${ctx.subjectOrg ? ' / ' + ctx.subjectOrg : ''}\nEvidence items:\n${list}\n\n` +
    `Return: [{"title":"short label","description":"what conflicts and why it matters","statement_a":"quote/paraphrase from one item","statement_b":"quote/paraphrase from the other","severity":"low|medium|high|critical"}]\n` +
    `Empty array if none. No emojis. Do not fabricate conflicts.`;
  try {
    const p = parseJson(await callClaude({ system, user, max_tokens: 2000 }));
    return arr(p, 20).map(c => ({
      title: str(c.title, 200), description: str(c.description, 1200),
      statement_a: str(c.statement_a, 800), statement_b: str(c.statement_b, 800), severity: sev(c.severity)
    }));
  } catch (e) {
    console.error('CaseGuard detectContradictions error:', e.message);
    return heuristicContradictions(clean);
  }
}

function heuristicContradictions(items) {
  // Zero-key: cannot reliably infer semantic contradictions; return nothing rather
  // than fabricate. The UI shows an honest "run with an API key for AI scan" note.
  return [];
}

// ── Next-step recommendations from case state ───────────────────────────────
async function recommendNextSteps(state = {}) {
  if (!anthropic) return heuristicNextSteps(state);
  const system =
    'You are an administrative-review strategist. Given the state of a patient\'s health care ' +
    'accountability case, propose the most useful next administrative and regulatory steps in ' +
    'priority order. Neutral, concrete, no legal advice. Reply with ONLY a JSON object.';
  const user =
    `Case: ${state.title || ''} (${state.subjectOrg || ''})\n` +
    `Objective: ${state.objective || 'accountability and patient safety'}\n` +
    `Counts: evidence=${state.evidence || 0}, timeline=${state.timeline || 0}, contradictions=${state.contradictions || 0}, ` +
    `open questions=${state.questions || 0}, escalations=${state.escalations || 0}.\n` +
    `Open escalation targets: ${(state.openTargets || []).join(', ') || 'none yet'}.\n\n` +
    `Return: {"summary":"2-4 sentences on where the case stands","recommendations":["ordered next step", "..."]}\n` +
    `6-10 recommendations. No emojis.`;
  try {
    const p = parseJson(await callClaude({ system, user }));
    return { summary: str(p.summary, 2000), recommendations: arr(p.recommendations, 12).map(r => str(r, 400)), is_simulated: false };
  } catch (e) {
    console.error('CaseGuard recommendNextSteps error:', e.message);
    return heuristicNextSteps(state);
  }
}

function heuristicNextSteps(state) {
  const recs = [];
  if (!state.evidence) recs.push('Log every document, email, medical record, image, and photo into the evidence inventory with its date and source.');
  if (!state.timeline) recs.push('Build the chronological timeline of every encounter and communication.');
  recs.push('Request complete medical records from FOI for each encounter (patient portal / medical-records request).');
  recs.push('Compare the urgent-care evaluation against the hand specialist\'s workup and record each gap in the policy-comparison log.');
  recs.push('Document the imaging-center incident in detail and note the absence of any published deterioration/rescue policy.');
  recs.push('Draft an internal complaint to FOI Executive Leadership and Corporate Compliance requesting the applicable policies and a written response.');
  recs.push('Prepare parallel external complaints: AHCA (facility), and DOH/boards (individual licensees).');
  recs.push('Verify each involved provider\'s license and disciplinary history via flhealthsource.gov.');
  return { summary: 'Foundational organization first, then internal escalation to FOI, then external regulatory complaints in parallel.', recommendations: recs, is_simulated: true };
}

// ── Draft correspondence ────────────────────────────────────────────────────
async function draftCorrespondence(opts = {}) {
  const { kind = 'complaint', target = 'FOI Corporate Compliance', tone = 'formal', lang = 'en', facts = '', caseTitle = '', subjectOrg = '' } = opts;
  if (!anthropic) return heuristicLetter(opts);
  const system =
    'You draft professional, factual, non-inflammatory correspondence for a patient pursuing a health ' +
    'care administrative review. The letter states the patient\'s own account, requests specific action, ' +
    'and is measured in tone. Do NOT invent facts beyond those provided. Do NOT assert legal conclusions ' +
    'as established fact. Reply with ONLY a JSON object.';
  const user =
    `Language: ${lang === 'es' ? 'Spanish (proper orthography)' : 'English'}. Tone: ${tone}. Letter kind: ${kind}. Recipient: ${target}.\n` +
    `Case: ${caseTitle} involving ${subjectOrg}.\n` +
    `Facts to include (patient\'s account):\n"""${String(facts).slice(0, 12000)}"""\n\n` +
    `Return: {"subject":"...","body":"full letter with [bracketed placeholders] for name/address/date/reference numbers where unknown"}\n` +
    `Include a clear list of the specific actions/answers requested and a reasonable response deadline. No emojis.`;
  try {
    const p = parseJson(await callClaude({ system, user, max_tokens: 2200 }));
    return { subject: str(p.subject, 300), body: str(p.body, 12000), model: MODEL, is_simulated: false };
  } catch (e) {
    console.error('CaseGuard draftCorrespondence error:', e.message);
    return heuristicLetter(opts);
  }
}

function heuristicLetter(opts) {
  const { kind = 'complaint', target = 'FOI Corporate Compliance', subjectOrg = 'Florida Orthopaedic Institute', facts = '' } = opts;
  const subject = `${kind === 'records_request' ? 'Request for Complete Medical Records and Applicable Policies' : 'Formal Concern Regarding Care and Request for Written Response'} — ${subjectOrg}`;
  const body =
`[Date]

[Recipient Name / Title]
${target}
[Address]

Re: ${subject}
Patient: [Your Name] — DOB: [__] — MRN/Account: [__]

To whom it may concern:

I am writing to formally document my account of the care I received at ${subjectOrg} and to request a written response.

Summary of my account:
${String(facts).trim() || '[Insert the chronological account of each encounter, what was and was not done, and the specific concerns.]'}

Specifically, I request:
1. Complete medical records for each of my encounters (including the urgent-care visit, the specialist visit, and the imaging study).
2. A copy of the policies and procedures that applied to my care, including any policy governing a patient whose condition deteriorates during or after diagnostic imaging, and the availability of rescue medication and provider evaluation at the imaging site.
3. A written explanation of why substantially different diagnostic workup and treatment were provided within the same organization for the same complaint.

Please provide a written response within thirty (30) days. I can be reached at [phone] and [email].

Respectfully,
[Your Name]

Note: This letter reflects my own account of events.`;
  return { subject, body, model: 'heuristic-fallback', is_simulated: true };
}

// ── Regulatory research answer (grounded in the seeded KB) ───────────────────
async function researchAnswer(question, policies = []) {
  const q = String(question || '').trim();
  if (!q) return { answer: '', citations: [], is_simulated: !anthropic };
  const kb = (policies || []).slice(0, 30).map((p, n) =>
    `[${n}] (${p.authority} / ${p.category}) ${p.title}${p.citation ? ' — ' + p.citation : ''}: ${String(p.body || '').slice(0, 900)}${p.source_url ? ' <' + p.source_url + '>' : ''}`
  ).join('\n');
  if (!anthropic) {
    // Zero-key: keyword-match the KB and return the most relevant entries verbatim.
    const terms = q.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const scored = (policies || []).map(p => {
      const hay = (p.title + ' ' + p.body + ' ' + p.authority).toLowerCase();
      return { p, score: terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
    const answer = scored.length
      ? 'Relevant reference material from your knowledge base (keyword match — enable ANTHROPIC_API_KEY for a synthesized answer):\n\n' +
        scored.map(x => `- ${x.p.authority}: ${x.p.title}${x.p.citation ? ' (' + x.p.citation + ')' : ''}\n  ${String(x.p.body).slice(0, 400)}`).join('\n\n')
      : 'No matching reference material found in the knowledge base for that question.';
    return { answer, citations: scored.map(x => ({ authority: x.p.authority, title: x.p.title, url: x.p.source_url })), is_simulated: true };
  }
  const system =
    'You answer regulatory/administrative research questions for a patient\'s health care accountability ' +
    'case, grounded ONLY in the provided knowledge-base entries. Cite entries by their [n] index. If the ' +
    'KB does not contain the answer, say so and point to which authority to consult. No legal advice; ' +
    'frame as administrative guidance. No emojis.';
  const user = `Knowledge base:\n${kb}\n\nQuestion: ${q}\n\nAnswer concisely and cite [n] indices you used.`;
  try {
    const answer = await callClaude({ system, user, max_tokens: 1600 });
    const used = Array.from(new Set((answer.match(/\[(\d+)\]/g) || []).map(m => parseInt(m.replace(/\D/g, ''), 10))));
    const citations = used.map(i => policies[i]).filter(Boolean).map(p => ({ authority: p.authority, title: p.title, url: p.source_url }));
    return { answer, citations, is_simulated: false };
  } catch (e) {
    console.error('CaseGuard researchAnswer error:', e.message);
    return { answer: `[Research unavailable: ${e.message}]`, citations: [], is_simulated: true };
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function str(v, n) { return String(v == null ? '' : v).slice(0, n); }
function arr(v, n) { return Array.isArray(v) ? v.filter(Boolean).slice(0, n) : []; }
function sev(v) { return ['low', 'medium', 'high', 'critical'].includes(String(v)) ? String(v) : 'medium'; }

module.exports = {
  activeModel, hasAI,
  analyzeDocument, detectContradictions, recommendNextSteps, draftCorrespondence, researchAnswer
};
