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
    voice_settings: { stability: 0.78, similarity_boost: 0.75, style: 0.08, use_speaker_boost: true, speed: 0.82 }
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
 * Convert a number to spoken words for natural TTS
 * e.g. 228274 → "two hundred twenty-eight thousand, two hundred seventy-four"
 */
function numberToWords(n) {
  if (n == null || isNaN(n)) return 'not available';
  n = Math.round(Number(n));
  if (n === 0) return 'zero';

  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function chunk(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + chunk(num % 100) : '');
  }

  if (n < 0) return 'negative ' + numberToWords(-n);

  // For very large numbers (>10M), use approximate form
  if (n >= 10000000) return Math.round(n / 1000000) + ' million';
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    const rest = n % 1000000;
    return chunk(m) + ' million' + (rest > 0 ? ', ' + numberToWords(rest) : '');
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    return chunk(k) + ' thousand' + (rest > 0 ? ', ' + chunk(rest) : '');
  }
  return chunk(n);
}

/**
 * Speak a number naturally — spells out for TTS consistency
 */
function say(n) {
  if (n == null || isNaN(n)) return 'not available';
  return numberToWords(n);
}

/**
 * Speak a percentage naturally
 */
function sayPct(n) {
  if (n == null || isNaN(n)) return 'not available';
  return Number(n).toFixed(1).replace('.0', '') + ' percent';
}

