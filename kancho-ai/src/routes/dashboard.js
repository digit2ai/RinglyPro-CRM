// kancho-ai/src/routes/dashboard.js
// Dashboard aggregation routes for Kancho AI

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { KanchoSchool, KanchoStudent, KanchoLead, KanchoClass, KanchoRevenue, KanchoHealthScore, KanchoAiCall, KanchoBusinessHealthMetrics } = models;

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
        latestKPIMetrics,
        studentStats,
        leadStats,
        revenueThisMonth,
        recentCalls,
        atRiskStudents,
        hotLeads,
        followUpLeads
      ] = await Promise.all([
        // School info
        KanchoSchool.findByPk(school_id),

        // Latest health score
        KanchoHealthScore.findOne({
          where: { school_id },
          order: [['date', 'DESC']]
        }),

        // Latest KPI metrics (from BusinessHealthMetrics)
        KanchoBusinessHealthMetrics ? KanchoBusinessHealthMetrics.findOne({
          where: { school_id },
          order: [['report_month', 'DESC']]
        }) : Promise.resolve(null),

        // Student stats
        Promise.all([
          KanchoStudent.count({ where: { school_id } }),
          KanchoStudent.count({ where: { school_id, status: 'active' } }),
          KanchoStudent.count({ where: { school_id, churn_risk: { [Op.in]: ['high', 'critical'] } } })
        ]),

        // Lead stats
        Promise.all([
          KanchoLead.count({ where: { school_id, status: { [Op.notIn]: ['converted', 'lost'] } } }),
          KanchoLead.count({ where: { school_id, temperature: 'hot' } }),
          KanchoLead.count({ where: { school_id, created_at: { [Op.gte]: sevenDaysAgo } } })
        ]),

        // Revenue this month
        KanchoRevenue.sum('amount', {
          where: {
            school_id,
            date: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), 1) }
          }
        }),

        // Recent AI calls
        KanchoAiCall.findAll({
          where: { school_id },
          order: [['created_at', 'DESC']],
          limit: 5
        }),

        // At-risk students
        KanchoStudent.findAll({
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
        KanchoLead.findAll({
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
        KanchoLead.findAll({
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

      // Calculate revenue at risk and growth potential
      const avgRevenuePerStudent = 175; // Default ARPS if not calculated
      const arps = latestKPIMetrics?.arps || avgRevenuePerStudent;
      const revenueAtRisk = studentStats[2] * arps;
      const growthPotential = leadStats[1] * arps;

      res.json({
        success: true,
        data: {
          school: {
            id: school.id,
            name: school.name,
            plan_type: school.plan_type,
            voice_agent: school.voice_agent,
            martial_art_type: school.martial_art_type
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
          // KPI Metrics section for dashboard cards
          kpi: latestKPIMetrics ? {
            report_month: latestKPIMetrics.report_month,
            health_score: latestKPIMetrics.health_score,
            health_grade: latestKPIMetrics.health_grade,
            active_students: latestKPIMetrics.active_students,
            net_student_growth: latestKPIMetrics.net_student_growth,
            churn_rate: latestKPIMetrics.churn_rate,
            arps: latestKPIMetrics.arps,
            trial_conversion_rate: latestKPIMetrics.trial_conversion_rate,
            revenue_at_risk: latestKPIMetrics.revenue_at_risk,
            students_at_risk: latestKPIMetrics.students_at_risk,
            growth_potential: latestKPIMetrics.growth_potential,
            hot_leads: latestKPIMetrics.hot_leads,
            monthly_revenue: latestKPIMetrics.monthly_revenue,
            revenue_vs_target_percent: latestKPIMetrics.revenue_vs_target_percent
          } : {
            // Fallback calculated values if no KPI record exists
            health_score: latestHealthScore?.overall_score || 0,
            health_grade: latestHealthScore?.grade || 'N/A',
            active_students: studentStats[1],
            students_at_risk: studentStats[2],
            revenue_at_risk: revenueAtRisk,
            hot_leads: leadStats[1],
            growth_potential: growthPotential,
            monthly_revenue: revenueThisMonth || 0,
            revenue_vs_target_percent: school.monthly_revenue_target > 0
              ? ((revenueThisMonth || 0) / school.monthly_revenue_target * 100)
              : 0
          },
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
            percent: school.monthly_revenue_target > 0
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
      const healthTrends = await KanchoHealthScore.findAll({
        where: {
          school_id,
          date: { [Op.gte]: startDate }
        },
        order: [['date', 'ASC']],
        attributes: ['date', 'overall_score', 'retention_score', 'revenue_score', 'lead_score']
      });

      // Get revenue by day
      const revenueTrends = await KanchoRevenue.findAll({
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
