'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

// ffmpeg setup
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

// ============================================================================
// Video Proposal Generator
// Combines Puppeteer slide screenshots + ElevenLabs TTS → MP4
// ============================================================================

const SLIDE_COUNT = 13;
const SCREENSHOT_WIDTH = 1920;
const SCREENSHOT_HEIGHT = 1080;

// ElevenLabs TTS voice — "Rachel" professional female
// Default to Rachel; can be overridden via ELEVENLABS_VOICE_ID env
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

/**
 * Generate narration scripts for each slide based on analysis data
 */
function generateSlideScripts(analysis, companyName, recommendations, benefits) {
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
  const hourly = a.throughput_hourly || {};
  const recs = Array.isArray(recommendations) ? recommendations : recommendations?.recommendations || [];
  const ben = benefits || {};
  const fmt = n => n != null ? Number(n).toLocaleString() : 'not available';

  return [
    // Slide 0: Title
    `Welcome to the PINAXIS Dashboard Playbook for ${companyName}. This presentation contains a comprehensive warehouse data analysis based on your actual operational data. Let's walk through the findings together.`,

    // Slide 1: Data Overview
    `Let's start with the data overview. We analyzed ${fmt(skus.total)} total SKUs, of which ${fmt(skus.active)} are actively moved. Your operation processed ${fmt(orders.total_orders)} orders containing ${fmt(orders.total_orderlines)} order lines, with an average of ${orders.avg_lines_per_order || 'about 10'} lines per order. The total pick unit volume is ${fmt(orders.total_units)} units. ${skus.bin_capable_pct || 0}% of your SKUs are bin-capable, indicating strong automation potential. The data spans from ${dateRange.from || 'the start'} to ${dateRange.to || 'the end'}, covering ${dailyPerc.days || 370} operating days.${ov.by_order_type?.length ? ` By order type, store replenishment accounts for ${ov.by_order_type[0]?.pct_units || 0}% of pick units.` : ''}`,

    // Slide 2: Fit/No-Fit
    `Now let's look at the fit analysis. Out of ${fmt(fit.total_items)} items in your master data, ${fmt(fit.items_with_dimensions)} have complete dimensions. ${fit.items_without_dimensions ? `${fmt(fit.items_without_dimensions)} items are missing dimension data.` : ''} ${fit.bins?.length ? `Using the largest PINAXIS standard bin at 600 by 400 by 450 millimeters, ${fit.bins[fit.bins.length - 1]?.fit_pct_total || 0}% of all items fit — this represents strong conveyability for automation.` : ''} The overall bin-capable rate of ${fit.overall_bin_capable_pct || 0}% of dimensioned items confirms that the majority of your product range is suitable for automated storage and retrieval.`,

    // Slide 3: ABC Classification
    `The ABC classification reveals a classic Pareto distribution with a Gini coefficient of ${abc.gini || 0}. ${abc.classes?.A ? `Your A-items represent just ${abc.classes.A.pct}% of SKUs but drive ${abc.classes.A.pct_lines || abc.classes.A.volume_pct}% of order lines and ${abc.classes.A.pct_picks || abc.classes.A.volume_pct}% of pick volume.` : ''} ${abc.classes?.B ? `B-items account for ${abc.classes.B.pct}% of SKUs and ${abc.classes.B.pct_lines || abc.classes.B.volume_pct}% of lines.` : ''} ${abc.classes?.D ? `Notably, ${fmt(abc.classes.D.count)} SKUs — ${abc.classes.D.pct}% of total — are dead stock with zero outbound activity.` : ''} This concentration means a small, focused goods-to-person zone can handle the vast majority of your throughput.`,

    // Slide 4: XYZ Seasonality
    `The XYZ seasonality analysis shows demand patterns over time. ${xyz.classes?.length ? `${xyz.classes[0]?.class === 'X' ? `${fmt(xyz.classes[0].moved_skus)} X-class items — just ${xyz.classes[0].pct_moved_skus}% of moved SKUs — are non-seasonal and generate ${xyz.classes[0].pct_lines}% of all order lines.` : ''} ${xyz.classes[2]?.class === 'Z' ? `Meanwhile, ${fmt(xyz.classes[2].moved_skus)} Z-class items are seasonal or intermittent, representing ${xyz.classes[2].pct_moved_skus}% of SKUs but only ${xyz.classes[2].pct_lines}% of lines.` : ''}` : ''} This tells us the automation system needs to be optimized for consistent, high-frequency X items while maintaining flexibility for seasonal Z items.`,

    // Slide 5: Order Profile
    `Looking at the order profile, ${fmt(orderStruct.total_orders)} orders were analyzed. ${orderStruct.single_line_pct || 0}% are single-line orders, while ${orderStruct.multi_line_pct || 0}% are multi-line. ${orderStruct.multi_line_pct > 50 ? 'The predominantly multi-line structure indicates complex fulfillment patterns well-suited for zone-based or wave-picking automation.' : 'The balanced order mix supports flexible automation strategies.'} The average of ${orders.avg_lines_per_order || 0} lines per order shapes the pick station and batch size design.`,

    // Slide 6: Percentiles / Design Basis
    `The percentile analysis determines the design basis for your automation system. The average day processes ${fmt(avgDay.order_lines)} order lines, ${fmt(avgDay.pick_units)} pick units, and ${fmt(avgDay.orders)} orders. The 75th percentile — our recommended design day — is ${fmt(p75Day.order_lines)} lines per day, or ${fmt(Math.round((p75Day.order_lines || 0) / (dailyPerc.working_hours || 12)))} lines per hour across a ${dailyPerc.working_hours || 12}-hour shift. The absolute maximum day reached ${fmt(maxDay.order_lines)} lines. Designing to the 75th percentile ensures the system handles peak demand 75% of the time while remaining cost-effective.`,

    // Slide 7: Extrapolation
    `For the ${extrap.years || 5}-year growth projection, we applied ${extrap.growth_rate_pct || 5}% annual growth. ${y5.design_day ? `By year 5, the design day increases to ${fmt(y5.design_day.order_lines)} order lines per day, or ${fmt(y5.design_day.lines_per_hour)} per hour. Pick units grow to ${fmt(y5.design_day.pick_units)} per day.` : ''} ${extrap.baseline ? `Starting from a baseline of ${fmt(extrap.baseline.order_lines)} lines per day today,` : ''} the PINAXIS solution is designed with headroom to accommodate this projected growth without requiring major system modifications.`,

    // Slide 8: Product Recommendations
    `Based on the complete analysis, ${recs.length > 0 ? `we recommend ${recs.length} PINAXIS intralogistics solutions. ${recs.slice(0, 3).map(r => `${r.product_name} scores ${Math.round(r.fit_score || 0)} out of 100 for fit`).join('. ')}.` : 'our product recommendation engine will match the optimal PINAXIS solutions to your warehouse profile.'} These recommendations are data-driven, matching your throughput requirements, SKU characteristics, and order complexity to our product portfolio.`,

    // Slide 9: Client Benefits
    `${ben.summary ? `The benefit projection shows an automation readiness score of ${ben.summary.automation_readiness_score || 0} out of 100. Estimated annual savings range up to €${Math.round((ben.summary.annual_savings_high || 0) / 1000)}K, with a payback period of ${ben.summary.payback_months_low || 0} to ${ben.summary.payback_months_high || 0} months.` : 'The benefit projections will quantify the ROI impact of automation for your operation.'} ${(ben.projections || []).length > 0 ? `Key improvements include ${ben.projections.slice(0, 2).map(p => `${p.title} at plus ${p.improvement_pct}%`).join(' and ')}.` : ''}`,

    // Slide 10: Hourly Throughput
    `The hourly throughput profile shows activity distribution across a 24-hour cycle. ${hourly.hours?.length ? `Peak activity occurs during the main shift hours, with the highest throughput reaching ${fmt(Math.max(...(hourly.hours || []).map(h => h.orderlines || 0)))} orderlines in the busiest hour.` : ''} This profile is critical for dimensioning the automation system — it must sustain peak hourly rates during the busiest windows while maintaining efficiency during lower-volume periods.`,

    // Slide 11: Top 10 SKUs
    `The top 10 SKUs by pick volume are prime candidates for goods-to-person automation zones. ${abc.top_skus?.length ? `The highest-frequency SKU, ${abc.top_skus[0].sku}, accounts for ${fmt(Math.round(abc.top_skus[0].picks))} picks — ${abc.top_skus[0].pct}% of total volume. Together, the top 10 SKUs represent a significant share of all picks.` : ''} Placing these fast-movers in dedicated high-performance zones dramatically reduces travel time and increases overall system efficiency.`,

    // Slide 12: Next Steps
    `To summarize the next steps: First, review the concept designs with our engineering team. Second, run warehouse simulations to validate throughput targets and optimize layout. Third, review the commercial proposal with ROI projections. Fourth, connect your WMS or ERP for live data feeds via API integration. And fifth, proceed with phased implementation with full PINAXIS engineering support and OEE tracking from day one. Thank you for exploring the PINAXIS Dashboard Playbook. We look forward to partnering on your warehouse automation journey.`
  ];
}

