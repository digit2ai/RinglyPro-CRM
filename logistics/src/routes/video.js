'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { generateVideoProposal } = require('../services/video-generator');

// In-memory job tracker (simple — could use Redis for production)
const videoJobs = new Map();

/**
 * POST /api/v1/video/:projectId/generate
 * Start video proposal generation in background
 */
router.post('/:projectId/generate', async (req, res) => {
  const { projectId } = req.params;

  // Check if already generating
  const existing = videoJobs.get(projectId);
  if (existing && existing.status === 'generating') {
    return res.json({
      success: true,
      data: { status: 'generating', step: existing.step, detail: existing.detail }
    });
  }

  // Start generation in background
  const job = { status: 'generating', step: 'init', detail: 'Starting...', startedAt: new Date() };
  videoJobs.set(projectId, job);

  res.json({
    success: true,
    data: { status: 'generating', message: 'Video generation started. Poll /status for progress.' }
  });

  // Background generation
  try {
    const models = req.models;
    const result = await generateVideoProposal(projectId, models, (step, detail) => {
      job.step = step;
      job.detail = detail;
    });

    job.status = 'completed';
    job.step = 'done';
    job.detail = `Video ready: ${(result.size / 1024 / 1024).toFixed(1)} MB`;
    job.result = result;
    job.completedAt = new Date();
  } catch (error) {
    console.error(`[VideoGen] Error for project ${projectId}:`, error);
    job.status = 'error';
    job.step = 'error';
    job.detail = error.message;
  }
});

/**
 * GET /api/v1/video/:projectId/status
 * Check video generation progress
 */
router.get('/:projectId/status', (req, res) => {
  const { projectId } = req.params;
  const job = videoJobs.get(projectId);

  if (!job) {
    return res.json({ success: true, data: { status: 'none', message: 'No video generation in progress.' } });
  }

  const response = {
    status: job.status,
    step: job.step,
    detail: job.detail,
    startedAt: job.startedAt
  };

  if (job.status === 'completed' && job.result) {
    response.filename = job.result.filename;
    response.size = job.result.size;
    response.duration = job.result.duration;
    response.completedAt = job.completedAt;
    response.downloadUrl = `/pinaxis/api/v1/video/${projectId}/download`;
  }

  res.json({ success: true, data: response });
});

/**
 * GET /api/v1/video/:projectId/download
 * Download the generated MP4 file
 */
router.get('/:projectId/download', (req, res) => {
  const { projectId } = req.params;
  const job = videoJobs.get(projectId);

  if (!job || job.status !== 'completed' || !job.result) {
    return res.status(404).json({ success: false, error: 'No video available. Generate one first.' });
  }

  const filePath = job.result.path;
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Video file not found. It may have been cleaned up.' });
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${job.result.filename}"`);
  res.setHeader('Content-Length', job.result.size);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', (err) => {
    console.error('[VideoGen] Download stream error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Stream error' });
  });
});

module.exports = router;
