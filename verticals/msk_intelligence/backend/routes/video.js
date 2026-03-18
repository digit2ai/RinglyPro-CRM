'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit } = require('../middleware/auth');

// In-memory signaling store (keyed by meetingId)
// In production, replace with Redis for multi-instance support
const rooms = new Map();

function getRoom(meetingId) {
  if (!rooms.has(meetingId)) {
    rooms.set(meetingId, {
      participants: new Map(),
      offers: new Map(),
      answers: new Map(),
      candidates: new Map(),
      createdAt: Date.now()
    });
  }
  return rooms.get(meetingId);
}

// Clean up old rooms every 2 hours
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, room] of rooms) {
    if (room.createdAt < twoHoursAgo) rooms.delete(id);
  }
}, 60 * 60 * 1000);

/**
 * POST /api/v1/video/join
 * Join a video room - registers participant and returns room state
 */
router.post('/join', async (req, res) => {
  try {
    const { meetingId, userId, displayName, role } = req.body;

    if (!meetingId || !userId) {
      return res.status(400).json({ error: 'meetingId and userId required' });
    }

    // Validate meeting exists in DB
    const [consults] = await sequelize.query(
      `SELECT co.*, c.case_number
       FROM msk_consultations co
       JOIN msk_cases c ON co.case_id = c.id
       WHERE co.meeting_url LIKE $1`,
      { bind: [`%${meetingId}`] }
    );

    if (consults.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const consult = consults[0];
    const room = getRoom(meetingId);
    const participantId = `${userId}-${Date.now()}`;

    room.participants.set(participantId, {
      userId, displayName, role,
      joinedAt: Date.now()
    });

    // Update consultation status to in_progress if first join
    if (room.participants.size <= 2 && consult.status === 'scheduled') {
      await sequelize.query(
        `UPDATE msk_consultations SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        { bind: [consult.id] }
      );
    }

    // Get list of other participants
    const otherParticipants = [];
    for (const [pid, p] of room.participants) {
      if (pid !== participantId) {
        otherParticipants.push({ participantId: pid, ...p });
      }
    }

    res.json({
      success: true,
      data: {
        participantId,
        meetingId,
        caseNumber: consult.case_number,
        consultation: consult,
        otherParticipants,
        isInitiator: room.participants.size === 1
      }
    });
  } catch (err) {
    console.error('[MSK Video] Join error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/video/signal
 * Exchange WebRTC signaling data (offer, answer, ICE candidates)
 */
router.post('/signal', (req, res) => {
  try {
    const { meetingId, fromId, type, data } = req.body;

    if (!meetingId || !fromId || !type) {
      return res.status(400).json({ error: 'meetingId, fromId, and type required' });
    }

    const room = getRoom(meetingId);

    if (type === 'offer') {
      room.offers.set(fromId, { data, timestamp: Date.now() });
    } else if (type === 'answer') {
      room.answers.set(fromId, { data, timestamp: Date.now() });
    } else if (type === 'candidate') {
      if (!room.candidates.has(fromId)) room.candidates.set(fromId, []);
      room.candidates.get(fromId).push({ data, timestamp: Date.now() });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[MSK Video] Signal error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/video/poll
 * Poll for signaling data from the other participant
 */
router.get('/poll', (req, res) => {
  try {
    const { meetingId, participantId, since } = req.query;

    if (!meetingId || !participantId) {
      return res.status(400).json({ error: 'meetingId and participantId required' });
    }

    const room = getRoom(meetingId);
    const sinceTs = parseInt(since) || 0;
    const signals = [];

    // Collect offers from other participants
    for (const [fromId, offer] of room.offers) {
      if (fromId !== participantId && offer.timestamp > sinceTs) {
        signals.push({ type: 'offer', from: fromId, data: offer.data, timestamp: offer.timestamp });
      }
    }

    // Collect answers from other participants
    for (const [fromId, answer] of room.answers) {
      if (fromId !== participantId && answer.timestamp > sinceTs) {
        signals.push({ type: 'answer', from: fromId, data: answer.data, timestamp: answer.timestamp });
      }
    }

    // Collect ICE candidates from other participants
    for (const [fromId, candidates] of room.candidates) {
      if (fromId !== participantId) {
        for (const c of candidates) {
          if (c.timestamp > sinceTs) {
            signals.push({ type: 'candidate', from: fromId, data: c.data, timestamp: c.timestamp });
          }
        }
      }
    }

    // Get current participants
    const participants = [];
    for (const [pid, p] of room.participants) {
      participants.push({ participantId: pid, ...p });
    }

    res.json({
      success: true,
      data: { signals, participants, serverTime: Date.now() }
    });
  } catch (err) {
    console.error('[MSK Video] Poll error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/video/leave
 * Leave a video room
 */
router.post('/leave', async (req, res) => {
  try {
    const { meetingId, participantId } = req.body;

    if (!meetingId || !participantId) {
      return res.status(400).json({ error: 'meetingId and participantId required' });
    }

    const room = getRoom(meetingId);
    room.participants.delete(participantId);
    room.offers.delete(participantId);
    room.answers.delete(participantId);
    room.candidates.delete(participantId);

    // If room is empty, mark consultation as completed
    if (room.participants.size === 0) {
      const [consults] = await sequelize.query(
        `SELECT id, case_id FROM msk_consultations WHERE meeting_url LIKE $1 AND status = 'in_progress'`,
        { bind: [`%${meetingId}`] }
      );

      if (consults.length > 0) {
        await sequelize.query(
          `UPDATE msk_consultations SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          { bind: [consults[0].id] }
        );
        await sequelize.query(
          `UPDATE msk_cases SET status = 'consult_complete', updated_at = NOW() WHERE id = $1`,
          { bind: [consults[0].case_id] }
        );
        await sequelize.query(
          `INSERT INTO msk_case_timeline (case_id, event_type, event_title) VALUES ($1, 'consult_complete', 'Video Consultation Completed')`,
          { bind: [consults[0].case_id] }
        );
      }

      rooms.delete(meetingId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[MSK Video] Leave error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/video/info/:meetingId
 * Get meeting info without joining (for lobby/pre-join screen)
 */
router.get('/info/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;

    const [consults] = await sequelize.query(
      `SELECT co.*, c.case_number,
         pu.first_name AS patient_first_name, pu.last_name AS patient_last_name,
         ru.first_name AS radiologist_first_name, ru.last_name AS radiologist_last_name
       FROM msk_consultations co
       JOIN msk_cases c ON co.case_id = c.id
       JOIN msk_patients p ON co.patient_id = p.id
       JOIN msk_users pu ON p.user_id = pu.id
       JOIN msk_users ru ON co.radiologist_id = ru.id
       WHERE co.meeting_url LIKE $1`,
      { bind: [`%${meetingId}`] }
    );

    if (consults.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ success: true, data: consults[0] });
  } catch (err) {
    console.error('[MSK Video] Info error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
