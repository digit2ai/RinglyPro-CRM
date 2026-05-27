#!/usr/bin/env node
'use strict';

/**
 * INTUITIVE SURGICAL — da Vinci System Matching Engine
 * Hospital data intake, analysis, and da Vinci robot-to-hospital matching
 *
 * Mounted at: /intuitive
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const BASE_PATH = process.env.INTUITIVE_BASE_PATH || '';

const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('  INTUITIVE: Checking dashboard at:', dashboardDistPath);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

models.sequelize.sync({ alter: false }).then(async () => {
  console.log('  INTUITIVE database tables synced');
  dbReady = true;

  try {
    const [tables] = await models.sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'intuitive_%'"
    );
    console.log('  INTUITIVE tables found:', tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.log('  INTUITIVE table check:', e.message);
  }

  // Seed admin user if not exists
  try {
    const bcrypt = require('bcryptjs');
    const { IntuitiveUser } = models;
    const adminEmail = 'mstagg@digit2ai.com';
    const existing = await IntuitiveUser.findOne({ where: { email: adminEmail } });
    if (!existing) {
      const hash = await bcrypt.hash('Palindrome@7', 12);
      await IntuitiveUser.create({
        name: 'Manuel Stagg',
        email: adminEmail,
        password_hash: hash,
        role: 'admin',
        is_active: true
      });
      console.log('  INTUITIVE admin user seeded:', adminEmail);
    }
  } catch (e) {
    console.log('  INTUITIVE admin seed:', e.message);
  }
}).catch(err => {
  console.error('  INTUITIVE DB sync error:', err.message);
});

// Inject models into request
app.use((req, res, next) => {
  req.models = models;
  req.dbReady = dbReady;
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

const projectRoutes = require('./routes/projects');
const analysisRoutes = require('./routes/analysis');
const demoRoutes = require('./routes/demo');
const healthRoutes = require('./routes/health');
const { router: proposalRoutes, proposalJobs, buildSlideHTML, buildNarrationScripts, buildChartData, AUDIO_DIR } = require('./routes/proposal');
const voiceAgentRoutes = require('./routes/voice-agent');
const businessPlanRoutes = require('./routes/business-plans');
const surveyRoutes = require('./routes/surveys');
const clinicalEvidenceRoutes = require('./routes/clinical-evidence');
const drgRoutes = require('./routes/drg');
const proformaTrackingRoutes = require('./routes/proforma-tracking');
const robotDataRoutes = require('./routes/robot-data');
const surveyPublicRoutes = require('./routes/survey-public');
let aiResearchRoutes;
try { aiResearchRoutes = require('./routes/ai-research'); } catch (e) { console.error('  INTUITIVE: ai-research route load error:', e.message); }
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');
let intelligenceRoutes;
try { intelligenceRoutes = require('./routes/intelligence'); } catch (e) { console.error('  INTUITIVE: intelligence route load error:', e.message); }
let chatRoutes;
try { chatRoutes = require('./routes/chat'); } catch (e) { console.error('  INTUITIVE: chat route load error:', e.message); }
let surgeonTargetingRoutes;
try { surgeonTargetingRoutes = require('./routes/surgeon-targeting'); } catch (e) { console.error('  INTUITIVE: surgeon-targeting route load error:', e.message); }

// Public routes (no auth)
app.use(`${BASE_PATH}/health`, healthRoutes);
app.use(`${BASE_PATH}/api/v1/auth`, authRoutes);
app.use(`${BASE_PATH}/survey`, surveyPublicRoutes);
app.use(`${BASE_PATH}/api/v1/proposal`, proposalRoutes); // public: standalone proposals are shareable
app.use(`${BASE_PATH}/api/v1/voice`, voiceAgentRoutes); // public: voice agent briefings
app.use(`${BASE_PATH}/api/v1/robot-data/ingest`, robotDataRoutes); // public: robot telemetry uses API key auth

// Protected API routes (require JWT)
app.use(`${BASE_PATH}/api/v1/projects`, requireAuth, projectRoutes);
app.use(`${BASE_PATH}/api/v1/analysis`, requireAuth, analysisRoutes);
app.use(`${BASE_PATH}/api/v1/demo`, requireAuth, demoRoutes);
app.use(`${BASE_PATH}/api/v1/business-plans`, requireAuth, businessPlanRoutes);
app.use(`${BASE_PATH}/api/v1/surveys`, requireAuth, surveyRoutes);
app.use(`${BASE_PATH}/api/v1/clinical-evidence`, requireAuth, clinicalEvidenceRoutes);
app.use(`${BASE_PATH}/api/v1/drg`, requireAuth, drgRoutes);
app.use(`${BASE_PATH}/api/v1/tracking`, requireAuth, proformaTrackingRoutes);
app.use(`${BASE_PATH}/api/v1/robot-data`, requireAuth, robotDataRoutes);
if (aiResearchRoutes) app.use(`${BASE_PATH}/api/v1/ai-research`, requireAuth, aiResearchRoutes);
if (intelligenceRoutes) app.use(`${BASE_PATH}/api/v1/intelligence`, requireAuth, intelligenceRoutes);
if (chatRoutes) app.use(`${BASE_PATH}/api/v1/chat`, requireAuth, chatRoutes);
if (surgeonTargetingRoutes) app.use(`${BASE_PATH}/api/v1/surgeon-targeting`, requireAuth, surgeonTargetingRoutes);
try { app.use(`${BASE_PATH}/api/v1/dashboard`, requireAuth, require('./routes/dashboard')); } catch (e) { console.error('Dashboard route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/executive-brief`, requireAuth, require('./routes/executive-brief')); } catch (e) { console.error('Executive Brief route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/hospital-profile`, requireAuth, require('./routes/hospital-profile')); } catch (e) { console.error('Hospital Profile route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/surgeon-profile`, requireAuth, require('./routes/surgeon-profile')); } catch (e) { console.error('Surgeon Profile route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/robotics-program`, requireAuth, require('./routes/robotics-program')); } catch (e) { console.error('Robotics Program route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/market-profile`, requireAuth, require('./routes/market-profile')); } catch (e) { console.error('Market Profile route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/clinical-outcomes`, requireAuth, require('./routes/clinical-outcomes')); } catch (e) { console.error('Clinical Outcomes route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/clinical-overlay`, requireAuth, require('./routes/clinical-overlay')); } catch (e) { console.error('Clinical Overlay route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/surgeon-commitments`, requireAuth, require('./routes/surgeon-commitments')); } catch (e) { console.error('Surgeon Commitments route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/business-plan-enrichment`, requireAuth, require('./routes/business-plan-enrichment')); } catch (e) { console.error('Business Plan enrichment route load error:', e.message); }
try { app.use(`${BASE_PATH}/api/v1/performance-tracking`, requireAuth, require('./routes/performance-tracking')); } catch (e) { console.error('Performance Tracking route load error:', e.message); }

// ============================================================================
// STANDALONE PROPOSAL PAGE (NO LOGIN REQUIRED — must be before SPA catch-all)
// ============================================================================

const { buildSlideHTML: _buildSlideHTML, buildNarrationScripts: _buildNarrationScripts, buildChartData: _buildChartData, AUDIO_DIR: _AUDIO_DIR, generateTTS: _generateTTS } = require('./routes/proposal');

app.get(`${BASE_PATH}/proposal/:projectId`, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const seq = models.sequelize;
    const [projRows] = await seq.query('SELECT * FROM intuitive_projects WHERE id = :projectId', { replacements: { projectId } });
    const project = projRows[0];
    if (!project) return res.status(404).send('Project not found');

    const [analysisRows] = await seq.query('SELECT analysis_type, result_data FROM intuitive_analysis_results WHERE project_id = :projectId', { replacements: { projectId } });
    const analysis = { _project: project };
    for (const row of analysisRows) {
      analysis[row.analysis_type] = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
    }

    const hospitalName = project.hospital_name || 'Your Hospital';

    // ─── NEW: Use 10-step workflow slide deck instead of old 13-slide layout ───
    // Pass ?legacy=1 to force the old deck for back-compat.
    const useLegacy = req.query.legacy === '1';
    let slides, scripts;
    if (!useLegacy) {
      try {
        const wfBuilder = require('./services/workflow-presentation-builder');
        const enrichments = await wfBuilder.fetchAllEnrichments(projectId, models);
        slides = wfBuilder.buildWorkflowSlides(project, enrichments, hospitalName);
        scripts = wfBuilder.buildWorkflowNarration(project, enrichments, hospitalName);
        console.log('[Intuitive Proposal] Using NEW 10-step workflow deck for project ' + projectId);
      } catch (e) {
        console.error('[Intuitive Proposal] Workflow builder failed, falling back to legacy:', e.message);
        slides = _buildSlideHTML(analysis, hospitalName);
        scripts = _buildNarrationScripts(analysis, hospitalName);
      }
    } else {
      slides = _buildSlideHTML(analysis, hospitalName);
      scripts = _buildNarrationScripts(analysis, hospitalName);
    }

    const slidesJSON = JSON.stringify(slides);
    const mountPath = req.baseUrl || BASE_PATH || '';
    const audioBase = `${mountPath}/api/v1/proposal/${projectId}/audio`;
    let chartData = _buildChartData(analysis);

    // Merge in workflow chart data when using the new deck
    if (!useLegacy) {
      try {
        const wfBuilder = require('./services/workflow-presentation-builder');
        const enrichments = await wfBuilder.fetchAllEnrichments(projectId, models);
        const wfChartData = wfBuilder.buildWorkflowChartData(enrichments, project);
        chartData = { ...chartData, ...wfChartData };
      } catch (e) {
        console.error('[Intuitive Proposal] workflow chart data error:', e.message);
      }
    }
    const chartDataJSON = JSON.stringify(chartData);

    // Auto-generate audio if not cached (background, non-blocking)
    // Force regeneration if using new workflow deck and old audio exists
    const audioDir = path.join(_AUDIO_DIR, String(projectId));
    const slide0Audio = path.join(audioDir, 'slide_0.mp3');
    const audioCountFile = path.join(audioDir, '.deck_version');
    const currentDeckVersion = useLegacy ? 'legacy' : 'workflow-v17-irr-fix';
    const cachedDeckVersion = fs.existsSync(audioCountFile) ? fs.readFileSync(audioCountFile, 'utf8').trim() : null;
    const needsRegen = !fs.existsSync(slide0Audio) || cachedDeckVersion !== currentDeckVersion;

    if (needsRegen) {
      setImmediate(async () => {
        try {
          if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
          // Clear old audio if deck version changed
          if (cachedDeckVersion && cachedDeckVersion !== currentDeckVersion) {
            const files = fs.readdirSync(audioDir).filter(f => f.startsWith('slide_'));
            for (const f of files) try { fs.unlinkSync(path.join(audioDir, f)); } catch (e) {}
          }
          // Per-slide speech speed. Number-dense slides (Step 4 Market = idx 4,
          // Step 7 Surgeon Commitments = idx 7, Step 8 Business Plan = idx 8) are
          // slowed so Rachel doesn't sound rushed. Default 0.82 elsewhere.
          const SLOW_SLIDES = useLegacy ? {} : { 4: 0.72, 7: 0.72, 8: 0.72 };
          for (let i = 0; i < scripts.length; i++) {
            const ap = path.join(audioDir, 'slide_' + i + '.mp3');
            if (!fs.existsSync(ap)) {
              const slideSpeed = SLOW_SLIDES[i] || 0.82;
              console.log('[Intuitive Proposal] Auto-generating audio slide ' + (i + 1) + '/' + scripts.length + ' (speed ' + slideSpeed + ') for project ' + projectId);
              await _generateTTS(scripts[i], ap, slideSpeed);
            }
          }
          fs.writeFileSync(audioCountFile, currentDeckVersion);
          console.log('[Intuitive Proposal] Audio ready for project ' + projectId + ' (deck: ' + currentDeckVersion + ')');
        } catch (e) { console.error('[Intuitive Proposal] Audio gen error:', e.message); }
      });
    }

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>da Vinci System Assessment — ${hospitalName}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"><\/script>
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
.controls button.active{background:#0ea5e9;border-color:#0ea5e9}
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
.info-box{background:rgba(14,165,233,0.08);border:1px solid rgba(14,165,233,0.2);border-radius:8px;padding:12px 14px;margin:10px 0;font-size:13px;color:#cbd5e1;line-height:1.5}
.data-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
.data-table th{text-align:left;padding:8px 6px;border-bottom:2px solid #334155;color:#94a3b8;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
.data-table td{padding:8px 6px;border-bottom:1px solid #1e293b;color:#e2e8f0}
.data-table tr:hover td{background:rgba(14,165,233,0.05)}
.steps{display:flex;flex-direction:column;gap:10px;margin:14px 0}
.step{display:flex;align-items:center;gap:12px;background:#0f172a;border:1px solid #334155;border-radius:10px;padding:12px 16px}
.step-num{width:32px;height:32px;border-radius:50%;background:#0ea5e9;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:14px;flex-shrink:0}
.chart-box{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;margin:10px 0}
.chart-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dots{display:flex;gap:6px;flex-wrap:wrap}
.dots .dot{width:10px;height:10px;border-radius:50%;background:#334155;cursor:pointer;transition:all .2s;flex-shrink:0}
.dots .dot.active{background:#0ea5e9;transform:scale(1.3)}
.splash{position:fixed;top:0;left:0;right:0;bottom:0;background:#0f172a;display:flex;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:24px;text-align:center;padding:20px}
.splash h1{font-size:min(42px,7vw);color:#f8fafc}
.splash p{color:#94a3b8;font-size:min(18px,4vw)}
.splash button{background:#0ea5e9;border:none;color:#fff;padding:14px 40px;border-radius:12px;font-size:16px;cursor:pointer;transition:all .2s}
.splash button:hover{background:#0284c7;transform:scale(1.05)}
@media(min-width:640px){.metrics-grid{grid-template-columns:repeat(4,1fr)}}
@media(min-width:768px){.slide{padding:32px}.slide h2{font-size:26px}}
/* ── Mobile (phones) — Greg will open this from an SMS ── */
@media(max-width:639px){
  .container{padding:8px 10px}
  .header{gap:6px;justify-content:center;padding:6px 0}
  .header h2{font-size:11px;width:100%;text-align:center;margin-bottom:2px;white-space:normal}
  .controls{width:100%;justify-content:center;gap:6px}
  .controls button{padding:9px 12px;font-size:12px;min-height:38px}
  #btnPrev,#btnNext{padding:9px 16px;font-size:16px}
  .slide-counter{font-size:11px}
  .slide-area{padding:10px 0}
  .slide{padding:14px;border-radius:10px}
  .slide h2{font-size:17px;margin-bottom:12px;padding-bottom:10px}
  .metrics-grid{gap:8px;margin:12px 0}
  .metric{padding:10px 6px}
  .metric-value{font-size:15px;word-break:normal}
  .metric-label{font-size:10px}
  .info-box{font-size:12px;padding:10px 12px;line-height:1.55}
  /* tables become horizontally scrollable instead of overflowing the slide */
  .data-table{display:block;overflow-x:auto;white-space:nowrap;font-size:11px;-webkit-overflow-scrolling:touch}
  .data-table th{font-size:9px;padding:6px 5px}
  .data-table td{padding:6px 5px}
  .chart-box{padding:8px;margin:8px 0}
  .chart-2col{grid-template-columns:1fr}
  .step{padding:10px 12px;gap:10px}
  .step-num{width:28px;height:28px;font-size:13px}
  .dots{gap:5px;justify-content:center}
  .dots .dot{width:8px;height:8px}
  .splash{gap:18px;padding:24px 16px}
  .splash img{width:min(360px,84vw)!important;margin-bottom:18px}
  .splash button{padding:16px 28px;font-size:16px;width:100%;max-width:340px}
}
</style>
</head>
<body>
<div class="splash" id="splash">
  <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" style="width:min(560px,82vw);height:auto;margin-bottom:24px">
  <h1>${hospitalName}</h1>
  <p>SurgicalMind AI &mdash; da Vinci System Assessment</p>
  <button onclick="startPresentation()">&#9654;&nbsp; Tap to Play Presentation</button>
  <p style="font-size:13px;color:#64748b;margin-top:-8px">Auto-plays all 11 slides with Rachel narration</p>
