#!/usr/bin/env node
'use strict';

/**
 * LOGISTICS Warehouse Data Analytics Platform
 * Warehouse data upload, analysis, and RinglyPro Logistics product matching
 *
 * Mounted at: /logistics
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const BASE_PATH = process.env.LOGISTICS_BASE_PATH || '';

// Dashboard static files path
const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('📊 LOGISTICS: Checking dashboard at:', dashboardDistPath);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Request ID for tracing
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(7);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================================================
// DATABASE
// ============================================================================

const models = require('../models');
let dbReady = false;

// Migrate old pinaxis_* tables to logistics_* (one-time rename)
(async () => {
  try {
    const renameMap = [
      ['pinaxis_projects', 'logistics_projects'],
      ['pinaxis_uploaded_files', 'logistics_uploaded_files'],
      ['pinaxis_item_master', 'logistics_item_master'],
      ['pinaxis_inventory_data', 'logistics_inventory_data'],
      ['pinaxis_goods_in_data', 'logistics_goods_in_data'],
      ['pinaxis_goods_out_data', 'logistics_goods_out_data'],
      ['pinaxis_product_recommendations', 'logistics_product_recommendations'],
      ['pinaxis_analysis_results', 'logistics_analysis_results'],
      ['pinaxis_api_keys', 'logistics_api_keys'],
      ['pinaxis_telemetry_events', 'logistics_telemetry_events'],
      ['pinaxis_oee_machines', 'logistics_oee_machines'],
      ['pinaxis_oee_machine_events', 'logistics_oee_machine_events'],
      ['pinaxis_oee_production_runs', 'logistics_oee_production_runs'],
    ];
    for (const [oldName, newName] of renameMap) {
      const [exists] = await models.sequelize.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${oldName}'`
      );
      if (exists.length > 0) {
        await models.sequelize.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
        console.log(`📊 Renamed table ${oldName} → ${newName}`);
      }
    }
  } catch (e) {
    console.log('⚠️ Table rename migration:', e.message);
  }
})().then(() => {

models.sequelize.sync({ alter: false }).then(async () => {
  console.log('✅ LOGISTICS database tables synced');
  dbReady = true;

  // Auto-migrate: ensure all tables exist
  try {
    const [tables] = await models.sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'logistics_%'"
    );
    console.log('📊 LOGISTICS tables found:', tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.log('⚠️ LOGISTICS table check:', e.message);
  }

  // Auto-migrate: add missing columns
  try {
    await models.sequelize.query(`ALTER TABLE logistics_goods_out_data ADD COLUMN IF NOT EXISTS order_type VARCHAR(100)`);
    console.log('✅ LOGISTICS: order_type column ensured');
  } catch (e) {
    console.log('⚠️ LOGISTICS migration:', e.message);
  }

  // Unique indexes for production API upsert support
  try {
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_item_master_project_sku_uq ON logistics_item_master (project_id, sku)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_inventory_project_sku_date_uq ON logistics_inventory_data (project_id, sku, COALESCE(snapshot_date, '1970-01-01'))`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_goods_in_project_receipt_sku_uq ON logistics_goods_in_data (project_id, COALESCE(receipt_id, ''), sku, receipt_date)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_goods_out_project_order_sku_uq ON logistics_goods_out_data (project_id, order_id, sku, ship_date)`);
    // OEE unique indexes
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_oee_machines_project_name_uq ON logistics_oee_machines (project_id, name)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_oee_machine_events_project_machine_time_uq ON logistics_oee_machine_events (project_id, machine_name, recorded_at)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_oee_production_runs_project_machine_shift_uq ON logistics_oee_production_runs (project_id, machine_name, shift_start)`);
    console.log('📊 LOGISTICS unique indexes verified for production API (including OEE)');
  } catch (e) {
    console.log('⚠️ LOGISTICS unique index migration:', e.message);
  }
}).catch(err => {
  console.log('⚠️ LOGISTICS database sync warning:', err.message);
});

}); // end table rename migration

// Make models available to routes
app.use((req, res, next) => {
  req.models = models;
  req.dbReady = dbReady;
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

let routesLoaded = false;

try {
  const healthRoutes = require('./routes/health');
  const projectRoutes = require('./routes/projects');
  const uploadRoutes = require('./routes/upload');
  const analysisRoutes = require('./routes/analysis');
  const productRoutes = require('./routes/products');
  const reportRoutes = require('./routes/reports');
  const demoRoutes = require('./routes/demo');
  const benefitRoutes = require('./routes/benefits');
  const ingestRoutes = require('./routes/ingest');
  const voiceAgentRoutes = require('./routes/voice-agent');
  const telemetryRoutes = require('./routes/telemetry');
  const ndaRoutes = require('./routes/nda');
  const simulationRoutes = require('./routes/simulation');
  const pricingSnapshotRoutes = require('./routes/pricing-snapshot');
  const approvalsRoutes = require('./routes/approvals');
  const videoRoutes = require('./routes/video');
  const { router: proposalRoutes, proposalJobs, buildSlideHTML, buildNarrationScripts, generateTTS, AUDIO_DIR, buildChartData } = require('./routes/proposal');

  // Health check
  app.use(`${BASE_PATH}/health`, healthRoutes);

  // API v1 routes
  app.use(`${BASE_PATH}/api/v1/projects`, projectRoutes);
  app.use(`${BASE_PATH}/api/v1/upload`, uploadRoutes);
  app.use(`${BASE_PATH}/api/v1/analysis`, analysisRoutes);
  app.use(`${BASE_PATH}/api/v1/products`, productRoutes);
  app.use(`${BASE_PATH}/api/v1/reports`, reportRoutes);
  app.use(`${BASE_PATH}/api/v1/demo`, demoRoutes);
  app.use(`${BASE_PATH}/api/v1/benefits`, benefitRoutes);
  app.use(`${BASE_PATH}/api/v1/ingest`, ingestRoutes);
  app.use(`${BASE_PATH}/api/v1/voice`, voiceAgentRoutes);
  app.use(`${BASE_PATH}/api/v1/telemetry`, telemetryRoutes);
  app.use(`${BASE_PATH}/api/v1/nda`, ndaRoutes);
  app.use(`${BASE_PATH}/api/v1/simulation`, simulationRoutes);
  app.use(`${BASE_PATH}/api/v1/pricing-snapshot`, pricingSnapshotRoutes);
  app.use(`${BASE_PATH}/api/v1/approvals`, approvalsRoutes);
  app.use(`${BASE_PATH}/api/v1/video`, videoRoutes);
  app.use(`${BASE_PATH}/api/v1/proposal`, proposalRoutes);

  // Standalone proposal page (NO LOGIN REQUIRED)
  app.get(`${BASE_PATH}/proposal/:projectId`, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      // Load data directly
      const seq = models.sequelize;
      const [projRows] = await seq.query('SELECT * FROM logistics_projects WHERE id = :projectId', { replacements: { projectId } });
      const project = projRows[0];
      if (!project) return res.status(404).send('Project not found');

      const [analysisRows] = await seq.query('SELECT analysis_type, result_data FROM logistics_analysis_results WHERE project_id = :projectId', { replacements: { projectId } });
      const analysis = {};
      for (const row of analysisRows) {
        analysis[row.analysis_type] = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
      }

      const companyName = project.company_name || 'Your Warehouse';
      const slides = buildSlideHTML(analysis, companyName);
      const slidesJSON = JSON.stringify(slides);
      const mountPath = req.baseUrl || BASE_PATH || '';
      const audioBase = `${mountPath}/api/v1/proposal/${projectId}/audio`;
      const chartData = buildChartData(analysis);
      const chartDataJSON = JSON.stringify(chartData);

      // Auto-generate audio if not cached (background, non-blocking)
      const audioDir = path.join(AUDIO_DIR, String(projectId));
      const slide0Audio = path.join(audioDir, 'slide_0.mp3');
      if (!fs.existsSync(slide0Audio)) {
        const genScripts = buildNarrationScripts(analysis, companyName);
        const genDir = audioDir;
        const genId = projectId;
        // Fire-and-forget background generation
        setImmediate(async () => {
          try {
            if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
            for (let i = 0; i < genScripts.length; i++) {
              const ap = path.join(genDir, 'slide_' + i + '.mp3');
              if (!fs.existsSync(ap)) {
                console.log('[Proposal] Auto-generating audio slide ' + (i + 1) + '/' + genScripts.length + ' for project ' + genId);
                await generateTTS(genScripts[i], ap);
              }
            }
            console.log('[Proposal] Audio ready for project ' + genId);
          } catch (e) { console.error('[Proposal] Audio gen error:', e.message); }
        });
      }

      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PINAXIS Proposal — ${companyName}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:'Inter',system-ui,-apple-system,sans-serif;overflow-x:hidden;min-height:100vh}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.container{max-width:1200px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;padding:12px 16px}
.header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e293b;flex-shrink:0;gap:8px}
.header h2{font-size:15px;color:#94a3b8;font-weight:400;flex-shrink:1;min-width:0}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.controls button{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px;transition:all .2s;white-space:nowrap}
.controls button:hover{background:#334155}
.controls button.active{background:#3b82f6;border-color:#3b82f6}
.controls button:disabled{opacity:.4;cursor:not-allowed}
.slide-counter{color:#64748b;font-size:12px;white-space:nowrap}
.voice-indicator{display:flex;align-items:center;gap:5px;color:#10b981;font-size:12px;white-space:nowrap}
.voice-indicator .dot{width:7px;height:7px;border-radius:50%;background:#10b981;animation:pulse 1.5s infinite;flex-shrink:0}
.slide-area{flex:1;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px 0;-webkit-overflow-scrolling:touch}
.slide{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;width:100%;max-width:1100px}
.slide h2{font-size:22px;color:#f8fafc;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #334155}
.metrics-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}
.metric{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px 10px;text-align:center}
.metric-value{font-size:18px;font-weight:bold;word-break:break-all}
.metric-label{font-size:11px;color:#94a3b8;margin-top:4px}
.info-box{background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:12px 14px;margin:10px 0;font-size:13px;color:#cbd5e1;line-height:1.5}
.data-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
.data-table th{text-align:left;padding:8px 6px;border-bottom:2px solid #334155;color:#94a3b8;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
.data-table td{padding:8px 6px;border-bottom:1px solid #1e293b;color:#e2e8f0}
.data-table tr:hover td{background:rgba(59,130,246,0.05)}
.steps{display:flex;flex-direction:column;gap:10px;margin:14px 0}
.step{display:flex;align-items:center;gap:12px;padding:14px;background:#0f172a;border:1px solid #334155;border-radius:10px;font-size:14px}
.step-num{width:36px;height:36px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;font-weight:bold;flex-shrink:0;font-size:14px}
.nav{display:flex;justify-content:center;align-items:center;padding:10px 0;flex-shrink:0}
.dots{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}
.dot-nav{width:7px;height:7px;border-radius:50%;background:#334155;cursor:pointer;transition:all .2s}
.dot-nav.active{background:#3b82f6;width:20px;border-radius:4px}
.progress-bar{height:3px;background:#1e293b;border-radius:2px;margin-top:4px;flex-shrink:0}
.progress-fill{height:100%;background:#3b82f6;border-radius:2px;transition:width .3s}
.chart-box{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px;margin:12px 0}
.charts-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0}
.charts-row .chart-box{margin:0}

/* Desktop overrides */
@media(min-width:768px){
  .container{padding:20px 40px}
  .header h2{font-size:18px}
  .controls button{padding:8px 20px;font-size:14px}
  .slide-counter{font-size:13px}
  .voice-indicator{font-size:13px}
  .slide{padding:50px;min-height:500px}
  .slide h2{font-size:36px;margin-bottom:20px;padding-bottom:16px}
  .metrics-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:20px 0}
  .metric{padding:20px}
  .metric-value{font-size:28px}
  .metric-label{font-size:13px}
  .info-box{padding:16px 20px;font-size:15px}
  .data-table{font-size:14px}
  .data-table th{padding:10px 12px;font-size:11px}
  .data-table td{padding:10px 12px}
  .step{padding:18px 20px}
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h2>PINAXIS Proposal — ${companyName}</h2>
    <div class="controls">
      <div class="voice-indicator" id="voiceStatus"><div class="dot"></div><span>Rachel AI Ready</span></div>
      <span class="slide-counter" id="slideCounter">1 / ${slides.length}</span>
      <button id="playBtn" class="active" onclick="togglePlay()">&#9654; Auto-Play</button>
      <button id="prevBtn" onclick="prevSlide()" disabled>&larr; Prev</button>
      <button id="nextBtn" onclick="nextSlide()">Next &rarr;</button>
    </div>
  </div>
  <!-- Start splash (enables audio autoplay after user click) -->
  <div id="startSplash" style="position:fixed;inset:0;z-index:100;background:#0f172a;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px" onclick="startPresentation()">
    <div style="text-align:center;max-width:500px">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="PINAXIS" style="width:min(200px,40vw);height:min(200px,40vw);border-radius:20px;margin-bottom:24px;box-shadow:0 8px 32px rgba(59,130,246,0.2)">
      <h1 style="font-size:min(36px,7vw);color:#f8fafc;margin-bottom:10px">PINAXIS Dashboard Playbook</h1>
      <p style="color:#94a3b8;font-size:min(18px,4vw);margin-bottom:32px">${companyName}</p>
      <div style="display:inline-flex;align-items:center;gap:10px;background:#3b82f6;padding:14px 32px;border-radius:12px;font-size:min(16px,4vw);font-weight:600;color:white;transition:all .2s">
        <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Tap to Start
      </div>
      <p style="color:#64748b;margin-top:16px;font-size:14px">Rachel Voice AI will narrate each slide</p>
    </div>
  </div>
  <div class="slide-area"><div class="slide" id="slideContent"></div></div>
  <div class="nav">
    <div class="dots" id="dots"></div>
  </div>
  <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
