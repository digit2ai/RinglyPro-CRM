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
try { app.use(`${BASE_PATH}/api/v1/dashboard`, requireAuth, require('./routes/dashboard')); } catch (e) { console.error('Dashboard route load error:', e.message); }

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
    const slides = _buildSlideHTML(analysis, hospitalName);
    const slidesJSON = JSON.stringify(slides);
    const mountPath = req.baseUrl || BASE_PATH || '';
    const audioBase = `${mountPath}/api/v1/proposal/${projectId}/audio`;
    const chartData = _buildChartData(analysis);
    const chartDataJSON = JSON.stringify(chartData);

    // Auto-generate audio if not cached (background, non-blocking)
    const audioDir = path.join(_AUDIO_DIR, String(projectId));
    const slide0Audio = path.join(audioDir, 'slide_0.mp3');
    if (!fs.existsSync(slide0Audio)) {
      const genScripts = _buildNarrationScripts(analysis, hospitalName);
      setImmediate(async () => {
        try {
          if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
          for (let i = 0; i < genScripts.length; i++) {
            const ap = path.join(audioDir, 'slide_' + i + '.mp3');
            if (!fs.existsSync(ap)) {
              console.log('[Intuitive Proposal] Auto-generating audio slide ' + (i + 1) + '/' + genScripts.length + ' for project ' + projectId);
              await _generateTTS(genScripts[i], ap);
            }
          }
          console.log('[Intuitive Proposal] Audio ready for project ' + projectId);
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
</style>
</head>
<body>
<div class="splash" id="splash">
  <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" style="width:280px;height:auto;margin-bottom:16px">
  <h1>${hospitalName}</h1>
  <p>SurgicalMind AI &mdash; da Vinci System Assessment</p>
  <button onclick="startPresentation()">Tap to Start</button>
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
    </div>
  </div>
  <div class="slide-area"><div class="slide" id="slideContent"></div></div>
  <div style="padding:8px 0;display:flex;justify-content:center"><div class="dots" id="dots"></div></div>
</div>
<audio id="audio" preload="none"></audio>
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

function startPresentation(){document.getElementById('splash').style.display='none';document.getElementById('app').style.display='flex';render();playAudio()}
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
function playAudio(){audio.src=audioBase+'/'+cur;audio.play().catch(()=>{})}
audio.onended=function(){if(auto&&cur<slides.length-1){cur++;render();playAudio()}else if(auto){auto=false;updatePlayBtn()}}

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