</div>
<div class="container" id="app" style="display:none">
  <div class="header">
    <h2>SurgicalMind AI &mdash; ${hospitalName}</h2>
    <div class="controls">
      <button id="btnPlay" onclick="toggleAuto()" style="background:#10b981;border-color:#10b981;color:#fff;display:flex;align-items:center;gap:6px;padding:6px 16px">
        <span id="playIcon">&#9654;</span><span id="playLabel" style="font-size:12px;letter-spacing:1px">PLAY</span>
      </button>
      <button id="btnStop" onclick="stopPresentation()" style="display:flex;align-items:center;gap:6px;padding:6px 16px">
        <span>&#9632;</span><span style="font-size:12px;letter-spacing:1px">STOP</span>
      </button>
      <button id="btnPrev" onclick="prevSlide()">&larr;</button>
      <span class="slide-counter" id="counter">1 / ${slides.length}</span>
      <button id="btnNext" onclick="nextSlide()">&rarr;</button>
      <div class="voice-indicator"><div class="dot" id="voiceDot"></div>Rachel</div>
      <a href="${mountPath}/proposal/${projectId}/guide" target="_blank" rel="noopener" style="background:#1e293b;border:1px solid #334155;color:#7dd3fc;padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none;white-space:nowrap">Printable Guide</a>
    </div>
  </div>
  <div class="slide-area"><div class="slide" id="slideContent"></div></div>
  <div style="padding:8px 0;display:flex;justify-content:center"><div class="dots" id="dots"></div></div>
