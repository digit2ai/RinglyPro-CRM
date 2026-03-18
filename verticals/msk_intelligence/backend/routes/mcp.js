'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../middleware/auth');
const { triageCase } = require('../services/triage');

// MCP Tool definitions
const TOOLS = [
  {
    name: 'msk_create_case',
    description: 'Create a new patient case from voice intake or web form data',
    inputSchema: {
      type: 'object',
      properties: {
        patientEmail: { type: 'string' },
        chiefComplaint: { type: 'string' },
        painLocation: { type: 'string' },
        injuryMechanism: { type: 'string', enum: ['trauma', 'overuse', 'acute', 'chronic', 'unknown'] },
        severity: { type: 'integer', minimum: 1, maximum: 10 },
        sportContext: { type: 'string' },
        urgency: { type: 'string', enum: ['routine', 'priority', 'urgent', 'emergency'] },
        source: { type: 'string', enum: ['voice', 'web', 'b2b', 'referral', 'api'] }
      },
      required: ['chiefComplaint']
    }
  },
  {
    name: 'msk_triage_case',
    description: 'Run AI triage on a case to determine next steps (imaging, consult, escalation)',
    inputSchema: {
      type: 'object',
      properties: { caseId: { type: 'integer' } },
      required: ['caseId']
    }
  },
  {
    name: 'msk_get_case_status',
    description: 'Get current status and timeline for a case',
    inputSchema: {
      type: 'object',
      properties: { caseId: { type: 'integer' }, caseNumber: { type: 'string' } }
    }
  },
  {
    name: 'msk_submit_report',
    description: 'Radiologist submits a diagnostic report for a case',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'integer' },
        radiologistId: { type: 'integer' },
        summary: { type: 'string' },
        impression: { type: 'string' },
        severityGrade: { type: 'string' },
        recoveryTimelineWeeks: { type: 'integer' },
        returnToPlayRecommendation: { type: 'string' },
        findings: { type: 'array', items: { type: 'object' } }
      },
      required: ['caseId', 'radiologistId', 'summary']
    }
  },
  {
    name: 'msk_get_dashboard_stats',
    description: 'Get admin KPI dashboard statistics',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'msk_search_imaging_centers',
    description: 'Find nearby imaging centers by city or modality',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string' },
        modality: { type: 'string', enum: ['MRI', 'CT', 'Ultrasound', 'X-Ray', 'DEXA', 'PET'] }
      }
    }
  },
  {
    name: 'msk_schedule_consult',
    description: 'Book a video consultation between patient and radiologist',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'integer' },
        patientId: { type: 'integer' },
        radiologistId: { type: 'integer' },
        scheduledAt: { type: 'string', format: 'date-time' },
        durationMinutes: { type: 'integer', default: 30 }
      },
      required: ['caseId', 'patientId', 'radiologistId', 'scheduledAt']
    }
  }
];

// GET /api/v1/mcp/tools/list
router.get('/tools/list', (req, res) => {
  res.json({ tools: TOOLS });
});

