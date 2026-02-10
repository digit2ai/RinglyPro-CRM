// spark-ai/src/routes/dashboard.js
// Dashboard aggregation routes

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { SparkSchool, SparkStudent, SparkLead, SparkClass, SparkRevenue, SparkHealthScore, SparkAiCall } = models;

  // GET /api/v1/dashboard - Get complete dashboard data for a school
  router.get('/', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch all dashboard data in parallel
      const [
        school,
        latestHealthScore,
        studentStats,
        leadStats,
        revenueThisMonth,
        recentCalls,
        atRiskStudents,
        hotLeads,
        followUpLeads
      ] = await Promise.all([
        // School info
        SparkSchool.findByPk(school_id),

        // Latest health score
        SparkHealthScore.findOne({
          where: { school_id },
          order: [['date', 'DESC']]
        }),

        // Student stats
        Promise.all([
          SparkStudent.count({ where: { school_id } }),
          SparkStudent.count({ where: { school_id, status: 'active' } }),
          SparkStudent.count({ where: { school_id, churn_risk: { [Op.in]: ['high', 'critical'] } } })
        ]),

        // Lead stats
        Promise.all([
          SparkLead.count({ where: { school_id, status: { [Op.notIn]: ['converted', 'lost'] } } }),
          SparkLead.count({ where: { school_id, temperature: 'hot' } }),
          SparkLead.count({ where: { school_id, created_at: { [Op.gte]: sevenDaysAgo } } })
        ]),

        // Revenue this month
        SparkRevenue.sum('amount', {
          where: {
            school_id,
            date: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), 1) }
          }
        }),

        // Recent AI calls
        SparkAiCall.findAll({
          where: { school_id },
          order: [['created_at', 'DESC']],
          limit: 5
        }),

        // At-risk students
        SparkStudent.findAll({
          where: {
            school_id,
            status: 'active',
            churn_risk: { [Op.in]: ['high', 'critical'] }
          },
          order: [['churn_risk_score', 'DESC']],
          limit: 5,
          attributes: ['id', 'first_name', 'last_name', 'churn_risk', 'churn_risk_score', 'last_attendance']
        }),

        // Hot leads
        SparkLead.findAll({
          where: {
            school_id,
            temperature: 'hot',
            status: { [Op.notIn]: ['converted', 'lost'] }
          },
          order: [['lead_score', 'DESC']],
          limit: 5,
          attributes: ['id', 'first_name', 'last_name', 'phone', 'lead_score', 'status']
        }),

        // Leads needing follow-up
        SparkLead.findAll({
          where: {
            school_id,
            follow_up_date: { [Op.lte]: today },
            status: { [Op.notIn]: ['converted', 'lost'] }
          },
          order: [['follow_up_date', 'ASC']],
          limit: 5,
          attributes: ['id', 'first_name', 'last_name', 'phone', 'follow_up_date', 'status']
        })
      ]);

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      res.json({
        success: true,
        data: {
          school: {
            id: school.id,
            name: school.name,
            plan_type: school.plan_type,
            voice_agent: school.voice_agent
          },
          health: latestHealthScore ? {
            overall_score: latestHealthScore.overall_score,
            grade: latestHealthScore.grade,
            retention_score: latestHealthScore.retention_score,
            revenue_score: latestHealthScore.revenue_score,
            lead_score: latestHealthScore.lead_score,
            vs_last_week: latestHealthScore.vs_last_week,
            insights: latestHealthScore.insights?.slice(0, 3) || [],
            alerts: latestHealthScore.alerts?.slice(0, 3) || []
          } : null,
          students: {
            total: studentStats[0],
            active: studentStats[1],
            at_risk: studentStats[2]
          },
          leads: {
            active: leadStats[0],
            hot: leadStats[1],
            new_this_week: leadStats[2]
          },
          revenue: {
            this_month: revenueThisMonth || 0,
            target: school.monthly_revenue_target || 0,
            progress: school.monthly_revenue_target > 0
              ? ((revenueThisMonth || 0) / school.monthly_revenue_target * 100).toFixed(1)
              : 0
          },
          lists: {
            at_risk_students: atRiskStudents,
            hot_leads: hotLeads,
            follow_up_needed: followUpLeads,
            recent_ai_calls: recentCalls
          }
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/dashboard/trends - Get trend data for charts
  router.get('/trends', async (req, res) => {
    try {
      const { school_id, days = 30 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      // Get health score trends
      const healthTrends = await SparkHealthScore.findAll({
        where: {
          school_id,
          date: { [Op.gte]: startDate }
        },
        order: [['date', 'ASC']],
        attributes: ['date', 'overall_score', 'retention_score', 'revenue_score', 'lead_score']
      });

      // Get revenue by day
      const revenueTrends = await SparkRevenue.findAll({
        where: {
          school_id,
          date: { [Op.gte]: startDate }
        },
        attributes: [
          'date',
          [models.sequelize.fn('SUM', models.sequelize.col('amount')), 'total']
        ],
        group: ['date'],
        order: [['date', 'ASC']]
      });

      res.json({
        success: true,
        data: {
          health: healthTrends,
          revenue: revenueTrends
        }
      });
    } catch (error) {
      console.error('Error fetching trends:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