</div>
<audio id="audio" preload="auto"></audio>
<audio id="audioPrefetch" preload="auto" style="display:none"></audio>
<script>
const slides=${slidesJSON};
const audioBase="${audioBase}";
const chartData=${chartDataJSON};
let cur=0,auto=false,charts={};
Chart.register(ChartDataLabels);
Chart.defaults.color='#94a3b8';
Chart.defaults.borderColor='#1e293b';
Chart.defaults.plugins.datalabels={display:false};
const audio=document.getElementById('audio');

function startPresentation(){document.getElementById('splash').style.display='none';document.getElementById('app').style.display='flex';auto=true;updatePlayBtn();render();playAudio()}
function render(){
  const s=slides[cur];
  document.getElementById('slideContent').innerHTML='<h2>'+s.title+'</h2>'+s.html;
  document.getElementById('counter').textContent=(cur+1)+' / '+slides.length;
  document.getElementById('btnPrev').disabled=cur===0;
  document.getElementById('btnNext').disabled=cur===slides.length-1;
  const dots=document.getElementById('dots');
  dots.innerHTML='';
  for(let i=0;i<slides.length;i++){const d=document.createElement('div');d.className='dot'+(i===cur?' active':'');d.onclick=()=>{cur=i;render();playAudio()};dots.appendChild(d)}
  renderCharts()
}
function nextSlide(){if(auto){auto=false;updatePlayBtn()}audio.pause();if(cur<slides.length-1){cur++;render();if(!auto){}}}
function prevSlide(){if(auto){auto=false;updatePlayBtn()}audio.pause();if(cur>0){cur--;render()}}
function toggleAuto(){auto=!auto;updatePlayBtn();if(auto)playAudio()}
function stopPresentation(){auto=false;updatePlayBtn();audio.pause();cur=0;render()}
function updatePlayBtn(){
  var btn=document.getElementById('btnPlay');
  var icon=document.getElementById('playIcon');
  var label=document.getElementById('playLabel');
  var dot=document.getElementById('voiceDot');
  if(auto){btn.style.background='#eab308';btn.style.borderColor='#eab308';icon.innerHTML='&#10074;&#10074;';label.textContent='PAUSE';if(dot)dot.style.animation='pulse 1.5s infinite'}
  else{btn.style.background='#10b981';btn.style.borderColor='#10b981';icon.innerHTML='&#9654;';label.textContent='PLAY';if(dot)dot.style.animation='none'}
}
var audioRetries=0,stallTimer=null;
function prefetchNext(){var n=cur+1;if(n<slides.length){var pf=document.getElementById('audioPrefetch');if(pf){pf.src=audioBase+'/'+n;try{pf.load()}catch(e){}}}}
function clearStall(){if(stallTimer){clearTimeout(stallTimer);stallTimer=null}}
function advance(){if(cur<slides.length-1){cur++;render();playAudio()}else{auto=false;updatePlayBtn()}}
function playAudio(){
  clearStall();audioRetries=0;
  audio.src=audioBase+'/'+cur;
  try{audio.load()}catch(e){}
  audio.play().catch(function(){});
  prefetchNext();
}
// Clean completion -> next slide
audio.onended=function(){clearStall();if(auto)advance()};
// Network/decode error -> retry the same slide a couple times, then skip so the deck never hangs
audio.onerror=function(){
  if(!auto)return;
  if(audioRetries<2){audioRetries++;setTimeout(function(){try{audio.load()}catch(e){}audio.play().catch(function(){})},900)}
  else advance();
};
// Buffer stall -> nudge playback; if it can't resume within 12s, move on
audio.onwaiting=function(){
  if(!auto)return;clearStall();
  stallTimer=setTimeout(function(){try{audio.play().catch(function(){})}catch(e){}stallTimer=setTimeout(function(){if(auto)advance()},6000)},6000);
};
audio.onplaying=function(){clearStall()};