/**
 * Build narration scripts from analysis data
 * Uses spelled-out numbers and natural pauses for consistent TTS delivery
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

  return [
    // Slide 0: Title — warm, welcoming
    `Welcome to the PINAXIS Dashboard Playbook... for ${companyName}. This presentation contains a comprehensive warehouse data analysis... based on your actual operational data. Let's walk through the key findings together.`,

    // Slide 1: Data Overview — deliberate pacing between metrics
    `Let's begin with the data overview. We analyzed a total of ${say(skus.total)} SKUs in your item master. Of those... ${say(skus.active)} are actively moved in outbound operations. Your operation processed ${say(orders.total_orders)} orders... containing ${say(orders.total_orderlines)} individual order lines. That gives us an average of ${orders.avg_lines_per_order || 'about ten'} lines per order. The total pick unit volume comes to approximately ${say(orders.total_units)} units. And importantly... ${sayPct(skus.bin_capable_pct)} of your SKUs are bin-capable... which indicates strong automation potential.`,

    // Slide 2: Fit/No-Fit
    `Now let's look at the fit analysis. Out of ${say(fit.total_items)} items in your master data... ${say(fit.items_with_dimensions)} have complete dimension records. ${fit.items_without_dimensions ? `That leaves ${say(fit.items_without_dimensions)} items with missing dimensions.` : ''} ${fit.bins?.length ? `Using the largest PINAXIS standard bin... at six hundred by four hundred by four hundred fifty millimeters... ${sayPct(fit.bins[fit.bins.length - 1]?.fit_pct_total)} of all items fit inside. This represents strong conveyability for automated storage and retrieval.` : ''}`,

    // Slide 3: ABC Classification
    `The ABC classification reveals a classic Pareto distribution... with a Gini coefficient of ${abc.gini || 'zero point nine'}. ${abc.classes?.A ? `Your A-items... the fast movers... represent just ${sayPct(abc.classes.A.pct)} of all SKUs. But they drive ${sayPct(abc.classes.A.pct_lines || abc.classes.A.volume_pct)} of your order lines... and ${sayPct(abc.classes.A.pct_picks || abc.classes.A.volume_pct)} of pick volume.` : ''} ${abc.classes?.B ? `B-items account for ${sayPct(abc.classes.B.pct)} of SKUs... and ${sayPct(abc.classes.B.pct_lines || abc.classes.B.volume_pct)} of lines.` : ''} ${abc.classes?.D ? `We also identified ${say(abc.classes.D.count)} dead stock SKUs... with zero outbound activity.` : ''} This high concentration means... a focused goods-to-person automation zone can handle the vast majority of your throughput.`,

    // Slide 4: XYZ Seasonality
    `Moving to the XYZ seasonality analysis... which reveals your demand patterns over time. ${xyz.classes?.[0]?.class === 'X' ? `${say(xyz.classes[0].moved_skus)} items are classified as X... meaning non-seasonal with consistent demand. These represent just ${sayPct(xyz.classes[0].pct_moved_skus)} of moved SKUs... but generate ${sayPct(xyz.classes[0].pct_lines)} of all order lines.` : ''} ${xyz.classes?.[2]?.class === 'Z' ? `On the other hand... ${say(xyz.classes[2].moved_skus)} Z-class items are seasonal or intermittent... making up ${sayPct(xyz.classes[2].pct_moved_skus)} of SKUs but only ${sayPct(xyz.classes[2].pct_lines)} of lines.` : ''} The automation system should be optimized for the consistent X items... while maintaining flexibility for seasonal Z items.`,

    // Slide 5: Order Profile
    `Let's look at the order profile. A total of ${say(orderStruct.total_orders)} orders were analyzed. ${sayPct(orderStruct.single_line_pct)} are single-line orders... while ${sayPct(orderStruct.multi_line_pct)} are multi-line. ${orderStruct.multi_line_pct > 50 ? 'The predominantly multi-line structure indicates complex fulfillment patterns... well-suited for zone-based or wave-picking automation.' : 'This balanced mix supports flexible automation strategies.'} The average of ${orders.avg_lines_per_order || 'about ten'} lines per order... shapes the pick station and batch size design.`,

    // Slide 6: Percentiles / Design Basis
    `Now for the percentile analysis... which determines our design basis. On an average day... your operation processes ${say(avgDay.order_lines)} order lines... ${say(avgDay.pick_units)} pick units... and ${say(avgDay.orders)} orders. The seventy-fifth percentile... our recommended design day... comes to ${say(p75Day.order_lines)} lines per day. That translates to approximately ${say(Math.round((p75Day.order_lines || 0) / (dailyPerc.working_hours || 12)))} lines per hour... across a ${dailyPerc.working_hours || 'twelve'} hour shift. The absolute maximum day reached ${say(maxDay.order_lines)} lines. Designing to the seventy-fifth percentile... ensures the system handles peak demand seventy-five percent of the time... while remaining cost-effective.`,

    // Slide 7: Extrapolation
    `For the ${extrap.years || 'five'}-year growth projection... we applied ${extrap.growth_rate_pct || 'five'} percent annual growth to all key metrics. ${y5.design_day ? `By year five... the design day increases to ${say(y5.design_day.order_lines)} order lines per day... or approximately ${say(y5.design_day.lines_per_hour)} per hour. Pick units grow to ${say(y5.design_day.pick_units)} per day.` : ''} ${extrap.baseline ? `Starting from today's baseline of ${say(extrap.baseline.order_lines)} lines per day...` : ''} the PINAXIS solution is engineered with sufficient headroom... to accommodate this projected growth without requiring major system modifications.`,

    // Slide 8: Product Recommendations
    `Based on the complete data analysis... our product recommendation engine has matched the optimal PINAXIS intralogistics solutions to your warehouse profile. These recommendations consider your throughput volume... SKU characteristics... order complexity... and bin compatibility. Each product is scored on a fit scale from zero to one hundred... reflecting how well it addresses your specific operational requirements.`,

    // Slide 9: Client Benefits
    `The benefit projections quantify the return on investment for automation in your operation. Using data-driven models... we calculate estimated annual savings... payback periods... and improvement percentages across key operational areas. These projections are grounded in your actual warehouse data... not industry benchmarks... giving you reliable numbers for your business case.`,

    // Slide 10: Hourly Throughput
    `The hourly throughput profile shows how activity distributes across a twenty-four hour cycle. Understanding peak hours is critical for system dimensioning. The automation must sustain the highest throughput rates during the busiest operational windows... while maintaining efficiency during lower-volume periods. This profile directly informs the number of workstations... conveyor capacity... and buffer sizing.`,

    // Slide 11: Top 10 SKUs
    `The top ten SKUs by pick volume represent your highest-frequency items... and are prime candidates for goods-to-person automation zones. ${abc.top_skus?.[0] ? `Your highest-frequency SKU... item ${abc.top_skus[0].sku}... alone accounts for approximately ${say(Math.round(abc.top_skus[0].picks))} picks... or ${sayPct(abc.top_skus[0].pct)} of total pick volume.` : ''} Placing these fast movers in dedicated high-performance zones... dramatically reduces travel time and increases overall system efficiency.`,

    // Slide 12: Next Steps — warm closing
    `To conclude... here are the recommended next steps. First... review the concept designs with our engineering team. Second... run warehouse simulations to validate throughput targets and optimize layout. Third... review the commercial proposal with R.O.I. projections. Fourth... connect your W.M.S. or E.R.P. system for live data feeds via A.P.I. integration. And fifth... proceed with phased implementation... with full PINAXIS engineering support and O.E.E. tracking from day one. Thank you for exploring the PINAXIS Dashboard Playbook. We look forward to partnering on your warehouse automation journey.`
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
  const chartBox = (id, h = 220) => `<div class="chart-box"><canvas id="${id}" height="${h}"></canvas></div>`;

  return [
    // Slide 0: Title
    { title: 'PINAXIS Dashboard Playbook', html: `
      <div style="text-align:center;padding:40px 0">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="PINAXIS" style="width:min(280px,50vw);height:min(280px,50vw);border-radius:24px;margin-bottom:30px;box-shadow:0 8px 32px rgba(59,130,246,0.2)">
        <h1 style="font-size:min(42px,7vw);margin:0;color:#f8fafc">${esc(companyName)}</h1>
        <p style="color:#94a3b8;margin-top:12px;font-size:min(18px,4vw)">Warehouse Data Analysis & Automation Proposal</p>
        <p style="color:#64748b;margin-top:8px">${dateRange.from || ''} to ${dateRange.to || ''} · ${dailyPerc.days || ''} operating days</p>
        <div style="margin-top:30px;display:inline-flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:#10b981;animation:pulse 2s infinite"></div><span style="color:#10b981;font-size:14px">Rachel Voice AI — Auto-narrating</span></div>
      </div>` },
    // Slide 1: Data Overview + pie charts
    { title: 'Data Analysis — Gaining Valuable Insights', html: `
      <div class="metrics-grid">${metric('Total SKUs', fmt(skus.total))}${metric('Moved SKUs', fmt(skus.active))}${metric('Total Orders', fmt(orders.total_orders))}${metric('Order Lines', fmt(orders.total_orderlines))}</div>
      <div class="metrics-grid">${metric('Pick Units', fmt(orders.total_units), '#10b981')}${metric('Avg Lines/Order', orders.avg_lines_per_order || '—', '#10b981')}${metric('Bin Capable', (skus.bin_capable_pct || '—') + '%', '#10b981')}</div>
      <div class="charts-row">${(ov.by_order_type || []).length ? chartBox('chartOrderType', 180) : ''}${(ov.by_temperature || []).length ? chartBox('chartTempZone', 180) : ''}${(ov.by_picking_unit || []).length ? chartBox('chartPickUnit', 180) : ''}</div>` },
    // Slide 2: Fit/No-Fit + donut
    { title: 'Fit / No-Fit Analysis', html: `
      <div class="metrics-grid">${metric('Total Items', fmt(fit.total_items))}${metric('With Dimensions', fmt(fit.items_with_dimensions))}${metric('Missing Dims', fmt(fit.items_without_dimensions), '#eab308')}${metric('Bin Capable', (fit.overall_bin_capable_pct || '—') + '%', '#10b981')}</div>
      ${chartBox('chartFitDonut', 200)}
      ${(fit.bins || []).map(b => `<div class="info-box">Bin <strong>${b.name}</strong> mm: ${fmt(b.fit_count)} fit (${b.fit_pct_total}% of total)</div>`).join('')}` },
    // Slide 3: ABC + bar chart
    { title: 'ABC Classification', html: `
      <div class="metrics-grid">${Object.entries(abc.classes || {}).map(([cls, d]) => {
        const colors = { A: '#10b981', B: '#eab308', C: '#94a3b8', D: '#ef4444' };
        const labels = { A: 'Fast Movers', B: 'Medium', C: 'Slow', D: 'Dead Stock' };
        return metric(cls + ' — ' + labels[cls], fmt(d.count) + ' (' + d.pct + '%)', colors[cls]);
      }).join('')}</div>
      ${chartBox('chartABC', 200)}
      <table class="data-table"><tr><th>Class</th><th>SKUs</th><th>% SKUs</th><th>% Lines</th><th>% Picks</th><th>% Orders</th></tr>
      ${Object.entries(abc.classes || {}).map(([cls, d]) => `<tr><td><strong>${cls}</strong></td><td>${fmt(d.count)}</td><td>${d.pct}%</td><td>${d.pct_lines != null ? d.pct_lines : d.volume_pct}%</td><td>${d.pct_picks != null ? d.pct_picks : d.volume_pct}%</td><td>${d.pct_orders != null ? d.pct_orders : '—'}%</td></tr>`).join('')}
      </table>
      <div class="metrics-grid">${metric('Gini', abc.gini || '—')}${metric('Active SKUs', fmt(abc.total_skus))}${metric('Dead Stock', fmt(abc.dead_stock_count), '#ef4444')}${metric('Design Day (P75)', fmt(p75Day.order_lines) + ' lines')}</div>` },
    // Slide 4: XYZ + chart
    { title: 'XYZ Seasonality Analysis', html: `
      <div class="metrics-grid">${(xyz.classes || []).map(c => {
        const colors = { X: '#ef4444', Y: '#eab308', Z: '#94a3b8' };
        return metric(c.class + ' (' + c.pct_moved_skus + '%)', fmt(c.moved_skus) + ' SKUs', colors[c.class]);
      }).join('')}</div>
      ${chartBox('chartXYZ', 200)}
      <table class="data-table"><tr><th>Class</th><th>SKUs</th><th>% Lines</th><th>% Picks</th><th>% Orders</th></tr>
      ${(xyz.classes || []).map(c => `<tr><td><strong>${c.class}</strong></td><td>${fmt(c.moved_skus)}</td><td>${c.pct_lines}%</td><td>${c.pct_picks}%</td><td>${c.pct_orders}%</td></tr>`).join('')}</table>` },
    // Slide 5: Order Profile + histogram
    { title: 'Order Profile', html: `
      <div class="metrics-grid">${metric('Total Orders', fmt(orderStruct.total_orders))}${metric('Single-Line', (orderStruct.single_line_pct || '—') + '%')}${metric('Multi-Line', (orderStruct.multi_line_pct || '—') + '%', '#10b981')}${metric('Avg Lines/Order', orders.avg_lines_per_order || '—')}</div>
      ${(orderStruct.histogram || []).length ? chartBox('chartHistogram', 200) : ''}` },
    // Slide 6: Percentiles + bar chart
    { title: 'Percentiles — Design Basis', html: `
      <div class="metrics-grid">${metric('Avg Day Lines', fmt(avgDay.order_lines))}${metric('P75 (Design Day)', fmt(p75Day.order_lines), '#10b981')}${metric('Max Day', fmt(maxDay.order_lines), '#ef4444')}</div>
      ${chartBox('chartPercentiles', 200)}
      <div class="info-box"><strong>Design Hour (${dailyPerc.working_hours || 12}h):</strong> ${fmt(Math.round((p75Day.order_lines || 0) / (dailyPerc.working_hours || 12)))} lines/hr · ${fmt(Math.round((p75Day.pick_units || 0) / (dailyPerc.working_hours || 12)))} picks/hr</div>` },
    // Slide 7: Extrapolation + growth chart
    { title: (extrap.years || 5) + '-Year Growth Extrapolation', html: `
      <div class="info-box"><strong>Growth Rate:</strong> ${extrap.growth_rate_pct || 5}% annual</div>
      ${(extrap.projections || []).length ? chartBox('chartGrowth', 200) : ''}
      ${y5.design_day ? `<div class="metrics-grid">${metric('Y5 Lines/Day', fmt(y5.design_day.order_lines), '#eab308')}${metric('Y5 Picks/Day', fmt(y5.design_day.pick_units), '#eab308')}${metric('Y5 Orders/Day', fmt(y5.design_day.orders), '#eab308')}${metric('Growth Factor', 'x' + y5.growth_factor)}</div>` : ''}` },
    // Slide 8: Products
    { title: 'Product Recommendations', html: `<div class="info-box">Product recommendations are matched to your warehouse profile based on throughput, SKU characteristics, and order complexity. Contact your PINAXIS representative for the full product portfolio.</div>` },
    // Slide 9: Benefits
    { title: 'Client Benefit Projections', html: `<div class="info-box">Data-driven ROI projections based on warehouse analytics and PINAXIS product matching. Detailed savings estimates and payback calculations available in the full report.</div>` },
    // Slide 10: Hourly + bar chart
    { title: 'Hourly Throughput', html: `${chartBox('chartHourly', 220)}
      <div class="info-box">Peak hours highlighted — the automation must sustain highest throughput during these operational windows.</div>` },
    // Slide 11: Top SKUs + bar chart
    { title: 'Top 10 SKUs', html: `
      ${(abc.top_skus || []).length ? chartBox('chartTopSKUs', 220) : ''}
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

/**
 * Build chart data for client-side Chart.js rendering
 */
