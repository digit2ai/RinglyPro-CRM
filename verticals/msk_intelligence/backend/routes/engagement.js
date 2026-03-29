const express = require('express');
const router = express.Router();
const { authenticate, authorize, sequelize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// 1. GET /patient-engagement — Overview metrics
// ---------------------------------------------------------------------------
router.get('/patient-engagement', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    // Total active patients (cases created in last 30 days)
    const [activePatients] = await sequelize.query(
      `SELECT COUNT(DISTINCT patient_id) AS total
       FROM msk_cases
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND created_at >= NOW() - INTERVAL '30 days'`,
      { bind: [tenantId] }
    );

    // ROM assessment frequency (avg measurements per patient per week)
    const [romFrequency] = await sequelize.query(
      `SELECT COALESCE(
         ROUND(
           COUNT(*)::numeric /
           NULLIF(COUNT(DISTINCT patient_id), 0) /
           GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(measured_at))) / 604800, 1),
           2
         ), 0
       ) AS avg_per_patient_per_week
       FROM msk_rom_measurements
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND measured_at >= NOW() - INTERVAL '30 days'`,
      { bind: [tenantId] }
    );

    // Exercise compliance rate (sessions logged / expected)
    const [exerciseCompliance] = await sequelize.query(
      `SELECT
         COALESCE(
           ROUND(
             SUM(s.sessions_logged)::numeric /
             NULLIF(SUM(GREATEST((EXTRACT(EPOCH FROM (NOW() - p.start_date)) / 604800) * 5, 1)), 0) * 100,
             1
           ), 0
         ) AS compliance_rate
       FROM msk_hep_programs p
       LEFT JOIN (
         SELECT program_id, COUNT(*) AS sessions_logged
         FROM msk_hep_sessions
         WHERE (tenant_id = $1 OR $1 IS NULL)
         GROUP BY program_id
       ) s ON s.program_id = p.id
       WHERE (p.tenant_id = $1 OR $1 IS NULL)
         AND p.status = 'active'`,
      { bind: [tenantId] }
    );

    // PROMs completion rate
    const [promsCompletion] = await sequelize.query(
      `SELECT
         COUNT(*) AS completed,
         COUNT(*) AS total,
         COALESCE(
           ROUND(
             COUNT(*)::numeric /
             NULLIF(COUNT(*), 0) * 100,
             1
           ), 0
         ) AS completion_rate
       FROM msk_prom_submissions
       WHERE (tenant_id = $1 OR $1 IS NULL)`,
      { bind: [tenantId] }
    );

    // Average pain score trend (latest VAS scores)
    const [painTrend] = await sequelize.query(
      `SELECT
         DATE_TRUNC('week', submitted_at) AS week,
         ROUND(AVG(score)::numeric, 1) AS avg_vas
       FROM msk_prom_submissions
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND instrument_code = 'VAS'
         AND submitted_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY DATE_TRUNC('week', submitted_at)
       ORDER BY week`,
      { bind: [tenantId] }
    );

    // Appointment no-show rate
    const [noShowRate] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
         COUNT(*) AS total,
         COALESCE(
           ROUND(
             COUNT(*) FILTER (WHERE status = 'no_show')::numeric /
             NULLIF(COUNT(*), 0) * 100,
             1
           ), 0
         ) AS no_show_rate
       FROM msk_appointments
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND scheduled_at >= NOW() - INTERVAL '30 days'`,
      { bind: [tenantId] }
    );

    // Message response stats
    const [messageStats] = await sequelize.query(
      `SELECT
         COUNT(*) AS total_messages,
         COALESCE(
           ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT case_id), 0), 1),
           0
         ) AS avg_per_case
       FROM msk_messages
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND created_at >= NOW() - INTERVAL '30 days'`,
      { bind: [tenantId] }
    );

    res.json({
      activePatients: parseInt(activePatients[0]?.total || 0),
      romAssessmentFrequency: parseFloat(romFrequency[0]?.avg_per_patient_per_week || 0),
      exerciseComplianceRate: parseFloat(exerciseCompliance[0]?.compliance_rate || 0),
      promsCompletionRate: parseFloat(promsCompletion[0]?.completion_rate || 0),
      promsCompleted: parseInt(promsCompletion[0]?.completed || 0),
      promsTotal: parseInt(promsCompletion[0]?.total || 0),
      painScoreTrend: painTrend,
      noShowRate: parseFloat(noShowRate[0]?.no_show_rate || 0),
      noShows: parseInt(noShowRate[0]?.no_shows || 0),
      appointmentsTotal: parseInt(noShowRate[0]?.total || 0),
      messages: {
        total: parseInt(messageStats[0]?.total_messages || 0),
        avgPerCase: parseFloat(messageStats[0]?.avg_per_case || 0)
      }
    });
  } catch (err) {
    console.error('patient-engagement error:', err);
    res.status(500).json({ error: 'Failed to fetch patient engagement metrics' });
  }
});

// ---------------------------------------------------------------------------
// 2. GET /provider-performance — Per-provider metrics
// ---------------------------------------------------------------------------
router.get('/provider-performance', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    // Get all radiologists
    const [providers] = await sequelize.query(
      `SELECT id, first_name, last_name, email
       FROM msk_users
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND role = 'radiologist'`,
      { bind: [tenantId] }
    );

    const results = [];

    for (const provider of providers) {
      // Cases assigned
      const [cases] = await sequelize.query(
        `SELECT COUNT(*) AS total
         FROM msk_cases
         WHERE (tenant_id = $1 OR $1 IS NULL)
           AND assigned_radiologist_id = $2`,
        { bind: [tenantId, provider.id] }
      );

      // Reports finalized + avg turnaround
      const [reports] = await sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE finalized_at IS NOT NULL) AS finalized,
           COALESCE(
             ROUND(
               AVG(EXTRACT(EPOCH FROM (finalized_at - created_at)) / 3600)::numeric,
               1
             ), 0
           ) AS avg_turnaround_hours
         FROM msk_reports
         WHERE (tenant_id = $1 OR $1 IS NULL)
           AND radiologist_id = $2`,
        { bind: [tenantId, provider.id] }
      );

      // Consultations completed
      const [consultations] = await sequelize.query(
        `SELECT COUNT(*) AS total
         FROM msk_consultations
         WHERE (tenant_id = $1 OR $1 IS NULL)
           AND provider_id = $2
           AND status = 'completed'`,
        { bind: [tenantId, provider.id] }
      );

      results.push({
        providerId: provider.id,
        name: `${provider.first_name} ${provider.last_name}`,
        email: provider.email,
        casesAssigned: parseInt(cases[0]?.total || 0),
        reportsFinalized: parseInt(reports[0]?.finalized || 0),
        avgTurnaroundHours: parseFloat(reports[0]?.avg_turnaround_hours || 0),
        consultationsCompleted: parseInt(consultations[0]?.total || 0)
      });
    }

    res.json({ providers: results });
  } catch (err) {
    console.error('provider-performance error:', err);
    res.status(500).json({ error: 'Failed to fetch provider performance metrics' });
  }
});

