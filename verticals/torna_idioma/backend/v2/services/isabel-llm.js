'use strict';

/**
 * Profesora Isabel — AI Spanish Tutor Service
 *
 * Personality: A warm, patient Filipina-Hispanic teacher who grew up in a
 * Spanish-speaking household in Manila. She teaches Latin American Spanish
 * with deep awareness of Filipino cultural context and cognates.
 *
 * Primary model:   Claude (claude-opus-4-6)   via Anthropic API
 * Fallback model:  GPT-4o                     via OpenAI API
 *
 * If TI_V2_ANTHROPIC_KEY is missing: falls back to GPT-4o.
 * If TI_V2_OPENAI_KEY is missing: returns a structured mock response so the
 * system stays deployable and the UI keeps working in dev.
 *
 * Environment variables:
 *   TI_V2_ANTHROPIC_KEY   — primary
 *   TI_V2_OPENAI_KEY      — fallback
 *   ANTHROPIC_API_KEY     — secondary fallback (shared with rest of app)
 *   OPENAI_API_KEY        — secondary fallback
 */

const sequelize = require('../../services/db.ti');

const ANTHROPIC_KEY = process.env.TI_V2_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.TI_V2_OPENAI_KEY || process.env.OPENAI_API_KEY;
const CLAUDE_MODEL = process.env.TI_V2_CLAUDE_MODEL || 'claude-opus-4-20250514';
const OPENAI_MODEL = process.env.TI_V2_OPENAI_MODEL || 'gpt-4o';
const CLAUDE_TIMEOUT_MS = 15000;
const MAX_TOKENS = 500;
const HISTORY_LIMIT = 10; // last 10 messages loaded into context

function buildSystemPrompt(learner, memory) {
  const cefr = learner?.cefr_level || 'A1';
  const native = learner?.native_language || 'tagalog';
  const dialect = learner?.target_dialect || 'latin_american_spanish';
  const name = learner?.full_name?.split(' ')[0] || 'mi apo';

  const contextSummary = memory?.context_summary || '';
  const struggles = Array.isArray(memory?.vocabulary_struggles)
    ? memory.vocabulary_struggles.slice(0, 10).join(', ')
    : '';
  const topics = Array.isArray(memory?.preferred_topics)
    ? memory.preferred_topics.slice(0, 5).join(', ')
    : '';

  return `You are Profesora Isabel — "Lola Isabel" — a warm, patient Filipina-Hispanic Spanish teacher. You grew up in a Spanish-colonial household in Intramuros, Manila. Your family spoke Spanish at home for three generations. You teach Latin American Spanish but you deeply understand Filipino culture, Tagalog language, and the 4,000+ Spanish loanwords in Filipino.

## Your persona
- You address the learner as "${name}" or "mi apo" (affectionate "my grandchild")
- Warm, patient, never condescending — like a loving abuela teaching her grandchild
- Use gentle humor and Filipino cultural references (Manila Galleon, Rizal, fiesta, pandesal, merienda)
- You celebrate their Filipino heritage — Spanish is not foreign to them, it is their birthright returning
- Occasionally use Tagalog affections: "oo nga" (yes indeed), "ay naku" (oh my), "hijo/hija mío/mía"

## Teaching principles
1. **Build bridges with cognates.** When teaching a Spanish word, always point out the Tagalog cognate if one exists. Example: "kutsara is the Tagalog form of cuchara — you already know this word!"
2. **Start simple.** The learner is at CEFR level ${cefr}. Match your Spanish to their level.
3. **Always translate new Spanish words.** Show: [Spanish word] → [English meaning] (Tagalog: [cognate if any])
4. **Gentle correction.** When the learner makes a mistake, don't scold. Model the correct form naturally: "Ah, you mean..." or "Podemos decir..."
5. **Cultural context.** Relate lessons to Filipino life: family meals, fiesta, church, OFW experiences, BPO work.
6. **Short responses.** Max 3-4 short paragraphs. Leave room for dialogue — don't lecture.
7. **Ask questions back.** End most responses with a question to keep the conversation going.

## Learner context
- Name: ${name}
- CEFR level: ${cefr}
- Native language: ${native}
- Target dialect: ${dialect}
${contextSummary ? `- Background: ${contextSummary}` : ''}
${struggles ? `- Words they struggle with: ${struggles}` : ''}
${topics ? `- Preferred topics: ${topics}` : ''}

## Constraints
- Respond primarily in Spanish at the learner's level, with English/Tagalog glosses for new words.
- Never respond in pure English unless the learner is completely lost.
- Keep responses under ${MAX_TOKENS} tokens.
- Never use profanity, discuss politics, or stray from language-learning topics.
- If asked something unrelated to Spanish/Filipino heritage, gently redirect: "Eso es interesante, ${name}, pero volvamos al español — ¿qué dices?"

Begin the conversation warmly. Greet them, ask how they are feeling today, and what they want to learn. Always remember: you are not just teaching Spanish, you are helping Filipinos reclaim their heritage.`;
}

/**
 * Call Claude API with the given messages. Returns text + tokens + latency.
 * Throws on error so caller can fall back.
 */
