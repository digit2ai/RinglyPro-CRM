'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// In-memory job tracker
const proposalJobs = new Map();

// Directory for generated audio files
const AUDIO_DIR = path.join(__dirname, '../../proposal-audio');

/**
 * Generate TTS audio via ElevenLabs
 */
function generateTTS(text, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.65, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 0.85 }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey, 'Accept': 'audio/mpeg' }
    }, (res) => {
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => reject(new Error(`TTS failed (${res.statusCode}): ${data}`)));
        return;
      }
      const ws = fs.createWriteStream(outputPath);
      res.pipe(ws);
      ws.on('finish', () => resolve(outputPath));
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Build narration scripts from analysis data
 */
function buildNarrationScripts(analysis, companyName) {
  const a = analysis || {};
  const ov = a.overview_kpis || {};
  const skus = ov.skus || {};
  const orders = ov.orders || {};
  const dateRange = ov.date_range || {};
  const fit = a.fit_analysis || {};
  const abc = a.abc_classification || {};
  const xyz = a.xyz_classification || {};
  const dailyPerc = a.daily_percentiles || {};
  const dailyVals = dailyPerc.daily_values || {};
  const avgDay = dailyVals.average || {};
  const p75Day = dailyVals.p75 || {};
  const maxDay = dailyVals.max || {};
  const extrap = a.extrapolation || {};
  const y5 = (extrap.projections || []).find(p => p.year === 5) || {};
  const orderStruct = a.order_structure || {};
  const fmt = n => n != null ? Number(n).toLocaleString() : 'not available';

  return [
    `Welcome to the PINAXIS Dashboard Playbook for ${companyName}. This presentation contains a comprehensive warehouse data analysis based on your actual operational data. Let's walk through the findings together.`,
    `Let's start with the data overview. We analyzed ${fmt(skus.total)} total SKUs, of which ${fmt(skus.active)} are actively moved. Your operation processed ${fmt(orders.total_orders)} orders containing ${fmt(orders.total_orderlines)} order lines, with an average of ${orders.avg_lines_per_order || 'about 10'} lines per order. The total pick unit volume is ${fmt(orders.total_units)} units. ${skus.bin_capable_pct || 0}% of your SKUs are bin-capable, indicating strong automation potential.`,
    `Now let's look at the fit analysis. Out of ${fmt(fit.total_items)} items in your master data, ${fmt(fit.items_with_dimensions)} have complete dimensions. ${fit.bins?.length ? `Using the largest PINAXIS standard bin at 600 by 400 by 450 millimeters, ${fit.bins[fit.bins.length - 1]?.fit_pct_total || 0}% of all items fit. This represents strong conveyability for automation.` : ''}`,
    `The ABC classification reveals a classic Pareto distribution with a Gini coefficient of ${abc.gini || 0}. ${abc.classes?.A ? `Your A-items represent just ${abc.classes.A.pct}% of SKUs but drive ${abc.classes.A.pct_lines || abc.classes.A.volume_pct}% of order lines.` : ''} ${abc.classes?.D ? `${fmt(abc.classes.D.count)} SKUs are dead stock with zero outbound activity.` : ''} This concentration means a small goods-to-person zone can handle the vast majority of your throughput.`,
    `The XYZ seasonality analysis shows demand patterns. ${xyz.classes?.[0] ? `${fmt(xyz.classes[0].moved_skus)} X-class items generate ${xyz.classes[0].pct_lines}% of all order lines.` : ''} The automation system needs to be optimized for consistent X items while maintaining flexibility for seasonal Z items.`,
    `Looking at the order profile. ${fmt(orderStruct.total_orders)} orders were analyzed. ${orderStruct.multi_line_pct || 0}% are multi-line orders. ${orderStruct.multi_line_pct > 50 ? 'This indicates complex fulfillment suited for zone-based automation.' : ''}`,
    `The percentile analysis. The average day processes ${fmt(avgDay.order_lines)} order lines. The 75th percentile design day is ${fmt(p75Day.order_lines)} lines per day, or ${fmt(Math.round((p75Day.order_lines || 0) / (dailyPerc.working_hours || 12)))} lines per hour. The maximum day reached ${fmt(maxDay.order_lines)} lines.`,
    `For the ${extrap.years || 5}-year growth projection at ${extrap.growth_rate_pct || 5}% annual growth. ${y5.design_day ? `By year 5, the design day increases to ${fmt(y5.design_day.order_lines)} order lines per day.` : ''} The PINAXIS solution is designed with headroom for this growth.`,
    `Based on the analysis, our product recommendation engine matches the optimal PINAXIS solutions to your warehouse profile, considering throughput, SKU characteristics, and order complexity.`,
    `The benefit projections quantify the ROI impact of automation for your operation, with data-driven savings estimates and payback period calculations.`,
    `The hourly throughput profile shows activity distribution across a 24-hour cycle. The system must sustain peak hourly rates during the busiest windows.`,
    `The top 10 SKUs by pick volume are prime candidates for goods-to-person automation zones. ${abc.top_skus?.[0] ? `The highest-frequency SKU, ${abc.top_skus[0].sku}, accounts for ${fmt(Math.round(abc.top_skus[0].picks))} picks.` : ''}`,
    `To summarize the next steps: Review concept designs, run warehouse simulations, review the commercial proposal, connect your WMS via API integration, and proceed with phased implementation. Thank you for exploring the PINAXIS Dashboard Playbook.`
  ];
}

