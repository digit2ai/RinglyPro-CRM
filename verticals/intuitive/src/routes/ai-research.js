'use strict';
const router = require('express').Router();

// In-memory job tracking for async research
const researchJobs = {};

// POST /api/v1/ai-research/generate - Start AI research pipeline
router.post('/generate', async (req, res) => {
  try {
    const { hospital_name } = req.body;
    if (!hospital_name || hospital_name.trim().length < 2) {
      return res.status(400).json({ error: 'hospital_name is required (min 2 characters)' });
    }

    const jobId = 'research-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    researchJobs[jobId] = {
      status: 'running',
      hospital_name: hospital_name.trim(),
      started_at: new Date().toISOString(),
      progress: [],
      result: null,
      error: null
    };

    res.json({ success: true, job_id: jobId, message: 'Research pipeline started for: ' + hospital_name.trim() });

    // Run pipeline async
    const { runFullPipeline } = require('../services/hospital-research-agent');
    setImmediate(async () => {
      try {
        const result = await runFullPipeline(hospital_name.trim(), req.models, (msg) => {
          if (researchJobs[jobId]) {
            researchJobs[jobId].progress.push({ message: msg, timestamp: new Date().toISOString() });
          }
        });

        researchJobs[jobId].status = 'completed';
        researchJobs[jobId].result = {
          project_id: result.project.id,
          project_code: result.project.project_code,
          hospital_name: result.project.hospital_name,
          business_plan_id: result.businessPlan.id,
          survey_id: result.survey.id,
          recommended_system: result.analysis?.model_matching?.primary_recommendation?.system || 'N/A',
          fit_score: result.analysis?.model_matching?.primary_recommendation?.score || 0,
          clinical_savings: result.businessPlan.total_clinical_outcome_savings || 0,
          research: result.research
        };
        researchJobs[jobId].completed_at = new Date().toISOString();
      } catch (err) {
        console.error('AI Research pipeline error:', err);
        researchJobs[jobId].status = 'error';
        researchJobs[jobId].error = err.message;
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/ai-research/status/:jobId - Poll job status
router.get('/status/:jobId', (req, res) => {
  const job = researchJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({
    success: true,
    data: {
      status: job.status,
      hospital_name: job.hospital_name,
      started_at: job.started_at,
      completed_at: job.completed_at || null,
      progress: job.progress,
      result: job.result,
      error: job.error
    }
  });
});

// POST /api/v1/ai-research/research-only - Research without creating project
router.post('/research-only', async (req, res) => {
  try {
    const { hospital_name } = req.body;
    if (!hospital_name) return res.status(400).json({ error: 'hospital_name required' });

    const { researchHospital } = require('../services/hospital-research-agent');
    const profile = await researchHospital(hospital_name.trim());
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
