'use strict';

// =============================================================
// Resume extraction + per-job tailoring.
//
// Extraction is ported from the donor's documentExtract.js (pdf-parse, mammoth,
// plain text) — both parsers are OPTIONAL dependencies, so a missing module
// degrades to a labelled result instead of crashing.
//
// TAILORING'S GOVERNING RULE (spec section 11.1 / 19.1):
//   Tailoring reorders, reweights and rephrases what the subscriber ACTUALLY
//   WROTE. It may never invent an employer, date, degree, certification,
//   clearance or metric that is not in the source. The generated version is
//   diffed against the source and ANY new proper noun or number is flagged for
//   explicit confirmation before it can be saved. Résumé fraud is not a feature.
// =============================================================

const brain = require('./brain');

const PER_FILE_CHAR_CAP = 120000;

function cleanText(s) {
  return String(s || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

let pdfParse = null;
try { pdfParse = require('pdf-parse/lib/pdf-parse.js'); } catch (_) { /* optional */ }
let mammoth = null;
try { mammoth = require('mammoth'); } catch (_) { /* optional */ }

async function extractText(buffer, filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  try {
    if (ext === 'pdf') {
      if (!pdfParse) return { text: '', ok: false, note: 'pdf-parse not installed' };
      const r = await pdfParse(buffer);
      return { text: cleanText(r && r.text).slice(0, PER_FILE_CHAR_CAP), ok: true };
    }
    if (ext === 'docx') {
      if (!mammoth) return { text: '', ok: false, note: 'mammoth not installed' };
      const r = await mammoth.extractRawText({ buffer });
      return { text: cleanText(r && r.value).slice(0, PER_FILE_CHAR_CAP), ok: true };
    }
    if (['txt', 'md', 'csv', 'json', 'rtf'].includes(ext)) {
      let t = buffer.toString('utf8');
      if (ext === 'rtf') t = t.replace(/\\'[0-9a-f]{2}/gi, ' ').replace(/[{}]|\\[a-z]+-?\d*/gi, ' ');
      return { text: cleanText(t).slice(0, PER_FILE_CHAR_CAP), ok: true };
    }
    return { text: '', ok: false, note: `unsupported file type: ${ext}` };
  } catch (e) {
    return { text: '', ok: false, note: e.message };
  }
}

// ---- Structuring into JSON Resume shape -----------------------------------

const STRUCTURE_SYSTEM = `Extract a resume into JSON Resume format.
Return ONLY JSON:
{"basics":{"name":"","headline":"","email":"","phone":"","location":"","summary":""},
 "experience":[{"title":"","company":"","start":"","end":"","highlights":[""]}],
 "education":[{"institution":"","area":"","studyType":"","end":""}],
 "skills":[""],"certifications":[""]}
Rules:
- Copy facts EXACTLY as written. Never infer, never embellish, never fill gaps.
- If a field is absent from the source, use an empty string or empty array.
- Do not invent employers, dates, degrees, certifications or metrics.`;

function heuristicStructure(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0] || '';
  const phone = (text.match(/\+?\d[\d\s().-]{7,}\d/) || [])[0] || '';
  return {
    basics: { name: lines[0] || '', headline: lines[1] || '', email, phone, location: '', summary: '' },
    experience: [], education: [], skills: [], certifications: [],
    is_simulated: true,
    note: 'Heuristic structure only — no ANTHROPIC_API_KEY. Fields left empty rather than guessed.',
  };
}

async function structure(text) {
  if (!brain.enabled()) return { profile: heuristicStructure(text), is_simulated: true, cost_usd: 0 };
  const res = await brain.json({
    system: STRUCTURE_SYSTEM,
    prompt: String(text || '').slice(0, 24000),
    maxTokens: 2500,
  });
  if (!res.ok || !res.data) {
    return { profile: heuristicStructure(text), is_simulated: true, cost_usd: res.cost_usd || 0 };
  }
  const d = res.data;
  return {
    profile: {
      headline: (d.basics && d.basics.headline) || '',
      summary: (d.basics && d.basics.summary) || '',
      name: (d.basics && d.basics.name) || '',
      email: (d.basics && d.basics.email) || '',
      phone: (d.basics && d.basics.phone) || '',
      location: (d.basics && d.basics.location) || '',
      experience: d.experience || [],
      education: d.education || [],
      skills: d.skills || [],
      certifications: d.certifications || [],
      is_simulated: false,
    },
    is_simulated: false,
    cost_usd: res.cost_usd || 0,
  };
}

// ---- THE NO-INVENTED-FACTS GUARD ------------------------------------------

const STOPWORDS = new Set(['The','A','An','And','Or','But','For','With','From','To','In','On','At','By','As','Of','My','I','We','This','That','These','Those','It','Its','Led','Built','Managed','Drove','Owned','Delivered','Designed','Developed','Created','Improved','Increased','Reduced','Senior','Junior','Lead','Principal','Staff','Manager','Director','Engineer','Analyst','Consultant']);

function properNouns(text) {
  const out = new Set();
  // SINGLE capitalised tokens, not phrases. Phrase matching spanned sentence
  // boundaries ("Ada Lovelace. Senior Engineer" became one token), which made a
  // faithful reordering look like an invented fact. Token-level comparison is
  // what actually answers "is this name present in the source?".
  const re = /\b[A-Z][a-zA-Z0-9&\-]{1,}\b/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const tok = m[0].trim();
    if (STOPWORDS.has(tok)) continue;
    if (tok.length < 2) continue;
    out.add(tok);
  }
  return out;
}

function numbers(text) {
  const out = new Set();
  // No trailing \b — it excluded the % sign, so "40%" -> "95%" read as a
  // plain number change and the percentage was lost from the comparison.
  const re = /\b\d[\d,.]*%?/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) out.add(m[0].replace(/,/g, ''));
  return out;
}

