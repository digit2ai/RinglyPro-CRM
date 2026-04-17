'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, authorize, sequelize } = require('../middleware/auth');

router.use(authenticate);

// 1. GET /patient-engagement
router.get('/patient-engagement', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const [activePatients] = await sequelize.query(
      `SELECT COUNT(DISTINCT patient_id) AS total FROM msk_cases WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    const [romFreq] = await sequelize.query(
      `SELECT COALESCE(ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT patient_id), 0) / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(measured_at))) / 604800, 1), 2), 0) AS val
       FROM msk_rom_measurements WHERE measured_at >= NOW() - INTERVAL '30 days'`
    );

    const [exerciseComp] = await sequelize.query(
      `SELECT COALESCE(ROUND(COUNT(s.id)::numeric / NULLIF(GREATEST(SUM(EXTRACT(EPOCH FROM (NOW() - p.start_date)) / 604800 * 5), 1), 0) * 100, 1), 0) AS val
       FROM msk_hep_programs p LEFT JOIN msk_hep_sessions s ON s.program_id = p.id WHERE p.status = 'active'`
    );

    const [promsComp] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM msk_prom_submissions`
    );

    const [painTrend] = await sequelize.query(
      `SELECT DATE_TRUNC('week', submitted_at) AS week, ROUND(AVG(score)::numeric, 1) AS avg_vas
       FROM msk_prom_submissions WHERE instrument_code = 'VAS' AND submitted_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY DATE_TRUNC('week', submitted_at) ORDER BY week`
    );

    const [noShow] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows, COUNT(*) AS total,
       COALESCE(ROUND(COUNT(*) FILTER (WHERE status = 'no_show')::numeric / NULLIF(COUNT(*), 0) * 100, 1), 0) AS rate
       FROM msk_appointments WHERE scheduled_at >= NOW() - INTERVAL '30 days'`
    );

    const [msgs] = await sequelize.query(
      `SELECT COUNT(*) AS total, COALESCE(ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT case_id), 0), 1), 0) AS avg_per_case
       FROM msk_messages WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    // Funnel
    const [fCases] = await sequelize.query(`SELECT COUNT(*) AS c FROM msk_cases`);
    const [fTriaged] = await sequelize.query(`SELECT COUNT(DISTINCT case_id) AS c FROM msk_triage_decisions`);
    const [fMessaged] = await sequelize.query(`SELECT COUNT(DISTINCT case_id) AS c FROM msk_messages`);
    const [fRom] = await sequelize.query(`SELECT COUNT(DISTINCT case_id) AS c FROM msk_rom_measurements`);
    const [fProm] = await sequelize.query(`SELECT COUNT(DISTINCT case_id) AS c FROM msk_prom_submissions`);
    const [fAppt] = await sequelize.query(`SELECT COUNT(*) AS c FROM msk_appointments WHERE status = 'completed'`);

    res.json({
      data: {
        activePatients: parseInt(activePatients[0]?.total || 0),
        romAssessmentFrequency: parseFloat(romFreq[0]?.val || 0),
        exerciseComplianceRate: parseFloat(exerciseComp[0]?.val || 0),
        promsCompletionRate: promsComp[0]?.total > 0 ? 100 : 0,
        painScoreTrend: painTrend,
        noShowRate: parseFloat(noShow[0]?.rate || 0),
        messages: { total: parseInt(msgs[0]?.total || 0), avgPerCase: parseFloat(msgs[0]?.avg_per_case || 0) },
        funnelCaseCreated: parseInt(fCases[0]?.c || 0),
        funnelTriaged: parseInt(fTriaged[0]?.c || 0),
        funnelMessaged: parseInt(fMessaged[0]?.c || 0),
        funnelRomDone: parseInt(fRom[0]?.c || 0),
        funnelPromDone: parseInt(fProm[0]?.c || 0),
        funnelApptAttended: parseInt(fAppt[0]?.c || 0),
      }
    });
  } catch (err) {
    console.error('[ImagingMind Engagement] patient-engagement error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /provider-performance
router.get('/provider-performance', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const [providers] = await sequelize.query(
      `SELECT u.id, u.first_name, u.last_name, u.email,
        (SELECT COUNT(*) FROM msk_cases WHERE assigned_radiologist_id = u.id) AS cases_assigned,
        (SELECT COUNT(*) FROM msk_reports WHERE radiologist_id = u.id AND finalized_at IS NOT NULL) AS reports_finalized,
        (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (finalized_at - created_at)) / 3600)::numeric, 1), 0) FROM msk_reports WHERE radiologist_id = u.id AND finalized_at IS NOT NULL) AS avg_turnaround_hours,
        (SELECT COUNT(*) FROM msk_consultations WHERE radiologist_id = u.id AND status = 'completed') AS consultations_completed
       FROM msk_users u WHERE u.role = 'radiologist'`
    );

    res.json({ data: providers });
  } catch (err) {
    console.error('[ImagingMind Engagement] provider-performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /site-activity
router.get('/site-activity', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const [casesToday] = await sequelize.query(`SELECT COUNT(*) AS c FROM msk_cases WHERE created_at >= CURRENT_DATE`);
    const [casesWeek] = await sequelize.query(`SELECT COUNT(*) AS c FROM msk_cases WHERE created_at >= NOW() - INTERVAL '7 days'`);
    const [casesMonth] = await sequelize.query(`SELECT COUNT(*) AS c FROM msk_cases WHERE created_at >= NOW() - INTERVAL '30 days'`);
    const [totalCases] = await sequelize.query(`SELECT COUNT(*) AS c FROM msk_cases`);

    const [sources] = await sequelize.query(
      `SELECT COALESCE(source, 'web') AS source, COUNT(*) AS count FROM msk_cases GROUP BY source ORDER BY count DESC`
    );

    const [peakHours] = await sequelize.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS count FROM msk_cases GROUP BY 1 ORDER BY count DESC LIMIT 10`
    );

    const [repeatRate] = await sequelize.query(
      `SELECT COALESCE(ROUND(COUNT(*) FILTER (WHERE cnt > 1)::numeric / NULLIF(COUNT(*), 0) * 100, 1), 0) AS rate
       FROM (SELECT patient_id, COUNT(*) AS cnt FROM msk_cases GROUP BY patient_id) sub`
    );

    res.json({
      data: {
        casesToday: parseInt(casesToday[0]?.c || 0),
        casesThisWeek: parseInt(casesWeek[0]?.c || 0),
        casesThisMonth: parseInt(casesMonth[0]?.c || 0),
        totalCases: parseInt(totalCases[0]?.c || 0),
        sources,
        peakHours,
        repeatRate: parseFloat(repeatRate[0]?.rate || 0),
      }
    });
  } catch (err) {
    console.error('[ImagingMind Engagement] site-activity error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /compliance-alerts
router.get('/compliance-alerts', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const alerts = [];

    // Exercise gaps: active program, no session in 3 days
    const [hepAlerts] = await sequelize.query(
      `SELECT p.patient_id, u.first_name || ' ' || u.last_name AS patient_name, MAX(s.completed_at) AS last_session
       FROM msk_hep_programs p
       JOIN msk_users u ON u.id = p.patient_id
       LEFT JOIN msk_hep_sessions s ON s.program_id = p.id
       WHERE p.status = 'active'
       GROUP BY p.patient_id, u.first_name, u.last_name
       HAVING MAX(s.completed_at) IS NULL OR MAX(s.completed_at) < NOW() - INTERVAL '3 days'`
    );
    for (const r of hepAlerts) {
      alerts.push({ patientId: r.patient_id, patientName: r.patient_name, alertType: 'exercise_reminder',
        details: r.last_session ? 'Last session: ' + new Date(r.last_session).toLocaleDateString() : 'No sessions logged yet' });
    }

    // Appointment reminders: scheduled in next 24h, reminder not sent
    const [apptAlerts] = await sequelize.query(
      `SELECT a.patient_id, u.first_name || ' ' || u.last_name AS patient_name, a.scheduled_at
       FROM msk_appointments a JOIN msk_users u ON u.id = a.patient_id
       WHERE a.status = 'scheduled' AND a.reminder_24h_sent = FALSE
       AND a.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'`
    );
    for (const r of apptAlerts) {
      alerts.push({ patientId: r.patient_id, patientName: r.patient_name, alertType: 'appointment_reminder',
        details: 'Appointment: ' + new Date(r.scheduled_at).toLocaleString() });
    }

    res.json({ data: alerts });
  } catch (err) {
    console.error('[ImagingMind Engagement] compliance-alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /outcome-correlation
router.get('/outcome-correlation', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    // Simple: compare patients with >3 ROM measurements vs <=3
    const [correlation] = await sequelize.query(
      `WITH patient_rom AS (
         SELECT patient_id,
           MAX(angle_degrees) - MIN(angle_degrees) AS rom_improvement,
           COUNT(*) AS measurement_count
         FROM msk_rom_measurements
         GROUP BY patient_id
         HAVING COUNT(*) >= 2
       )
       SELECT
         CASE WHEN measurement_count >= 3 THEN 'high' ELSE 'low' END AS bucket,
         COUNT(*) AS patient_count,
         ROUND(AVG(rom_improvement)::numeric, 1) AS avg_rom_improvement
       FROM patient_rom
       GROUP BY CASE WHEN measurement_count >= 3 THEN 'high' ELSE 'low' END`
    );

    const buckets = {};
    for (const r of correlation) {
      buckets[r.bucket] = { patientCount: parseInt(r.patient_count), avgRomImprovement: parseFloat(r.avg_rom_improvement) };
    }

    res.json({
      data: {
        highCompliance: buckets.high || { patientCount: 0, avgRomImprovement: 0 },
        lowCompliance: buckets.low || { patientCount: 0, avgRomImprovement: 0 },
      }
    });
  } catch (err) {
    console.error('[ImagingMind Engagement] outcome-correlation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. POST /send-nudge
router.post('/send-nudge', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const { patientId, nudgeType } = req.body;
    if (!patientId || !nudgeType) return res.status(400).json({ error: 'patientId and nudgeType required' });

    const [patients] = await sequelize.query(`SELECT id, first_name, last_name, phone FROM msk_users WHERE id = $1`, { bind: [patientId] });
    if (!patients.length) return res.status(404).json({ error: 'Patient not found' });

    const patient = patients[0];
    const titles = {
      exercise_reminder: 'Time for your exercises!',
      prom_reminder: 'Complete your assessment',
      appointment_reminder: 'Appointment reminder'
    };
    const bodies = {
      exercise_reminder: `Hi ${patient.first_name}, you haven't logged an exercise session recently. Staying consistent is key to recovery!`,
      prom_reminder: `Hi ${patient.first_name}, please complete your pending health assessment so we can track your progress.`,
      appointment_reminder: `Hi ${patient.first_name}, you have an upcoming appointment. Please confirm or contact us to reschedule.`
    };

    await sequelize.query(
      `INSERT INTO msk_notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)`,
      { bind: [patientId, nudgeType, titles[nudgeType] || nudgeType, bodies[nudgeType] || ''] }
    );

    res.json({ success: true, patientName: patient.first_name + ' ' + patient.last_name, nudgeType });
  } catch (err) {
    console.error('[ImagingMind Engagement] send-nudge error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
