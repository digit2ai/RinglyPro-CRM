// spark-ai/src/routes/health.js
// Health scoring routes

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { SparkSchool, SparkStudent, SparkLead, SparkRevenue, SparkHealthScore } = models;

  // GET /api/v1/health - Get current health score for a school
  router.get('/', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const latestScore = await SparkHealthScore.findOne({
        where: { school_id },
        order: [['date', 'DESC']],
        include: [{ model: SparkSchool, as: 'school', attributes: ['id', 'name'] }]
      });

      if (!latestScore) {
        return res.json({
          success: true,
          data: null,
          message: 'No health score calculated yet. Run /api/v1/health/calculate to generate.'
        });
      }

      res.json({ success: true, data: latestScore });
    } catch (error) {
      console.error('Error fetching health score:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/health/history - Get health score history
  router.get('/history', async (req, res) => {
    try {
      const { school_id, days = 30 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const history = await SparkHealthScore.findAll({
        where: {
          school_id,
          date: { [Op.gte]: startDate }
        },
        order: [['date', 'ASC']]
      });

      res.json({ success: true, data: history });
    } catch (error) {
      console.error('Error fetching health history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/health/calculate - Calculate and store health score
  router.post('/calculate', async (req, res) => {
    try {
      const { school_id } = req.body;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const school = await SparkSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate metrics
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Student metrics
      const totalStudents = await SparkStudent.count({ where: { school_id } });
      const activeStudents = await SparkStudent.count({ where: { school_id, status: 'active' } });
      const atRiskStudents = await SparkStudent.count({
        where: { school_id, churn_risk: { [Op.in]: ['high', 'critical'] } }
      });
      const cancelledThisMonth = await SparkStudent.count({
        where: {
          school_id,
          status: 'cancelled',
          updated_at: { [Op.gte]: thirtyDaysAgo }
        }
      });

      // Lead metrics
      const totalActiveLeads = await SparkLead.count({
        where: { school_id, status: { [Op.notIn]: ['converted', 'lost'] } }
      });
      const hotLeads = await SparkLead.count({ where: { school_id, temperature: 'hot' } });
      const convertedThisMonth = await SparkLead.count({
        where: {
          school_id,
          status: 'converted',
          conversion_date: { [Op.gte]: thirtyDaysAgo }
        }
      });
      const newLeadsThisMonth = await SparkLead.count({
        where: {
          school_id,
          created_at: { [Op.gte]: thirtyDaysAgo }
        }
      });

      // Revenue metrics
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const revenueThisMonth = await SparkRevenue.sum('amount', {
        where: { school_id, date: { [Op.gte]: monthStart } }
      }) || 0;

      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      const revenueLastMonth = await SparkRevenue.sum('amount', {
        where: { school_id, date: { [Op.between]: [lastMonthStart, lastMonthEnd] } }
      }) || 0;

      // Calculate component scores (0-100)
      // Retention Score: Based on active rate and churn risk
      const retentionRate = totalStudents > 0 ? (activeStudents / totalStudents) : 0;
      const atRiskRate = activeStudents > 0 ? (atRiskStudents / activeStudents) : 0;
      const retentionScore = Math.round(
        (retentionRate * 60) +
        ((1 - atRiskRate) * 30) +
        (cancelledThisMonth === 0 ? 10 : Math.max(0, 10 - cancelledThisMonth * 2))
      );

      // Revenue Score: Based on target progress and growth
      const revenueProgress = school.monthly_revenue_target > 0
        ? (revenueThisMonth / school.monthly_revenue_target)
        : 0.5;
      const revenueGrowth = revenueLastMonth > 0
        ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth)
        : 0;
      const revenueScore = Math.round(
        Math.min(100, (revenueProgress * 70) + ((revenueGrowth + 0.1) * 30 * 10))
      );

      // Lead Score: Based on pipeline health and conversion
      const conversionRate = newLeadsThisMonth > 0
        ? (convertedThisMonth / newLeadsThisMonth)
        : 0;
      const hotLeadRate = totalActiveLeads > 0 ? (hotLeads / totalActiveLeads) : 0;
      const leadScore = Math.round(
        (conversionRate * 40 * 100) +
        (hotLeadRate * 30 * 100) +
        Math.min(30, newLeadsThisMonth * 3)
      );

      // Attendance Score (placeholder - would need class attendance data)
      const attendanceScore = 70;

      // Engagement Score (placeholder - would need more engagement metrics)
      const engagementScore = 65;

      // Growth Score
      const growthScore = Math.round(
        Math.min(100, Math.max(0, 50 + (revenueGrowth * 100)))
      );

      // Overall Score (weighted average)
      const overallScore = Math.round(
        (retentionScore * 0.25) +
        (revenueScore * 0.25) +
        (leadScore * 0.20) +
        (attendanceScore * 0.15) +
        (engagementScore * 0.10) +
        (growthScore * 0.05)
      );

      // Determine grade
      let grade = 'F';
      if (overallScore >= 90) grade = 'A';
      else if (overallScore >= 80) grade = 'B';
      else if (overallScore >= 70) grade = 'C';
      else if (overallScore >= 60) grade = 'D';

      // Generate insights
      const insights = [];
      if (atRiskStudents > 0) {
        insights.push(`${atRiskStudents} students are at risk of churning. Consider reaching out with Sensei AI.`);
      }
      if (hotLeads > 0) {
        insights.push(`${hotLeads} hot leads need immediate follow-up for best conversion rates.`);
      }
      if (revenueProgress < 0.5) {
        insights.push(`Revenue is at ${(revenueProgress * 100).toFixed(0)}% of monthly target. Focus on upsells and retail.`);
      }
      if (convertedThisMonth > 0) {
        insights.push(`Great job! ${convertedThisMonth} leads converted to students this month.`);
      }

      // Generate alerts
      const alerts = [];
      if (retentionScore < 60) {
        alerts.push({ type: 'warning', message: 'Retention score is low. Review at-risk students.' });
      }
      if (revenueScore < 50) {
        alerts.push({ type: 'danger', message: 'Revenue significantly behind target.' });
      }
      if (leadScore < 40) {
        alerts.push({ type: 'warning', message: 'Lead pipeline needs attention.' });
      }

      // Get previous scores for comparison
      const lastWeekScore = await SparkHealthScore.findOne({
        where: {
          school_id,
          date: { [Op.lt]: today }
        },
        order: [['date', 'DESC']]
      });

      const lastMonthScore = await SparkHealthScore.findOne({
        where: {
          school_id,
          date: { [Op.lt]: thirtyDaysAgo }
        },
        order: [['date', 'DESC']]
      });

      // Save or update health score
      const [healthScore, created] = await SparkHealthScore.upsert({
        school_id,
        date: today,
        retention_score: retentionScore,
        revenue_score: revenueScore,
        lead_score: leadScore,
        attendance_score: attendanceScore,
        engagement_score: engagementScore,
        growth_score: growthScore,
        overall_score: overallScore,
        grade,
        metrics: {
          students: { total: totalStudents, active: activeStudents, at_risk: atRiskStudents },
          leads: { active: totalActiveLeads, hot: hotLeads, converted: convertedThisMonth },
          revenue: { this_month: revenueThisMonth, last_month: revenueLastMonth, target: school.monthly_revenue_target }
        },
        insights,
        alerts,
        vs_last_week: lastWeekScore ? (overallScore - lastWeekScore.overall_score) : 0,
        vs_last_month: lastMonthScore ? (overallScore - lastMonthScore.overall_score) : 0
      });

      res.json({ success: true, data: healthScore, created });
    } catch (error) {
      console.error('Error calculating health score:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