/**
 * Diff a tailored resume against its source. Anything new that is a proper noun
 * or a number is FLAGGED — it cannot be saved until a human confirms it.
 * This is the mechanism, not the prompt, that prevents résumé fraud.
 */
function flagInventedFacts(sourceText, tailoredText) {
  const srcNouns = properNouns(sourceText);
  const srcNums = numbers(sourceText);
  const srcLower = new Set([...srcNouns].map((s) => s.toLowerCase()));

  const flagged = [];
  for (const n of properNouns(tailoredText)) {
    if (!srcLower.has(n.toLowerCase())) flagged.push({ type: 'proper_noun', term: n });
  }
  for (const n of numbers(tailoredText)) {
    if (!srcNums.has(n)) flagged.push({ type: 'number', term: n });
  }
  return flagged;
}

const TAILOR_SYSTEM = `You tailor an existing resume to a specific job posting.
Return ONLY JSON: {"resume":"the full tailored resume as plain text","changes":["what changed and why", ...]}
ABSOLUTE RULES:
- You may reorder, reweight, re-emphasise and rephrase content that is already in the source resume.
- You may NOT introduce any employer, job title, date, degree, certification, clearance, tool or metric that does not appear in the source resume.
- If the posting wants something the candidate lacks, leave it out. Do not manufacture it.
- Every number in your output must appear in the source resume.`;

async function tailor(sourceText, job) {
  if (!brain.enabled()) {
    return {
      content: sourceText,
      changes: ['No ANTHROPIC_API_KEY — returned the source resume unchanged rather than fabricating a tailored one.'],
      flagged: [],
      is_simulated: true,
      cost_usd: 0,
    };
  }

  const prompt = [
    'JOB POSTING:',
    `Title: ${job.title || ''}`,
    `Employer: ${job.employer || ''}`,
    (job.description || '').slice(0, 5000),
    '',
    'SOURCE RESUME (the only permitted source of facts):',
    String(sourceText || '').slice(0, 12000),
  ].join('\n');

  const res = await brain.json({ system: TAILOR_SYSTEM, prompt, maxTokens: 3000 });
  if (!res.ok || !res.data || !res.data.resume) {
    return {
      content: sourceText,
      changes: ['Tailoring failed; returned the source resume unchanged.'],
      flagged: [], is_simulated: true, cost_usd: res.cost_usd || 0,
    };
  }

  const content = String(res.data.resume);
  const flagged = flagInventedFacts(sourceText, content);

  return {
    content,
    changes: Array.isArray(res.data.changes) ? res.data.changes.slice(0, 20) : [],
    flagged,
    // A tailored resume with flagged terms CANNOT be auto-saved as confirmed.
    requires_confirmation: flagged.length > 0,
    is_simulated: false,
    cost_usd: res.cost_usd || 0,
  };
}

// ---- Deterministic ATS keyword scoring (free — no LLM) ---------------------

function atsScore(resumeText, job) {
  const stop = new Set(['and','the','for','with','you','our','are','will','have','this','that','from','your','who','all','can','not','但','a','an','to','of','in','on','at','as','is','be','or','by','we']);
  const jobTerms = new Set(
    String(`${job.title || ''} ${job.description || ''}`).toLowerCase()
      .match(/[a-z][a-z0-9+#.]{2,}/g)?.filter((w) => !stop.has(w)) || []
  );
  const resumeWords = new Set(
    String(resumeText || '').toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) || []
  );
  const matched = [...jobTerms].filter((t) => resumeWords.has(t));
  const missing = [...jobTerms].filter((t) => !resumeWords.has(t));
  const score = jobTerms.size ? Math.round((matched.length / jobTerms.size) * 100) : 0;
  return {
    score,
    matched: matched.slice(0, 40),
    missing: missing.slice(0, 40),
    total_terms: jobTerms.size,
    deterministic: true, // no model call, no cost
  };
}

module.exports = {
  extractText, structure, tailor, atsScore,
  flagInventedFacts, properNouns, numbers, heuristicStructure, cleanText,
};
