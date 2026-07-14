'use strict';

/**
 * Executive English Coaching — AI Curriculum Agent.
 * Provider-agnostic Claude wrapper (reuses ANTHROPIC_API_KEY). Encodes the
 * fast-track methodology: ESP (English for Specific Purposes), 80/20 vocabulary
 * (~1000 high-frequency + top industry terms), task-based micro-sessions,
 * spaced repetition, shadowing + AI voice scoring.
 *
 *  - generateCurriculum(profile, kbText) -> full modular program
 *  - gradeAssessment(questions, answers) -> { score, passed, weak_areas }
 *  - reinforce(module, weak_areas, profile) -> targeted reinforcement content
 *  - scoreSpoken(target, said, level) -> 5-criterion rubric (Torna Idioma pattern)
 *  - PLACEMENT_BANK + scorePlacement(answers) -> deterministic level
 *
 * Zero-key heuristic fallbacks keep the whole flow working without a key.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.EXEC_COACHING_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function extractJson(raw, open, close) {
  const s = raw.indexOf(open), e = raw.lastIndexOf(close);
  return JSON.parse(raw.slice(s, e + 1));
}

// Module count flexes with level + timeline (fast-track, executive schedule).
function suggestModuleCount(level, months) {
  const base = level === 'low' ? 4 : level === 'high' ? 6 : 5;
  const bump = months >= 12 ? 2 : months >= 6 ? 1 : 0;
  return Math.min(8, base + bump);
}

// ─── AI Curriculum Agent — Phase A: compact OUTLINE (fast, reliable) ─────────
// Produces module shells (title, objective, vocab, lesson TITLES, assessment).
// Full lesson content is generated lazily per-module (Phase B) so no single
// call is large enough to truncate at max_tokens.
async function generateCurriculum(profile, kbText) {
  const level = profile.placement_level || profile.self_level || 'medium';
  const months = profile.timeline_months || 6;
  const count = suggestModuleCount(level, months);

  if (!anthropic) return heuristicCurriculum(profile, count, level);

  const kb = (kbText || '').slice(0, 3000);
  const prompt = `You are the AI Curriculum Agent for a premium executive English program for Spanish-speaking professionals. Design ONLY the high-level OUTLINE (module titles + objectives) — nothing else. Teach English THROUGH the student's job context (ESP), increasing difficulty, last module = capstone/certification.

STUDENT PROFILE:
- Level: ${level}
- Occupation: ${profile.occupation || 'executive'} in ${profile.industry || 'business'}
- Motivation: ${profile.motivation || ''} ${profile.motivation_text || ''}
- Timeline: ${months} months, ${profile.hours_per_week || 3} hours/week
${kb ? `\nCOACH KNOWLEDGE BASE (teach in THIS style):\n${kb}\n` : ''}

Produce EXACTLY ${count} modules. Return ONLY JSON:
{ "title": "program title (Spanish)", "focus": "1-2 sentence ESP focus (Spanish)",
  "modules": [ { "title": "module topic (English)", "objective": "what the student can DO after it (Spanish, one sentence)" } ] }
Concrete to a ${profile.occupation || 'executive'} in ${profile.industry || 'business'}. Proper Spanish orthography. No emojis.`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = (resp.content || []).map(b => b.text || '').join('').trim();
    const p = extractJson(raw, '{', '}');
    if (!Array.isArray(p.modules) || !p.modules.length) return heuristicCurriculum(profile, count, level);
    return {
      title: String(p.title || 'Programa Ejecutivo de Inglés').slice(0, 200),
      focus: String(p.focus || '').slice(0, 800),
      level, generated_by: 'ai',
      // Empty content — vocab/lessons/assessment generated lazily per module.
      modules: p.modules.slice(0, 8).map(m => ({
        title: String(m.title || 'Module').slice(0, 200),
        objective: String(m.objective || '').slice(0, 800),
        vocab: [], lessons: [], assessment: { questions: [] }
      }))
    };
  } catch (e) {
    console.error('Curriculum outline error:', e.message);
    return heuristicCurriculum(profile, count, level);
  }
}

// ─── AI Curriculum Agent — Phase B: materialize ONE module ──────────────────
// Vocab + lessons + assessment for a single module. Small, fast, reliable.
// Called lazily the first time a student opens the module.
async function generateModuleContent(module, profile, kbText) {
  if (!anthropic) return heuristicModuleContent(module, profile);
  const kb = (kbText || '').slice(0, 1500);
  const prompt = `Create the content for ONE English module in a program for a Spanish-speaking ${profile.occupation || 'executive'} in ${profile.industry || 'business'}.
Module: "${module.title}". Objective: ${module.objective || ''}.
${kb ? `Coach style to follow:\n${kb}\n` : ''}
Return ONLY JSON:
{ "vocab": [ { "term": "English term", "meaning_es": "significado", "example": "short English example" } ],
  "lessons": [ { "title": "lesson title (English)", "type": "reading|dialogue|drill", "mins": 12, "content_en": "markdown English content, concrete phrases the student will actually use in their job", "exercises": [ { "type": "multiple_choice", "q": "...", "options": ["..."], "answer": 0 }, { "type": "fill_blank", "q": "... ___ ...", "answer": "word" } ] } ],
  "assessment": { "questions": [ { "type": "multiple_choice", "q": "...", "options": ["..."], "answer": 0 }, { "type": "fill_blank", "q": "...", "answer": "word" } ] } }
Rules: 5-6 vocab; 2 lessons (content_en under 200 words each); 5-6 assessment questions. No emojis.`;
  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = (resp.content || []).map(b => b.text || '').join('').trim();
    const p = extractJson(raw, '{', '}');
    const arr = (v) => Array.isArray(v) ? v : [];
    const vocab = arr(p.vocab).slice(0, 12).map(v => ({
      term: String(v.term || '').slice(0, 120), meaning_es: String(v.meaning_es || '').slice(0, 200), example: String(v.example || '').slice(0, 300)
    }));
    const lessons = arr(p.lessons).slice(0, 3).map((l, i) => ({
      title: String(l.title || ('Lesson ' + (i + 1))).slice(0, 200),
      type: ['reading', 'dialogue', 'drill'].includes(l.type) ? l.type : 'reading',
      mins: Math.min(30, Math.max(5, parseInt(l.mins, 10) || 12)),
      content_en: String(l.content_en || '').slice(0, 4000),
      exercises: sanitizeQuestions(l.exercises)
    }));
    const questions = sanitizeQuestions(p.assessment && p.assessment.questions);
    if (!lessons.length && !questions.length) return heuristicModuleContent(module, profile);
    return { vocab, lessons: lessons.length ? lessons : heuristicModuleContent(module, profile).lessons, assessment: { questions: questions.length ? questions : heuristicModuleContent(module, profile).assessment.questions } };
  } catch (e) {
    console.error('generateModuleContent error:', e.message);
    return heuristicModuleContent(module, profile);
  }
}

function heuristicModuleContent(module, profile) {
  const job = profile.occupation || 'executive';
  const ind = profile.industry || 'business';
  return {
    vocab: [
      { term: 'stakeholder', meaning_es: 'parte interesada', example: 'We aligned every stakeholder before the launch.' },
      { term: 'leverage', meaning_es: 'aprovechar', example: 'We can leverage our regional network.' },
      { term: 'framework', meaning_es: 'marco', example: 'Let me share our strategic framework.' },
      { term: 'milestone', meaning_es: 'hito', example: 'We hit every milestone this quarter.' },
      { term: 'bottom line', meaning_es: 'resultado final', example: 'The bottom line is growth.' }
    ],
    lessons: [{
      title: `${module.title}: Core Phrases`, type: 'reading', mins: 12,
      content_en: `# ${module.title}\n\nKey executive English for a ${job} in ${ind}.\n\n- "Let me walk you through the key points."\n- "That said, our priority remains..."\n- "I'd be happy to elaborate on that."\n\nPractice each phrase aloud three times, then use it in a sentence about your work.`,
      exercises: [
        { type: 'multiple_choice', q: 'Which best opens a structured explanation?', options: ['Whatever.', 'Let me walk you through the key points.', 'I dunno.'], answer: 1 },
        { type: 'fill_blank', q: 'That said, our priority ___ competitiveness.', answer: 'remains' }
      ]
    }],
    assessment: { questions: [
      { type: 'multiple_choice', q: 'Choose the most professional opener.', options: ['Hey listen', 'Good afternoon, thank you for your time', 'Yo'], answer: 1 },
      { type: 'fill_blank', q: 'We can ___ our regional network. (aprovechar)', answer: 'leverage' },
      { type: 'multiple_choice', q: '"Stakeholder" significa:', options: ['competidor', 'parte interesada', 'empleado'], answer: 1 }
    ] }
  };
}

function sanitizeQuestions(qs) {
  if (!Array.isArray(qs)) return [];
  return qs.slice(0, 10).map(q => {
    const type = q.type === 'fill_blank' ? 'fill_blank' : 'multiple_choice';
    if (type === 'multiple_choice') {
      const options = Array.isArray(q.options) ? q.options.slice(0, 6).map(o => String(o).slice(0, 200)) : [];
      let answer = parseInt(q.answer, 10); if (isNaN(answer) || answer < 0 || answer >= options.length) answer = 0;
      return { type, q: String(q.q || '').slice(0, 400), options, answer };
    }
    return { type, q: String(q.q || '').slice(0, 400), answer: String(q.answer || '').slice(0, 120) };
  }).filter(q => q.q);
}

// Zero-key fallback curriculum (generic ESP executive track).
function heuristicCurriculum(profile, count, level) {
  const job = profile.occupation || 'executive';
  const ind = profile.industry || 'business';
  const topics = [
    'Executive Introductions & Small Talk', 'Meetings & Agendas', 'Presentations & Pitching',
    'Negotiation Language', 'Email & Written Communication', 'Handling Q&A and Press',
    'Networking & Relationship Building', 'Capstone: High-Stakes Communication'
  ];
  const modules = [];
  for (let i = 0; i < count; i++) {
    const t = topics[i] || `Advanced Communication ${i + 1}`;
    modules.push({
      title: t,
      objective: `Comunicar con confianza en inglés en situaciones de ${t.toLowerCase()} propias de un ${job} en ${ind}.`,
      vocab: [
        { term: 'stakeholder', meaning_es: 'parte interesada', example: 'We aligned every stakeholder before the launch.' },
        { term: 'leverage', meaning_es: 'aprovechar', example: 'We can leverage our regional network.' },
        { term: 'framework', meaning_es: 'marco', example: 'Let me share our strategic framework.' },
        { term: 'milestone', meaning_es: 'hito', example: 'We hit every milestone this quarter.' },
        { term: 'bottom line', meaning_es: 'resultado final', example: 'The bottom line is growth.' }
      ],
      lessons: [
        { title: `${t}: Core Phrases`, type: 'reading', mins: 12,
          content_en: `# ${t}\n\nKey executive phrases for a ${job} in ${ind}.\n\n- "Let me walk you through the key points."\n- "That said, our priority remains..."\n- "I'd be happy to elaborate on that."\n\nPractice each aloud three times.`,
          exercises: [
            { type: 'multiple_choice', q: 'Which phrase best opens a structured explanation?', options: ['Whatever.', 'Let me walk you through the key points.', 'I dunno.'], answer: 1 },
            { type: 'fill_blank', q: 'That said, our priority ___ competitiveness.', answer: 'remains' }
          ] }
      ],
      assessment: { questions: [
        { type: 'multiple_choice', q: 'Choose the most professional opener.', options: ['Hey listen', 'Good afternoon, thank you for your time', 'Yo'], answer: 1 },
        { type: 'fill_blank', q: 'We can ___ our regional network. (aprovechar)', answer: 'leverage' },
        { type: 'multiple_choice', q: '"Stakeholder" significa:', options: ['competidor', 'parte interesada', 'empleado'], answer: 1 }
      ] }
    });
  }
  return {
    title: `Programa Ejecutivo de Inglés — ${job}`,
    focus: `Inglés para ${job} en ${ind}, enfocado en reuniones, presentaciones y negociación de alto nivel.`,
    level, generated_by: 'heuristic', modules
  };
}

// ─── Assessment grading (deterministic for MC/fill) ─────────────────────────
function gradeAssessment(questions, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  if (!qs.length) return { score: 0, passed: false, weak_areas: [] };
  let correct = 0; const weak = [];
  qs.forEach((q, i) => {
    const a = answers ? answers[i] : undefined;
    let ok = false;
    if (q.type === 'multiple_choice') ok = parseInt(a, 10) === q.answer;
    else ok = String(a || '').trim().toLowerCase() === String(q.answer || '').trim().toLowerCase();
    if (ok) correct++; else weak.push(q.q);
  });
  const score = Math.round((correct / qs.length) * 100);
  return { score, correct, total: qs.length, weak_areas: weak };
}

// ─── Reinforcement content for a failed module (targets weak areas) ─────────
async function reinforce(module, weakAreas, profile) {
  if (!anthropic) {
    return `Repaso enfocado del módulo "${module.title}". Revise de nuevo estas preguntas y practique en voz alta:\n\n- ${(weakAreas || []).slice(0, 6).join('\n- ')}\n\nVuelva a intentar la evaluación cuando se sienta seguro.`;
  }
  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 1200,
      messages: [{ role: 'user', content: `A Spanish-speaking ${profile.occupation || 'executive'} failed the English module "${module.title}". They struggled with:\n${(weakAreas || []).map(w => '- ' + w).join('\n')}\n\nWrite short, targeted reinforcement (Spanish instructions, English examples): re-explain each weak point with a model English phrase and a 1-line drill. Under 250 words. No emojis.` }]
    });
    return (resp.content || []).map(b => b.text || '').join('').trim() || 'Repaso disponible. Intente de nuevo.';
  } catch (e) {
    return 'Repaso: revise el módulo y vuelva a intentar la evaluación.';
  }
}

// ─── Spoken response scoring (Torna Idioma 5-criterion rubric) ──────────────
function heuristicSpoken(said) {
  const n = String(said || '').trim().split(/\s+/).filter(Boolean).length;
  const score = Math.max(20, Math.min(95, 30 + n * 3));
  return { score, level: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low', tip: 'Grabe una respuesta más larga y detallada para subir su nivel.', heuristic: true };
}
async function scoreSpoken(target, said, level) {
  if (!anthropic) return heuristicSpoken(said);
  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 500,
      messages: [{ role: 'user', content: `You are an oral English examiner. The prompt was: "${target}". The learner's spoken response (browser-transcribed, imperfect) was: "${said}". Judge communication, not spelling. Score 5 criteria 1-5 (fluency, accuracy, pronunciation-from-word-choice, range, interaction). Never auto-perfect. Return ONLY JSON: {"score": <0-100>, "level": "low|medium|high", "tip": "one improvement tip in Spanish"}` }]
    });
    const raw = (resp.content || []).map(b => b.text || '').join('').trim();
    const p = extractJson(raw, '{', '}');
    return { score: Math.max(0, Math.min(100, parseInt(p.score, 10) || 0)), level: ['low', 'medium', 'high'].includes(p.level) ? p.level : 'medium', tip: String(p.tip || '').slice(0, 300) };
  } catch (e) {
    return heuristicSpoken(said);
  }
}

// ─── Placement item bank (deterministic; no key needed) ─────────────────────
// Increasing difficulty. index of correct option in `a`.
const PLACEMENT_BANK = [
  { q: 'Choose the correct sentence.', options: ['She go to work every day.', 'She goes to work every day.', 'She going to work every day.'], a: 1, band: 'low' },
  { q: 'Complete: "I have worked here ___ 2019."', options: ['since', 'for', 'from'], a: 0, band: 'low' },
  { q: 'Which is most formal for an email opening?', options: ['Hey!', 'Dear Mr. Gómez,', 'Yo Gómez'], a: 1, band: 'medium' },
  { q: 'Choose the best word: "We need to ___ the contract terms."', options: ['negotiate', 'negotiation', 'negotiable'], a: 0, band: 'medium' },
  { q: 'Complete: "Had we known earlier, we ___ acted differently."', options: ['will have', 'would have', 'have'], a: 1, band: 'high' },
  { q: 'Best diplomatic rephrase of "You are wrong":', options: ['I respectfully see it differently.', 'That is false.', 'No.'], a: 0, band: 'high' }
];

function scorePlacement(answers) {
  let correct = 0, highOk = 0;
  PLACEMENT_BANK.forEach((it, i) => {
    if (parseInt(answers[i], 10) === it.a) { correct++; if (it.band === 'high') highOk++; }
  });
  const pct = Math.round((correct / PLACEMENT_BANK.length) * 100);
  let level = 'low';
  if (pct >= 80 || highOk >= 2) level = 'high';
  else if (pct >= 50) level = 'medium';
  return { score: pct, level, correct, total: PLACEMENT_BANK.length };
}

module.exports = {
  generateCurriculum, generateModuleContent, gradeAssessment, reinforce, scoreSpoken,
  PLACEMENT_BANK: PLACEMENT_BANK.map(({ q, options }) => ({ q, options })), // no answers to client
  scorePlacement, suggestModuleCount,
  activeModel: () => (anthropic ? MODEL : 'heuristic-fallback')
};