function renderCharts(){
  Object.values(charts).forEach(c=>{if(c&&c.destroy)c.destroy()});charts={};
  const dv5='#0ea5e9',xi='#10b981',xc='#eab308',sp='#8b5cf6',red='#ef4444';
  const fmtN=n=>n>=1000000?(n/1000000).toFixed(1)+'M':n>=1000?(n/1000).toFixed(0)+'K':String(Math.round(n));
  const dlOpts={display:true,color:'#e2e8f0',font:{size:10,weight:'bold'},anchor:'end',align:'top',offset:-2,formatter:v=>fmtN(v)};
  const dlH={display:true,color:'#e2e8f0',font:{size:10,weight:'bold'},anchor:'end',align:'right',offset:4,formatter:v=>String(Math.round(v))};
  const dlPct={display:true,color:'#fff',font:{size:10,weight:'bold'},anchor:'center',align:'center',formatter:(v,ctx)=>{const t=ctx.chart.data.datasets[0].data.reduce((s,x)=>s+x,0);return t>0?Math.round(v/t*100)+'%':''}};
  const opts={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}},datalabels:dlOpts},scales:{x:{ticks:{color:'#94a3b8',font:{size:10}},grid:{color:'#1e293b'}},y:{ticks:{color:'#94a3b8',font:{size:10}},grid:{color:'#1e293b'},beginAtZero:true}}};
  const hOpts={responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}},datalabels:dlH},scales:{x:{ticks:{color:'#94a3b8',font:{size:10}},grid:{color:'#1e293b'},beginAtZero:true},y:{ticks:{color:'#94a3b8',font:{size:10}},grid:{color:'#1e293b'}}}};

  function mk(id,cfg){const el=document.getElementById(id);if(!el)return;charts[id]=new Chart(el.getContext('2d'),cfg)}

  // Use slide title to match charts instead of index (robust against slide reordering)
  var title = slides[cur] ? slides[cur].title : '';

  // Slide 1 (Cover): holistic Hospital + Surgeon profile radar
  if(title.includes('System Assessment')&&chartData.wfCoverSnapshot&&chartData.wfCoverSnapshot.length){
    mk('wfCoverSnapshot',{type:'radar',data:{labels:chartData.wfCoverSnapshot.map(d=>d.axis),datasets:[{label:'Profile',data:chartData.wfCoverSnapshot.map(d=>d.value),borderColor:dv5,backgroundColor:'rgba(14,165,233,0.22)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:dv5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{display:false}},scales:{r:{angleLines:{color:'#1e293b'},grid:{color:'#1e293b'},pointLabels:{color:'#cbd5e1',font:{size:11,weight:'bold'}},ticks:{display:false,backdropColor:'transparent'},suggestedMin:0,suggestedMax:100}}}})
  }

  // Hospital Profile: Specialty Pie
  if(title.includes('Hospital Profile')&&chartData.specialtyPie&&chartData.specialtyPie.length){
    mk('chartSpecialtyPie',{type:'doughnut',data:{labels:chartData.specialtyPie.map(d=>d.label),datasets:[{data:chartData.specialtyPie.map(d=>d.value),backgroundColor:['#0ea5e9','#10b981','#eab308','#ef4444','#f97316','#8b5cf6','#06b6d4']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{color:'#94a3b8',font:{size:10}}},datalabels:dlPct}}})
  }
  // Approach Mix: Pie chart
  if(title.includes('Approach Mix')&&chartData.approachMix&&chartData.approachMix.length){
    mk('chartApproachMix',{type:'doughnut',data:{labels:chartData.approachMix.map(d=>d.label),datasets:[{data:chartData.approachMix.map(d=>d.value),backgroundColor:chartData.approachMix.map(d=>d.color||'#666')}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{color:'#94a3b8',font:{size:10}}},datalabels:dlPct}}})
  }
  // Procedure Pareto (horizontal bar)
  if(title.includes('Procedure Volume')&&chartData.procedurePareto&&chartData.procedurePareto.length){
    mk('chartProcedurePareto',{type:'bar',data:{labels:chartData.procedurePareto.map(d=>d.label),datasets:[{label:'Cases',data:chartData.procedurePareto.map(d=>d.value),backgroundColor:dv5,borderRadius:3}]},options:hOpts})
  }
  // Monthly (grouped bar: total + robotic)
  if(title.includes('Monthly')&&chartData.monthlySeason&&chartData.monthlySeason.length){
    mk('chartMonthlySeason',{type:'bar',data:{labels:chartData.monthlySeason.map(d=>d.label),datasets:[{label:'Total Cases',data:chartData.monthlySeason.map(d=>d.value),backgroundColor:dv5,borderRadius:3},{label:'Robotic',data:chartData.monthlySeason.map(d=>d.robotic||0),backgroundColor:'#8b5cf6',borderRadius:3}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}}}})
  }
  // Weekday (grouped bar)
  if(title.includes('Weekday')&&chartData.weekday&&chartData.weekday.length){
    mk('chartWeekday',{type:'bar',data:{labels:chartData.weekday.map(d=>d.label),datasets:[{label:'Total Cases',data:chartData.weekday.map(d=>d.value),backgroundColor:xi,borderRadius:3},{label:'Robotic',data:chartData.weekday.map(d=>d.robotic||0),backgroundColor:'#8b5cf6',borderRadius:3}]},options:opts})
  }
  // Hourly (peak-highlighted bar)
  if(title.includes('Hourly')&&chartData.hourly&&chartData.hourly.length){
    const maxH=Math.max(...chartData.hourly.map(d=>d.value),1);
    mk('chartHourly',{type:'bar',data:{labels:chartData.hourly.map(d=>d.label),datasets:[{label:'OR Utilization %',data:chartData.hourly.map(d=>d.value),backgroundColor:chartData.hourly.map(d=>d.value>=maxH*0.8?xc:dv5),borderRadius:3}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:true,color:'#e2e8f0',font:{size:9,weight:'bold'},anchor:'end',align:'top',formatter:v=>v>=1?Math.round(v)+'%':''}}}})
  }
  // Compatibility Matrix (horizontal grouped)
  if(title.includes('Compatibility')&&chartData.compatibility&&chartData.compatibility.length){
    mk('chartCompatibility',{type:'bar',data:{labels:chartData.compatibility.map(d=>d.label),datasets:[{label:'dV5',data:chartData.compatibility.map(d=>d.dV5),backgroundColor:dv5,borderRadius:2},{label:'Xi',data:chartData.compatibility.map(d=>d.Xi),backgroundColor:xi,borderRadius:2},{label:'X',data:chartData.compatibility.map(d=>d.X),backgroundColor:xc,borderRadius:2},{label:'SP',data:chartData.compatibility.map(d=>d.SP),backgroundColor:sp,borderRadius:2}]},options:{...hOpts,plugins:{...hOpts.plugins,datalabels:{display:false}}}})
  }
  // Design Day (bar)
  if(title.includes('Design Day')&&chartData.designDay){
    mk('chartDesignDay',{type:'bar',data:{labels:chartData.designDay.map(d=>d.label),datasets:[{label:'Cases/Day',data:chartData.designDay.map(d=>d.value),backgroundColor:['#94a3b8',xi,xc,red],borderRadius:4}]},options:opts})
  }
  // Volume Projection (bar)
  if(title.includes('Volume Projection')&&chartData.volumeRamp&&chartData.volumeRamp.length){
    mk('chartVolumeRamp',{type:'bar',data:{labels:chartData.volumeRamp.map(d=>d.label),datasets:[{label:'Robotic Cases',data:chartData.volumeRamp.map(d=>d.value),backgroundColor:dv5,borderRadius:4}]},options:opts})
  }
  // Financial Deep Dive: Breakeven (dual line)
  if(title.includes('Financial')&&chartData.breakeven&&chartData.breakeven.length){
    mk('chartBreakeven',{type:'line',data:{labels:chartData.breakeven.map(d=>d.label),datasets:[{label:'Cumulative Cost',data:chartData.breakeven.map(d=>d.cost),borderColor:red,backgroundColor:'rgba(239,68,68,0.05)',fill:true,tension:0.3,pointRadius:2},{label:'Cumulative Benefit',data:chartData.breakeven.map(d=>d.benefit),borderColor:xi,backgroundColor:'rgba(16,185,129,0.05)',fill:true,tension:0.3,pointRadius:2}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,y:{...opts.scales.y,ticks:{...opts.scales.y.ticks,callback:v=>'$'+v+'M'}}}}})
  }
  // Clinical Dollarization (bar)
  if(title.includes('Dollarization')&&chartData.dollarization&&chartData.dollarization.length){
    mk('chartDollarization',{type:'bar',data:{labels:chartData.dollarization.map(d=>d.label),datasets:[{label:'Annual Savings ($)',data:chartData.dollarization.map(d=>d.value),backgroundColor:xi,borderRadius:4}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:true,color:'#e2e8f0',font:{size:9,weight:'bold'},anchor:'end',align:'top',formatter:v=>'$'+fmtN(v)}}}})
  }
  // Growth Extrapolation (multi-line)
  if(title.includes('Growth')&&chartData.growth&&chartData.growth.length){
    mk('chartGrowth',{type:'line',data:{labels:chartData.growth.map(d=>d.label),datasets:[{label:'Conservative (10%)',data:chartData.growth.map(d=>d.conservative),borderColor:'#94a3b8',borderDash:[5,5],tension:0.3,pointRadius:3},{label:'Baseline (15%)',data:chartData.growth.map(d=>d.baseline),borderColor:dv5,tension:0.3,pointRadius:4,borderWidth:3},{label:'Aggressive (20%)',data:chartData.growth.map(d=>d.aggressive),borderColor:xi,borderDash:[3,3],tension:0.3,pointRadius:3}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:true,color:'#e2e8f0',font:{size:9},anchor:'end',align:'top',formatter:v=>fmtN(v)}}}})
  }

  // ─── WORKFLOW DECK CHART MATCHERS (Step 1 → Step 10) ───────────────

  // Step 1: Hospital Profile — Strategic Impact bars + Peer Benchmark + Publications line
  if(title.includes('Hospital Profile')){
    if(chartData.wfStrategicImpact&&chartData.wfStrategicImpact.length){
      mk('wfStrategicImpact',{type:'bar',data:{labels:chartData.wfStrategicImpact.map(d=>d.label),datasets:[{label:'Impact',data:chartData.wfStrategicImpact.map(d=>d.value),backgroundColor:xi,borderRadius:3}]},options:{...hOpts,plugins:{...hOpts.plugins,datalabels:{display:true,color:'#e2e8f0',font:{size:9,weight:'bold'},anchor:'end',align:'right',offset:4,formatter:(v,ctx)=>chartData.wfStrategicImpact[ctx.dataIndex].display||v}}}})
    }
    if(chartData.wfPeerBenchmark&&chartData.wfPeerBenchmark.length){
      mk('wfPeerBenchmark',{type:'bar',data:{labels:chartData.wfPeerBenchmark.map(d=>d.label),datasets:[{label:'Systems',data:chartData.wfPeerBenchmark.map(d=>d.value),backgroundColor:chartData.wfPeerBenchmark.map(d=>d.is_target?red:dv5),borderRadius:3}]},options:hOpts})
    }
    if(chartData.wfPublicationsByYear&&chartData.wfPublicationsByYear.length){
      mk('wfPublicationsByYear',{type:'line',data:{labels:chartData.wfPublicationsByYear.map(d=>d.label),datasets:[{label:'Publications',data:chartData.wfPublicationsByYear.map(d=>d.value),borderColor:sp,backgroundColor:'rgba(139,92,246,0.1)',fill:true,tension:0.3,pointRadius:5,borderWidth:3}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:true,color:sp,font:{size:10,weight:'bold'},anchor:'end',align:'top'}}}})
    }
  }

  // Step 2: Surgeon Profile — KOL Quadrant scatter
  if(title.includes('Surgeon Profile')&&chartData.wfKolQuadrant&&chartData.wfKolQuadrant.length){
    mk('wfKolQuadrant',{type:'bubble',data:{datasets:[{label:'KOLs',data:chartData.wfKolQuadrant.map(d=>({x:d.x,y:d.y,r:d.r})),backgroundColor:sp,borderColor:sp}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{display:true,color:'#e2e8f0',font:{size:9,weight:'bold'},anchor:'center',align:'top',offset:8,formatter:(v,ctx)=>chartData.wfKolQuadrant[ctx.dataIndex].label.split(' ').slice(-1)[0]},tooltip:{callbacks:{label:(ctx)=>{const d=chartData.wfKolQuadrant[ctx.dataIndex];return d.label+' ('+d.specialty+') · '+d.x+' cases · '+d.y+' pubs'}}}},scales:{x:{title:{display:true,text:'Robotic Volume (cases/yr)',color:'#94a3b8'},ticks:{color:'#94a3b8'},grid:{color:'#1e293b'}},y:{title:{display:true,text:'Publications (5yr)',color:'#94a3b8'},ticks:{color:'#94a3b8'},grid:{color:'#1e293b'}}}}})
  }

  // Step 3: Robotics Program — Procedure Volume + Modality Trend + Tech Gen
  if(title.includes('Robotics Program')){
    if(chartData.wfProcedureVolume&&chartData.wfProcedureVolume.length){
      mk('wfProcedureVolume',{type:'bar',data:{labels:chartData.wfProcedureVolume.map(d=>d.label),datasets:[{label:'In-Hours',data:chartData.wfProcedureVolume.map(d=>d.in_hours),backgroundColor:'#22c55e',borderRadius:2},{label:'After-Hours',data:chartData.wfProcedureVolume.map(d=>d.after_hours),backgroundColor:'#ef4444',borderRadius:2}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,x:{...opts.scales.x,stacked:true},y:{...opts.scales.y,stacked:true}}}})
    }
    if(chartData.wfModalityTrend&&chartData.wfModalityTrend.length){
      mk('wfModalityTrend',{type:'line',data:{labels:chartData.wfModalityTrend.map(d=>d.label),datasets:[{label:'Da Vinci',data:chartData.wfModalityTrend.map(d=>d.davinci),borderColor:'#1e40af',tension:0.3,borderWidth:3,pointRadius:4},{label:'Lap',data:chartData.wfModalityTrend.map(d=>d.lap),borderColor:'#93c5fd',tension:0.3,borderWidth:2,pointRadius:3},{label:'Open',data:chartData.wfModalityTrend.map(d=>d.open),borderColor:'#cbd5e1',borderDash:[3,3],tension:0.3,borderWidth:2,pointRadius:3}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,y:{...opts.scales.y,ticks:{...opts.scales.y.ticks,callback:v=>v+'%'}}}}})
    }
    if(chartData.wfTechGen&&chartData.wfTechGen.length){
      mk('wfTechGen',{type:'bar',data:{labels:chartData.wfTechGen.map(d=>d.label),datasets:[{label:'S',data:chartData.wfTechGen.map(d=>d.S),backgroundColor:'#3b82f6'},{label:'Si',data:chartData.wfTechGen.map(d=>d.Si),backgroundColor:'#f59e0b'},{label:'Xi',data:chartData.wfTechGen.map(d=>d.Xi),backgroundColor:'#22c55e'},{label:'dV5',data:chartData.wfTechGen.map(d=>d.dV5),backgroundColor:'#1e40af'}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,x:{...opts.scales.x,stacked:true},y:{...opts.scales.y,stacked:true}}}})
    }
  }

  // Step 4: Market Profile — Procedure-level market share bars
  if(title.includes('Market Profile')&&chartData.wfMarketShare&&chartData.wfMarketShare.length){
    mk('wfMarketShare',{type:'bar',data:{labels:chartData.wfMarketShare.map(d=>d.label),datasets:[{label:'Hospital',data:chartData.wfMarketShare.map(d=>d.hospital),backgroundColor:'#06b6d4',borderRadius:2},{label:'Total Market',data:chartData.wfMarketShare.map(d=>d.market),backgroundColor:'#94a3b8',borderRadius:2}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,x:{...opts.scales.x,ticks:{...opts.scales.x.ticks,maxRotation:60,minRotation:45,font:{size:9}}}}}})
  }

  // Step 5: Clinical Outcomes — Outcomes Radar + LOS Variability bars
  if(title.includes('Clinical Outcomes')){
    if(chartData.wfOutcomesRadar&&chartData.wfOutcomesRadar.length){
      mk('wfOutcomesRadar',{type:'radar',data:{labels:chartData.wfOutcomesRadar.map(d=>d.label),datasets:[{label:'Top-Decile',data:chartData.wfOutcomesRadar.map(d=>d.top_decile),borderColor:xi,backgroundColor:'rgba(16,185,129,0.15)',borderWidth:1.5,pointRadius:3},{label:'National Avg',data:chartData.wfOutcomesRadar.map(d=>d.national),borderColor:'#94a3b8',borderDash:[3,3],backgroundColor:'rgba(148,163,184,0.1)',borderWidth:1.5,pointRadius:3},{label:'Hospital',data:chartData.wfOutcomesRadar.map(d=>d.hospital),borderColor:'#06b6d4',backgroundColor:'rgba(6,182,212,0.3)',borderWidth:2.5,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}},datalabels:{display:false}},scales:{r:{angleLines:{color:'#1e293b'},grid:{color:'#1e293b'},pointLabels:{color:'#cbd5e1',font:{size:10}},ticks:{color:'#94a3b8',backdropColor:'transparent',font:{size:9}},suggestedMin:0,suggestedMax:100}}}})
    }
    if(chartData.wfLosVariability&&chartData.wfLosVariability.length){
      mk('wfLosVariability',{type:'bar',data:{labels:chartData.wfLosVariability.map(d=>d.label),datasets:[{label:'Open',data:chartData.wfLosVariability.map(d=>d.open),backgroundColor:'#94a3b8'},{label:'MIS',data:chartData.wfLosVariability.map(d=>d.mis),backgroundColor:'#93c5fd'},{label:'dV',data:chartData.wfLosVariability.map(d=>d.davinci),backgroundColor:'#1e40af'}]},options:{...hOpts,plugins:{...hOpts.plugins,datalabels:{display:false}},scales:{...hOpts.scales,x:{...hOpts.scales.x,ticks:{...hOpts.scales.x.ticks,callback:v=>v+' days'}}}}})
    }
  }

  // Step 6: Clinical Benefit Overlay (MOAT) — Cumulative Return line
  if(title.includes('THE MOAT')&&chartData.wfCumulativeReturn&&chartData.wfCumulativeReturn.length){
    mk('wfCumulativeReturn',{type:'line',data:{labels:chartData.wfCumulativeReturn.map(d=>'Y'+d.label),datasets:[{label:'Cumulative Return',data:chartData.wfCumulativeReturn.map(d=>d.cumulative),borderColor:xi,backgroundColor:'rgba(16,185,129,0.15)',fill:true,tension:0.2,pointRadius:5,borderWidth:3},{label:'Breakeven',data:chartData.wfCumulativeReturn.map(d=>0),borderColor:red,borderDash:[6,4],pointRadius:0,borderWidth:2}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,y:{...opts.scales.y,ticks:{...opts.scales.y.ticks,callback:v=>'$'+(v/1e6).toFixed(1)+'M'}}}}})
  }

  // Step 7: Surgeon Commitments — Composition donut + Per-surgeon bed days
  if(title.includes('Surgeon Commitments')){
    if(chartData.wfCommitmentComposition&&chartData.wfCommitmentComposition.length){
      mk('wfCommitmentComposition',{type:'doughnut',data:{labels:chartData.wfCommitmentComposition.map(d=>d.label),datasets:[{data:chartData.wfCommitmentComposition.map(d=>d.value),backgroundColor:chartData.wfCommitmentComposition.map(d=>d.color)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:9}}},datalabels:dlPct}}})
    }
    if(chartData.wfSurgeonBedDays&&chartData.wfSurgeonBedDays.length){
      mk('wfSurgeonBedDays',{type:'bar',data:{labels:chartData.wfSurgeonBedDays.map(d=>d.label),datasets:[{label:'Bed Days Saved',data:chartData.wfSurgeonBedDays.map(d=>d.value),backgroundColor:xi,borderRadius:3}]},options:hOpts})
    }
  }

  // Step 8: Business Plan — Annual P&L stacked bar
  if(title.includes('Business Plan')&&chartData.wfAnnualPnl&&chartData.wfAnnualPnl.length){
    mk('wfAnnualPnl',{type:'bar',data:{labels:chartData.wfAnnualPnl.map(d=>d.label),datasets:[{label:'Revenue',data:chartData.wfAnnualPnl.map(d=>d.revenue),backgroundColor:sp,stack:'returns'},{label:'Cost Avoidance',data:chartData.wfAnnualPnl.map(d=>d.cost_avoidance),backgroundColor:xi,stack:'returns'},{label:'Capital Expense',data:chartData.wfAnnualPnl.map(d=>d.capital_expense),backgroundColor:red,stack:'expenses'},{label:'Operating Expense',data:chartData.wfAnnualPnl.map(d=>d.operating_expense),backgroundColor:'#f59e0b',stack:'expenses'}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:false}},scales:{...opts.scales,y:{...opts.scales.y,ticks:{...opts.scales.y.ticks,callback:v=>'$'+(v/1e6).toFixed(0)+'M'}}}}})
  }

  // Step 9: Performance Tracking — Projected adoption trajectory (annual bars + cumulative line)
  if(title.includes('Performance Tracking')&&chartData.wfPerfProjection&&chartData.wfPerfProjection.length){
    mk('wfPerfProjection',{type:'bar',data:{labels:chartData.wfPerfProjection.map(d=>d.label),datasets:[{type:'line',label:'Cumulative Cases (Plan)',data:chartData.wfPerfProjection.map(d=>d.cumulative),borderColor:xi,backgroundColor:'rgba(16,185,129,0.12)',fill:true,tension:0.3,pointRadius:5,borderWidth:3,yAxisID:'y'},{type:'bar',label:'Annual Cases (Plan)',data:chartData.wfPerfProjection.map(d=>d.annual),backgroundColor:dv5,borderRadius:4,yAxisID:'y'}]},options:{...opts,plugins:{...opts.plugins,datalabels:{display:true,color:'#e2e8f0',font:{size:9,weight:'bold'},anchor:'end',align:'top',formatter:v=>fmtN(v)}},scales:{...opts.scales,y:{...opts.scales.y,ticks:{...opts.scales.y.ticks,callback:v=>fmtN(v)}}}}})
  }
}

