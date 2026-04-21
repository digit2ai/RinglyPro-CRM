'use strict';
const router = require('express').Router();

// ═══════════════════════════════════════════════════════════════
// da Vinci Robot Data API
// Integration point for Intuitive's internal robot telemetry.
// Robots log every case: surgeon, procedure, console time, date.
// This API receives that data and converts it into plan actuals.
// ═══════════════════════════════════════════════════════════════

// POST /api/v1/robot-data/ingest - Receive case data from Intuitive systems
// Called by Intuitive's internal BI/telemetry pipeline
router.post('/ingest', async (req, res) => {
  try {
    const { IntuitiveRobotCase } = req.models;
    const { cases, api_key } = req.body;

    // Validate API key (Intuitive's internal systems authenticate with this)
    if (api_key !== process.env.INTUITIVE_ROBOT_API_KEY && process.env.INTUITIVE_ROBOT_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!cases || !Array.isArray(cases) || cases.length === 0) {
      return res.status(400).json({ error: 'cases array required' });
    }

    const results = [];
    for (const c of cases) {
      const [record, created] = await IntuitiveRobotCase.findOrCreate({
        where: {
          robot_serial: c.robot_serial,
          case_date: c.case_date,
          surgeon_name: c.surgeon_name,
          procedure_type: c.procedure_type || 'unspecified'
        },
        defaults: {
          robot_serial: c.robot_serial,
          robot_model: c.robot_model || null,
          hospital_name: c.hospital_name || null,
          facility_id: c.facility_id || null,
          case_date: c.case_date,
          surgeon_name: c.surgeon_name,
          surgeon_id: c.surgeon_id || null,
          procedure_type: c.procedure_type || 'unspecified',
          procedure_category: c.procedure_category || null,
          console_time_minutes: c.console_time_minutes || null,
          total_procedure_minutes: c.total_procedure_minutes || null,
          instruments_used: c.instruments_used || null,
          case_id: c.case_id || null,
          metadata: c.metadata || null
        }
      });
      results.push({ case_id: record.id, created });
    }

    const newCases = results.filter(r => r.created).length;
    const duplicates = results.length - newCases;

    res.status(201).json({
      success: true,
      ingested: newCases,
      duplicates,
      total_received: cases.length
    });
  } catch (err) {
    console.error('Robot data ingest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/robot-data/cases - Query robot cases with filters
router.get('/cases', async (req, res) => {
  try {
    const { IntuitiveRobotCase } = req.models;
    const { Op } = require('sequelize');
    const where = {};

    if (req.query.robot_serial) where.robot_serial = req.query.robot_serial;
    if (req.query.hospital_name) where.hospital_name = { [Op.iLike]: `%${req.query.hospital_name}%` };
    if (req.query.surgeon_name) where.surgeon_name = { [Op.iLike]: `%${req.query.surgeon_name}%` };
    if (req.query.from && req.query.to) {
      where.case_date = { [Op.between]: [req.query.from, req.query.to] };
    } else if (req.query.from) {
      where.case_date = { [Op.gte]: req.query.from };
    }

    const cases = await IntuitiveRobotCase.findAll({
      where,
      order: [['case_date', 'DESC']],
      limit: parseInt(req.query.limit) || 500
    });

    res.json({ success: true, data: cases, count: cases.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/robot-data/sync-to-plan/:planId - Sync robot data into plan actuals
// This is the key endpoint: matches robot cases to surgeon commitments
router.post('/sync-to-plan/:planId', async (req, res) => {
  try {
    const { IntuitiveRobotCase, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment,
            IntuitivePlanActual, IntuitiveProject } = req.models;
    const { Op } = require('sequelize');

    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const project = await IntuitiveProject.findByPk(plan.project_id);
    const commitments = await IntuitiveSurgeonCommitment.findAll({
      where: { business_plan_id: plan.id }
    });

    if (commitments.length === 0) {
      return res.status(400).json({ error: 'No surgeon commitments in this plan to match against' });
    }

    // Determine sync period
    const { period_start, period_end, period_label } = req.body;
    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'period_start and period_end required' });
    }

    // Find robot cases matching this hospital and time period
    const hospitalName = project ? project.hospital_name : null;
    const robotSerial = req.body.robot_serial || null;

    const caseWhere = {
      case_date: { [Op.between]: [period_start, period_end] }
    };
    // Match by hospital name or robot serial
    if (robotSerial) {
      caseWhere.robot_serial = robotSerial;
    } else if (hospitalName) {
      caseWhere.hospital_name = { [Op.iLike]: `%${hospitalName}%` };
    } else {
      return res.status(400).json({ error: 'Need hospital_name (from project) or robot_serial to match cases' });
    }

    const robotCases = await IntuitiveRobotCase.findAll({ where: caseWhere });

    // Match robot cases to committed surgeons
    const surgeonCaseCounts = {};
    const unmatchedCases = [];

    for (const rc of robotCases) {
      const surgeonKey = rc.surgeon_name.toLowerCase().trim();
      const matched = commitments.find(c =>
        c.surgeon_name.toLowerCase().trim() === surgeonKey ||
        surgeonKey.includes(c.surgeon_name.toLowerCase().split(',')[0].trim()) ||
        c.surgeon_name.toLowerCase().includes(surgeonKey.split(',')[0].trim())
      );

      if (matched) {
        if (!surgeonCaseCounts[matched.surgeon_name]) {
          surgeonCaseCounts[matched.surgeon_name] = 0;
        }
        surgeonCaseCounts[matched.surgeon_name]++;
      } else {
        unmatchedCases.push({
          surgeon_name: rc.surgeon_name,
          case_date: rc.case_date,
          procedure_type: rc.procedure_type
        });
      }
    }

    // Build surgeon_actuals array for the standard actuals import
    const surgeonActuals = Object.entries(surgeonCaseCounts).map(([name, count]) => ({
      surgeon_name: name,
      actual_cases: count
    }));

    if (surgeonActuals.length === 0 && robotCases.length === 0) {
      return res.json({
        success: true,
        message: 'No robot cases found for this period and hospital',
        robot_cases_found: 0,
        matched: 0,
        unmatched: 0
      });
    }

    // Calculate projections (same logic as manual actuals import)
    const startDate = new Date(period_start);
    const endDate = new Date(period_end);
    const periodMonths = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24 * 30.44));

    const actuals = surgeonActuals.map(sa => {
      const commitment = commitments.find(c =>
        c.surgeon_name.toLowerCase() === sa.surgeon_name.toLowerCase()
      );
      const projectedAnnual = commitment ? commitment.total_incremental_annual : 0;
      const projectedForPeriod = Math.round(projectedAnnual * (periodMonths / 12));
      const variance = sa.actual_cases - projectedForPeriod;
      const variancePct = projectedForPeriod > 0 ? Math.round((variance / projectedForPeriod) * 100) : 0;

      return {
        surgeon_name: sa.surgeon_name,
        actual_cases: sa.actual_cases,
        projected_cases: projectedForPeriod,
        variance,
        variance_pct: variancePct
      };
    });

    const totalActual = actuals.reduce((s, a) => s + a.actual_cases, 0);
    const totalProjected = actuals.reduce((s, a) => s + a.projected_cases, 0);
    const totalVariance = totalActual - totalProjected;
    const variancePct = totalProjected > 0 ? Math.round((totalVariance / totalProjected) * 100) : 0;

    // Create the actuals record
    const actual = await IntuitivePlanActual.create({
      business_plan_id: plan.id,
      period_start,
      period_end,
      period_label: period_label || `${period_start} to ${period_end}`,
      surgeon_actuals: actuals,
      total_actual_cases: totalActual,
      total_projected_cases: totalProjected,
      total_variance: totalVariance,
      variance_pct: variancePct,
      imported_by: 'robot_data_sync',
      import_source: 'davinci_robot',
      notes: `Auto-synced from da Vinci robot data. ${robotCases.length} cases found, ${surgeonActuals.length} surgeons matched, ${unmatchedCases.length} unmatched.`
    });

    // Update plan status
    if (plan.status === 'finalized') {
      await plan.update({ status: 'tracking' });
    }

    res.status(201).json({
      success: true,
      data: actual,
      sync_summary: {
        robot_cases_found: robotCases.length,
        surgeons_matched: surgeonActuals.length,
        unmatched_cases: unmatchedCases.length,
        unmatched_details: unmatchedCases.slice(0, 20),
        period: { start: period_start, end: period_end },
        total_actual_cases: totalActual,
        total_projected_cases: totalProjected,
        variance_pct: variancePct
      }
    });
  } catch (err) {
    console.error('Robot sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/robot-data/summary - Aggregate robot usage stats
router.get('/summary', async (req, res) => {
  try {
    const { IntuitiveRobotCase } = req.models;
    const sequelize = IntuitiveRobotCase.sequelize;
    const { Op } = require('sequelize');

    const where = {};
    if (req.query.hospital_name) where.hospital_name = { [Op.iLike]: `%${req.query.hospital_name}%` };
    if (req.query.robot_serial) where.robot_serial = req.query.robot_serial;
    if (req.query.from) where.case_date = { [Op.gte]: req.query.from };

    const stats = await IntuitiveRobotCase.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_cases'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('surgeon_name'))), 'unique_surgeons'],
        [sequelize.fn('MIN', sequelize.col('case_date')), 'earliest_case'],
        [sequelize.fn('MAX', sequelize.col('case_date')), 'latest_case'],
        [sequelize.fn('AVG', sequelize.col('console_time_minutes')), 'avg_console_time']
      ],
      raw: true
    });

    const byMonth = await IntuitiveRobotCase.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('case_date')), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'cases']
      ],
      group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('case_date'))],
      order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('case_date')), 'ASC']],
      raw: true
    });

    res.json({ success: true, data: { overview: stats[0], by_month: byMonth } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
