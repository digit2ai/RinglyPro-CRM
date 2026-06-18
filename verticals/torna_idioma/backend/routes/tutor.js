const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.ti');
const rateLimit = require('../middleware/rate-limit.ti');
const edgeTts = require('../services/edge-tts');
const emperador = require('../services/emperador');

// Cost-sensitive endpoints: throttle per learner (LLM + TTS calls).
const chatLimiter = rateLimit({ windowMs: 60000, max: 20, key: 'chat' });
const ttsLimiter = rateLimit({ windowMs: 60000, max: 40, key: 'tts' });

// ============================================================================
// PROFESORA ISABEL — MÉTODO RIZAL system prompt (PART B, installed verbatim).
// Model stays claude-sonnet-4-6. Runtime variables in {{...}} are injected per
// request. Explanations in {{interface_lang}} (en|fil) — never Spanish. Spanish
// target words/phrases are wrapped in ⟦es⟧ … ⟦es⟧ for TTS smart-split.
// ============================================================================
const SYSTEM_PROMPT = `## RUNTIME CONTEXT (injected by the backend)
- interface_lang: {{interface_lang}}  (the language you EXPLAIN in — never Spanish)
- immersion_level: {{immersion_level}}  (1–5; controls Spanish-to-explanation ratio)
- streak_days: {{streak_days}}
- learner_name: {{learner_name}}
- current_module / current_theme: {{current_module}} / {{current_theme}}
- todays_roots: {{todays_roots}}
- mode: {{mode}}  (tutor | dia_de_espanol | rizal_module | translation)

## 1. IDENTITY & MISSION
You are **Profesora Isabel**, a warm, patient Spanish teacher for Torna Idioma,
teaching Spanish to Filipino and English-speaking learners using the **Método Rizal**
— modeled on how José Rizal learned languages (five root words a night, toward
~1,800 words a year) and how he taught at Dapitan (immersion, translating real texts,
friendly progress). Make each learner a little more capable in **Spanish** every day,
explaining everything in their chosen language so nothing blocks their progress.

## 2. THE TWO-LANGUAGE RULE (most important — never break)
- **EXPLAIN in {{interface_lang}}** (English or Filipino): all teaching,
  encouragement, grammar notes, instructions.
- **TEACH Spanish:** every target word, example sentence, and model phrase is in
  **Spanish**, regardless of interface language.
- Never use Spanish for explanations; never replace a Spanish target word with its
  interface-language translation — translate only as a parenthetical gloss.
- fil → natural, correct Tagalog (proper spelling/diacritics). en → natural English.

### Spanish span markers (required for voice)
Wrap **every Spanish word/phrase** to be spoken in a Spanish voice with ⟦es⟧ … ⟦es⟧.
Leave explanation text unmarked. The frontend strips markers before display and uses
them for correct Spanish audio.

**interface_lang = en:**
> Today's first word is ⟦es⟧saludar⟦es⟧ (to greet). You'll hear it in
> ⟦es⟧Hola, ¿cómo estás?⟦es⟧ — "Hello, how are you?" Try saying ⟦es⟧Hola⟦es⟧ back to me.

**interface_lang = fil:**
> Ang unang salita natin ngayon ay ⟦es⟧saludar⟦es⟧ (bumati). Naririnig mo ito sa
> ⟦es⟧Hola, ¿cómo estás?⟦es⟧ — "Kumusta ka?" Subukan mong sabihin ang ⟦es⟧Hola⟦es⟧.

## 3. THE MÉTODO RIZAL — how you run a session
1. **Five roots a night.** Standard session = exactly five new Spanish roots from
   todays_roots. Don't exceed five; depth beats volume. (If the learner only wants to
   chat or review, follow their lead and skip new roots.)
2. **Teach roots as families.** 2–4 derived/related forms per root; explain the link.
3. **Use it immediately.** Each new root in a short natural Spanish sentence, then
   invite the learner to produce one.
4. **Honor the streak.** Acknowledge streak_days warmly when relevant; encourage the
   next session without pressure, guilt, or manipulation; never imply harm/loss.
5. **Translate real things.** Offer a tiny real line to render to/from Spanish.
6. **Recycle.** Weave in previously learned roots naturally.

## 4. IMMERSION LADDER — calibrate by immersion_level
Explanations stay in {{interface_lang}}; immersion changes how much Spanish you model
and gloss.
- **L1:** mostly explanation; every Spanish phrase fully glossed.
- **L2:** short Spanish phrases, each glossed; simple Spanish questions.
- **L3:** alternate Spanish and explanation; gloss only harder words.
- **L4:** lead in Spanish for greetings/instructions; gloss sparingly.
- **L5 (near-immersion):** most of the exchange in Spanish, glossing only on stalls.
  In dia_de_espanol, push to the top of the learner's level regardless of stored #.
Never jump past their level; if they struggle, drop a level for that turn and gloss more.

## 5. MODE BEHAVIORS
- **tutor** (default): the five-root session above.
- **dia_de_espanol**: maximize Spanish for the learner's level (see L5).
- **translation**: grade the learner's EN/FIL ↔ Spanish submission — what's correct,
  one or two priority fixes, corrected Spanish in ⟦es⟧ markers, tied to the roots.
- **rizal_module**: teach the Rizal Studies track — Rizal's life, works
  (⟦es⟧Noli Me Tángere⟦es⟧, ⟦es⟧El Filibusterismo⟦es⟧), and his multilingual method —
  using his own Spanish prose (public-domain or graded adaptations) as reading and
  translation. Keep target text Spanish; explain in {{interface_lang}}. Note when text
  is a graded adaptation vs. an original. No copyrighted third-party editions.

## 6. TESDA / COMPETENCY-ALIGNED FEEDBACK
- Frame progress as what the learner can now **do** ("You can now greet someone and
  give your name in Spanish"), not just words memorized.
- Name the criterion when correcting (pronunciation, gender agreement,
  ⟦es⟧ser⟦es⟧ vs. ⟦es⟧estar⟦es⟧, verb ending) so it maps to a performance criterion.
- One or two highest-impact fixes per turn; A1 learners need encouragement most.
- End a completed session with a one-line "can-do" summary the system logs as evidence.

## 7. STYLE & SAFETY
Warm, encouraging, concise; short turns; one question at a time. Honest praise, not
flattery; gentle specific correction. Keep existing UI emojis; add none. Stay in scope
(Spanish + Rizal Studies); decline unrelated requests politely and steer back. Never
shame a learner for mistakes, accent, or missed days. If unsure of a Tagalog rendering,
give your best natural Tagalog and keep moving; never invent non-standard Spanish.

## 8. TURN FORMAT (default tutor mode)
1. Brief warm opener in {{interface_lang}} (acknowledge streak if notable).
2. Today's five roots, one at a time: root + family + gloss + one Spanish example
   (Spanish in ⟦es⟧), then a quick prompt to use it.
3. One short translation or production task.
4. A one-line "can-do" summary for the session log.`;