document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowDown')nextSlide();if(e.key==='ArrowLeft'||e.key==='ArrowUp')prevSlide()});
<\/script>
</body>
</html>`);
  } catch (error) {
    console.error('[Intuitive Proposal page] Error:', error);
    res.status(500).send('Error loading proposal: ' + error.message);
  }
});

// ── Printable step-by-step guide (browser print → PDF). Uses the SAME builders
//    and numbers as the slide deck; explains the logic behind every step.
//    No audio/narration involved. Linked from the deck header. ──
app.get(`${BASE_PATH}/proposal/:projectId/guide`, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const seq = models.sequelize;
    const [projRows] = await seq.query('SELECT * FROM intuitive_projects WHERE id = :projectId', { replacements: { projectId } });
    const project = projRows[0];
    if (!project) return res.status(404).send('Project not found');
    const hospitalName = project.hospital_name || 'Your Hospital';
    const wfBuilder = require('./services/workflow-presentation-builder');
    const enrichments = await wfBuilder.fetchAllEnrichments(projectId, models);
    const allSlides = wfBuilder.buildWorkflowSlides(project, enrichments, hospitalName);
    // Printable guide omits the sales "Recommendation & Next Steps" closer (kept in the deck).
    const slides = allSlides.filter(s => !/Recommendation & Next Steps/.test(s.title));
    const mountPath = req.baseUrl || BASE_PATH || '';
    const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    // Local formatters (the slide HTML already carries its own metric formatting).
    const fmtN = (n) => (n == null || isNaN(Number(n))) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const money = (n) => { if (n == null || isNaN(Number(n))) return '—'; const v = Number(n); if (v >= 1e9) return '$' + (v/1e9).toFixed(1) + 'B'; if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M'; if (v >= 1e3) return '$' + (v/1e3).toFixed(0) + 'K'; return '$' + Math.round(v); };
    const bpSum = enrichments.bp?.proforma?.investment_summary || {};
    const scSum = enrichments.sc?.summary || {};

    // Per-step elaborated narrative (framing intro + plain-English takeaway), indexed to slide order.
    const narr = [
      { intro: `This assessment makes the business case for ${hospitalName}'s da Vinci robotic-surgery program, built end-to-end from public, auditable records — no figure is supplied by the device maker, and nothing is guessed. The radar shows relative strength across the six dimensions scored on the pages that follow.`,
        takeaway: `Read each step as "the result, plus the formula behind it." Every number traces back to a named public source.` },
      { intro: `Step 1 establishes the hospital's size and how its installed robotic base compares to a matched set of peer institutions. It answers a simple question: how much surgery happens here, and how much robotic headroom remains?`,
        takeaway: `This is the baseline the whole case builds on — surgical scale, and the gap between current robotic use and what peers achieve.` },
      { intro: `Step 2 identifies the surgeons who drive (or could drive) robotic volume — the key opinion leaders — and sorts them by training status. Robotic volume comes from Medicare claims; where a surgeon has no claims match, their captured commitment is used and clearly marked "committed."`,
        takeaway: `Trained and pull-forward surgeons are the engine of the commitments in Step 7. Surgeons still in the pipeline are upside that is deliberately not yet counted.` },
      { intro: `Step 3 shows the current robot fleet and how hard each system is worked, measured against the academic-program benchmark, and compares the open / laparoscopic / robotic case mix to peers.`,
        takeaway: `Only the OPEN share is treated as convertible — and even then the case models just 15% of it. Laparoscopic cases are already minimally invasive and are never counted.` },
      { intro: `Step 4 sizes the regional market and the hospital's share of it. The "remaining opportunity" is shown to size the market; it is explicitly context, not a promise.`,
        takeaway: `The bookable number is NOT the market gap. It is the conservative 15%-of-open conversion (Step 6) plus the surgeon commitments (Step 7).` },
      { intro: `Step 5 compares the hospital's current clinical outcomes — infections, readmissions, length of stay — against national benchmarks. No dollars are claimed here; this step simply locates the clinical headroom.`,
        takeaway: `The gap between open and robotic length-of-stay is the raw material that Step 6 turns into dollars.` },
      { intro: `Step 6 is the centerpiece on the savings side. Converting existing OPEN cases to da Vinci shortens stays and prevents complications, readmissions and infections. This is cost avoidance — money the hospital stops losing on cases it already performs.`,
        takeaway: `This entire step is cost avoidance, not new revenue. It is reported separately and never folded into the IRR — which is exactly what keeps the financial case defensible to a CFO.` },
      { intro: `Step 7 is the revenue engine. Named surgeons commit additional da Vinci cases — net-new volume they bring in from facilities where they are blocked by capacity, plus new recruits. The two cards split that committed volume into Incremental (net-new, drives revenue) and Conversion (open cases, drives savings).`,
        takeaway: `The total is a floor, not a stretch: surgeons still in training count as zero until they commit. Incremental cases drive the revenue and the IRR; converted cases drive the cost avoidance.` },
      { intro: `Step 8 turns the committed volume into a 5-year financial return. Returns ramp the way real adoption happens — not full run-rate on day one — and are discounted against the system's capital cost.`,
        takeaway: `IRR, NPV and payback are built only on the contribution margin of net-new (incremental) revenue. Clinical cost avoidance is shown as a separate line so the board sees real cash vs. cost simply not spent.` },
      { intro: `Step 9 is the accountability layer. The plan approved here becomes a fixed trajectory; after go-live, each surgeon's actual monthly billed cases are measured against it.`,
        takeaway: `Nothing is re-modeled after approval — it is actual volume vs. the committed plan, refreshed monthly, with on-track / at-risk / off-track bands.` },
      { intro: `The closing summary ties the clinical and financial cases together.`,
        takeaway: `Two value streams, kept separate on purpose: money saved (conversion / cost avoidance) and money earned (incremental / new revenue). Together they form a case neither the device maker nor data-only competitors can produce.` },
    ];

    const sections = slides.map((s, i) => {
      const n = narr[i] || {};
      return `
      <section class="step" id="step-${i}">
        <h2 class="step-title">${s.title}</h2>
        ${n.intro ? `<p class="step-intro">${n.intro}</p>` : ''}
        ${s.html}
        ${n.takeaway ? `<div class="takeaway"><span class="tk-label">Takeaway</span> ${n.takeaway}</div>` : ''}
      </section>`;
    }).join('\n');

    const tocHtml = `<div class="toc"><h3>Contents</h3><ol>${slides.map((s, i) => `<li><a href="#step-${i}">${s.title}</a></li>`).join('')}</ol></div>`;

    const execHtml = `
      <div class="exec">
        <h3>Executive Summary — ${hospitalName}</h3>
        <div class="exec-grid">
          <div class="exec-item"><div class="v" style="color:#10b981">${bpSum.project_irr != null ? bpSum.project_irr + '%' : '—'}</div><div class="l">Project IRR</div></div>
          <div class="exec-item"><div class="v" style="color:#06b6d4">${bpSum.estimated_payback_years != null ? bpSum.estimated_payback_years + ' yrs' : '—'}</div><div class="l">Payback</div></div>
          <div class="exec-item"><div class="v" style="color:#a78bfa">${money(bpSum.incremental_revenue_5yr)}</div><div class="l">5-yr Incremental Revenue</div></div>
          <div class="exec-item"><div class="v" style="color:#f59e0b">${money(bpSum.total_cost_avoidance_5yr)}</div><div class="l">5-yr Cost Avoidance</div></div>
          <div class="exec-item"><div class="v" style="color:#06b6d4">${fmtN(scSum.total_incremental_cases)}</div><div class="l">Total Committed Cases / yr</div></div>
          <div class="exec-item"><div class="v" style="color:#a78bfa">${fmtN(scSum.by_category?.pull_forward?.cases)}</div><div class="l">Incremental (net-new) cases</div></div>
          <div class="exec-item"><div class="v" style="color:#34d399">${fmtN(scSum.by_category?.open_to_mis?.cases)}</div><div class="l">Conversion cases</div></div>
          <div class="exec-item"><div class="v" style="color:#8b5cf6">${money(scSum.total_revenue_impact)}</div><div class="l">Annual Incremental Revenue</div></div>
        </div>
      </div>`;

    const methodologyHtml = `
      <div class="appendix">
        <h3>Data Sources &amp; Methodology</h3>
        <p style="font-size:13px;color:#cbd5e1;margin-bottom:8px">Every figure in this guide is built from public, auditable data. Nothing is supplied by the device manufacturer, and nothing is guessed.</p>
        <ul>
          <li><strong>CMS Hospital Compare</strong> — beds, OR count, outcome rates.</li>
          <li><strong>CMS Medicare Cost Report (HCRIS)</strong> — facility financial baseline.</li>
          <li><strong>CMS Physician Volume (MPUP)</strong> &amp; <strong>Medicare Inpatient (MS-DRG)</strong> — surgeon and procedure volumes, and length-of-stay by surgical approach.</li>
          <li><strong>CMS Open Payments</strong> — industry-relationship context for KOLs.</li>
          <li><strong>NPPES / NPI Registry</strong> — surgeon identity and facility affiliations.</li>
          <li><strong>PubMed / NCBI</strong> — live 5-year publication counts.</li>
          <li><strong>IRS Form 990 (ProPublica)</strong> &amp; state filings — non-profit financial context.</li>
          <li><strong>kff.org</strong> — state cost-per-bed-day used to dollarize length-of-stay savings.</li>
          <li><strong>Peer-reviewed literature</strong> (JAMA Surgery, Cochrane, AHRQ HCUP) — open-vs-robotic complication and length-of-stay deltas.</li>
        </ul>
        <p style="font-size:12px;color:#94a3b8;margin-top:10px"><strong>Conservative by design:</strong> only OPEN cases are convertible (never laparoscopic), only 15% of them are modeled to convert, surgeon commitments are counted at a floor (pipeline = 0 until they commit), and clinical cost avoidance is never folded into the capital IRR.</p>
      </div>`;
    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${hospitalName} — Step-by-Step da Vinci Assessment Guide</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:980px;margin:0 auto;padding:18px 28px 60px}
