'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, sequelize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// 1. GET /exercises — Browse exercise library
// ---------------------------------------------------------------------------
router.get('/exercises', async (req, res) => {
  try {
    const { body_region, category, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (body_region) {
      conditions.push(`body_region = $${idx++}`);
      binds.push(body_region);
    }
    if (category) {
      conditions.push(`category = $${idx++}`);
      binds.push(category);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [exercises] = await sequelize.query(`
      SELECT * FROM msk_exercise_library
      ${where}
      ORDER BY name ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `, { bind: [...binds, parseInt(limit), parseInt(offset)] });

    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM msk_exercise_library ${where}`,
      { bind: binds }
    );

    res.json({ success: true, data: exercises, count: parseInt(countResult[0].total) });
  } catch (err) {
    console.error('[MSK] Exercise library error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. POST /programs — Create HEP program (provider only)
// ---------------------------------------------------------------------------
router.post('/programs', async (req, res) => {
  try {
    if (req.user.role === 'patient') {
      return res.status(403).json({ error: 'Only providers can create programs' });
    }

    const { caseId, patientId, name, startDate, endDate, exercises } = req.body;

    if (!patientId || !name || !exercises || !exercises.length) {
      return res.status(400).json({ error: 'patientId, name, and exercises are required' });
    }

    // Insert program
    const [programRows] = await sequelize.query(`
      INSERT INTO msk_hep_programs (case_id, patient_id, provider_id, name, start_date, end_date, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
      RETURNING *
    `, { bind: [caseId || null, patientId, req.user.userId, name, startDate || null, endDate || null] });

    const program = programRows[0];

    // Insert exercises
    for (const ex of exercises) {
      await sequelize.query(`
        INSERT INTO msk_hep_exercises (program_id, exercise_id, sets, reps, hold_seconds, frequency_per_week, notes, sort_order, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, {
        bind: [
          program.id,
          ex.exerciseId,
          ex.sets || null,
          ex.reps || null,
          ex.holdSeconds || null,
          ex.frequencyPerWeek || null,
          ex.notes || null,
          ex.sortOrder || 0
        ]
      });
    }

    // Return the full program with exercises
    const [programExercises] = await sequelize.query(`
      SELECT he.*, el.name AS exercise_name, el.body_region, el.category, el.description, el.video_url
      FROM msk_hep_exercises he
      JOIN msk_exercise_library el ON he.exercise_id = el.id
      WHERE he.program_id = $1
      ORDER BY he.sort_order ASC
    `, { bind: [program.id] });

    res.status(201).json({ success: true, data: { ...program, exercises: programExercises } });
  } catch (err) {
    console.error('[MSK] Create HEP program error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. GET /programs/:id — Program detail with exercises
// ---------------------------------------------------------------------------
router.get('/programs/:id', async (req, res) => {
  try {
    const [programs] = await sequelize.query(`
      SELECT p.*,
        u.first_name AS provider_first_name, u.last_name AS provider_last_name,
        pu.first_name AS patient_first_name, pu.last_name AS patient_last_name
      FROM msk_hep_programs p
      LEFT JOIN msk_users u ON p.provider_id = u.id
      LEFT JOIN msk_patients pt ON p.patient_id = pt.id
      LEFT JOIN msk_users pu ON pt.user_id = pu.id
      WHERE p.id = $1
    `, { bind: [req.params.id] });

    if (programs.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const program = programs[0];

    // Fetch exercises with library details
    const [exercises] = await sequelize.query(`
      SELECT he.*, el.name AS exercise_name, el.body_region, el.category,
        el.description, el.video_url, el.image_url, el.instructions
      FROM msk_hep_exercises he
      JOIN msk_exercise_library el ON he.exercise_id = el.id
      WHERE he.program_id = $1
      ORDER BY he.sort_order ASC
    `, { bind: [program.id] });

    res.json({ success: true, data: { ...program, exercises } });
  } catch (err) {
    console.error('[MSK] Program detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. PUT /programs/:id — Update program (status, name, dates)
// ---------------------------------------------------------------------------
router.put('/programs/:id', async (req, res) => {
  try {
    if (req.user.role === 'patient') {
      return res.status(403).json({ error: 'Only providers can update programs' });
    }

    const { status, name, startDate, endDate } = req.body;
    const sets = [];
    const binds = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); binds.push(name); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); binds.push(status); }
    if (startDate !== undefined) { sets.push(`start_date = $${idx++}`); binds.push(startDate); }
    if (endDate !== undefined) { sets.push(`end_date = $${idx++}`); binds.push(endDate); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    binds.push(req.params.id);

    const [updated] = await sequelize.query(`
      UPDATE msk_hep_programs
      SET ${sets.join(', ')}
      WHERE id = $${idx++}
      RETURNING *
    `, { bind: binds });

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    res.json({ success: true, data: updated[0] });
  } catch (err) {
    console.error('[MSK] Update program error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. POST /sessions — Log completed exercise session
// ---------------------------------------------------------------------------
router.post('/sessions', async (req, res) => {
  try {
    const { programId, exercisesCompleted, overallPainScore, durationMinutes } = req.body;

    if (!programId || !exercisesCompleted || !exercisesCompleted.length) {
      return res.status(400).json({ error: 'programId and exercisesCompleted are required' });
    }

    // Insert session
    const [sessionRows] = await sequelize.query(`
      INSERT INTO msk_hep_sessions (program_id, user_id, overall_pain_score, duration_minutes, exercises_completed, completed_at, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
      RETURNING *
    `, {
      bind: [
        programId,
        req.user.userId,
        overallPainScore || null,
        durationMinutes || null,
        JSON.stringify(exercisesCompleted)
      ]
    });

    res.status(201).json({ success: true, data: sessionRows[0] });
  } catch (err) {
    console.error('[MSK] Log session error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. GET /compliance/:programId — Compliance rate
// ---------------------------------------------------------------------------
router.get('/compliance/:programId', async (req, res) => {
  try {
    const programId = req.params.programId;

    // Get program with start date
    const [programs] = await sequelize.query(`
      SELECT id, start_date, end_date, status, created_at FROM msk_hep_programs WHERE id = $1
    `, { bind: [programId] });

    if (programs.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const program = programs[0];

    // Get max frequency_per_week across exercises in this program
    const [freqResult] = await sequelize.query(`
      SELECT MAX(frequency_per_week) AS max_freq FROM msk_hep_exercises WHERE program_id = $1
    `, { bind: [programId] });

    const frequencyPerWeek = parseInt(freqResult[0].max_freq) || 3;

    // Calculate weeks elapsed since start
    const startDate = program.start_date || program.created_at;
    const endDate = program.end_date && new Date(program.end_date) < new Date() ? new Date(program.end_date) : new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.max(1, Math.ceil((endDate - new Date(startDate)) / msPerWeek));

    const expectedSessions = frequencyPerWeek * weeksElapsed;

    // Get sessions
    const [sessions] = await sequelize.query(`
      SELECT * FROM msk_hep_sessions
      WHERE program_id = $1
      ORDER BY completed_at DESC
    `, { bind: [programId] });

    const totalSessions = sessions.length;
    const compliancePercent = expectedSessions > 0 ? Math.round((totalSessions / expectedSessions) * 100) : 0;

    res.json({
      success: true,
      data: {
        programId: parseInt(programId),
        weeksElapsed,
        frequencyPerWeek,
        expectedSessions,
        totalSessions,
        compliancePercent: Math.min(compliancePercent, 100),
        sessions
      }
    });
  } catch (err) {
    console.error('[MSK] Compliance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 7. GET /my-program — Patient's active program
// ---------------------------------------------------------------------------
router.get('/my-program', async (req, res) => {
  try {
    // Resolve patient record from user
    const [patients] = await sequelize.query(
      `SELECT id FROM msk_patients WHERE user_id = $1`, { bind: [req.user.userId] }
    );

    if (patients.length === 0) {
      return res.status(404).json({ error: 'No patient profile found' });
    }

    const patientId = patients[0].id;

    // Find active program
    const [programs] = await sequelize.query(`
      SELECT p.*,
        u.first_name AS provider_first_name, u.last_name AS provider_last_name
      FROM msk_hep_programs p
      LEFT JOIN msk_users u ON p.provider_id = u.id
      WHERE p.patient_id = $1 AND p.status = 'active'
      ORDER BY p.created_at DESC
      LIMIT 1
    `, { bind: [patientId] });

    if (programs.length === 0) {
      return res.json({ success: true, data: null, message: 'No active program' });
    }

    const program = programs[0];

    // Fetch exercises
    const [exercises] = await sequelize.query(`
      SELECT he.*, el.name AS exercise_name, el.body_region, el.category,
        el.description, el.video_url, el.image_url, el.instructions
      FROM msk_hep_exercises he
      JOIN msk_exercise_library el ON he.exercise_id = el.id
      WHERE he.program_id = $1
      ORDER BY he.sort_order ASC
    `, { bind: [program.id] });

    // Recent sessions for context
    const [sessions] = await sequelize.query(`
      SELECT * FROM msk_hep_sessions
      WHERE program_id = $1
      ORDER BY completed_at DESC
      LIMIT 10
    `, { bind: [program.id] });

    res.json({ success: true, data: { ...program, exercises, recentSessions: sessions } });
  } catch (err) {
    console.error('[MSK] My program error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
