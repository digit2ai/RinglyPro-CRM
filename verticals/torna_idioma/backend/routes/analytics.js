const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.ti');
const auth = require('../middleware/auth.ti');

// Program overview KPIs
router.get('/overview', auth.official, async (req, res) => {
  try {
    const [[students]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_users WHERE role = 'student' AND status = 'active'`);
    const [[teachers]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_users WHERE role = 'teacher' AND status = 'active'`);
    const [[bpo]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_users WHERE role = 'bpo_worker' AND status = 'active'`);
    const [[courses]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_courses WHERE is_published = true`);
    const [[enrollments]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_enrollments WHERE status = 'active'`);
    const [[certs]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_certifications WHERE status = 'active'`);
    const [[schools]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_schools`);
    const [[partners]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_partners WHERE partnership_status = 'active'`);
    const [[events]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_events WHERE event_date >= NOW()`);
    const [[supporters]] = await sequelize.query(`SELECT COUNT(*) as count FROM ti_supporters`);
    const [[placements]] = await sequelize.query(`SELECT COUNT(*) as count, COALESCE(AVG(salary_increase_pct),0) as avg_increase FROM ti_bpo_placements WHERE status = 'active'`);
    const [[donations]] = await sequelize.query(`SELECT COALESCE(SUM(amount),0) as total FROM ti_donations WHERE status = 'received'`);

    res.json({
      success: true,
      kpis: {
        total_students: parseInt(students.count),
        total_teachers: parseInt(teachers.count),
        total_bpo_workers: parseInt(bpo.count),
        published_courses: parseInt(courses.count),
        active_enrollments: parseInt(enrollments.count),
        certifications_issued: parseInt(certs.count),
        participating_schools: parseInt(schools.count),
        active_partners: parseInt(partners.count),
        upcoming_events: parseInt(events.count),
        total_supporters: parseInt(supporters.count),
        bpo_placements: parseInt(placements.count),
        avg_salary_increase_pct: parseFloat(placements.avg_increase || 0),
        total_donations_php: parseFloat(donations.total || 0)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Economic impact summary
router.get('/economic-impact', auth.official, async (req, res) => {
  try {
    const [impacts] = await sequelize.query(
      `SELECT * FROM ti_economic_impact ORDER BY period_start DESC LIMIT 12`
    );
    const [[placements]] = await sequelize.query(
      `SELECT COUNT(*) as total_placed,
        COALESCE(SUM(salary_after - salary_before) * 12, 0) as annual_income_increase,
        COALESCE(AVG(salary_increase_pct), 0) as avg_increase_pct
       FROM ti_bpo_placements WHERE status = 'active'`
    );
    res.json({
      success: true,
      impacts,
      live_impact: {
        total_placed: parseInt(placements.total_placed),
        annual_income_increase_php: parseFloat(placements.annual_income_increase),
        avg_salary_increase_pct: parseFloat(placements.avg_increase_pct),
        estimated_tax_revenue_php: parseFloat(placements.annual_income_increase) * 0.15
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Schools summary
router.get('/schools', auth.official, async (req, res) => {
  try {
    const [schools] = await sequelize.query(
      `SELECT * FROM ti_schools ORDER BY program_status, name`
    );
    res.json({ success: true, schools });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Partners summary
router.get('/partners', async (req, res) => {
  try {
    const [partners] = await sequelize.query(
      `SELECT * FROM ti_partners WHERE partnership_status = 'active' ORDER BY country, name`
    );
    res.json({ success: true, partners });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