/**
 * Build slide content for the HTML presentation
 */
function buildSlideHTML(analysis, companyName) {
  const a = analysis || {};
  const ov = a.overview_kpis || {};
  const skus = ov.skus || {};
  const orders = ov.orders || {};
  const dateRange = ov.date_range || {};
  const fit = a.fit_analysis || {};
  const abc = a.abc_classification || {};
  const xyz = a.xyz_classification || {};
  const dailyPerc = a.daily_percentiles || {};
  const dailyVals = dailyPerc.daily_values || {};
  const avgDay = dailyVals.average || {};
  const p75Day = dailyVals.p75 || {};
  const maxDay = dailyVals.max || {};
  const extrap = a.extrapolation || {};
  const y5 = (extrap.projections || []).find(p => p.year === 5) || {};
  const orderStruct = a.order_structure || {};
  const fmt = n => n != null ? Number(n).toLocaleString() : '—';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const metric = (label, value, color = '#3b82f6') => `<div class="metric"><div class="metric-value" style="color:${color}">${esc(String(value))}</div><div class="metric-label">${esc(label)}</div></div>`;

  return [
    // Slide 0: Title
    { title: 'PINAXIS Dashboard Playbook', html: `
      <div style="text-align:center;padding:60px 0">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="PINAXIS" style="width:120px;height:120px;border-radius:16px;margin-bottom:30px">
        <h1 style="font-size:48px;margin:0;color:#f8fafc">${esc(companyName)}</h1>
        <p style="color:#94a3b8;margin-top:12px;font-size:20px">Warehouse Data Analysis & Automation Proposal</p>
        <p style="color:#64748b;margin-top:8px">${dateRange.from || ''} to ${dateRange.to || ''} · ${dailyPerc.days || ''} operating days</p>
        <div style="margin-top:40px;display:inline-flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:#10b981;animation:pulse 2s infinite"></div><span style="color:#10b981;font-size:14px">Rachel Voice AI — Auto-narrating</span></div>
      </div>` },
    // Slide 1: Data Overview
    { title: 'Data Analysis — Gaining Valuable Insights', html: `
      <div class="metrics-grid">${metric('Total SKUs', fmt(skus.total))}${metric('Moved SKUs', fmt(skus.active))}${metric('Total Orders', fmt(orders.total_orders))}${metric('Order Lines', fmt(orders.total_orderlines))}</div>
      <div class="metrics-grid">${metric('Pick Units', fmt(orders.total_units), '#10b981')}${metric('Avg Lines/Order', orders.avg_lines_per_order || '—', '#10b981')}${metric('Bin Capable', (skus.bin_capable_pct || '—') + '%', '#10b981')}</div>
      ${(ov.by_order_type || []).length ? `<div class="info-box"><strong>Order Types:</strong> ${(ov.by_order_type || []).map(d => `${d.name} ${d.pct_units}%`).join(' · ')}</div>` : ''}
      ${(ov.by_temperature || []).length ? `<div class="info-box"><strong>Temperature:</strong> ${(ov.by_temperature || []).map(d => `${d.name} ${d.pct_units}%`).join(' · ')}</div>` : ''}` },
    // Slide 2: Fit/No-Fit
    { title: 'Fit / No-Fit Analysis', html: `
      <div class="metrics-grid">${metric('Total Items', fmt(fit.total_items))}${metric('With Dimensions', fmt(fit.items_with_dimensions))}${metric('Missing Dims', fmt(fit.items_without_dimensions), '#eab308')}${metric('Bin Capable', (fit.overall_bin_capable_pct || '—') + '%', '#10b981')}</div>
      ${(fit.bins || []).map(b => `<div class="info-box">Bin <strong>${b.name}</strong> mm: ${fmt(b.fit_count)} fit (${b.fit_pct_total}% of total)</div>`).join('')}` },
    // Slide 3: ABC
    { title: 'ABC Classification', html: `
      <div class="metrics-grid">${Object.entries(abc.classes || {}).map(([cls, d]) => {
        const colors = { A: '#10b981', B: '#eab308', C: '#94a3b8', D: '#ef4444' };
        const labels = { A: 'Fast Movers', B: 'Medium', C: 'Slow', D: 'Dead Stock' };
        return metric(`${cls} — ${labels[cls]}`, `${fmt(d.count)} (${d.pct}%)`, colors[cls]);
      }).join('')}</div>
      <table class="data-table"><tr><th>Class</th><th>SKUs</th><th>% SKUs</th><th>% Lines</th><th>% Picks</th><th>% Orders</th></tr>
      ${Object.entries(abc.classes || {}).map(([cls, d]) => `<tr><td><strong>${cls}</strong></td><td>${fmt(d.count)}</td><td>${d.pct}%</td><td>${d.pct_lines != null ? d.pct_lines : d.volume_pct}%</td><td>${d.pct_picks != null ? d.pct_picks : d.volume_pct}%</td><td>${d.pct_orders != null ? d.pct_orders : '—'}%</td></tr>`).join('')}
      </table>
      <div class="metrics-grid">${metric('Gini', abc.gini || '—')}${metric('Active SKUs', fmt(abc.total_skus))}${metric('Dead Stock', fmt(abc.dead_stock_count), '#ef4444')}${metric('Design Day (P75)', fmt(p75Day.order_lines) + ' lines')}</div>` },
    // Slide 4: XYZ
    { title: 'XYZ Seasonality Analysis', html: `
      <div class="metrics-grid">${(xyz.classes || []).map(c => {
        const colors = { X: '#ef4444', Y: '#eab308', Z: '#94a3b8' };
        return metric(`${c.class} (${c.pct_moved_skus}%)`, fmt(c.moved_skus) + ' SKUs', colors[c.class]);
      }).join('')}</div>
      <table class="data-table"><tr><th>Class</th><th>SKUs</th><th>% Lines</th><th>% Picks</th><th>% Orders</th></tr>
      ${(xyz.classes || []).map(c => `<tr><td><strong>${c.class}</strong></td><td>${fmt(c.moved_skus)}</td><td>${c.pct_lines}%</td><td>${c.pct_picks}%</td><td>${c.pct_orders}%</td></tr>`).join('')}</table>` },
    // Slide 5: Order Profile
    { title: 'Order Profile', html: `
      <div class="metrics-grid">${metric('Total Orders', fmt(orderStruct.total_orders))}${metric('Single-Line', (orderStruct.single_line_pct || '—') + '%')}${metric('Multi-Line', (orderStruct.multi_line_pct || '—') + '%', '#10b981')}${metric('Avg Lines/Order', orders.avg_lines_per_order || '—')}</div>
      ${(orderStruct.histogram || []).length ? `<div class="info-box"><strong>Distribution:</strong> ${(orderStruct.histogram || []).map(h => `${h.label}: ${fmt(h.count)} (${h.pct}%)`).join(' · ')}</div>` : ''}` },
    // Slide 6: Percentiles
    { title: 'Percentiles — Design Basis', html: `
      <div class="metrics-grid">${metric('Avg Day Lines', fmt(avgDay.order_lines))}${metric('P75 (Design Day)', fmt(p75Day.order_lines), '#10b981')}${metric('Max Day', fmt(maxDay.order_lines), '#ef4444')}</div>
      <div class="metrics-grid">${metric('Avg Picks/Day', fmt(avgDay.pick_units))}${metric('P75 Picks/Day', fmt(p75Day.pick_units), '#10b981')}${metric('Max Picks', fmt(maxDay.pick_units), '#ef4444')}</div>
      <div class="info-box"><strong>Design Hour (${dailyPerc.working_hours || 12}h):</strong> ${fmt(Math.round((p75Day.order_lines || 0) / (dailyPerc.working_hours || 12)))} lines/hr · ${fmt(Math.round((p75Day.pick_units || 0) / (dailyPerc.working_hours || 12)))} picks/hr</div>` },
    // Slide 7: Extrapolation
    { title: `${extrap.years || 5}-Year Growth Extrapolation`, html: `
      <div class="info-box"><strong>Growth Rate:</strong> ${extrap.growth_rate_pct || 5}% annual</div>
      ${y5.design_day ? `<div class="metrics-grid">${metric('Y5 Lines/Day', fmt(y5.design_day.order_lines), '#eab308')}${metric('Y5 Picks/Day', fmt(y5.design_day.pick_units), '#eab308')}${metric('Y5 Orders/Day', fmt(y5.design_day.orders), '#eab308')}${metric('Growth Factor', 'x' + y5.growth_factor)}</div>` : ''}
      ${extrap.baseline ? `<div class="info-box"><strong>Baseline:</strong> ${fmt(extrap.baseline.order_lines)} lines/day · ${fmt(extrap.baseline.pick_units)} picks/day · ${fmt(extrap.baseline.skus)} SKUs</div>` : ''}` },
    // Slide 8: Products
    { title: 'Product Recommendations', html: `<div class="info-box">Product recommendations are matched to your warehouse profile based on throughput, SKU characteristics, and order complexity. Contact your PINAXIS representative for the full product portfolio.</div>` },
    // Slide 9: Benefits
    { title: 'Client Benefit Projections', html: `<div class="info-box">Data-driven ROI projections based on warehouse analytics and PINAXIS product matching. Detailed savings estimates and payback calculations available in the full report.</div>` },
    // Slide 10: Hourly
    { title: 'Hourly Throughput', html: `<div class="info-box">The hourly throughput profile drives system dimensioning — the automation must sustain peak hourly rates during the busiest operational windows while maintaining efficiency in lower-volume periods.</div>` },
    // Slide 11: Top SKUs
    { title: 'Top 10 SKUs', html: `
      ${(abc.top_skus || []).length ? `<table class="data-table"><tr><th>#</th><th>SKU</th><th>Picks</th><th>%</th><th>Class</th></tr>
      ${(abc.top_skus || []).slice(0, 10).map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.sku)}</td><td>${fmt(Math.round(s.picks))}</td><td>${s.pct}%</td><td><strong style="color:${s.class === 'A' ? '#10b981' : '#eab308'}">${s.class}</strong></td></tr>`).join('')}</table>` : '<div class="info-box">No top SKU data available.</div>'}` },
    // Slide 12: Next Steps
    { title: 'Next Steps', html: `
      <div class="steps">
        ${['Review Concept Designs with engineering team', 'Run Warehouse Simulations for throughput validation', 'Review Commercial Proposal with ROI projections', 'API Integration — connect WMS/ERP for live data', 'Implementation with PINAXIS engineering support'].map((s, i) => `<div class="step"><div class="step-num">${i + 1}</div><div>${esc(s)}</div></div>`).join('')}
      </div>
      <div class="info-box" style="border-color:#8b5cf6;background:rgba(139,92,246,0.1)"><strong>Thank you</strong> for exploring the PINAXIS Dashboard Playbook. We look forward to partnering on your warehouse automation journey.</div>` }
  ];
}

/**
 * POST /api/v1/proposal/:projectId/generate
 */
router.post('/:projectId/generate', async (req, res) => {
  const { projectId } = req.params;
  const existing = proposalJobs.get(projectId);
  if (existing && existing.status === 'generating') {
    return res.json({ success: true, data: { status: 'generating', step: existing.step, detail: existing.detail } });
  }

  const job = { status: 'generating', step: 'init', detail: 'Starting...', startedAt: new Date() };
  proposalJobs.set(projectId, job);
  res.json({ success: true, data: { status: 'generating', message: 'Generating proposal. Poll /status for progress.' } });

  try {
    const models = req.models;
    const seq = models.sequelize;
    const report = (step, detail) => { job.step = step; job.detail = detail; console.log(`[Proposal] ${step}: ${detail}`); };

    // Load project + analysis
    report('data', 'Loading project data...');
    const [projRows] = await seq.query('SELECT * FROM logistics_projects WHERE id = :projectId', { replacements: { projectId } });
    const project = projRows[0];
    if (!project) throw new Error('Project not found');

    const [analysisRows] = await seq.query('SELECT analysis_type, result_data FROM logistics_analysis_results WHERE project_id = :projectId', { replacements: { projectId } });
    const analysis = {};
    for (const row of analysisRows) {
      analysis[row.analysis_type] = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
    }

    const companyName = project.company_name || 'Your Warehouse';

    // Generate TTS audio
    const audioDir = path.join(AUDIO_DIR, String(projectId));
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const scripts = buildNarrationScripts(analysis, companyName);
    report('tts', `Generating voice narration (0/${scripts.length})...`);

    for (let i = 0; i < scripts.length; i++) {
      const audioPath = path.join(audioDir, `slide_${i}.mp3`);
      if (!fs.existsSync(audioPath)) {
        report('tts', `Generating voice for slide ${i + 1}/${scripts.length}...`);
        await generateTTS(scripts[i], audioPath);
      } else {
        report('tts', `Slide ${i + 1}/${scripts.length} audio cached`);
      }
    }

    // Build slide data
    report('html', 'Building presentation...');
    const slides = buildSlideHTML(analysis, companyName);

    job.status = 'completed';
    job.step = 'done';
    job.detail = 'Proposal ready';
    job.result = { slides, companyName, projectId, audioSlideCount: scripts.length };
    job.completedAt = new Date();
    report('done', `Proposal ready for project ${projectId}`);
  } catch (error) {
    console.error(`[Proposal] Error:`, error);
    job.status = 'error';
    job.step = 'error';
    job.detail = error.message;
  }
});

/**
 * GET /api/v1/proposal/:projectId/status
 */
router.get('/:projectId/status', (req, res) => {
  const job = proposalJobs.get(req.params.projectId);
  if (!job) return res.json({ success: true, data: { status: 'none' } });
  const resp = { status: job.status, step: job.step, detail: job.detail };
  if (job.status === 'completed') resp.proposalUrl = `/pinaxis/proposal/${req.params.projectId}`;
  res.json({ success: true, data: resp });
});

/**
 * GET /api/v1/proposal/:projectId/audio/:index
 * Serve audio files
 */
router.get('/:projectId/audio/:index', (req, res) => {
  const filePath = path.join(AUDIO_DIR, req.params.projectId, `slide_${req.params.index}.mp3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio not found' });
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = { router, proposalJobs, buildSlideHTML, buildNarrationScripts };