</div>

<script>
const slides = ${slidesJSON};
const AUDIO_BASE = '${audioBase}';
let current = 0, playing = true, audio = null;

function render() {
  const s = slides[current];
  document.getElementById('slideContent').innerHTML = '<h2>' + s.title + '</h2>' + s.html;
  document.getElementById('slideCounter').textContent = (current + 1) + ' / ' + slides.length;
  document.getElementById('prevBtn').disabled = current === 0;
  document.getElementById('nextBtn').disabled = current === slides.length - 1;
  document.getElementById('progressFill').style.width = ((current + 1) / slides.length * 100) + '%';
  // Dots
  let dots = '';
  for (let i = 0; i < slides.length; i++) dots += '<div class="dot-nav' + (i === current ? ' active' : '') + '" onclick="goSlide(' + i + ')"></div>';
  document.getElementById('dots').innerHTML = dots;
}

var retryTimer = null;
function playAudio() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (audio) { audio.pause(); audio = null; }
  if (!playing) return;
  document.getElementById('voiceStatus').innerHTML = '<div class="dot"></div><span>Loading audio...</span>';
  audio = new Audio(AUDIO_BASE + '/' + current);
  var retrying = false;
  function scheduleRetry() {
    if (retrying) return;
    retrying = true;
    document.getElementById('voiceStatus').innerHTML = '<div class="dot"></div><span>Generating audio... please wait</span>';
    retryTimer = setTimeout(function() { retrying = false; playAudio(); }, 5000);
  }
  audio.oncanplaythrough = function() {
    document.getElementById('voiceStatus').innerHTML = '<div class="dot"></div><span>Rachel speaking...</span>';
  };
  audio.play().catch(function() { scheduleRetry(); });
  audio.onerror = function() { scheduleRetry(); };
  audio.onended = function() {
    document.getElementById('voiceStatus').innerHTML = '<div class="dot"></div><span>Rachel AI Ready</span>';
    if (playing && current < slides.length - 1) { current++; render(); playAudio(); }
  };
}

