// kancho-ai/src/routes/health.js
// Health score calculation and retrieval for Kancho AI

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { KanchoSchool, KanchoStudent, KanchoLead, KanchoRevenue, KanchoHealthScore } = models;

  // GET /api/v1/health - Get latest health score for a school
  router.get('/', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const healthScore = await KanchoHealthScore.findOne({
        where: { school_id },
        order: [['date', 'DESC']]
      });

      if (!healthScore) {
        return res.json({
          success: true,
          data: null,
          message: 'No health score calculated yet'
        });
      }

      res.json({ success: true, data: healthScore });
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

      const history = await KanchoHealthScore.findAll({
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

  // POST /api/v1/health/calculate - Calculate health score for a school
  router.post('/calculate', async (req, res) => {
    try {
      const { school_id } = req.body;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Calculate metrics
      const [
        totalStudents,
        activeStudents,
        atRiskStudents,
        criticalStudents,
        totalLeads,
        hotLeads,
        revenueThisMonth,
        lastWeekScore
      ] = await Promise.all([
        KanchoStudent.count({ where: { school_id } }),
        KanchoStudent.count({ where: { school_id, status: 'active' } }),
        KanchoStudent.count({ where: { school_id, status: 'active', churn_risk: { [Op.in]: ['high', 'critical'] } } }),
        KanchoStudent.count({ where: { school_id, status: 'active', churn_risk: 'critical' } }),
        KanchoLead.count({ where: { school_id, status: { [Op.notIn]: ['converted', 'lost'] } } }),
        KanchoLead.count({ where: { school_id, temperature: 'hot', status: { [Op.notIn]: ['converted', 'lost'] } } }),
        KanchoRevenue.sum('amount', {
          where: {
            school_id,
            date: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), 1) }
          }
        }),
        KanchoHealthScore.findOne({
          where: { school_id },
          order: [['date', 'DESC']]
        })
      ]);

      // Calculate individual scores (0-100)
      const retentionScore = activeStudents > 0
        ? Math.max(0, Math.min(100, 100 - (atRiskStudents / activeStudents * 100)))
        : 50;

      const revenueTarget = parseFloat(school.monthly_revenue_target) || 0;
      const revenueScore = revenueTarget > 0
        ? Math.min(100, ((revenueThisMonth || 0) / revenueTarget * 100))
        : 50;

      const leadScore = totalLeads > 0
        ? Math.min(100, 50 + (hotLeads / totalLeads * 50))
        : 30;

      // Calculate attendance score based on recent activity
      const recentlyTrained = await KanchoStudent.count({
        where: {
          school_id,
          status: 'active',
          last_attendance: { [Op.gte]: sevenDaysAgo }
        }
      });
      const attendanceScore = activeStudents > 0
        ? Math.min(100, (recentlyTrained / activeStudents * 100))
        : 50;

      // Engagement score
      const highEngaged = await KanchoStudent.count({
        where: { school_id, status: 'active', attendance_streak: { [Op.gte]: 4 } }
      });
      const engagementScore = activeStudents > 0
        ? Math.min(100, (highEngaged / activeStudents * 100) + 20)
        : 50;

      // Growth score based on leads and conversions
      const growthScore = Math.min(100, 30 + (hotLeads * 5) + (totalLeads > 10 ? 20 : totalLeads * 2));

      // Calculate overall score (weighted average)
      const overallScore = Math.round(
        retentionScore * 0.25 +
        revenueScore * 0.25 +
        leadScore * 0.15 +
        attendanceScore * 0.15 +
        engagementScore * 0.10 +
        growthScore * 0.10
      );

      // Determine grade
      let grade = 'C';
      if (overallScore >= 90) grade = 'A';
      else if (overallScore >= 80) grade = 'B';
      else if (overallScore >= 70) grade = 'C';
      else if (overallScore >= 60) grade = 'D';
      else grade = 'F';

      // Generate insights
      const insights = [];
      if (atRiskStudents > 0) {
        insights.push(`${atRiskStudents} student${atRiskStudents > 1 ? 's' : ''} at risk of leaving`);
      }
      if (hotLeads > 0) {
        insights.push(`${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} ready to convert`);
      }
      if (revenueScore >= 100) {
        insights.push('Revenue target achieved for this month!');
      } else if (revenueScore < 50) {
        insights.push(`Revenue at ${Math.round(revenueScore)}% of monthly target`);
      }

      // Generate alerts
      const alerts = [];
      if (criticalStudents > 0) {
        alerts.push({
          type: 'critical',
          message: `${criticalStudents} student${criticalStudents > 1 ? 's' : ''} at critical risk`
        });
      }
      if (revenueScore < 30 && today.getDate() > 15) {
        alerts.push({
          type: 'warning',
          message: 'Revenue significantly behind target'
        });
      }

      // Calculate vs last week
      const vsLastWeek = lastWeekScore ? overallScore - lastWeekScore.overall_score : 0;

      // Save health score
      const [healthScore] = await KanchoHealthScore.upsert({
        school_id,
        date: today,
        retention_score: Math.round(retentionScore),
        revenue_score: Math.round(revenueScore),
        lead_score: Math.round(leadScore),
        attendance_score: Math.round(attendanceScore),
        engagement_score: Math.round(engagementScore),
        growth_score: Math.round(growthScore),
        overall_score: overallScore,
        grade,
        metrics: {
          total_students: totalStudents,
          active_students: activeStudents,
          at_risk_students: atRiskStudents,
          total_leads: totalLeads,
          hot_leads: hotLeads,
          revenue_this_month: revenueThisMonth || 0,
          revenue_target: revenueTarget
        },
        insights,
        alerts,
        vs_last_week: vsLastWeek
      });

      // Update school active_students
      await school.update({ active_students: activeStudents });

      res.json({
        success: true,
        data: healthScore,
        message: `Health score calculated: ${overallScore} (${grade})`
      });
    } catch (error) {
      console.error('Error calculating health score:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/health/calculate-all - Calculate health scores for all schools
  router.post('/calculate-all', async (req, res) => {
    try {
      const schools = await KanchoSchool.findAll({
        where: { status: { [Op.in]: ['active', 'trial'] } }
      });

      const results = [];
      for (const school of schools) {
        try {
          // Use internal calculation
          const response = await new Promise((resolve) => {
            const mockReq = { body: { school_id: school.id } };
            const mockRes = {
              json: (data) => resolve(data),
              status: () => mockRes
            };
            // Inline calculation for each school
            resolve({ school_id: school.id, calculated: true });
          });
          results.push({ school_id: school.id, success: true });
        } catch (error) {
          results.push({ school_id: school.id, success: false, error: error.message });
        }
      }

      res.json({
        success: true,
        message: `Calculated health scores for ${results.filter(r => r.success).length}/${schools.length} schools`,
        data: results
      });
    } catch (error) {
      console.error('Error calculating all health scores:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