// POST /api/v1/mcp/tools/call
router.post('/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    if (!name) return res.status(400).json({ error: 'Tool name required' });

    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return res.status(404).json({ error: `Unknown tool: ${name}` });

    let result;

    switch (name) {
      case 'msk_create_case': {
        const caseNum = `MSK-${Date.now().toString(36).toUpperCase()}`;
        let patientId = null;

        if (args.patientEmail) {
          const [patients] = await sequelize.query(`
            SELECT p.id FROM msk_patients p JOIN msk_users u ON p.user_id = u.id WHERE u.email = $1
          `, { bind: [args.patientEmail] });
          patientId = patients[0]?.id || null;
        }

        const [cases] = await sequelize.query(`
          INSERT INTO msk_cases (case_number, patient_id, chief_complaint, pain_location, injury_mechanism, severity, sport_context, urgency, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *
        `, {
          bind: [caseNum, patientId, args.chiefComplaint, args.painLocation || null,
            args.injuryMechanism || 'unknown', args.severity || null,
            args.sportContext || null, args.urgency || 'routine', args.source || 'api']
        });

        await sequelize.query(`
          INSERT INTO msk_case_timeline (case_id, event_type, event_title) VALUES ($1, 'case_created', 'Case Created via MCP')
        `, { bind: [cases[0].id] });

        result = cases[0];
        break;
      }

      case 'msk_triage_case': {
        const [cases] = await sequelize.query(`SELECT * FROM msk_cases WHERE id = $1`, { bind: [args.caseId] });
        if (cases.length === 0) return res.status(404).json({ error: 'Case not found' });

        const triageResult = await triageCase(cases[0]);

        await sequelize.query(`
          INSERT INTO msk_triage_decisions (case_id, decision_type, imaging_protocol, reasoning, confidence_score)
          VALUES ($1,$2,$3,$4,$5)
        `, { bind: [args.caseId, triageResult.decisionType, triageResult.imagingProtocol || null, triageResult.reasoning, triageResult.confidenceScore] });

        await sequelize.query(`UPDATE msk_cases SET status = 'triage', triage_result = $1, updated_at = NOW() WHERE id = $2`,
          { bind: [JSON.stringify(triageResult), args.caseId] });

        result = triageResult;
        break;
      }

      case 'msk_get_case_status': {
        const where = args.caseId ? 'c.id = $1' : 'c.case_number = $1';
        const bind = [args.caseId || args.caseNumber];

        const [cases] = await sequelize.query(`
          SELECT c.*, u.first_name AS patient_first_name, u.last_name AS patient_last_name
          FROM msk_cases c LEFT JOIN msk_patients p ON c.patient_id = p.id LEFT JOIN msk_users u ON p.user_id = u.id
          WHERE ${where}
        `, { bind });

        if (cases.length === 0) return res.status(404).json({ error: 'Case not found' });

        const [timeline] = await sequelize.query(
          `SELECT * FROM msk_case_timeline WHERE case_id = $1 ORDER BY created_at ASC`,
          { bind: [cases[0].id] }
        );

        result = { ...cases[0], timeline };
        break;
      }

      case 'msk_submit_report': {
        const [reports] = await sequelize.query(`
          INSERT INTO msk_reports (case_id, radiologist_id, summary, impression, severity_grade, recovery_timeline_weeks, return_to_play_recommendation, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'finalized')
          RETURNING *
        `, {
          bind: [args.caseId, args.radiologistId, args.summary, args.impression || null,
            args.severityGrade || null, args.recoveryTimelineWeeks || null,
            args.returnToPlayRecommendation || null]
        });

        if (args.findings) {
          for (const f of args.findings) {
            await sequelize.query(`
              INSERT INTO msk_findings (report_id, body_region, structure, finding_type, description, severity)
              VALUES ($1,$2,$3,$4,$5,$6)
            `, { bind: [reports[0].id, f.bodyRegion || null, f.structure || null, f.findingType || null, f.description, f.severity || null] });
          }
        }

        await sequelize.query(`UPDATE msk_cases SET status = 'report_ready', updated_at = NOW() WHERE id = $1`, { bind: [args.caseId] });

        result = reports[0];
        break;
      }

      case 'msk_get_dashboard_stats': {
        const [stats] = await sequelize.query(`
          SELECT
            (SELECT COUNT(*) FROM msk_cases) AS total_cases,
            (SELECT COUNT(*) FROM msk_cases WHERE status NOT IN ('closed')) AS active_cases,
            (SELECT COUNT(*) FROM msk_patients) AS total_patients,
            (SELECT COUNT(*) FROM msk_reports WHERE status = 'finalized') AS finalized_reports,
            (SELECT COUNT(*) FROM msk_cases WHERE urgency IN ('urgent','emergency')) AS urgent_cases,
            (SELECT COALESCE(SUM(amount_cents),0) FROM msk_invoices WHERE status = 'paid') AS total_revenue_cents
        `);
        result = stats[0];
        break;
      }

      case 'msk_search_imaging_centers': {
        const conditions = ['is_active = true'];
        const binds = [];
        let idx = 1;
        if (args.city) { conditions.push(`city ILIKE $${idx++}`); binds.push(`%${args.city}%`); }
        if (args.modality) { conditions.push(`modalities @> $${idx++}::jsonb`); binds.push(`["${args.modality}"]`); }

        const [centers] = await sequelize.query(
          `SELECT * FROM msk_imaging_centers WHERE ${conditions.join(' AND ')} LIMIT 20`,
          { bind: binds }
        );
        result = centers;
        break;
      }

      case 'msk_schedule_consult': {
        const meetingUrl = `https://aiagent.ringlypro.com/msk/video/msk-${Date.now()}`;
        const [consults] = await sequelize.query(`
          INSERT INTO msk_consultations (case_id, patient_id, radiologist_id, scheduled_at, duration_minutes, meeting_url)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
        `, { bind: [args.caseId, args.patientId, args.radiologistId, args.scheduledAt, args.durationMinutes || 30, meetingUrl] });

        await sequelize.query(`UPDATE msk_cases SET status = 'consult_scheduled', updated_at = NOW() WHERE id = $1`, { bind: [args.caseId] });
        result = consults[0];
        break;
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[MSK] MCP tool error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