function togglePlay() {
  playing = !playing;
  document.getElementById('playBtn').textContent = playing ? '⏸ Pause' : '▶ Auto-Play';
  document.getElementById('playBtn').classList.toggle('active', playing);
  if (playing) playAudio();
  else if (audio) { audio.pause(); }
}

function prevSlide() { if (current > 0) { current--; render(); if (playing) playAudio(); } }
function nextSlide() { if (current < slides.length - 1) { current++; render(); if (playing) playAudio(); } }
function goSlide(i) { current = i; render(); if (playing) playAudio(); }

render();

function startPresentation() {
  document.getElementById('startSplash').style.display = 'none';
  playAudio();
}

// Chart.js rendering
var CD = ${chartDataJSON};
var activeCharts = [];
var chartDefaults = { color: '#94a3b8', borderColor: '#334155' };
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';

function destroyCharts() { activeCharts.forEach(function(c) { c.destroy(); }); activeCharts = []; }

function pie(id, data, colors) {
  var el = document.getElementById(id); if (!el || !data.length) return;
  activeCharts.push(new Chart(el, { type: 'doughnut', data: {
    labels: data.map(function(d){return d.label}), datasets: [{data: data.map(function(d){return d.value}),
    backgroundColor: colors || ['#10b981','#3b82f6','#eab308','#ef4444','#f97316','#8b5cf6','#06b6d4'], borderWidth: 0}]
  }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } } } }));
}

