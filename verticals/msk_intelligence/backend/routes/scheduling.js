'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, sequelize, logAudit } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate 30-min time slots between start and end (HH:MM format),
 * with a 5-min buffer between slots.
 * e.g. 09:00-09:30, 09:35-10:05, 10:10-10:40 ...
 */
function generateSlots(startTime, endTime) {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  let cursor = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const slotDuration = 30;
  const buffer = 5;

  while (cursor + slotDuration <= endMinutes) {
    const fromH = String(Math.floor(cursor / 60)).padStart(2, '0');
    const fromM = String(cursor % 60).padStart(2, '0');
    const toMin = cursor + slotDuration;
    const toH = String(Math.floor(toMin / 60)).padStart(2, '0');
    const toM = String(toMin % 60).padStart(2, '0');

    slots.push({ start: `${fromH}:${fromM}`, end: `${toH}:${toM}` });
    cursor += slotDuration + buffer;
  }
  return slots;
}

/**
 * Get numeric day of week (0=Sun, 6=Sat) matching SMALLINT column.
 */
function dayOfWeek(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay();
}

// ---------------------------------------------------------------------------
// GET /availability/:providerId?date=YYYY-MM-DD
// Returns available 30-min slots for that provider on the given date.
// ---------------------------------------------------------------------------
router.get('/availability/:providerId', authenticate, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
    }

    const dow = dayOfWeek(date);

    // 1. Fetch provider availability windows for this day of week
    const [windows] = await sequelize.query(`
      SELECT start_time, end_time
      FROM msk_provider_availability
      WHERE provider_id = $1 AND day_of_week = $2 AND is_active = true
      ORDER BY start_time ASC
    `, { bind: [providerId, dow] });

    if (windows.length === 0) {
      return res.json({ success: true, data: { date, providerId, slots: [] } });
    }

    // 2. Fetch booked appointments for this provider on this date
    const [booked] = await sequelize.query(`
      SELECT scheduled_at, duration_minutes
      FROM msk_appointments
      WHERE provider_id = $1
        AND scheduled_at::date = $2::date
        AND status NOT IN ('cancelled')
      ORDER BY scheduled_at ASC
    `, { bind: [providerId, date] });

    // Build set of booked intervals (in minutes from midnight)
    const bookedIntervals = booked.map(b => {
      const dt = new Date(b.scheduled_at);
      const startMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();
      const dur = parseInt(b.duration_minutes) || 30;
      return { start: startMin, end: startMin + dur };
    });

    // 3. Generate slots per window, then remove conflicts
    const allSlots = [];
    for (const win of windows) {
      const raw = generateSlots(win.start_time, win.end_time);

      for (const slot of raw) {
        const [sH, sM] = slot.start.split(':').map(Number);
        const [eH, eM] = slot.end.split(':').map(Number);
        const slotStart = sH * 60 + sM;
        const slotEnd = eH * 60 + eM;

        const conflict = bookedIntervals.some(b =>
          slotStart < b.end && slotEnd > b.start
        );

        if (!conflict) {
          allSlots.push(slot);
        }
      }
    }

    res.json({ success: true, data: { date, providerId, slots: allSlots } });
  } catch (err) {
    console.error('[ImagingMind Scheduling] availability error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /book
// Body: { caseId, patientId, providerId, scheduledAt, durationMinutes }
// Creates appointment + consultation with meeting URL, updates case timeline.
// ---------------------------------------------------------------------------
router.post('/book', authenticate, async (req, res) => {
  try {
    const { caseId, patientId, providerId, scheduledAt, durationMinutes } = req.body;

    if (!caseId || !patientId || !providerId || !scheduledAt) {
      return res.status(400).json({ error: 'caseId, patientId, providerId, and scheduledAt are required' });
    }

    const duration = parseInt(durationMinutes) || 30;
    const meetingId = `msk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const meetingUrl = `https://aiagent.ringlypro.com/msk/video/${meetingId}`;

    // 1. Create appointment
    const [apptRows] = await sequelize.query(`
      INSERT INTO msk_appointments (case_id, patient_id, provider_id, scheduled_at, duration_minutes, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW(), NOW())
      RETURNING *
    `, { bind: [caseId, patientId, providerId, scheduledAt, duration] });

    const appointment = apptRows[0];

    // 2. Create consultation with meeting URL
    const [consultRows] = await sequelize.query(`
      INSERT INTO msk_consultations (case_id, patient_id, radiologist_id, scheduled_at, duration_minutes, meeting_url, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NOW(), NOW())
      RETURNING *
    `, { bind: [caseId, patientId, providerId, scheduledAt, duration, meetingUrl] });

    // 3. Update case status
    await sequelize.query(`
      UPDATE msk_cases SET status = 'appointment_scheduled', updated_at = NOW() WHERE id = $1
    `, { bind: [caseId] });

    // 4. Add timeline entry
    const description = `Appointment scheduled for ${new Date(scheduledAt).toISOString()} (${duration} min) — Meeting: ${meetingUrl}`;
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'appointment_scheduled', 'Appointment Scheduled', $2, $3)
    `, { bind: [caseId, description, req.user.userId] });

    // 5. Audit
    await logAudit(req.user.userId, 'appointment_booked', 'appointment', appointment.id, req);

    res.status(201).json({
      success: true,
      data: {
        appointment,
        consultation: consultRows[0],
        meetingUrl
      }
    });
  } catch (err) {
    console.error('[ImagingMind Scheduling] book error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /:appointmentId/cancel
// Body: { cancelReason }
// ---------------------------------------------------------------------------
router.put('/:appointmentId/cancel', authenticate, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { cancelReason } = req.body;

    const [rows] = await sequelize.query(`
      UPDATE msk_appointments
      SET status = 'cancelled', cancel_reason = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, { bind: [cancelReason || null, appointmentId] });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appointment = rows[0];

    // Cancel associated consultation if exists
    await sequelize.query(`
      UPDATE msk_consultations
      SET status = 'cancelled', cancelled_reason = $1, updated_at = NOW()
      WHERE case_id = $2 AND scheduled_at = $3 AND status != 'cancelled'
    `, { bind: [cancelReason || null, appointment.case_id, appointment.scheduled_at] });

    // Timeline entry
    if (appointment.case_id) {
      await sequelize.query(`
        INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
        VALUES ($1, 'appointment_cancelled', 'Appointment Cancelled', $2, $3)
      `, { bind: [appointment.case_id, cancelReason || 'No reason provided', req.user.userId] });
    }

    await logAudit(req.user.userId, 'appointment_cancelled', 'appointment', appointmentId, req);

    res.json({ success: true, data: appointment });
  } catch (err) {
    console.error('[ImagingMind Scheduling] cancel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /upcoming
// Patient sees their own upcoming appointments; radiologist/admin sees assigned.
// ---------------------------------------------------------------------------
router.get('/upcoming', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const conditions = [`a.scheduled_at > NOW()`, `a.status != 'cancelled'`];
    const binds = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      conditions.push(`a.patient_id IN (SELECT id FROM msk_patients WHERE user_id = $${idx++})`);
      binds.push(req.user.userId);
    } else if (req.user.role === 'radiologist') {
      conditions.push(`a.provider_id = $${idx++}`);
      binds.push(req.user.userId);
    }
    // admin sees all upcoming — no extra filter

    binds.push(parseInt(limit));

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [appointments] = await sequelize.query(`
      SELECT a.*,
        pu.first_name AS patient_first_name, pu.last_name AS patient_last_name,
        prov.first_name AS provider_first_name, prov.last_name AS provider_last_name,
        c.case_number
      FROM msk_appointments a
      LEFT JOIN msk_patients p ON a.patient_id = p.id
      LEFT JOIN msk_users pu ON p.user_id = pu.id
      LEFT JOIN msk_users prov ON a.provider_id = prov.id
      LEFT JOIN msk_cases c ON a.case_id = c.id
      ${where}
      ORDER BY a.scheduled_at ASC
      LIMIT $${idx}
    `, { bind: binds });

    res.json({ success: true, data: appointments });
  } catch (err) {
    console.error('[ImagingMind Scheduling] upcoming error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// Admin / radiologist only — all appointments in a date range.
// ---------------------------------------------------------------------------
router.get('/calendar', authenticate, async (req, res) => {
  try {
    if (!['admin', 'radiologist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions — admin or radiologist required' });
    }

    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
    }

    const binds = [start, end];
    let idx = 3;
    let extraFilter = '';

    // Radiologists only see their own calendar
    if (req.user.role === 'radiologist') {
      extraFilter = `AND a.provider_id = $${idx++}`;
      binds.push(req.user.userId);
    }

    const [appointments] = await sequelize.query(`
      SELECT a.*,
        pu.first_name AS patient_first_name, pu.last_name AS patient_last_name,
        prov.first_name AS provider_first_name, prov.last_name AS provider_last_name,
        c.case_number
      FROM msk_appointments a
      LEFT JOIN msk_patients p ON a.patient_id = p.id
      LEFT JOIN msk_users pu ON p.user_id = pu.id
      LEFT JOIN msk_users prov ON a.provider_id = prov.id
      LEFT JOIN msk_cases c ON a.case_id = c.id
      WHERE a.scheduled_at::date >= $1::date
        AND a.scheduled_at::date <= $2::date
        ${extraFilter}
      ORDER BY a.scheduled_at ASC
    `, { bind: binds });

    res.json({ success: true, data: appointments });
  } catch (err) {
    console.error('[ImagingMind Scheduling] calendar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
