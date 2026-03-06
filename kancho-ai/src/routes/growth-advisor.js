'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) {}
const KanchoGrowthAdvisor = require('../../services/kancho-growth-advisor');

// GET / - Get AI growth insights for a school
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const advisor = new KanchoGrowthAdvisor(kanchoModels);
    const report = await advisor.generateInsights(parseInt(schoolId));

    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /voice-summary - Get insights as voice-friendly text for AI agent
router.get('/voice-summary', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const advisor = new KanchoGrowthAdvisor(kanchoModels);
    const report = await advisor.generateInsights(parseInt(schoolId));

    const m = report.metrics;
    let summary = `Here's your growth report for ${report.schoolName}. `;
    summary += `You have ${m.activeStudents} active students and $${m.revenueThisMonth} in revenue this month`;
    if (m.revenueGrowth !== 0) summary += `, which is ${m.revenueGrowth > 0 ? 'up' : 'down'} ${Math.abs(m.revenueGrowth)}% from last month`;
    summary += '. ';

    if (report.insights.length > 0) {
      summary += `I have ${report.insights.length} insight${report.insights.length > 1 ? 's' : ''} for you. `;
      const top = report.insights.slice(0, 3);
      top.forEach((insight, i) => {
        summary += `${i + 1}: ${insight.title}. ${insight.message} `;
      });
    } else {
      summary += 'Everything looks healthy. Keep up the great work!';
    }

    res.json({ success: true, data: { summary, insights_count: report.insights.length, metrics: report.metrics } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