function bar(id, labels, datasets) {
  var el = document.getElementById(id); if (!el) return;
  activeCharts.push(new Chart(el, { type: 'bar', data: { labels: labels, datasets: datasets },
    options: { responsive: true, indexAxis: 'x', plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { grid: { color: '#1e293b' } }, y: { grid: { color: '#1e293b' }, beginAtZero: true } } } }));
}

function hbar(id, labels, datasets) {
  var el = document.getElementById(id); if (!el) return;
  activeCharts.push(new Chart(el, { type: 'bar', data: { labels: labels, datasets: datasets },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { grid: { color: '#1e293b' }, beginAtZero: true }, y: { grid: { color: '#1e293b' } } } } }));
}

// Re-render charts after slide change
var origRender = render;
render = function() { origRender(); destroyCharts(); setTimeout(renderCharts, 50); };

function renderCharts() {
  // Slide 1: pie charts
  if (CD.orderType.length) pie('chartOrderType', CD.orderType);
  if (CD.tempZone.length) pie('chartTempZone', CD.tempZone);
  if (CD.pickUnit.length) pie('chartPickUnit', CD.pickUnit);
  // Slide 2: fit donut
  if (CD.fitDonut.length) pie('chartFitDonut', CD.fitDonut, CD.fitDonut.map(function(d){return d.color}));
  // Slide 3: ABC volume bar
  if (CD.abc.length) hbar('chartABC', CD.abc.map(function(d){return d.label}), [{label:'Volume %',data:CD.abc.map(function(d){return d.volume}),backgroundColor:CD.abc.map(function(d){return d.color}),borderRadius:4}]);
  // Slide 4: XYZ grouped bar
  if (CD.xyz.length) bar('chartXYZ', CD.xyz.map(function(d){return d.label}), [
    {label:'% Lines',data:CD.xyz.map(function(d){return d.lines}),backgroundColor:'#ef4444',borderRadius:4},
    {label:'% Picks',data:CD.xyz.map(function(d){return d.picks}),backgroundColor:'#eab308',borderRadius:4},
    {label:'% Orders',data:CD.xyz.map(function(d){return d.orders}),backgroundColor:'#94a3b8',borderRadius:4}]);
  // Slide 5: histogram
  if (CD.histogram.length) bar('chartHistogram', CD.histogram.map(function(d){return d.label}), [{label:'Orders',data:CD.histogram.map(function(d){return d.count}),backgroundColor:'#ef4444',borderRadius:4}]);
  // Slide 6: percentiles grouped
  if (CD.percentiles.length) bar('chartPercentiles', CD.percentiles.map(function(d){return d.label}), [
    {label:'Average',data:CD.percentiles.map(function(d){return d.avg}),backgroundColor:'#3b82f6',borderRadius:4},
    {label:'P75',data:CD.percentiles.map(function(d){return d.p75}),backgroundColor:'#10b981',borderRadius:4},
    {label:'Max',data:CD.percentiles.map(function(d){return d.max}),backgroundColor:'#ef4444',borderRadius:4}]);
  // Slide 7: growth projection
  if (CD.growth.length) bar('chartGrowth', CD.growth.map(function(d){return d.label}), [
    {label:'Lines/Day',data:CD.growth.map(function(d){return d.lines}),backgroundColor:'#eab308',borderRadius:4},
    {label:'Orders/Day',data:CD.growth.map(function(d){return d.orders}),backgroundColor:'#10b981',borderRadius:4}]);
  // Slide 10: hourly
  if (CD.hourly.length) bar('chartHourly', CD.hourly.map(function(d){return d.label}), [{label:'Order Lines',data:CD.hourly.map(function(d){return d.value}),backgroundColor:CD.hourly.map(function(d,i){var mx=Math.max.apply(null,CD.hourly.map(function(h){return h.value}));return d.value>=mx*0.8?'#eab308':'#3b82f6'}),borderRadius:3}]);
  // Slide 11: top SKUs
  if (CD.topSkus.length) hbar('chartTopSKUs', CD.topSkus.map(function(d){return d.label}), [{label:'Picks',data:CD.topSkus.map(function(d){return d.value}),backgroundColor:'#8b5cf6',borderRadius:4}]);
}
</script>
</body>
</html>`);
    } catch (err) {
      console.error('[Proposal Page]', err);
      res.status(500).send('Error loading proposal: ' + err.message);
    }
  });

  routesLoaded = true;
  console.log('✅ LOGISTICS routes loaded successfully');
  console.log('📊 LOGISTICS API routes mounted:');
  console.log('   - /health');
  console.log('   - /api/v1/projects');
  console.log('   - /api/v1/upload');
  console.log('   - /api/v1/analysis');
  console.log('   - /api/v1/products');
  console.log('   - /api/v1/reports');
  console.log('   - /api/v1/demo');
  console.log('   - /api/v1/ingest (Production API - auth required)');
  console.log('   - /api/v1/voice (ElevenLabs Voice Agent)');
  console.log('   - /api/v1/telemetry (Live Observability)');
} catch (error) {
  console.log('⚠️ Some LOGISTICS routes failed to load:', error.message);
  console.log('   Error stack:', error.stack);
}

// Fallback health if routes failed
if (!routesLoaded) {
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'LOGISTICS running without full routes',
      timestamp: new Date().toISOString()
    });
  });
}

// Serve dashboard static files if they exist
if (fs.existsSync(dashboardDistPath)) {
  console.log('📊 Serving LOGISTICS dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  // SPA routing - serve index.html for non-API routes
  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    if (req.path.startsWith(`${BASE_PATH}/api/`) ||
        req.path.startsWith(`${BASE_PATH}/health`)) {
      return next();
    }
    const indexPath = path.join(dashboardDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
} else {
  console.log('⚠️ LOGISTICS dashboard not built yet');

  app.get(`${BASE_PATH}/`, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LOGISTICS - Warehouse Data Analytics</title>
  <style>
    :root { --bg: #0f172a; --panel: #1e293b; --accent: #3b82f6; --text: #f1f5f9; --muted: #94a3b8; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: var(--panel); border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; border: 1px solid #334155; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h1 span { color: var(--accent); }
    p { color: var(--muted); margin: 12px 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(59,130,246,.15); color: var(--accent); font-size: 12px; margin-bottom: 16px; }
    .status { margin-top: 24px; padding: 16px; background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); border-radius: 8px; color: #22c55e; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">POWERED BY RinglyPro Logistics</div>
    <h1><span>LOGISTICS</span> Analytics</h1>
    <p>Warehouse Data Analytics Platform</p>
    <p style="font-size: 14px;">Upload warehouse data, run automated analysis, and get RinglyPro Logistics product recommendations.</p>
    <div class="status">API Online — Dashboard coming soon</div>
  </div>
</body>
</html>`);
  });
}

// Error handling
const errorHandler = require('./middleware/error-handler');
const notFound = require('./middleware/not-found');
app.use(notFound);
app.use(errorHandler);

module.exports = app;
