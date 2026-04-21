'use strict';
const router = require('express').Router();
const path = require('path');
const fs = require('fs');

// Lazy-load services
let annualReportIngester, cmsClient, dollarizationEngine;
try { annualReportIngester = require('../services/annual-report-ingester'); } catch (e) { console.log('  Annual report ingester not loaded:', e.message); }
try { cmsClient = require('../services/cms-hospital-compare'); } catch (e) { console.log('  CMS client not loaded:', e.message); }
try { dollarizationEngine = require('../services/clinical-dollarization'); } catch (e) {}

// Simple file upload handler (multer alternative -- handle multipart manually)
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// POST /api/v1/intelligence/:projectId/annual-report/upload -- PDF upload
router.post('/:projectId/annual-report/upload', async (req, res) => {
  try {
    if (!annualReportIngester) return res.status(500).json({ error: 'Annual report ingester not available' });
    const { IntuitiveHospitalReport, IntuitiveProject } = req.models;
    const project = await IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Accept raw body as PDF buffer or JSON with base64
    let buffer, filename;
    if (req.headers['content-type']?.includes('application/pdf')) {
      buffer = await parseMultipart(req);
      filename = 'uploaded.pdf';
    } else if (req.body?.file_base64) {
      buffer = Buffer.from(req.body.file_base64, 'base64');
      filename = req.body.filename || 'uploaded.pdf';
    } else {
      return res.status(400).json({ error: 'Send PDF as raw body (Content-Type: application/pdf) or as JSON { file_base64, filename }' });
    }

    const result = await annualReportIngester.ingestFromBuffer(buffer, filename);

    const report = await IntuitiveHospitalReport.create({
      project_id: project.id,
      report_type: 'uploaded_pdf',
      file_path: filename,
      raw_text: (result.raw_text || '').substring(0, 50000),
      extracted_procedures: result.extracted_procedures || [],
      extraction_confidence: result.extraction_confidence || 0,
      ingested_at: new Date()
    });

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/intelligence/:projectId/annual-report/url -- Ingest from URL
router.post('/:projectId/annual-report/url', async (req, res) => {
  try {
    if (!annualReportIngester) return res.status(500).json({ error: 'Annual report ingester not available' });
    const { IntuitiveHospitalReport, IntuitiveProject } = req.models;
    const project = await IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const result = await annualReportIngester.ingestFromUrl(url);

    const report = await IntuitiveHospitalReport.create({
      project_id: project.id,
      report_type: 'annual_report',
      source_url: url,
      raw_text: (result.raw_text || '').substring(0, 50000),
      extracted_procedures: result.extracted_procedures || [],
      extraction_confidence: result.extraction_confidence || 0,
      ingested_at: new Date()
    });

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/intelligence/:projectId/annual-report -- Retrieve parsed data
router.get('/:projectId/annual-report', async (req, res) => {
  try {
    const { IntuitiveHospitalReport } = req.models;
    const reports = await IntuitiveHospitalReport.findAll({
      where: { project_id: req.params.projectId },
      order: [['ingested_at', 'DESC']]
    });
    res.json({ success: true, data: reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/intelligence/:projectId/cms/fetch -- Trigger CMS lookup
router.post('/:projectId/cms/fetch', async (req, res) => {
  try {
    if (!cmsClient) return res.status(500).json({ error: 'CMS client not available' });
    const { IntuitiveCMSMetrics, IntuitiveProject } = req.models;
    const project = await IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const hospitalName = req.body.hospital_name || project.hospital_name;
    const state = req.body.state || project.state;

    const result = await cmsClient.fetchAllForHospital(hospitalName, state);

    if (!result || !result.metrics || result.metrics.length === 0) {
      return res.json({ success: true, data: { provider: result?.provider || null, metrics: [], message: 'No CMS metrics found for this hospital' } });
    }

    // Delete old metrics for this project
    await IntuitiveCMSMetrics.destroy({ where: { project_id: project.id } });

    // Insert new metrics
    const created = [];
    for (const m of result.metrics) {
      const row = await IntuitiveCMSMetrics.create({
        project_id: project.id,
        cms_provider_id: result.provider?.provider_id || null,
        measure_id: m.measure_id,
        measure_name: m.measure_name,
        measure_category: m.category,
        score: m.score,
        national_avg: m.national_avg,
        comparison: m.comparison,
        reporting_period: m.reporting_period,
        fetched_at: new Date()
      });
      created.push(row);
    }

    res.json({ success: true, data: { provider: result.provider, metrics: created, count: created.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/intelligence/:projectId/cms -- Retrieve CMS metrics
router.get('/:projectId/cms', async (req, res) => {
  try {
    const { IntuitiveCMSMetrics } = req.models;
    const metrics = await IntuitiveCMSMetrics.findAll({
      where: { project_id: req.params.projectId },
      order: [['measure_category', 'ASC'], ['measure_name', 'ASC']]
    });
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/intelligence/:projectId/outcome-savings/compute -- Run dollarizer
router.post('/:projectId/outcome-savings/compute', async (req, res) => {
  try {
    if (!dollarizationEngine) return res.status(500).json({ error: 'Dollarization engine not available' });
    const { IntuitiveProject, IntuitiveClinicalOutcome, IntuitiveBusinessPlan, IntuitiveHospitalReport } = req.models;
    const project = await IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Build hospital case data from annual report or project data
    const reports = await IntuitiveHospitalReport.findAll({ where: { project_id: project.id }, order: [['ingested_at', 'DESC']], limit: 1 });
    const report = reports[0];

    const hospitalCaseData = {};
    if (report && report.extracted_procedures && report.extracted_procedures.length > 0) {
      // Use extracted procedures from annual report
      for (const proc of report.extracted_procedures) {
        const total = (proc.open_count || 0) + (proc.lap_count || 0) + (proc.robotic_count || 0) || proc.total_count || 0;
        if (total > 0) {
          const spec = mapProcedureToSpecialty(proc.procedure);
          if (!hospitalCaseData[spec]) hospitalCaseData[spec] = { annual_cases: 0, open_pct: 0, lap_pct: 0, robotic_pct: 0, _open: 0, _lap: 0, _robotic: 0 };
          hospitalCaseData[spec].annual_cases += total;
          hospitalCaseData[spec]._open += (proc.open_count || 0);
          hospitalCaseData[spec]._lap += (proc.lap_count || 0);
          hospitalCaseData[spec]._robotic += (proc.robotic_count || 0);
        }
      }
      // Calculate percentages
      for (const spec of Object.keys(hospitalCaseData)) {
        const d = hospitalCaseData[spec];
        const total = d.annual_cases || 1;
        d.open_pct = Math.round((d._open / total) * 100);
        d.lap_pct = Math.round((d._lap / total) * 100);
        d.robotic_pct = Math.round((d._robotic / total) * 100);
        if (d.open_pct + d.lap_pct + d.robotic_pct !== 100) d.open_pct += (100 - d.open_pct - d.lap_pct - d.robotic_pct);
        delete d._open; delete d._lap; delete d._robotic;
      }
    } else {
      // Fallback to project specialty mix
      const specMap = { urology: project.specialty_urology, gynecology: project.specialty_gynecology, general_surgery: project.specialty_general, thoracic: project.specialty_thoracic, colorectal: project.specialty_colorectal, ent_head_neck: project.specialty_head_neck, cardiac: project.specialty_cardiac };
      const currentRoboticPct = project.annual_surgical_volume > 0 ? Math.round(((project.current_robotic_cases || 0) / project.annual_surgical_volume) * 100) : 5;
      for (const [spec, pct] of Object.entries(specMap)) {
        if (pct > 0) {
          const cases = Math.round((project.annual_surgical_volume || 0) * pct / 100);
          hospitalCaseData[spec] = { annual_cases: cases, open_pct: Math.max(0, 100 - currentRoboticPct * 2 - 30), lap_pct: 30, robotic_pct: Math.min(100, currentRoboticPct * 2) };
          const total = hospitalCaseData[spec].open_pct + hospitalCaseData[spec].lap_pct + hospitalCaseData[spec].robotic_pct;
          if (total !== 100) hospitalCaseData[spec].open_pct += (100 - total);
        }
      }
    }

    const results = dollarizationEngine.calculateDollarization(hospitalCaseData, req.body.options || {});

    // Find or create business plan to attach outcome
    let plan = await IntuitiveBusinessPlan.findOne({ where: { project_id: project.id }, order: [['created_at', 'DESC']] });

    if (plan) {
      const [outcome, created] = await IntuitiveClinicalOutcome.findOrCreate({
        where: { business_plan_id: plan.id },
        defaults: {
          project_id: project.id, business_plan_id: plan.id,
          hospital_case_data: hospitalCaseData, dollarization_results: results,
          total_clinical_savings_annual: results.total_clinical_savings_annual || 0,
          citations: results.all_citations || [], computed_at: new Date()
        }
      });
      if (!created) await outcome.update({ hospital_case_data: hospitalCaseData, dollarization_results: results, total_clinical_savings_annual: results.total_clinical_savings_annual || 0, citations: results.all_citations || [], computed_at: new Date() });

      await plan.update({ total_clinical_outcome_savings: results.total_clinical_savings_annual || 0, total_combined_roi: (parseFloat(plan.total_incremental_revenue) || 0) + (results.total_clinical_savings_annual || 0) });
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/intelligence/:projectId/outcome-savings
router.get('/:projectId/outcome-savings', async (req, res) => {
  try {
    const { IntuitiveClinicalOutcome } = req.models;
    const outcomes = await IntuitiveClinicalOutcome.findAll({
      where: { project_id: req.params.projectId },
      order: [['computed_at', 'DESC']]
    });
    res.json({ success: true, data: outcomes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: map procedure name to specialty key
function mapProcedureToSpecialty(procedureName) {
  const name = (procedureName || '').toLowerCase();
  if (name.includes('prostat') || name.includes('nephr') || name.includes('cystect') || name.includes('pyelo') || name.includes('ureter')) return 'urology';
  if (name.includes('hysterect') || name.includes('myomect') || name.includes('sacrocol') || name.includes('endometri') || name.includes('oophor')) return 'gynecology';
  if (name.includes('colon') || name.includes('colect') || name.includes('rectal') || name.includes('rectopexy') || name.includes('anterior resection')) return 'colorectal';
  if (name.includes('lobect') || name.includes('segmentect') || name.includes('thymect') || name.includes('thorac')) return 'thoracic';
  if (name.includes('mitral') || name.includes('cabg') || name.includes('cardiac') || name.includes('valve')) return 'cardiac';
  if (name.includes('tors') || name.includes('oropharyn') || name.includes('tongue') || name.includes('thyroid')) return 'ent_head_neck';
  if (name.includes('liver') || name.includes('hepat') || name.includes('pancrea') || name.includes('whipple')) return 'hepatobiliary';
  return 'general_surgery';
}

module.exports = router;