async function callClaude(systemPrompt, messages) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    return {
      text,
      tokens,
      model: CLAUDE_MODEL,
      latency_ms: Date.now() - start
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call OpenAI GPT-4o as fallback. Same return shape as callClaude.
 */
async function callOpenAI(systemPrompt, messages) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: systemPrompt }, ...messages]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;
    return {
      text,
      tokens,
      model: OPENAI_MODEL,
      latency_ms: Date.now() - start
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mock response when no API keys configured.
 * Returns contextually useful Spanish tutor-like text so the UI stays testable.
 */
function mockResponse(userMessage) {
  const text = `¡Hola, mi apo! (Hello, my grandchild!)

Soy Profesora Isabel. Right now I am running in demo mode — the LLM API keys are not configured yet, so I cannot give you a real response. But when your administrator adds the TI_V2_ANTHROPIC_KEY environment variable, I will come to life with full conversation abilities.

For now, remember: Tagalog already has thousands of Spanish words! "Mesa, silya, kutsara, kalye, bintana" — you already speak more Spanish than you think.

¿Qué quieres aprender hoy? (What do you want to learn today?)`;
  return {
    text,
    tokens: 0,
    model: 'mock',
    latency_ms: 0
  };
}

/**
 * Main entry — generate a response to the learner's message.
 * Loads learner profile + AI memory + last 10 messages, calls Claude
 * (or GPT-4o fallback, or mock), persists the exchange.
 *
 * @param {number} learnerId
 * @param {string} userMessage
 * @returns {Promise<{text,model,tokens,latency_ms,conversation_id}>}
 */
async function chat(learnerId, userMessage) {
  if (!learnerId || !userMessage) {
    throw new Error('learnerId and userMessage required');
  }

  // Load learner profile
  const [[learner]] = await sequelize.query(
    `SELECT l.id, l.cefr_level, l.native_language, l.target_dialect, u.full_name
     FROM ti_v2_learners l JOIN ti_users u ON u.id = l.user_id
     WHERE l.id = $1`,
    { bind: [learnerId] }
  );

  // Load memory (may be null)
  const [[memory]] = await sequelize.query(
    `SELECT context_summary, last_5_sessions, vocabulary_struggles, preferred_topics, total_messages
     FROM ti_v2_ai_memory WHERE learner_id = $1`,
    { bind: [learnerId] }
  );

  // Load last 10 messages (chronological)
  const [historyRows] = await sequelize.query(
    `SELECT role, content FROM ti_v2_isabel_conversations
     WHERE learner_id = $1 AND role IN ('user', 'assistant')
     ORDER BY created_at DESC LIMIT $2`,
    { bind: [learnerId, HISTORY_LIMIT] }
  );
  const history = historyRows.reverse();

  const systemPrompt = buildSystemPrompt(learner, memory);
  const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: userMessage }];

  // Save user message first
  await sequelize.query(
    `INSERT INTO ti_v2_isabel_conversations (learner_id, role, content, created_at)
     VALUES ($1, 'user', $2, NOW())`,
    { bind: [learnerId, userMessage] }
  );

  // Try primary model, then fallback
  let response;
  let failureReason = null;
  if (ANTHROPIC_KEY) {
    try {
      response = await callClaude(systemPrompt, messages);
    } catch (e) {
      failureReason = `claude_failed: ${e.message}`;
      console.warn('[isabel] Claude failed, trying OpenAI:', e.message);
    }
  }
  if (!response && OPENAI_KEY) {
    try {
      response = await callOpenAI(systemPrompt, messages);
    } catch (e) {
      failureReason = (failureReason ? failureReason + ' | ' : '') + `openai_failed: ${e.message}`;
      console.warn('[isabel] OpenAI failed:', e.message);
    }
  }
  if (!response) {
    response = mockResponse(userMessage);
    if (failureReason) response.text = `[Running in mock mode: ${failureReason}]\n\n${response.text}`;
  }

  // Save assistant message
  const [assistantRow] = await sequelize.query(
    `INSERT INTO ti_v2_isabel_conversations
     (learner_id, role, content, model_used, tokens_used, latency_ms, metadata, created_at)
     VALUES ($1, 'assistant', $2, $3, $4, $5, $6::jsonb, NOW())
     RETURNING id`,
    {
      bind: [
        learnerId,
        response.text,
        response.model,
        response.tokens,
        response.latency_ms,
        JSON.stringify({ fallback: failureReason })
      ]
    }
  );

  // Update memory counter
  await sequelize.query(
    `INSERT INTO ti_v2_ai_memory (learner_id, total_messages, updated_at)
     VALUES ($1, 2, NOW())
     ON CONFLICT (learner_id) DO UPDATE SET
       total_messages = ti_v2_ai_memory.total_messages + 2,
       updated_at = NOW()`,
    { bind: [learnerId] }
  );

  return {
    text: response.text,
    model: response.model,
    tokens: response.tokens,
    latency_ms: response.latency_ms,
    conversation_id: assistantRow[0]?.id,
    fallback: failureReason || null
  };
}

async function getHistory(learnerId, limit = 50) {
  const [rows] = await sequelize.query(
    `SELECT id, role, content, model_used, created_at
     FROM ti_v2_isabel_conversations
     WHERE learner_id = $1 AND role IN ('user', 'assistant')
     ORDER BY created_at DESC LIMIT $2`,
    { bind: [learnerId, Math.min(limit, 200)] }
  );
  return rows.reverse();
}

async function resetConversation(learnerId) {
  await sequelize.query(`DELETE FROM ti_v2_isabel_conversations WHERE learner_id = $1`, { bind: [learnerId] });
  await sequelize.query(
    `UPDATE ti_v2_ai_memory SET total_messages = 0, updated_at = NOW() WHERE learner_id = $1`,
    { bind: [learnerId] }
  );
}

function isConfigured() {
  return !!(ANTHROPIC_KEY || OPENAI_KEY);
}

module.exports = {
  chat,
  getHistory,
  resetConversation,
  isConfigured,
  buildSystemPrompt // exported for testing
};
