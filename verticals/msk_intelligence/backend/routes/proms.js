'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, sequelize } = require('../middleware/auth');

// Instrument assignments by body region
const REGION_INSTRUMENTS = {
  spine:    ['VAS', 'ODI'],
  knee:     ['VAS', 'KOOS'],
  shoulder: ['VAS', 'DASH'],
  arm:      ['VAS', 'DASH'],
  hand:     ['VAS', 'DASH'],
  default:  ['VAS', 'PROMIS_PF']
};

const INSTRUMENT_META = {
  VAS:       { name: 'Visual Analog Scale', scaleMin: 0, scaleMax: 10, questions: 1 },
  ODI:       { name: 'Oswestry Disability Index', scaleMin: 0, scaleMax: 100, questions: 10 },
  KOOS:      { name: 'Knee Injury & Osteoarthritis Outcome Score', scaleMin: 0, scaleMax: 100, questions: 42 },
  DASH:      { name: 'Disabilities of the Arm, Shoulder & Hand', scaleMin: 0, scaleMax: 100, questions: 30 },
  PROMIS_PF: { name: 'PROMIS Physical Function', scaleMin: 0, scaleMax: 100, questions: 20 }
};

/**
 * Calculate score based on instrument type
 */
function calculateScore(instrumentCode, answers) {
  // Normalize: accept both object {q1: 3, q2: 4} and array [3, 4]
  let values;
  if (Array.isArray(answers)) {
    values = answers.map(v => parseFloat(v));
  } else if (answers && typeof answers === 'object') {
    values = Object.values(answers).map(v => parseFloat(v));
  } else {
    return null;
  }
  if (values.length === 0) return null;

  if (instrumentCode === 'VAS') {
    return values[0]; // Direct single value
  }

  // All other instruments: average of answers
  const sum = values.reduce((acc, val) => acc + val, 0);
  return parseFloat((sum / values.length).toFixed(2));
}

// GET /pending/:caseId — instruments due for this case
router.get('/pending/:caseId', authenticate, async (req, res) => {
  try {
    const { caseId } = req.params;

    // Fetch case with body region
    const [cases] = await sequelize.query(`
      SELECT c.id, c.pain_location, c.case_type, c.patient_id
      FROM msk_cases c
      WHERE c.id = $1
    `, { bind: [caseId] });

    if (cases.length === 0) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const caseRow = cases[0];
    // Map pain_location or case_type to a body region key
    const loc = (caseRow.pain_location || '').toLowerCase();
    const cType = (caseRow.case_type || '').toLowerCase();
    let region = 'default';
    if (loc.includes('knee')) region = 'knee';
    else if (loc.includes('shoulder') || loc.includes('elbow') || loc.includes('wrist') || loc.includes('hand')) region = 'shoulder';
    else if (loc.includes('spine') || loc.includes('lumbar') || loc.includes('cervical') || loc.includes('thoracic')) region = 'spine';
    else if (loc.includes('hip')) region = 'default';
    else if (cType === 'spine') region = 'spine';
    else if (cType === 'joint' && loc.includes('knee')) region = 'knee';

    // Determine which instruments apply
    const instruments = REGION_INSTRUMENTS[region] || REGION_INSTRUMENTS.default;

    // Check which have already been submitted for the latest collection point
    const [submitted] = await sequelize.query(`
      SELECT DISTINCT instrument_code, collection_point
      FROM msk_prom_submissions
      WHERE case_id = $1
      ORDER BY collection_point DESC
    `, { bind: [caseId] });

    const submittedCodes = new Set(submitted.map(s => s.instrument_code));

    // Fetch full instrument data from DB
    const placeholders = instruments.map((_, i) => `$${i + 1}`).join(',');
    const [dbInstruments] = await sequelize.query(
      `SELECT * FROM msk_prom_instruments WHERE code IN (${placeholders})`,
      { bind: instruments }
    );

    const pending = instruments.map(code => {
      const dbInst = dbInstruments.find(i => i.code === code);
      return {
        code,
        instrumentCode: code,
        name: dbInst?.name || INSTRUMENT_META[code]?.name || code,
        description: dbInst?.description || '',
        questions: dbInst?.questions || [],
        ...(INSTRUMENT_META[code] || {}),
        alreadySubmitted: submittedCodes.has(code)
      };
    });

    res.json({
      success: true,
      data: {
        caseId: caseRow.id,
        bodyRegion: caseRow.body_region,
        instruments: pending
      }
    });
  } catch (err) {
    console.error('[MSK-PROMS] pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /submit — submit a PROM response
router.post('/submit', authenticate, async (req, res) => {
  try {
    const { caseId, instrumentCode, answers, collectionPoint } = req.body;

    if (!caseId || !instrumentCode || !answers) {
      return res.status(400).json({ error: 'caseId, instrumentCode, and answers are required' });
    }

    if (!INSTRUMENT_META[instrumentCode]) {
      return res.status(400).json({ error: `Unknown instrument: ${instrumentCode}` });
    }

    // Verify case exists
    const [cases] = await sequelize.query(
      `SELECT id, patient_id FROM msk_cases WHERE id = $1`, { bind: [caseId] }
    );
    if (cases.length === 0) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const score = calculateScore(instrumentCode, answers);
    if (score === null || isNaN(score)) {
      return res.status(400).json({ error: 'Invalid answers — could not compute score' });
    }

    const point = collectionPoint || 'baseline';

    const [result] = await sequelize.query(`
      INSERT INTO msk_prom_submissions
        (case_id, patient_id, instrument_code, answers, score, collection_point, submitted_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, {
      bind: [
        caseId,
        cases[0].patient_id,
        instrumentCode,
        JSON.stringify(answers),
        score,
        point,
        req.user.userId
      ]
    });

    res.json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[MSK-PROMS] submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /history/:caseId — all submissions for a case
router.get('/history/:caseId', authenticate, async (req, res) => {
  try {
    const { caseId } = req.params;

    const [submissions] = await sequelize.query(`
      SELECT ps.*,
        u.first_name AS submitted_by_first, u.last_name AS submitted_by_last
      FROM msk_prom_submissions ps
      LEFT JOIN msk_users u ON ps.submitted_by = u.id
      WHERE ps.case_id = $1
      ORDER BY ps.created_at ASC
    `, { bind: [caseId] });

    res.json({ success: true, data: submissions, count: submissions.length });
  } catch (err) {
    console.error('[MSK-PROMS] history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /trends/:patientId — longitudinal score trends
router.get('/trends/:patientId', authenticate, async (req, res) => {
  try {
    const { patientId } = req.params;

    const [rows] = await sequelize.query(`
      SELECT
        instrument_code,
        collection_point,
        score,
        case_id,
        created_at
      FROM msk_prom_submissions
      WHERE patient_id = $1
      ORDER BY instrument_code, created_at ASC
    `, { bind: [patientId] });

    // Group by instrument
    const trends = {};
    for (const row of rows) {
      if (!trends[row.instrument_code]) {
        trends[row.instrument_code] = {
          instrumentCode: row.instrument_code,
          instrumentName: (INSTRUMENT_META[row.instrument_code] || {}).name || row.instrument_code,
          dataPoints: []
        };
      }
      trends[row.instrument_code].dataPoints.push({
        score: parseFloat(row.score),
        collectionPoint: row.collection_point,
        caseId: row.case_id,
        date: row.created_at
      });
    }

    res.json({
      success: true,
      data: Object.values(trends)
    });
  } catch (err) {
    console.error('[MSK-PROMS] trends error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