function buildChartData(analysis) {
  const a = analysis || {};
  const ov = a.overview_kpis || {};
  const fit = a.fit_analysis || {};
  const abc = a.abc_classification || {};
  const xyz = a.xyz_classification || {};
  const dailyPerc = a.daily_percentiles || {};
  const dailyVals = dailyPerc.daily_values || {};
  const avgDay = dailyVals.average || {};
  const p75Day = dailyVals.p75 || {};
  const maxDay = dailyVals.max || {};
  const extrap = a.extrapolation || {};
  const orderStruct = a.order_structure || {};
  const hourly = a.throughput_hourly || {};

  return {
    orderType: (ov.by_order_type || []).map(d => ({ label: d.name, value: d.pct_units || 0 })),
    tempZone: (ov.by_temperature || []).map(d => ({ label: d.name, value: d.pct_units || 0 })),
    pickUnit: (ov.by_picking_unit || []).map(d => ({ label: d.name, value: d.pct_units || 0 })),
    fitDonut: [
      { label: 'Fit', value: fit.bins?.[fit.bins.length - 1]?.fit_count || 0, color: '#10b981' },
      { label: 'Missing Dims', value: fit.items_without_dimensions || 0, color: '#eab308' },
      { label: 'No Fit', value: Math.max(0, (fit.items_with_dimensions || 0) - (fit.bins?.[fit.bins.length - 1]?.fit_count || 0)), color: '#ef4444' }
    ].filter(d => d.value > 0),
    abc: Object.entries(abc.classes || {}).map(([cls, d]) => ({
      label: cls, volume: d.pct_lines || d.volume_pct || 0,
      color: { A: '#10b981', B: '#eab308', C: '#94a3b8', D: '#ef4444' }[cls]
    })),
    xyz: (xyz.classes || []).map(c => ({
      label: c.class, lines: c.pct_lines || 0, picks: c.pct_picks || 0, orders: c.pct_orders || 0
    })),
    histogram: (orderStruct.histogram || []).map(h => ({ label: h.label, count: h.count || 0 })),
    percentiles: [
      { label: 'Order Lines', avg: avgDay.order_lines || 0, p75: p75Day.order_lines || 0, max: maxDay.order_lines || 0 },
      { label: 'Pick Units', avg: Math.round((avgDay.pick_units || 0) / 1000), p75: Math.round((p75Day.pick_units || 0) / 1000), max: Math.round((maxDay.pick_units || 0) / 1000) },
      { label: 'Orders', avg: avgDay.orders || 0, p75: p75Day.orders || 0, max: maxDay.orders || 0 }
    ],
    growth: (extrap.projections || []).map(p => ({
      label: 'Y' + p.year, lines: p.design_day?.order_lines || 0, orders: p.design_day?.orders || 0
    })),
    hourly: (hourly.hours || []).map(h => ({ label: String(h.hour || h.label || ''), value: h.orderlines || 0 })),
    topSkus: (abc.top_skus || []).slice(0, 10).map(s => ({ label: s.sku, value: Math.round(s.picks || 0) }))
  };
}

module.exports = { router, proposalJobs, buildSlideHTML, buildNarrationScripts, generateTTS, AUDIO_DIR, buildChartData };