/**
 * Call ElevenLabs TTS API to generate audio for a text
 */
async function generateTTS(text, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.6,
      similarity_boost: 0.8,
      style: 0.3,
      use_speaker_boost: true
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Accept': 'audio/mpeg'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => reject(new Error(`ElevenLabs TTS failed (${res.statusCode}): ${data}`)));
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
 * Capture a slide screenshot using Puppeteer
 */
async function captureSlide(browser, baseUrl, projectId, slideIndex, outputPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT });

  // Navigate to presentation page
  const url = `${baseUrl}/pinaxis/presentation/${projectId}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

  // Click the slide button to navigate to the correct slide
  if (slideIndex > 0) {
    // Click slide buttons to navigate
    const slideButtons = await page.$$('.flex.items-center.gap-2 button');
    if (slideButtons[slideIndex]) {
      await slideButtons[slideIndex].click();
      await page.waitForTimeout(500);
    }
  }

  // Wait for charts to render
  await page.waitForTimeout(1000);

  // Screenshot the slide card area
  const slideCard = await page.$('.card');
  if (slideCard) {
    await slideCard.screenshot({ path: outputPath, type: 'png' });
  } else {
    await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  }

  await page.close();
  return outputPath;
}

/**
 * Combine a slide image + audio into a video segment using FFmpeg
 */
function createSlideVideo(imagePath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1'])
      .input(audioPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-movflags', '+faststart'
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`FFmpeg slide error: ${err.message}`)))
      .run();
  });
}

/**
 * Concatenate multiple video segments into one final MP4
 */
function concatenateVideos(segmentPaths, outputPath, workDir) {
  return new Promise((resolve, reject) => {
    // Write concat file list
    const listPath = path.join(workDir, 'concat_list.txt');
    const content = segmentPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(listPath, content);

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c', 'copy',
        '-movflags', '+faststart'
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`FFmpeg concat error: ${err.message}`)))
      .run();
  });
}

/**
 * Get audio duration in seconds using ffprobe
 */
function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 10);
    });
  });
}

/**
 * Main: Generate video proposal for a project
 * Returns the path to the final MP4 file
 */
async function generateVideoProposal(projectId, models, progressCallback) {
  const report = (step, detail) => {
    if (progressCallback) progressCallback(step, detail);
    console.log(`[VideoGen] ${step}: ${detail}`);
  };

  // 1. Fetch all project data
  report('init', 'Loading project data...');
  const seq = models.sequelize;
  const [projRows] = await seq.query(
    'SELECT * FROM logistics_projects WHERE id = :projectId',
    { replacements: { projectId } }
  );
  const project = projRows[0];
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Load all analysis results
  const [analysisRows] = await seq.query(
    'SELECT analysis_type, result_data FROM logistics_analysis_results WHERE project_id = :projectId',
    { replacements: { projectId } }
  );
  const analysis = {};
  for (const row of analysisRows) {
    analysis[row.analysis_type] = typeof row.result_data === 'string'
      ? JSON.parse(row.result_data) : row.result_data;
  }

  // Load recommendations + benefits (tables may not exist yet — non-fatal)
  let recRows = [];
  let benefits = null;
  try {
    const [rows] = await seq.query(
      'SELECT * FROM logistics_recommendations WHERE project_id = :projectId ORDER BY fit_score DESC',
      { replacements: { projectId } }
    );
    recRows = rows;
  } catch (e) { console.log('[VideoGen] Recommendations table not available:', e.message); }
  try {
    const [benRows] = await seq.query(
      'SELECT result_data FROM logistics_analysis_results WHERE project_id = :projectId AND analysis_type = \'benefit_projections\'',
      { replacements: { projectId } }
    );
    benefits = benRows[0]?.result_data
      ? (typeof benRows[0].result_data === 'string' ? JSON.parse(benRows[0].result_data) : benRows[0].result_data)
      : null;
  } catch (e) { console.log('[VideoGen] Benefits data not available:', e.message); }

  const companyName = project.company_name || 'Your Warehouse';

  // 2. Generate narration scripts
  report('scripts', 'Generating narration scripts...');
  const scripts = generateSlideScripts(analysis, companyName, recRows, benefits);

  // 3. Create temp working directory
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinaxis-video-'));
  report('setup', `Working directory: ${workDir}`);

  try {
    // 4. Generate TTS audio for each slide
    report('tts', 'Generating voice narration (0/' + scripts.length + ')...');
    const audioPaths = [];
    for (let i = 0; i < scripts.length; i++) {
      report('tts', `Generating voice for slide ${i + 1}/${scripts.length}...`);
      const audioPath = path.join(workDir, `slide_${i}_audio.mp3`);
      await generateTTS(scripts[i], audioPath);
      audioPaths.push(audioPath);
    }

    // 5. Capture slide screenshots using Puppeteer
    report('screenshots', 'Capturing slide screenshots...');
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT }
    });

    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'http://localhost:10000';
    const screenshotPaths = [];
    for (let i = 0; i < SLIDE_COUNT; i++) {
      report('screenshots', `Capturing slide ${i + 1}/${SLIDE_COUNT}...`);
      const imgPath = path.join(workDir, `slide_${i}.png`);
      await captureSlide(browser, baseUrl, projectId, i, imgPath);
      screenshotPaths.push(imgPath);
    }
    await browser.close();

    // 6. Create video segments for each slide
    report('video', 'Creating video segments...');
    const segmentPaths = [];
    for (let i = 0; i < SLIDE_COUNT; i++) {
      report('video', `Encoding slide ${i + 1}/${SLIDE_COUNT}...`);
      const segPath = path.join(workDir, `segment_${i}.mp4`);
      await createSlideVideo(screenshotPaths[i], audioPaths[i], segPath);
      segmentPaths.push(segPath);
    }

    // 7. Concatenate all segments
    report('concat', 'Concatenating final video...');
    const finalPath = path.join(workDir, `PINAXIS_Proposal_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${projectId}.mp4`);
    await concatenateVideos(segmentPaths, finalPath, workDir);

    // 8. Get final video stats
    const stats = fs.statSync(finalPath);
    const duration = await getAudioDuration(finalPath);
    report('done', `Video ready: ${(stats.size / 1024 / 1024).toFixed(1)} MB, ${Math.round(duration)}s`);

    return {
      path: finalPath,
      filename: path.basename(finalPath),
      size: stats.size,
      duration: Math.round(duration),
      workDir
    };
  } catch (error) {
    // Clean up on error
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    throw error;
  }
}

module.exports = { generateVideoProposal, generateSlideScripts };