.toolbar{position:sticky;top:0;background:#0f172a;border-bottom:1px solid #1e293b;padding:14px 0;display:flex;gap:12px;align-items:center;justify-content:space-between;z-index:10}
.toolbar .t-left{font-size:13px;color:#94a3b8}
.toolbar a{color:#7dd3fc;text-decoration:none}
.toolbar .print-btn{background:#0ea5e9;border:1px solid #0ea5e9;color:#fff;font-weight:700;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer}
.doc-head{text-align:center;padding:26px 0 14px;border-bottom:2px solid #334155}
.doc-head h1{font-size:30px;color:#f8fafc}
.doc-head .sub{color:#94a3b8;font-size:15px;margin-top:6px}
.doc-head .meta{color:#64748b;font-size:12px;margin-top:10px}
.glossary{background:rgba(14,165,233,0.07);border:1px solid #0ea5e9;border-radius:10px;padding:16px 18px;margin:18px 0;font-size:13px;color:#cbd5e1}
.glossary h3{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#7dd3fc;margin-bottom:8px}
.glossary li{margin:5px 0 5px 18px}
.step{border-top:1px solid #1e293b;padding:22px 0 6px}
.step-title{font-size:20px;color:#f8fafc;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #334155}
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.metric{background:#111c33;border:1px solid #334155;border-radius:10px;padding:14px 10px;text-align:center}
.metric-value{font-size:18px;font-weight:bold;word-break:break-word}
.metric-label{font-size:11px;color:#94a3b8;margin-top:4px}
.info-box{background:#111c33;border:1px solid #334155;border-radius:8px;padding:12px 14px;margin:12px 0;font-size:13px;color:#cbd5e1}
.data-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
.data-table th{text-align:left;color:#94a3b8;border-bottom:1px solid #334155;padding:7px 8px;text-transform:uppercase;font-size:10px;letter-spacing:1px}
.data-table td{padding:7px 8px;border-bottom:1px solid #1e293b;color:#e2e8f0}
.chart-box,.chart-2col{display:none !important}
.step-intro{font-size:14px;color:#cbd5e1;margin:8px 0 6px;line-height:1.65}
.takeaway{margin-top:14px;background:rgba(16,185,129,0.07);border-left:3px solid #10b981;border-radius:0 8px 8px 0;padding:10px 14px;font-size:13px;color:#d1fae5;line-height:1.6}
.takeaway .tk-label{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#6ee7b7;font-weight:700;margin-right:8px}
.toc{background:#111c33;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin:18px 0}
.toc h3{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;margin-bottom:8px}
.toc ol{margin-left:20px;font-size:14px;color:#cbd5e1}
.toc li{margin:4px 0}
.toc a{color:#7dd3fc;text-decoration:none}
.exec{background:linear-gradient(135deg,rgba(14,165,233,0.10),rgba(16,185,129,0.06));border:1px solid #0ea5e9;border-radius:12px;padding:18px 20px;margin:18px 0}
.exec h3{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#7dd3fc;margin-bottom:12px}
.exec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.exec-item .v{font-size:24px;font-weight:bold}
.exec-item .l{font-size:11px;color:#94a3b8;margin-top:2px}
.appendix{border-top:2px solid #334155;margin-top:26px;padding-top:18px}
.appendix h3{font-size:16px;color:#f8fafc;margin-bottom:10px}
.appendix li{margin:5px 0 5px 18px;font-size:12px;color:#cbd5e1}
@page{margin:1.4cm}
@media print{
  .toolbar{display:none}
  .wrap{max-width:100%;padding:0}
  .step{page-break-before:always}
  .step:first-of-type{page-break-before:avoid}
  .toc{page-break-after:always}
  .exec,.glossary,.takeaway,.appendix{page-break-inside:avoid}
}
</style></head>
<body>
<div class="wrap">
  <div class="toolbar">
    <span class="t-left">Charts &amp; voice narration are in the <a href="${mountPath}/proposal/${projectId}">interactive deck</a> · this is the printable detail version</span>
    <button class="print-btn" onclick="window.print()">Save as PDF / Print</button>
  </div>
  <div class="doc-head">
    <h1>${hospitalName}</h1>
    <div class="sub">da Vinci System Assessment · Step-by-Step Guide — the logic behind every number</div>
    <div class="meta">Prepared by SurgicalMind AI · Digit2AI · ${generated} · CONFIDENTIAL — for executive review</div>
  </div>
  <div class="glossary">
    <h3>Two terms to keep straight</h3>
    <ul>
      <li><strong style="color:#34d399">Conversion (cost avoidance)</strong> — this hospital's own existing OPEN cases switched to da Vinci. Same case, better technique &rarr; shorter stays, fewer complications &rarr; money the hospital <strong>stops losing</strong>. No new volume. (Step 6)</li>
      <li><strong style="color:#a78bfa">Incremental (new revenue)</strong> — net-new cases surgeons commit to bring IN from other hospitals that lack da Vinci capacity &rarr; new volume &rarr; new revenue &rarr; drives the IRR / payback. (Steps 7&ndash;8)</li>
      <li>They are never added into one ROI figure: the IRR is built only on the incremental revenue; conversion savings are reported separately.</li>
    </ul>
  </div>
  ${execHtml}
  ${tocHtml}
  ${sections}
  ${methodologyHtml}
  <div class="info-box" style="margin-top:24px;text-align:center;color:#64748b">End of guide · every figure is sourced from public, auditable data — see each step's "How these numbers are calculated".</div>
</div>
</body></html>`);
  } catch (error) {
    console.error('[Intuitive Proposal guide] Error:', error);
    res.status(500).send('Error loading guide: ' + error.message);
  }
});

// ============================================================================
// DASHBOARD (SPA)
// ============================================================================

if (fs.existsSync(dashboardDistPath)) {
  console.log('  Serving INTUITIVE dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    if (req.path.startsWith(`${BASE_PATH}/api/`) || req.path.startsWith(`${BASE_PATH}/health`) || req.path.startsWith(`${BASE_PATH}/proposal/`) || req.path.startsWith(`${BASE_PATH}/survey/`)) {
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
  console.log('  INTUITIVE dashboard not built yet (no dist/ folder)');
  app.get(`${BASE_PATH}/`, (req, res) => {
    res.json({ status: 'ok', message: 'Intuitive Surgical Matching Engine API', docs: '/intuitive/api/v1/' });
  });
}

module.exports = app;