// Map any interface lang to en|fil — Isabel never explains in Spanish.
function normalizeLang(l) {
  return l === 'fil' ? 'fil' : 'en';
}

// Format the injected five roots (array of root objects) into a compact briefing.
function formatRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) return '(none provided — follow the learner)';
  return roots.map(r => {
    const fam = Array.isArray(r.derived_forms) && r.derived_forms.length ? ` [family: ${r.derived_forms.join(', ')}]` : '';
    const en = r.gloss_en ? ` = ${r.gloss_en}` : '';
    const fil = r.gloss_fil ? ` / ${r.gloss_fil}` : '';
    return `- ${r.root_lemma}${fam}${en}${fil}`;
  }).join('\n');
}

function renderPrompt(vars) {
  const map = {
    interface_lang: vars.interface_lang,
    immersion_level: String(vars.immersion_level),
    streak_days: String(vars.streak_days),
    learner_name: vars.learner_name || '(unknown)',
    current_module: String(vars.current_module),
    current_theme: vars.current_theme || '(general)',
    todays_roots: formatRoots(vars.todays_roots),
    mode: vars.mode,
  };
  return SYSTEM_PROMPT.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

const VALID_MODES = ['tutor', 'dia_de_espanol', 'rizal_module', 'translation'];

// Chat with Profesora Isabel (Método Rizal).
router.post('/chat', auth.any, chatLimiter, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TI_V2_ANTHROPIC_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI tutor service not configured' });
    }

    const interface_lang = normalizeLang(req.body.interface_lang || req.user.language_pref);
    const immersion_level = Math.max(1, Math.min(5, Number(req.body.immersion_level) || 1));
    const mode = VALID_MODES.includes(req.body.mode) ? req.body.mode : 'tutor';
    const systemPrompt = renderPrompt({
      interface_lang,
      immersion_level,
      mode,
      streak_days: Number(req.body.streak_days) || 0,
      learner_name: req.body.learner_name || req.user.full_name,
      current_module: Number(req.body.current_module) || 1,
      current_theme: req.body.current_theme,
      todays_roots: req.body.todays_roots,
    });

    // Claude requires user/assistant-only messages starting with a user turn.
    const claudeMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content || '') }));
    while (claudeMessages.length && claudeMessages[0].role !== 'user') claudeMessages.shift();
    if (claudeMessages.length === 0) {
      return res.status(400).json({ error: 'no user message to respond to' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 900,
        system: systemPrompt,
        messages: claudeMessages,
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude error:', err);
      return res.status(502).json({ error: 'AI tutor temporarily unavailable' });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Lo siento, no pude generar una respuesta. ¡Inténtalo de nuevo!';

    const sequelize = require('../services/db.ti');
    try {
      await sequelize.query(
        `INSERT INTO ti_tutor_sessions (user_id, message_count, last_active, created_at)
         VALUES ($1, 1, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET message_count = ti_tutor_sessions.message_count + 1, last_active = NOW()`,
        { bind: [req.user.id] }
      );
    } catch (logErr) { /* table may not exist yet, non-critical */ }

    // Honor-based points for graded translations and immersion sessions.
    try {
      if (mode === 'translation') await emperador.award(req.user.id, 'translation_done');
      else if (mode === 'dia_de_espanol') await emperador.award(req.user.id, 'immersion_session');
    } catch (e) { /* non-critical */ }

    res.json({ success: true, reply });
  } catch (err) {
    console.error('Tutor chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Neural TTS with ⟦es⟧ smart-split: Spanish voice for Spanish spans, interface-
// language voice for explanation. One MP3 back. Body: { text, interface_lang? }
router.post('/tts', auth.any, ttsLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text required' });
    }
    const interfaceLang = normalizeLang(req.body.interface_lang || req.user.language_pref);
    const clean = text.trim().slice(0, 2000); // cap to keep latency/usage bounded
    const audio = await edgeTts.synthesizeMarked(clean, { interfaceLang });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    return res.send(audio);
  } catch (err) {
    console.error('Edge TTS error:', err.message);
    return res.status(502).json({ error: 'tts_unavailable' });
  }
});

// Conversation starters (bilingual labels; Spanish is content, not UI chrome).
router.get('/starters', auth.any, (req, res) => {
  const starters = {
    beginner: [
      { label_en: 'Introduce yourself', label_fil: 'Ipakilala ang sarili', prompt: 'Hola! I want to learn how to introduce myself in Spanish.' },
      { label_en: 'Numbers & counting', label_fil: 'Mga numero', prompt: 'Can you teach me numbers in Spanish? I know uno, dos, tres from Filipino!' },
      { label_en: 'Greetings', label_fil: 'Mga pagbati', prompt: 'How do I greet people in Spanish? I already know "kumusta" comes from Spanish!' },
      { label_en: 'Filipino-Spanish words', label_fil: 'Mga salitang magkapareho', prompt: 'What Spanish words do Filipinos already use every day?' },
      { label_en: 'Five roots today', label_fil: 'Limang ugat ngayon', prompt: 'Teach me my five new root words for today, Método Rizal style.' },
      { label_en: 'Days & months', label_fil: 'Araw at buwan', prompt: 'Teach me the days and months — I think they\'re similar to Filipino!' },
    ],
    intermediate: [
      { label_en: 'BPO phone skills', label_fil: 'BPO phone skills', prompt: 'I work in a BPO. Teach me professional phone greetings in Spanish.' },
      { label_en: 'Job interview', label_fil: 'Job interview', prompt: 'Help me practice for a Spanish-speaking job interview.' },
      { label_en: 'Past tense practice', label_fil: 'Pretérito', prompt: 'Can you help me practice the preterite? I still mix up ser and estar.' },
      { label_en: 'Customer service', label_fil: 'Customer service', prompt: 'Teach me how to handle a customer complaint in Spanish.' },
      { label_en: 'Translate a line', label_fil: 'Magsalin ng pangungusap', prompt: 'Give me a short sentence to translate into Spanish and grade me.' },
      { label_en: 'DELE B1 practice', label_fil: 'DELE B1', prompt: 'Can we practice some DELE B1 level conversation topics?' },
    ],
    advanced: [
      { label_en: 'Business negotiation', label_fil: 'Negosasyon', prompt: 'Let\'s practice a business negotiation in Spanish.' },
      { label_en: 'Debate a topic', label_fil: 'Magdebate', prompt: 'Can we debate a topic? I want to practice argumentation in Spanish.' },
      { label_en: 'Rizal in Spanish', label_fil: 'Si Rizal sa Espanyol', prompt: 'Let\'s talk about José Rizal and his works in Spanish.' },
      { label_en: 'Día de Español', label_fil: 'Día de Español', prompt: 'Let\'s do a Día de Español — speak mostly Spanish with me.' },
      { label_en: 'DELE C1 writing', label_fil: 'DELE C1 writing', prompt: 'Help me practice formal essay writing for DELE C1.' },
      { label_en: 'Philippine-Spanish history', label_fil: 'Kasaysayan', prompt: 'Let\'s discuss Spanish influence on Philippine history — in Spanish, please.' },
    ],
  };
  res.json({ success: true, starters });
});

module.exports = router;
