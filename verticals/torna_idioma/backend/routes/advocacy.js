const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.ti');
const auth = require('../middleware/auth.ti');

// Public: Register as supporter
router.post('/supporters', async (req, res) => {
  try {
    const { full_name, email, phone, supporter_type, organization, message, is_newsletter } = req.body;
    if (!full_name || !email) return res.status(400).json({ error: 'Name and email required' });
    const [[existing]] = await sequelize.query(`SELECT id FROM ti_supporters WHERE email = $1`, { bind: [email.toLowerCase()] });
    if (existing) return res.status(409).json({ error: 'Already registered as supporter' });
    const [[supporter]] = await sequelize.query(
      `INSERT INTO ti_supporters (full_name, email, phone, supporter_type, organization, message, is_newsletter, signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      { bind: [full_name, email.toLowerCase(), phone||null, supporter_type||'individual', organization||null, message||null, is_newsletter !== false] }
    );
    res.status(201).json({ success: true, supporter });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public: Get supporter count
router.get('/supporters/count', async (req, res) => {
  try {
    const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_supporters`);
    res.json({ success: true, count: parseInt(result.count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: List supporters
router.get('/supporters', auth.admin, async (req, res) => {
  try {
    const [supporters] = await sequelize.query(`SELECT * FROM ti_supporters ORDER BY signed_at DESC`);
    res.json({ success: true, supporters });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public: List events (upcoming + optionally past)
router.get('/events', async (req, res) => {
  try {
    const includePast = req.query.include_past === 'true';
    const [events] = await sequelize.query(
      `SELECT e.*, u.full_name as creator_name FROM ti_events e LEFT JOIN ti_users u ON e.created_by = u.id
       WHERE e.is_published = true ${includePast ? '' : 'AND e.event_date >= NOW()'}
       ORDER BY e.event_date ${includePast ? 'DESC' : 'ASC'}`
    );
    res.json({ success: true, events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public: Register for event
router.post('/events/:id/register', async (req, res) => {
  try {
    const { guest_name, guest_email, user_id } = req.body;
    if (!guest_name && !user_id) return res.status(400).json({ error: 'Name or user_id required' });
    const [[event]] = await sequelize.query(`SELECT * FROM ti_events WHERE id = $1`, { bind: [req.params.id] });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.capacity && event.registered_count >= event.capacity) return res.status(409).json({ error: 'Event is full' });
    const [[reg]] = await sequelize.query(
      `INSERT INTO ti_event_registrations (event_id, user_id, guest_name, guest_email, status, registered_at)
       VALUES ($1,$2,$3,$4,'registered',NOW()) RETURNING *`,
      { bind: [req.params.id, user_id||null, guest_name||null, guest_email||null] }
    );
    await sequelize.query(`UPDATE ti_events SET registered_count = registered_count + 1 WHERE id = $1`, { bind: [req.params.id] });
    res.status(201).json({ success: true, registration: reg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create event (admin/official)
router.post('/events', auth.official, async (req, res) => {
  try {
    const { title_en, title_es, title_fil, description_en, description_es, description_fil, event_type, location, event_date, end_date, capacity } = req.body;
    if (!title_en || !event_date) return res.status(400).json({ error: 'title_en and event_date required' });
    const [[event]] = await sequelize.query(
      `INSERT INTO ti_events (title_en, title_es, title_fil, description_en, description_es, description_fil, event_type, location, event_date, end_date, capacity, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING *`,
      { bind: [title_en, title_es||null, title_fil||null, description_en||null, description_es||null, description_fil||null, event_type||'cultural', location||null, event_date, end_date||null, capacity||null, req.user.id] }
    );
    res.status(201).json({ success: true, event });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All events (admin, including past)
router.get('/events/all', auth.admin, async (req, res) => {
  try {
    const [events] = await sequelize.query(
      `SELECT e.*, u.full_name as creator_name FROM ti_events e LEFT JOIN ti_users u ON e.created_by = u.id ORDER BY e.event_date DESC`
    );
    res.json({ success: true, events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// My event registrations
router.get('/events/my', auth.any, async (req, res) => {
  try {
    const [regs] = await sequelize.query(
      `SELECT r.*, e.title_en, e.title_es, e.title_fil, e.event_date, e.location, e.event_type
       FROM ti_event_registrations r JOIN ti_events e ON r.event_id = e.id
       WHERE r.user_id = $1 ORDER BY e.event_date DESC`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, registrations: regs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Advocacy stats
router.get('/stats', async (req, res) => {
  try {
    const [[stats]] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM ti_supporters) as total_supporters,
        (SELECT COUNT(*) FROM ti_events WHERE is_published = true) as total_events,
        (SELECT COUNT(*) FROM ti_events WHERE is_published = true AND event_date >= NOW()) as upcoming_events,
        (SELECT COALESCE(SUM(registered_count),0) FROM ti_events) as total_registrations,
        (SELECT COALESCE(SUM(amount),0) FROM ti_donations WHERE status = 'received') as total_donations
    `);
    res.json({ success: true, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
