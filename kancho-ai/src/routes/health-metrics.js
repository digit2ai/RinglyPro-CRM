// kancho-ai/src/routes/health-metrics.js
// Business Health Metrics and KPI API endpoints for Kancho AI

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { KanchoSchool, KanchoStudent, KanchoLead, KanchoRevenue, KanchoBusinessHealthMetrics } = models;

  /**
   * Calculate health grade from score
   */
  const calculateGrade = (score) => {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
  };

  /**
   * Get health description for voice responses
   */
  const getHealthDescription = (score) => {
    if (score >= 80) return 'strong and healthy';
    if (score >= 60) return 'stable but with some risks';
    return 'at risk and needs attention';
  };

  /**
   * Calculate comprehensive health score from component metrics
   */
  const calculateHealthScore = (metrics) => {
    // Weight distribution:
    // - Churn rate: 25%
    // - Revenue performance: 25%
    // - Lead conversion: 20%
    // - Growth: 15%
    // - Student engagement: 15%

    let score = 0;

    // Churn rate score (lower is better)
    // 0% churn = 100 points, 20%+ churn = 0 points
    const churnScore = Math.max(0, 100 - (metrics.churn_rate * 5));
    score += churnScore * 0.25;

    // Revenue performance score
    const revenueScore = Math.min(100, metrics.revenue_vs_target_percent);
    score += revenueScore * 0.25;

    // Trial conversion score
    // 80%+ conversion = 100 points, 0% = 0 points
    const conversionScore = Math.min(100, (metrics.trial_conversion_rate / 80) * 100);
    score += conversionScore * 0.20;

    // Growth score (positive growth = bonus)
    // +10 net growth = 100 points, -10 = 0 points
    const growthScore = Math.max(0, Math.min(100, 50 + (metrics.net_student_growth * 5)));
    score += growthScore * 0.15;

    // Engagement score (based on at-risk ratio)
    // 0% at-risk = 100 points, 30%+ at-risk = 0 points
    const atRiskRatio = metrics.students_at_risk / Math.max(1, metrics.active_students);
    const engagementScore = Math.max(0, 100 - (atRiskRatio * 333));
    score += engagementScore * 0.15;

    return Math.round(score);
  };

  // =====================================================
  // GET /api/v1/health-metrics - Get all metrics for a school
  // =====================================================
  router.get('/', async (req, res) => {
    try {
      const { school_id, limit = 12 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const metrics = await KanchoBusinessHealthMetrics.findAll({
        where: { school_id },
        order: [['report_month', 'DESC']],
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('[HealthMetrics] GET error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // GET /api/v1/health-metrics/latest - Get latest month metrics (for voice agent)
  // =====================================================
  router.get('/latest', async (req, res) => {
    try {
      const { school_id, format = 'json' } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const metrics = await KanchoBusinessHealthMetrics.findOne({
        where: { school_id },
        order: [['report_month', 'DESC']]
      });

      if (!metrics) {
        return res.status(404).json({
          error: 'No metrics found for this school. Please generate metrics first.'
        });
      }

      // If format=voice, return natural language summary
      if (format === 'voice') {
        const healthDesc = getHealthDescription(metrics.health_score);

        let voiceResponse = `Your business health score is ${metrics.health_score} out of 100, which is a grade ${metrics.health_grade}. `;
        voiceResponse += `This means your business is ${healthDesc}. `;

        if (metrics.students_at_risk > 0) {
          voiceResponse += `There are ${metrics.students_at_risk} students at risk, representing about $${Math.round(metrics.revenue_at_risk).toLocaleString()} in revenue. `;
        }

        if (metrics.hot_leads > 0) {
          voiceResponse += `On the positive side, you have ${metrics.hot_leads} hot leads worth around $${Math.round(metrics.growth_potential).toLocaleString()} in potential growth. `;
        }

        voiceResponse += `Monthly revenue is at $${Math.round(metrics.monthly_revenue).toLocaleString()}, which is ${Math.round(metrics.revenue_vs_target_percent)} percent of your target.`;

        return res.json({
          success: true,
          voice_response: voiceResponse,
          data: metrics
        });
      }

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('[HealthMetrics] GET latest error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // GET /api/v1/health-metrics/:month - Get metrics for a specific month
  // =====================================================
  router.get('/:month', async (req, res) => {
    try {
      const { school_id } = req.query;
      const { month } = req.params; // YYYY-MM format

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const metrics = await KanchoBusinessHealthMetrics.findOne({
        where: { school_id, report_month: month }
      });

      if (!metrics) {
        return res.status(404).json({ error: `No metrics found for ${month}` });
      }

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('[HealthMetrics] GET month error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // POST /api/v1/health-metrics - Store monthly KPI snapshot
  // =====================================================
  router.post('/', async (req, res) => {
    try {
      const { school_id, report_month, ...metrics } = req.body;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      // Use current month if not specified
      const month = report_month || new Date().toISOString().slice(0, 7);

      // Calculate health score if not provided
      const healthScore = metrics.health_score || calculateHealthScore(metrics);
      const healthGrade = metrics.health_grade || calculateGrade(healthScore);

      // Upsert the metrics (update if exists, create if not)
      const [record, created] = await KanchoBusinessHealthMetrics.upsert({
        school_id,
        report_month: month,
        ...metrics,
        health_score: healthScore,
        health_grade: healthGrade,
        calculated_at: new Date(),
        updated_at: new Date()
      });

      console.log(`[HealthMetrics] ${created ? 'Created' : 'Updated'} metrics for school ${school_id}, month ${month}`);

      res.status(created ? 201 : 200).json({
        success: true,
        created,
        data: record
      });
    } catch (error) {
      console.error('[HealthMetrics] POST error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // POST /api/v1/health-metrics/calculate - Auto-calculate metrics from existing data
  // =====================================================
  router.post('/calculate', async (req, res) => {
    try {
      const { school_id, report_month } = req.body;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const month = report_month || new Date().toISOString().slice(0, 7);
      const [year, monthNum] = month.split('-').map(Number);

      // Calculate date ranges
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
      const prevMonthStart = new Date(year, monthNum - 2, 1);
      const prevMonthEnd = new Date(year, monthNum - 1, 0, 23, 59, 59);

      // Fetch school data
      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      // Calculate all metrics in parallel
      const [
        activeStudents,
        atRiskStudents,
        newStudents,
        cancelledStudents,
        startOfMonthStudents,
        hotLeads,
        trialsStarted,
        trialsConverted,
        monthlyRevenue
      ] = await Promise.all([
        // Current active students
        KanchoStudent.count({ where: { school_id, status: 'active' } }),

        // At-risk students
        KanchoStudent.count({
          where: {
            school_id,
            status: 'active',
            churn_risk: { [Op.in]: ['high', 'critical'] }
          }
        }),

        // New students this month
        KanchoStudent.count({
          where: {
            school_id,
            created_at: { [Op.between]: [monthStart, monthEnd] }
          }
        }),

        // Cancelled students this month
        KanchoStudent.count({
          where: {
            school_id,
            status: 'cancelled',
            updated_at: { [Op.between]: [monthStart, monthEnd] }
          }
        }),

        // Students at start of month (approximate)
        KanchoStudent.count({
          where: {
            school_id,
            created_at: { [Op.lt]: monthStart },
            [Op.or]: [
              { status: 'active' },
              {
                status: 'cancelled',
                updated_at: { [Op.gte]: monthStart }
              }
            ]
          }
        }),

        // Hot leads
        KanchoLead.count({
          where: {
            school_id,
            temperature: 'hot',
            status: { [Op.notIn]: ['converted', 'lost'] }
          }
        }),

        // Trials started this month
        KanchoLead.count({
          where: {
            school_id,
            status: 'trial_scheduled',
            created_at: { [Op.between]: [monthStart, monthEnd] }
          }
        }),

        // Trials converted
        KanchoLead.count({
          where: {
            school_id,
            status: 'converted',
            updated_at: { [Op.between]: [monthStart, monthEnd] }
          }
        }),

        // Monthly revenue
        KanchoRevenue.sum('amount', {
          where: {
            school_id,
            date: { [Op.between]: [monthStart, monthEnd] }
          }
        })
      ]);

      // Calculate derived metrics
      const netStudentGrowth = newStudents - cancelledStudents;
      const churnRate = startOfMonthStudents > 0
        ? ((cancelledStudents / startOfMonthStudents) * 100).toFixed(2)
        : 0;
      const arps = activeStudents > 0
        ? ((monthlyRevenue || 0) / activeStudents).toFixed(2)
        : 0;
      const trialConversionRate = trialsStarted > 0
        ? ((trialsConverted / trialsStarted) * 100).toFixed(2)
        : 0;

      // Revenue calculations
      const actualRevenue = monthlyRevenue || 0;
      const revenueTarget = school.monthly_revenue_target || actualRevenue;
      const revenueVsTargetPercent = revenueTarget > 0
        ? ((actualRevenue / revenueTarget) * 100).toFixed(2)
        : 100;

      // Risk and growth potential (using ARPS of $175 as baseline if not available)
      const avgRevPerStudent = arps > 0 ? parseFloat(arps) : 175;
      const revenueAtRisk = atRiskStudents * avgRevPerStudent;
      const growthPotential = hotLeads * avgRevPerStudent;

      // Build metrics object
      const metricsData = {
        active_students: activeStudents,
        net_student_growth: netStudentGrowth,
        churn_rate: parseFloat(churnRate),
        arps: parseFloat(arps),
        trial_conversion_rate: parseFloat(trialConversionRate),
        new_students: newStudents,
        cancelled_students: cancelledStudents,
        trials_started: trialsStarted,
        trials_converted: trialsConverted,
        students_at_risk: atRiskStudents,
        hot_leads: hotLeads,
        monthly_revenue: actualRevenue,
        monthly_revenue_target: revenueTarget,
        revenue_vs_target_percent: parseFloat(revenueVsTargetPercent),
        revenue_at_risk: revenueAtRisk,
        growth_potential: growthPotential
      };

      // Calculate health score and grade
      const healthScore = calculateHealthScore(metricsData);
      const healthGrade = calculateGrade(healthScore);

      // Upsert the metrics
      const [record, created] = await KanchoBusinessHealthMetrics.upsert({
        school_id,
        report_month: month,
        ...metricsData,
        health_score: healthScore,
        health_grade: healthGrade,
        calculated_at: new Date(),
        updated_at: new Date()
      });

      console.log(`[HealthMetrics] Auto-calculated metrics for school ${school_id}, month ${month}. Score: ${healthScore} (${healthGrade})`);

      res.json({
        success: true,
        created,
        data: record
      });
    } catch (error) {
      console.error('[HealthMetrics] Calculate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // GET /api/v1/health-metrics/voice-summary - Get voice-ready summary
  // =====================================================
  router.get('/voice-summary', async (req, res) => {
    try {
      const { school_id, language = 'en' } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const metrics = await KanchoBusinessHealthMetrics.findOne({
        where: { school_id },
        order: [['report_month', 'DESC']]
      });

      if (!metrics) {
        const noDataResponse = language === 'es'
          ? 'No tengo métricas de salud del negocio disponibles todavía. ¿Le gustaría que las calcule ahora?'
          : 'I don\'t have business health metrics available yet. Would you like me to calculate them now?';

        return res.json({
          success: true,
          has_data: false,
          voice_response: noDataResponse
        });
      }

      const healthDesc = getHealthDescription(metrics.health_score);

      let voiceResponse;
      if (language === 'es') {
        // Spanish response
        const healthDescEs = metrics.health_score >= 80 ? 'fuerte y saludable'
          : metrics.health_score >= 60 ? 'estable pero con algunos riesgos'
          : 'en riesgo y necesita atención';

        voiceResponse = `Su puntuación de salud del negocio es ${metrics.health_score} de 100, que es una calificación ${metrics.health_grade}. `;
        voiceResponse += `Esto significa que su negocio está ${healthDescEs}. `;

        if (metrics.students_at_risk > 0) {
          voiceResponse += `Hay ${metrics.students_at_risk} estudiantes en riesgo, representando aproximadamente $${Math.round(metrics.revenue_at_risk).toLocaleString()} en ingresos. `;
        }

        if (metrics.hot_leads > 0) {
          voiceResponse += `Por el lado positivo, tiene ${metrics.hot_leads} prospectos calientes con un potencial de $${Math.round(metrics.growth_potential).toLocaleString()} en crecimiento. `;
        }

        voiceResponse += `Los ingresos mensuales están en $${Math.round(metrics.monthly_revenue).toLocaleString()}, que es ${Math.round(metrics.revenue_vs_target_percent)} por ciento de su meta.`;
      } else {
        // English response
        voiceResponse = `Your business health score is ${metrics.health_score} out of 100, which is a grade ${metrics.health_grade}. `;
        voiceResponse += `This means your business is ${healthDesc}. `;

        if (metrics.students_at_risk > 0) {
          voiceResponse += `There are ${metrics.students_at_risk} students at risk, representing about $${Math.round(metrics.revenue_at_risk).toLocaleString()} in revenue. `;
        }

        if (metrics.hot_leads > 0) {
          voiceResponse += `On the positive side, you have ${metrics.hot_leads} hot leads worth around $${Math.round(metrics.growth_potential).toLocaleString()} in potential growth. `;
        }

        voiceResponse += `Monthly revenue is at $${Math.round(metrics.monthly_revenue).toLocaleString()}, which is ${Math.round(metrics.revenue_vs_target_percent)} percent of your target.`;
      }

      res.json({
        success: true,
        has_data: true,
        voice_response: voiceResponse,
        metrics: {
          health_score: metrics.health_score,
          health_grade: metrics.health_grade,
          students_at_risk: metrics.students_at_risk,
          revenue_at_risk: metrics.revenue_at_risk,
          hot_leads: metrics.hot_leads,
          growth_potential: metrics.growth_potential,
          monthly_revenue: metrics.monthly_revenue,
          revenue_vs_target_percent: metrics.revenue_vs_target_percent
        }
      });
    } catch (error) {
      console.error('[HealthMetrics] Voice summary error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // DELETE /api/v1/health-metrics/:month - Delete metrics for a month
  // =====================================================
  router.delete('/:month', async (req, res) => {
    try {
      const { school_id } = req.query;
      const { month } = req.params;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const deleted = await KanchoBusinessHealthMetrics.destroy({
        where: { school_id, report_month: month }
      });

      if (deleted === 0) {
        return res.status(404).json({ error: `No metrics found for ${month}` });
      }

      res.json({
        success: true,
        message: `Deleted metrics for ${month}`
      });
    } catch (error) {
      console.error('[HealthMetrics] DELETE error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
