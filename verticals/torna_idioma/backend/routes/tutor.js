const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.ti');

// The Don Quijote method system prompt — immersion-based communicative teaching
const SYSTEM_PROMPT = `You are Profesora Isabel, an expert Spanish teacher at the Torna Idioma program in Makati City, Philippines. You use the Don Quijote immersion method — a communicative, student-centered approach inspired by Spain's best language schools.

## Your Teaching Personality
- Warm, encouraging, and patient
- You celebrate Filipino-Spanish heritage connections enthusiastically
- You use humor and cultural references to make learning memorable
- You adapt to the student's level instantly
- You ALWAYS respond primarily in Spanish with English/Filipino support based on student level

## Teaching Principles
1. **Target Language First**: Start every response in Spanish. Provide English/Filipino translations in parentheses only when introducing new vocabulary.
2. **Contextual Learning**: Teach vocabulary and grammar through real-life situations (ordering food, BPO calls, traveling, job interviews).
3. **Filipino Heritage Bridge**: Constantly connect Spanish to Filipino words students already know (mesa, silya, kumusta, etc.)
4. **Error Correction with Grace**: When students make mistakes, gently model the correct form without harsh correction. Say "Casi perfecto! Try: [correct form]" rather than "Wrong."
5. **Scaffolded Difficulty**: Start with what they know, add one new element at a time.
6. **Active Production**: Always ask the student to produce language, not just read. End every response with a question or prompt for them to practice.
7. **Cultural Immersion**: Weave in cultural facts about Spain, Latin America, and the Philippines' Spanish heritage.
8. **BPO Relevance**: When appropriate, connect lessons to BPO career skills (professional phone greetings, customer service phrases, etc.)
9. **Positive Reinforcement**: Use encouraging phrases: "¡Muy bien!", "¡Excelente!", "¡Así se hace!"
10. **Spaced Repetition**: Revisit vocabulary from earlier in the conversation naturally.

## Lesson Structure
For each interaction:
1. Greet/respond warmly in Spanish
2. Address the student's message or question
3. Teach or practice the relevant concept
4. Give a cultural or heritage connection
5. Provide a practice prompt or question for the student to answer

## Level Adaptation
- **A1 (Beginner)**: Use very simple Spanish, lots of English support, focus on greetings, numbers, basic phrases
- **A2 (Elementary)**: More Spanish, less English, simple conversations
- **B1 (Intermediate)**: Mostly Spanish, English only for complex grammar explanations
- **B2+ (Advanced)**: Almost entirely Spanish, discuss complex topics, nuance, idioms

## Special Context
- You are teaching in Makati City, Philippines — reference local places, culture, and the BPO industry
- The Torna Idioma program aims to make Makati the first Spanish-enabled city in Asia
- Many Filipino students already know hundreds of Spanish words from their own language
- Always be encouraging about the Filipino-Spanish connection: "You already speak more Spanish than you think!"

## Format
- Keep responses concise but educational (150-300 words)
- Use bold for new vocabulary: **palabra** (translation)
- Use emoji sparingly for warmth: 🇪🇸 🇵🇭
- Structure with short paragraphs, not walls of text`;

// Chat with AI tutor
router.post('/chat', auth.any, async (req, res) => {
  try {
    const { messages, level } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI tutor service not configured' });
    }

    const levelHint = level ? `\n\nThe student's current Spanish level is: ${level}. Adapt your teaching accordingly.` : '';

    const openaiMessages = [
      { role: 'system', content: SYSTEM_PROMPT + levelHint },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        max_tokens: 800,
        temperature: 0.8,
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'AI tutor temporarily unavailable' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Lo siento, no pude generar una respuesta. ¡Inténtalo de nuevo!';

    // Log conversation for analytics (optional)
    const sequelize = require('../services/db.ti');
    try {
      await sequelize.query(
        `INSERT INTO ti_tutor_sessions (user_id, message_count, last_active, created_at)
         VALUES ($1, 1, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET message_count = ti_tutor_sessions.message_count + 1, last_active = NOW()`,
        { bind: [req.user.id] }
      );
    } catch (logErr) { /* table may not exist yet, non-critical */ }

    res.json({ success: true, reply });
  } catch (err) {
    console.error('Tutor chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get conversation starters based on level
router.get('/starters', auth.any, (req, res) => {
  const starters = {
    beginner: [
      { label_en: 'Introduce yourself', label_es: 'Preséntate', prompt: 'Hola! I want to learn how to introduce myself in Spanish.' },
      { label_en: 'Numbers & counting', label_es: 'Números', prompt: 'Can you teach me numbers in Spanish? I know uno, dos, tres from Filipino!' },
      { label_en: 'Greetings', label_es: 'Saludos', prompt: 'How do I greet people in Spanish? I already know "kumusta" comes from Spanish!' },
      { label_en: 'Filipino-Spanish words', label_es: 'Palabras compartidas', prompt: 'What Spanish words do Filipinos already use every day?' },
      { label_en: 'At the restaurant', label_es: 'En el restaurante', prompt: 'How do I order food in Spanish?' },
      { label_en: 'Days & months', label_es: 'Días y meses', prompt: 'Teach me the days and months — I think they\'re the same as Filipino!' },
    ],
    intermediate: [
      { label_en: 'BPO phone skills', label_es: 'Habilidades telefónicas', prompt: 'I work in a BPO. Teach me professional phone greetings in Spanish.' },
      { label_en: 'Job interview', label_es: 'Entrevista de trabajo', prompt: 'Help me practice for a Spanish-speaking job interview.' },
      { label_en: 'Past tense practice', label_es: 'Pretérito', prompt: '¿Puedes ayudarme a practicar el pretérito? I still mix up ser and estar.' },
      { label_en: 'Customer service', label_es: 'Servicio al cliente', prompt: 'Teach me how to handle a customer complaint in Spanish.' },
      { label_en: 'Travel conversations', label_es: 'Viajes', prompt: 'I\'m planning to visit Spain. What phrases do I need?' },
      { label_en: 'DELE B1 practice', label_es: 'Práctica DELE B1', prompt: 'Can we practice some DELE B1 level conversation topics?' },
    ],
    advanced: [
      { label_en: 'Business negotiation', label_es: 'Negociación', prompt: 'Practiquemos una negociación de negocios en español.' },
      { label_en: 'Debate a topic', label_es: 'Debate', prompt: '¿Podemos debatir un tema? Me gustaría practicar argumentación en español.' },
      { label_en: 'Rizal in Spanish', label_es: 'Rizal en español', prompt: 'Hablemos sobre José Rizal y sus obras en español.' },
      { label_en: 'Idiomatic expressions', label_es: 'Modismos', prompt: 'Enséñame expresiones idiomáticas que se usan en el mundo de negocios.' },
      { label_en: 'DELE C1 writing', label_es: 'Escritura DELE C1', prompt: 'Help me practice formal essay writing for DELE C1.' },
      { label_en: 'Philippine-Spanish history', label_es: 'Historia', prompt: 'Discutamos la influencia española en la historia filipina — en español, por favor.' },
    ],
  };
  res.json({ success: true, starters });
});

module.exports = router;
