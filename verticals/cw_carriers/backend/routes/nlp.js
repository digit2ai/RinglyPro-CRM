const express = require('express');
const router = express.Router();
const nlp = require('../services/nlp.cw');
const hubspot = require('../services/hubspot.cw');
const rachel = require('../services/rachel.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// POST /command - parse NLP input and execute
router.post('/command', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'input required' });

    const parsed = await nlp.parseCommand(input);
    const result = await nlp.executeIntent(parsed, {
      hubspot,
      rachel,
      userInput: input
    });

    res.json({
      success: result.success,
      intent: parsed.intent,
      entities: parsed.entities,
      confidence: parsed.confidence,
      message: result.message,
      data: result.data || null
    });
  } catch (err) {
    console.error('CW NLP command error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
