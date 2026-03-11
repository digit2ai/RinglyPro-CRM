'use strict';

/**
 * Human Review Gates — Approval Log
 *
 * Records which version of concept, simulation, and pricing was approved.
 * Gates: concept | simulation | pricing | final
 *
 * Routes:
 *   POST /api/v1/approvals/:projectId         — Record an approval
 *   GET  /api/v1/approvals/:projectId         — Get all approvals for a project
 *   GET  /api/v1/approvals/:projectId/status  — Get gate status (which stages approved)
 */

const express = require('express');
const router = express.Router();

const VALID_STAGES = ['concept', 'simulation', 'pricing', 'final'];

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS logistics_project_approvals (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL,
    stage           VARCHAR(30) NOT NULL,
    approved_by     VARCHAR(255) NOT NULL DEFAULT 'Manuel Stagg',
    approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT,
    snapshot_ref    VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )
`;

// POST /:projectId — Record approval for a stage
router.post('/:projectId', async (req, res) => {
  try {
    const { sequelize } = req.models;
    await sequelize.query(CREATE_TABLE);

    const { stage, approved_by, notes, snapshot_ref } = req.body;

    if (!stage || !VALID_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        error: `stage must be one of: ${VALID_STAGES.join(', ')}`
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO logistics_project_approvals
        (project_id, stage, approved_by, notes, snapshot_ref)
      VALUES
        (:project_id, :stage, :approved_by, :notes, :snapshot_ref)
      RETURNING *
    `, {
      replacements: {
        project_id: req.params.projectId,
        stage,
        approved_by: approved_by || 'Manuel Stagg',
        notes: notes || null,
        snapshot_ref: snapshot_ref || null
      }
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Approval record error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:projectId — Get all approvals
router.get('/:projectId', async (req, res) => {
  try {
    const { sequelize } = req.models;
    await sequelize.query(CREATE_TABLE);

    const [rows] = await sequelize.query(`
      SELECT * FROM logistics_project_approvals
      WHERE project_id = :project_id
      ORDER BY approved_at DESC
    `, { replacements: { project_id: req.params.projectId } });

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:projectId/status — Gate status map
router.get('/:projectId/status', async (req, res) => {
  try {
    const { sequelize } = req.models;
    await sequelize.query(CREATE_TABLE);

    const [rows] = await sequelize.query(`
      SELECT DISTINCT ON (stage) stage, approved_by, approved_at, notes, snapshot_ref
      FROM logistics_project_approvals
      WHERE project_id = :project_id
      ORDER BY stage, approved_at DESC
    `, { replacements: { project_id: req.params.projectId } });

    // Build status map for all gates
    const statusMap = {};
    for (const stage of VALID_STAGES) {
      const found = rows.find(r => r.stage === stage);
      statusMap[stage] = found
        ? { approved: true, approved_by: found.approved_by, approved_at: found.approved_at, notes: found.notes }
        : { approved: false };
    }

    const allApproved = VALID_STAGES.every(s => statusMap[s].approved);
    const nextPending = VALID_STAGES.find(s => !statusMap[s].approved) || null;

    res.json({ success: true, data: { gates: statusMap, all_approved: allApproved, next_pending: nextPending } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