// ---------------------------------------------------------------------------
// 3. GET /site-activity — Starlink deployment tracking
// ---------------------------------------------------------------------------
router.get('/site-activity', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    // Cases per day for last 30 days
    const [casesPerDay] = await sequelize.query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS cases
       FROM msk_cases
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      { bind: [tenantId] }
    );

    // Peak hours
    const [peakHours] = await sequelize.query(
      `SELECT
         EXTRACT(HOUR FROM created_at)::int AS hour,
         COUNT(*) AS cases
       FROM msk_cases
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY cases DESC`,
      { bind: [tenantId] }
    );

    // Source breakdown
    const [sourceBreakdown] = await sequelize.query(
      `SELECT
         COALESCE(source, 'unknown') AS source,
         COUNT(*) AS cases
       FROM msk_cases
       WHERE (tenant_id = $1 OR $1 IS NULL)
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY source
       ORDER BY cases DESC`,
      { bind: [tenantId] }
    );

    // Repeat visit rate
    const [repeatVisits] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE case_count > 1) AS repeat_patients,
         COUNT(*) AS total_patients,
         COALESCE(
           ROUND(
             COUNT(*) FILTER (WHERE case_count > 1)::numeric /
             NULLIF(COUNT(*), 0) * 100,
             1
           ), 0
         ) AS repeat_rate
       FROM (
         SELECT patient_id, COUNT(*) AS case_count
         FROM msk_cases
         WHERE (tenant_id = $1 OR $1 IS NULL)
         GROUP BY patient_id
       ) sub`,
      { bind: [tenantId] }
    );

    res.json({
      casesPerDay,
      peakHours,
      sourceBreakdown,
      repeatVisits: {
        repeatPatients: parseInt(repeatVisits[0]?.repeat_patients || 0),
        totalPatients: parseInt(repeatVisits[0]?.total_patients || 0),
        repeatRate: parseFloat(repeatVisits[0]?.repeat_rate || 0)
      }
    });
  } catch (err) {
    console.error('site-activity error:', err);
    res.status(500).json({ error: 'Failed to fetch site activity metrics' });
  }
});

// ---------------------------------------------------------------------------
// 4. GET /compliance-alerts — Patients who need a nudge
// ---------------------------------------------------------------------------
router.get('/compliance-alerts', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const alerts = [];

    // Patients with active HEP program but no session in last 3 days
    const [hepAlerts] = await sequelize.query(
      `SELECT
         p.patient_id,
         u.first_name || ' ' || u.last_name AS patient_name,
         p.id AS program_id,
         MAX(s.completed_at) AS last_session
       FROM msk_hep_programs p
       JOIN msk_users u ON u.id = p.patient_id AND (u.tenant_id = $1 OR $1 IS NULL)
       LEFT JOIN msk_hep_sessions s ON s.program_id = p.id AND (s.tenant_id = $1 OR $1 IS NULL)
       WHERE (p.tenant_id = $1 OR $1 IS NULL)
         AND p.status = 'active'
       GROUP BY p.patient_id, u.first_name, u.last_name, p.id
       HAVING MAX(s.completed_at) IS NULL
          OR MAX(s.completed_at) < NOW() - INTERVAL '3 days'`,
      { bind: [tenantId] }
    );

    for (const row of hepAlerts) {
      alerts.push({
        patientId: row.patient_id,
        patientName: row.patient_name,
        alertType: 'exercise_gap',
        details: row.last_session
          ? `No exercise session since ${new Date(row.last_session).toLocaleDateString()}`
          : 'No exercise sessions logged for active program'
      });
    }

    // Patients with cases but no recent PROM submission (>14 days since last)
    const [promAlerts] = await sequelize.query(
      `SELECT c.patient_id, u.first_name || ' ' || u.last_name AS patient_name,
         MAX(ps.submitted_at) AS last_submission
       FROM msk_cases c
       JOIN msk_patients p ON c.patient_id = p.id
       JOIN msk_users u ON p.user_id = u.id
       LEFT JOIN msk_prom_submissions ps ON ps.case_id = c.id
       WHERE c.status NOT IN ('closed')
       GROUP BY c.patient_id, u.first_name, u.last_name
       HAVING MAX(ps.submitted_at) IS NULL OR MAX(ps.submitted_at) < NOW() - INTERVAL '14 days'
       LIMIT 20`,
      { bind: [] }
    );

    for (const row of promAlerts) {
      alerts.push({
        patientId: row.patient_id,
        patientName: row.patient_name,
        alertType: 'prom_overdue',
        details: row.last_submission
          ? 'Last PROM submission: ' + new Date(row.last_submission).toLocaleDateString()
          : 'No PROM submissions yet for active case'
      });
    }

    // Patients with appointment in 24h and reminder not sent
    const [appointmentAlerts] = await sequelize.query(
      `SELECT
         a.patient_id,
         u.first_name || ' ' || u.last_name AS patient_name,
         a.scheduled_at
       FROM msk_appointments a
       JOIN msk_users u ON u.id = a.patient_id AND (u.tenant_id = $1 OR $1 IS NULL)
       WHERE (a.tenant_id = $1 OR $1 IS NULL)
         AND a.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
         AND a.reminder_24h_sent = false`,
      { bind: [tenantId] }
    );

    for (const row of appointmentAlerts) {
      alerts.push({
        patientId: row.patient_id,
        patientName: row.patient_name,
        alertType: 'appointment_reminder',
        details: `Appointment at ${new Date(row.scheduled_at).toLocaleString()} — reminder not sent`
      });
    }

    res.json({ alerts, total: alerts.length });
  } catch (err) {
    console.error('compliance-alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch compliance alerts' });
  }
});

// ---------------------------------------------------------------------------
// 5. GET /outcome-correlation — Exercise compliance vs ROM improvement
// ---------------------------------------------------------------------------
router.get('/outcome-correlation', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    const [correlation] = await sequelize.query(
      `WITH patient_compliance AS (
         SELECT
           p.patient_id,
           COALESCE(
             COUNT(s.id)::numeric / NULLIF(GREATEST((EXTRACT(EPOCH FROM (NOW() - p.start_date)) / 604800) * 5, 1), 0) * 100,
             0
           ) AS compliance_pct
         FROM msk_hep_programs p
         LEFT JOIN msk_hep_sessions s ON s.program_id = p.id AND (s.tenant_id = $1 OR $1 IS NULL)
         WHERE (p.tenant_id = $1 OR $1 IS NULL)
         GROUP BY p.patient_id, p.expected_sessions
       ),
       patient_rom AS (
         SELECT
           patient_id,
           (
             (SELECT angle_degrees FROM msk_rom_measurements r2
              WHERE r2.patient_id = r.patient_id AND (r2.tenant_id = $1 OR $1 IS NULL)
              ORDER BY measured_at DESC LIMIT 1)
             -
             (SELECT angle_degrees FROM msk_rom_measurements r3
              WHERE r3.patient_id = r.patient_id AND (r3.tenant_id = $1 OR $1 IS NULL)
              ORDER BY measured_at ASC LIMIT 1)
           ) AS rom_improvement
         FROM msk_rom_measurements r
         WHERE (r.tenant_id = $1 OR $1 IS NULL)
         GROUP BY r.patient_id
       ),
       combined AS (
         SELECT
           pc.patient_id,
           pc.compliance_pct,
           pr.rom_improvement,
           CASE
             WHEN pc.compliance_pct >= 70 THEN 'high'
             ELSE 'low'
           END AS compliance_bucket
         FROM patient_compliance pc
         JOIN patient_rom pr ON pr.patient_id = pc.patient_id
         WHERE pr.rom_improvement IS NOT NULL
       )
       SELECT
         compliance_bucket,
         COUNT(*) AS patient_count,
         ROUND(AVG(compliance_pct)::numeric, 1) AS avg_compliance,
         ROUND(AVG(rom_improvement)::numeric, 1) AS avg_rom_improvement
       FROM combined
       GROUP BY compliance_bucket
       ORDER BY compliance_bucket DESC`,
      { bind: [tenantId] }
    );

    const buckets = {};
    for (const row of correlation) {
      buckets[row.compliance_bucket] = {
        patientCount: parseInt(row.patient_count),
        avgCompliance: parseFloat(row.avg_compliance),
        avgRomImprovement: parseFloat(row.avg_rom_improvement)
      };
    }

    res.json({
      highCompliance: buckets.high || { patientCount: 0, avgCompliance: 0, avgRomImprovement: 0 },
      lowCompliance: buckets.low || { patientCount: 0, avgCompliance: 0, avgRomImprovement: 0 }
    });
  } catch (err) {
    console.error('outcome-correlation error:', err);
    res.status(500).json({ error: 'Failed to fetch outcome correlation data' });
  }
});

// ---------------------------------------------------------------------------
// 6. POST /send-nudge — Send SMS nudge to a patient
// ---------------------------------------------------------------------------
router.post('/send-nudge', authorize('admin', 'radiologist'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { patientId, nudgeType } = req.body;

    if (!patientId || !nudgeType) {
      return res.status(400).json({ error: 'patientId and nudgeType are required' });
    }

    const validTypes = ['exercise_reminder', 'prom_reminder', 'appointment_reminder'];
    if (!validTypes.includes(nudgeType)) {
      return res.status(400).json({ error: `nudgeType must be one of: ${validTypes.join(', ')}` });
    }

    // Look up patient phone
    const [patients] = await sequelize.query(
      `SELECT id, first_name, last_name, phone
       FROM msk_users
       WHERE id = $1
         AND tenant_id = $2`,
      { bind: [patientId, tenantId] }
    );

    if (!patients.length) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patients[0];

    // Build SMS message
    const messages = {
      exercise_reminder: `Hi ${patient.first_name}, this is a friendly reminder to complete your exercise program today. Staying consistent is key to your recovery!`,
      prom_reminder: `Hi ${patient.first_name}, you have a pending health questionnaire. Please complete it at your earliest convenience so we can track your progress.`,
      appointment_reminder: `Hi ${patient.first_name}, you have an upcoming appointment. Please confirm your attendance or contact us to reschedule.`
    };

    const smsBody = messages[nudgeType];
    let smsSent = false;

    // Attempt Twilio SMS if credentials are configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      if (patient.phone) {
        try {
          const twilio = require('twilio');
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({
            body: smsBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: patient.phone
          });
          smsSent = true;
        } catch (twilioErr) {
          console.error('Twilio SMS error:', twilioErr.message);
        }
      }
    }

    // Log the notification
    await sequelize.query(
      `INSERT INTO msk_notifications (user_id, type, title, body, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      { bind: [patientId, nudgeType, messages[nudgeType].split(',')[0], smsBody] }
    );

    res.json({
      success: true,
      smsSent,
      patientName: `${patient.first_name} ${patient.last_name}`,
      nudgeType,
      message: smsSent
        ? 'SMS sent and notification logged'
        : 'Notification logged (SMS not sent — credentials not configured or no phone number)'
    });
  } catch (err) {
    console.error('send-nudge error:', err);
    res.status(500).json({ error: 'Failed to send nudge' });
  }
});

module.exports = router;
