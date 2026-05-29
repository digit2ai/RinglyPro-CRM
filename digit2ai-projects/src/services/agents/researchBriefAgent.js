'use strict';

// Agent #1 — Research Brief
// Input: { task, project }
// Output: { ok, output_md, structured, cost_estimate_usd, model, error }
//
// Process:
//   1. Build a 4-8 word web search query from task.title + project.name (Haiku).
//   2. webSearch(query, 5) — Brave + DDG fallback.
//   3. For top 3 results, fetch + strip HTML, grab first 4000 chars.
//   4. Sonnet with full context produces structured JSON.
//   5. Render markdown brief.

const { webSearch } = require('./webSearch');
const { fetchWithTimeout, stripHtml } = require('./fetchWithTimeout');

const SONNET_MODEL = 'claude-sonnet-4-6';
const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';

// Rough $/MTok for cost estimation. Sonnet 4: $3 in / $15 out. Haiku 4.5: $1 in / $5 out.
const SONNET_IN = 3 / 1e6, SONNET_OUT = 15 / 1e6;
const HAIKU_IN  = 1 / 1e6, HAIKU_OUT  = 5 / 1e6;

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  // Try direct parse, then extract first balanced object.
  try { return JSON.parse(cleaned); } catch (_) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

async function buildSearchQuery(client, task, project) {
  const fallback = (`${task.title || ''} ${project?.name || ''}`).trim().slice(0, 120) || 'general research';
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Convert this research task into a 4-8 word web search query. Reply with ONLY the query, no quotes, no prose.\n\nTask: ${task.title}\nProject: ${project?.name || 'n/a'}`
      }]
    });
    const text = (resp?.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '').slice(0, 200);
    const haiku_cost = (resp?.usage?.input_tokens || 0) * HAIKU_IN + (resp?.usage?.output_tokens || 0) * HAIKU_OUT;
    return { query: text || fallback, cost: haiku_cost };
  } catch (err) {
    console.warn('[researchBriefAgent] query gen failed:', err.message);
    return { query: fallback, cost: 0 };
  }
}

function renderMarkdown(task, parsed) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(`# Research Brief: ${task.title || ''}`);
  lines.push(`*Generated ${date} · Confidence: ${parsed.confidence || 'medium'}*`);
  lines.push('');
  lines.push('## Summary');
  lines.push(parsed.summary || '(no summary)');
  lines.push('');
  if (Array.isArray(parsed.key_findings) && parsed.key_findings.length) {
    lines.push('## Key Findings');
    parsed.key_findings.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }
  if (Array.isArray(parsed.sources) && parsed.sources.length) {
    lines.push('## Sources');
    parsed.sources.forEach((s, i) => {
      lines.push(`${i + 1}. **[${s.title || s.url || 'Source'}](${s.url || ''})** — ${s.takeaway || ''}`);
    });
    lines.push('');
  }
  if (Array.isArray(parsed.open_questions) && parsed.open_questions.length) {
    lines.push('## Open Questions');
    parsed.open_questions.forEach(q => lines.push(`- ${q}`));
    lines.push('');
  }
  if (Array.isArray(parsed.next_steps) && parsed.next_steps.length) {
    lines.push('## Recommended Next Steps');
    parsed.next_steps.forEach(s => lines.push(`- ${s}`));
    lines.push('');
  }
  return lines.join('\n');
}

async function run({ task, project, language }) {
  if (!task || !task.title) {
    return { ok: false, error: 'missing_task', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'no_api_key', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
    return { ok: false, error: 'sdk_missing', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let totalCost = 0;

  // 1. Generate query
  const { query, cost: queryCost } = await buildSearchQuery(client, task, project);
  totalCost += queryCost;

  // 2. Web search
  const results = await webSearch(query, 5);

  // 3. Pull first 3 source bodies in parallel
  const enriched = await Promise.all(results.slice(0, 3).map(async r => {
    try {
      const f = await fetchWithTimeout(r.url, { timeoutMs: 8000 });
      const body = f.ok ? stripHtml(f.text, 4000) : '';
      return { ...r, body };
    } catch (_) { return { ...r, body: '' }; }
  }));

  // 4. Sonnet call
  const sources_block = enriched.map((s, i) => (
    `[${i + 1}] ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet || ''}\nBody (first 4000 chars):\n${s.body || '(could not fetch body)'}`
  )).join('\n\n---\n\n') || '(no search results — produce a brief based on what you can infer from the task + project context, mark confidence as low, and recommend the user search manually)';

  const prompt = `You are a senior research analyst supporting Manuel Stagg / Digit2AI.

CONTEXT
- Task: ${task.title}
- Description: ${task.description || '(none)'}
- Project: ${project?.name || '(unattached)'} (${project?.sector || ''}, ${project?.country || ''})
- Project purpose: ${project?.description || '(no project description on file)'}

SEARCH QUERY USED: ${query}

SOURCES (extracted from web search)
${sources_block}

Produce a JSON object matching this schema:
{
  "summary": "2-3 sentence executive summary",
  "key_findings": ["finding 1", "..."],
  "sources": [{ "title": "...", "url": "...", "takeaway": "..." }],
  "open_questions": ["question 1", "..."],
  "next_steps": ["recommended action 1", "..."],
  "confidence": "high" | "medium" | "low"
}

Be concrete and skeptical. Cite specific numbers, names, dates from sources where possible. If sources are thin or contradictory, say so in open_questions and mark confidence accordingly. Output only valid JSON.

${language === 'es' ? 'RESPONSE LANGUAGE: Write summary, key_findings, takeaways, open_questions, and next_steps in fluent business Spanish with proper orthography (tildes, ñ). Source titles and URLs stay as-is.' : language === 'en' ? 'RESPONSE LANGUAGE: Write everything in English.' : 'RESPONSE LANGUAGE: Match the language of the project context (Spanish project context → Spanish output, English → English). Source titles and URLs stay as-is.'}`;

  try {
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp?.content?.[0]?.text || '';
    totalCost += (resp?.usage?.input_tokens || 0) * SONNET_IN + (resp?.usage?.output_tokens || 0) * SONNET_OUT;
    const parsed = safeParseJson(text);
    if (!parsed) {
      return { ok: false, error: 'parse_failed', output_md: '', structured: { raw: text.slice(0, 2000) }, cost_estimate_usd: totalCost, model: SONNET_MODEL };
    }
    // Backfill sources from the search results if Claude omitted them
    if (!Array.isArray(parsed.sources) || !parsed.sources.length) {
      parsed.sources = enriched.map(s => ({ title: s.title, url: s.url, takeaway: s.snippet || '' }));
    }
    return {
      ok: true,
      output_md: renderMarkdown(task, parsed),
      structured: parsed,
      cost_estimate_usd: Number(totalCost.toFixed(4)),
      model: SONNET_MODEL
    };
  } catch (err) {
    console.error('[researchBriefAgent] Sonnet call failed:', err.message);
    return { ok: false, error: err.message, output_md: '', structured: null, cost_estimate_usd: Number(totalCost.toFixed(4)), model: SONNET_MODEL };
  }
}

module.exports = { run, SONNET_MODEL, HAIKU_MODEL };
