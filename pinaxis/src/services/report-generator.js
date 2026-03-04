'use strict';

/**
 * PINAXIS Executive Report Generator
 *
 * Generates premium, board-room quality PDF reports for C-level executives.
 * Uses pdfmake with custom SVG charts and professional corporate design.
 */

// ============================================================================
// DESIGN SYSTEM — Executive Color Palette & Constants
// ============================================================================

const COLORS = {
  // Primary brand
  navy:        '#0B1D3A',
  navyMid:     '#152D52',
  navyLight:   '#1E3A5F',
  blue:        '#1B5FED',
  blueMid:     '#3B7BF7',
  blueLight:   '#E8F0FE',

  // Accent
  gold:        '#B8944F',
  goldLight:   '#D4BC80',
  goldPale:    '#F5F0E5',

  // Neutrals
  white:       '#FFFFFF',
  offWhite:    '#F8F9FB',
  grayPale:    '#F1F3F5',
  grayLight:   '#DEE2E6',
  gray:        '#868E96',
  grayDark:    '#495057',
  charcoal:    '#212529',

  // Semantic
  green:       '#0F9D58',
  greenLight:  '#E6F4EA',
  amber:       '#F29D12',
  amberLight:  '#FEF7E0',
  red:         '#DB4437',
  redLight:    '#FDECEA',

  // Chart palette (executive-friendly)
  chart: ['#1B5FED', '#0F9D58', '#F29D12', '#DB4437', '#7C3AED', '#0891B2', '#B8944F', '#6366F1']
};

function escSvg(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US');
}

function fmtCurrency(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 1000000) return `€${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `€${Math.round(v / 1000).toLocaleString()}K`;
  return `€${v.toLocaleString()}`;
}

// ============================================================================
// PROFESSIONAL TABLE LAYOUT
// ============================================================================

const executiveTableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
  vLineWidth: () => 0,
  hLineColor: (i) => i === 0 || i === 1 ? COLORS.navy : COLORS.grayLight,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 7,
  paddingBottom: () => 7,
  dontBreakRows: true
};

const accentTableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 2 : (i === 1 ? 1 : 0.5),
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 2 : 0,
  hLineColor: (i) => i <= 1 ? COLORS.blue : COLORS.grayLight,
  vLineColor: () => COLORS.blue,
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 8,
  paddingBottom: () => 8,
  dontBreakRows: true
};

const kpiCardLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0
};

// ============================================================================
// SVG CHART BUILDERS — Executive Grade
// ============================================================================

function buildBarChartSvg(data, { width = 480, height = 210, barColor = COLORS.blue, labelKey = 'label', valueKey = 'value', unit = '' } = {}) {
  if (!data || data.length === 0) return null;
  const margin = { top: 20, right: 20, bottom: 40, left: 52 };
  const cW = width - margin.left - margin.right;
  const cH = height - margin.top - margin.bottom;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const barW = Math.min(36, (cW / data.length) * 0.6);
  const gap = cW / data.length;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" fill="${COLORS.white}" rx="6"/>`;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + cH - (i / 4) * cH;
    const val = Math.round((i / 4) * maxVal);
    const lbl = val >= 10000 ? `${(val / 1000).toFixed(0)}K` : val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val;
    svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${COLORS.grayLight}" stroke-width="0.8" stroke-dasharray="4,3"/>`;
    svg += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="${COLORS.gray}" font-size="9" font-family="Helvetica">${lbl}${unit}</text>`;
  }

  // Bars with rounded tops and gradient effect
  data.forEach((d, i) => {
    const val = d[valueKey] || 0;
    const bH = (val / maxVal) * cH;
    const x = margin.left + i * gap + (gap - barW) / 2;
    const y = margin.top + cH - bH;

    // Shadow
    svg += `<rect x="${x + 2}" y="${y + 2}" width="${barW}" height="${bH}" fill="${COLORS.grayLight}" rx="3" opacity="0.4"/>`;
    // Bar
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${bH}" fill="${barColor}" rx="3"/>`;
    // Highlight
    svg += `<rect x="${x}" y="${y}" width="${barW * 0.4}" height="${bH}" fill="white" rx="3" opacity="0.12"/>`;

    // Value on top
    const valTxt = val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val;
    svg += `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" fill="${COLORS.grayDark}" font-size="8" font-weight="bold" font-family="Helvetica">${valTxt}</text>`;

    // Label
    const label = escSvg(d[labelKey] || '');
    const trunc = label.length > 8 ? label.slice(0, 7) + '.' : label;
    svg += `<text x="${x + barW / 2}" y="${margin.top + cH + 16}" text-anchor="middle" fill="${COLORS.grayDark}" font-size="8" font-family="Helvetica">${trunc}</text>`;
  });

  // Baseline
  svg += `<line x1="${margin.left}" y1="${margin.top + cH}" x2="${width - margin.right}" y2="${margin.top + cH}" stroke="${COLORS.navy}" stroke-width="1.2"/>`;
  svg += '</svg>';
  return svg;
}

function buildGroupedBarChartSvg(data, { width = 480, height = 220, labelKey = 'label', keys = [], colors = [], legends = [] } = {}) {
  if (!data || data.length === 0 || keys.length === 0) return null;
  const margin = { top: 28, right: 20, bottom: 40, left: 52 };
  const cW = width - margin.left - margin.right;
  const cH = height - margin.top - margin.bottom;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => d[k] || 0)), 1);
  const groupW = cW / data.length;
  const barW = Math.min(18, (groupW / (keys.length + 1)) * 0.75);

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" fill="${COLORS.white}" rx="6"/>`;

  // Legend
  legends.forEach((l, i) => {
    const lx = margin.left + i * 110;
    svg += `<rect x="${lx}" y="7" width="12" height="4" fill="${colors[i] || COLORS.chart[i]}" rx="2"/>`;
    svg += `<text x="${lx + 16}" y="13" fill="${COLORS.grayDark}" font-size="9" font-family="Helvetica">${escSvg(l)}</text>`;
  });

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + cH - (i / 4) * cH;
    const val = Math.round((i / 4) * maxVal);
    const lbl = val >= 10000 ? `${(val / 1000).toFixed(0)}K` : val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val;
    svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${COLORS.grayLight}" stroke-width="0.8" stroke-dasharray="4,3"/>`;
    svg += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="${COLORS.gray}" font-size="9" font-family="Helvetica">${lbl}</text>`;
  }

  // Bars
  data.forEach((d, i) => {
    const gx = margin.left + i * groupW;
    keys.forEach((key, ki) => {
      const val = d[key] || 0;
      const bH = (val / maxVal) * cH;
      const x = gx + (groupW - barW * keys.length - 4 * (keys.length - 1)) / 2 + ki * (barW + 4);
      const y = margin.top + cH - bH;
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${bH}" fill="${colors[ki] || COLORS.chart[ki]}" rx="2"/>`;
    });
    const label = escSvg(d[labelKey] || '');
    const trunc = label.length > 6 ? label.slice(0, 5) + '.' : label;
    svg += `<text x="${gx + groupW / 2}" y="${margin.top + cH + 16}" text-anchor="middle" fill="${COLORS.grayDark}" font-size="8" font-family="Helvetica">${trunc}</text>`;
  });

  svg += `<line x1="${margin.left}" y1="${margin.top + cH}" x2="${width - margin.right}" y2="${margin.top + cH}" stroke="${COLORS.navy}" stroke-width="1.2"/>`;
  svg += '</svg>';
  return svg;
}

function buildDonutChartSvg(segments, { width = 220, height = 200, title = '' } = {}) {
  if (!segments || segments.length === 0) return null;
  const cx = width / 2, cy = 88, r = 60, innerR = 36;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;

  let svg = `<svg width="${width}" height="${height + 10}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height + 10}" fill="${COLORS.white}" rx="6"/>`;

  let angle = -Math.PI / 2;
  segments.forEach((seg, i) => {
    const pct = (seg.value || 0) / total;
    const sliceAngle = pct * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sliceAngle), y2 = cy + r * Math.sin(angle + sliceAngle);
    const ix1 = cx + innerR * Math.cos(angle + sliceAngle), iy1 = cy + innerR * Math.sin(angle + sliceAngle);
    const ix2 = cx + innerR * Math.cos(angle), iy2 = cy + innerR * Math.sin(angle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const color = seg.color || COLORS.chart[i % COLORS.chart.length];
    svg += `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc},0 ${ix2},${iy2} Z" fill="${color}"/>`;
    angle += sliceAngle;
  });

  if (title) {
    svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" fill="${COLORS.navy}" font-size="11" font-weight="bold" font-family="Helvetica">${escSvg(title)}</text>`;
  }

  // Legend
  const ly = cy + r + 18;
  const colW = width / Math.min(segments.length, 3);
  segments.forEach((seg, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const lx = col * colW + 8;
    const lyi = ly + row * 15;
    const color = seg.color || COLORS.chart[i % COLORS.chart.length];
    const pct = Math.round(((seg.value || 0) / total) * 100);
    svg += `<rect x="${lx}" y="${lyi}" width="8" height="8" fill="${color}" rx="2"/>`;
    svg += `<text x="${lx + 12}" y="${lyi + 8}" fill="${COLORS.grayDark}" font-size="8" font-family="Helvetica">${escSvg(seg.label)} (${pct}%)</text>`;
  });

  svg += '</svg>';
  return svg;
}

function buildHorizontalBarChartSvg(data, { width = 480, barHeight = 22, labelKey = 'label', valueKey = 'value', maxValue = 100, showPct = true, colorFn = null } = {}) {
  if (!data || data.length === 0) return null;
  const margin = { top: 10, right: 55, bottom: 10, left: 155 };
  const cW = width - margin.left - margin.right;
  const height = margin.top + data.length * (barHeight + 10) + margin.bottom;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" fill="${COLORS.white}" rx="6"/>`;

  data.forEach((d, i) => {
    const val = d[valueKey] || 0;
    const bW = (Math.min(val, maxValue) / maxValue) * cW;
    const y = margin.top + i * (barHeight + 10);
    const color = colorFn ? colorFn(val) : (val >= 70 ? COLORS.green : val >= 40 ? COLORS.amber : COLORS.gray);

    const label = escSvg(d[labelKey] || '');
    const trunc = label.length > 24 ? label.slice(0, 23) + '...' : label;
    svg += `<text x="${margin.left - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" fill="${COLORS.grayDark}" font-size="9" font-family="Helvetica">${trunc}</text>`;

    // Track
    svg += `<rect x="${margin.left}" y="${y}" width="${cW}" height="${barHeight}" fill="${COLORS.grayPale}" rx="4"/>`;
    // Bar
    svg += `<rect x="${margin.left}" y="${y}" width="${Math.max(bW, 3)}" height="${barHeight}" fill="${color}" rx="4"/>`;
    // Highlight
    svg += `<rect x="${margin.left}" y="${y}" width="${Math.max(bW, 3)}" height="${barHeight * 0.45}" fill="white" rx="4" opacity="0.18"/>`;

    const valText = showPct ? `${Math.round(val)}%` : Math.round(val).toString();
    svg += `<text x="${margin.left + cW + 10}" y="${y + barHeight / 2 + 4}" fill="${COLORS.navy}" font-size="10" font-weight="bold" font-family="Helvetica">${valText}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function buildGaugeSvg(score, { width = 180, height = 120 } = {}) {
  const cx = width / 2, cy = 88, r = 62;
  const startAngle = Math.PI, endAngle = 2 * Math.PI;
  const scoreAngle = startAngle + (Math.min(score, 100) / 100) * Math.PI;

  const bgX1 = cx + r * Math.cos(startAngle), bgY1 = cy + r * Math.sin(startAngle);
  const bgX2 = cx + r * Math.cos(endAngle), bgY2 = cy + r * Math.sin(endAngle);
  const valX = cx + r * Math.cos(scoreAngle), valY = cy + r * Math.sin(scoreAngle);
  const largeArc = (scoreAngle - startAngle) > Math.PI ? 1 : 0;
  const color = score >= 70 ? COLORS.green : score >= 40 ? COLORS.amber : COLORS.red;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${COLORS.white}" rx="6"/>
    <path d="M${bgX1},${bgY1} A${r},${r} 0 0,1 ${bgX2},${bgY2}" fill="none" stroke="${COLORS.grayPale}" stroke-width="12" stroke-linecap="round"/>
    <path d="M${bgX1},${bgY1} A${r},${r} 0 ${largeArc},1 ${valX},${valY}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="${COLORS.navy}" font-size="26" font-weight="bold" font-family="Helvetica">${score}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="${COLORS.gray}" font-size="9" font-family="Helvetica">out of 100</text>
  </svg>`;
}


// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

async function generate(project) {
  const analysisMap = {};
  for (const r of (project.results || [])) {
    analysisMap[r.analysis_type] = r.result_data;
  }

  const recommendations = (project.recommendations || []).sort((a, b) => b.fit_score - a.fit_score);
  const overview = analysisMap.overview_kpis || {};
  const orderStructure = analysisMap.order_structure || {};
  const abc = analysisMap.abc_classification || {};
  const fit = analysisMap.fit_analysis || {};
  const throughputMonthly = analysisMap.throughput_monthly || {};
  const throughputWeekday = analysisMap.throughput_weekday || {};
  const benefitData = analysisMap.benefit_projections || {};
  const skus = overview.skus || {};
  const orders = overview.orders || {};
  const dateRange = overview.date_range || {};
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ========================================================================
  // COVER PAGE
  // ========================================================================

  const coverPage = [
    // Top accent bar
    {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: 515, h: 6, color: COLORS.blue },
        { type: 'rect', x: 0, y: 6, w: 515, h: 2, color: COLORS.gold }
      ]
    },
    { text: '\n\n\n\n\n' },
    // Brand
    { text: 'PINAXIS', fontSize: 44, bold: true, color: COLORS.blue, alignment: 'center', characterSpacing: 8 },
    { text: '\n', fontSize: 6 },
    {
      canvas: [{ type: 'line', x1: 180, y1: 0, x2: 335, y2: 0, lineWidth: 1.5, lineColor: COLORS.gold }]
    },
    { text: '\n', fontSize: 10 },
    { text: 'Warehouse Data Analytics', fontSize: 20, color: COLORS.navy, alignment: 'center', characterSpacing: 2 },
    { text: 'Executive Report', fontSize: 16, color: COLORS.gray, alignment: 'center', margin: [0, 6, 0, 0] },
    { text: '\n\n\n' },

    // Company name block
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: 'Prepared for', fontSize: 10, color: COLORS.gray, alignment: 'center', margin: [0, 0, 0, 4] },
            { text: project.company_name || 'Client', fontSize: 26, bold: true, color: COLORS.navy, alignment: 'center' }
          ],
          margin: [0, 18, 0, 18]
        }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 0,
        hLineColor: () => COLORS.grayLight
      },
      margin: [60, 0, 60, 0]
    },

    { text: '\n\n\n' },

    // Project details grid
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'PROJECT ID', fontSize: 8, color: COLORS.gray, characterSpacing: 1.5 },
            { text: String(project.id || '—'), fontSize: 12, color: COLORS.navy, bold: true, margin: [0, 3, 0, 0] }
          ],
          alignment: 'center'
        },
        {
          width: '*',
          stack: [
            { text: 'PROJECT CODE', fontSize: 8, color: COLORS.gray, characterSpacing: 1.5 },
            { text: project.project_code || '—', fontSize: 12, color: COLORS.navy, bold: true, margin: [0, 3, 0, 0] }
          ],
          alignment: 'center'
        },
        {
          width: '*',
          stack: [
            { text: 'INDUSTRY', fontSize: 8, color: COLORS.gray, characterSpacing: 1.5 },
            { text: project.industry || '—', fontSize: 12, color: COLORS.navy, bold: true, margin: [0, 3, 0, 0] }
          ],
          alignment: 'center'
        },
        {
          width: '*',
          stack: [
            { text: 'REPORT DATE', fontSize: 8, color: COLORS.gray, characterSpacing: 1.5 },
            { text: reportDate, fontSize: 12, color: COLORS.navy, bold: true, margin: [0, 3, 0, 0] }
          ],
          alignment: 'center'
        }
      ],
      margin: [20, 0, 20, 0]
    },

    { text: '\n\n\n\n\n\n' },

    // Bottom powered by
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COLORS.grayLight }]
    },
    { text: '\n', fontSize: 6 },
    {
      columns: [
        { text: 'Powered by GEBHARDT Intralogistics Group', fontSize: 9, color: COLORS.gray, italics: true },
        { text: 'CONFIDENTIAL', fontSize: 9, color: COLORS.gold, bold: true, alignment: 'right', characterSpacing: 2 }
      ]
    },

    { text: '', pageBreak: 'after' }
  ];

  // ========================================================================
  // EXECUTIVE SUMMARY PAGE
  // ========================================================================

  const execSummary = [
    sectionHeader('Executive Summary', '01'),
    { text: '\n', fontSize: 4 },
    {
      text: `This report presents a comprehensive data-driven analysis of the warehouse operations for ${project.company_name}. The findings below are based on actual operational data and provide actionable insights for intralogistics automation decisions.`,
      fontSize: 10.5, color: COLORS.grayDark, lineHeight: 1.5, margin: [0, 0, 0, 16]
    },

    // KPI Cards Row 1
    {
      columns: [
        kpiCard('Total SKUs', fmtNum(skus.total), 'Unique products', COLORS.blue),
        kpiCard('Active SKUs', fmtNum(skus.active), 'With order activity', COLORS.navy),
        kpiCard('Bin-Capable', skus.bin_capable_pct != null ? `${skus.bin_capable_pct}%` : '—', `${fmtNum(skus.bin_capable)} items`, COLORS.green),
      ],
      columnGap: 12,
      margin: [0, 0, 0, 12],
      unbreakable: true
    },

    // KPI Cards Row 2
    {
      columns: [
        kpiCard('Total Orders', fmtNum(orders.total_orders), 'In analysis period', COLORS.blue),
        kpiCard('Orderlines', fmtNum(orders.total_orderlines), 'Total pick tasks', COLORS.navy),
        kpiCard('Avg Lines/Order', orders.avg_lines_per_order != null ? String(orders.avg_lines_per_order) : '—', 'Order complexity', COLORS.gold),
      ],
      columnGap: 12,
      margin: [0, 0, 0, 16],
      unbreakable: true
    },

    // Data period
    (dateRange.from && dateRange.to) ? {
      table: {
        widths: ['*'],
        body: [[{
          text: `Data Period:  ${dateRange.from}  to  ${dateRange.to}`,
          fontSize: 10, color: COLORS.navy, bold: true, alignment: 'center', margin: [0, 8, 0, 8]
        }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 0,
        hLineColor: () => COLORS.blueLight
      },
      fillColor: COLORS.blueLight,
      margin: [0, 0, 0, 16],
      unbreakable: true
    } : { text: '' },

    // Key findings
    keyFindingsBlock(overview, orderStructure, abc, fit, recommendations, benefitData),

    { text: '', pageBreak: 'after' }
  ];

  // ========================================================================
  // SECTION 2: ORDER STRUCTURE
  // ========================================================================

  const orderSection = [
    sectionHeader('Order Structure Analysis', '02'),
    { text: '\n', fontSize: 4 },
    {
      text: 'Understanding order profiles is critical for selecting the right automation strategy. Single-line orders benefit from goods-to-person systems, while multi-line orders require efficient batch picking or zone-based approaches.',
      fontSize: 10, color: COLORS.grayDark, lineHeight: 1.45, margin: [0, 0, 0, 14]
    },

    // Summary metrics
    {
      columns: [
        metricBox('Total Orders', fmtNum(orderStructure.total_orders || 0)),
        metricBox('Single-Line', `${orderStructure.single_line_pct || 0}%`),
        metricBox('Multi-Line', `${orderStructure.multi_line_pct || 0}%`),
        metricBox('Avg Lines/Order', String(orders.avg_lines_per_order || '—'))
      ],
      columnGap: 10,
      margin: [0, 0, 0, 16],
      unbreakable: true
    },

    // Histogram table
    buildOrderHistogramTable(orderStructure),
    { text: '\n' },

    // Chart — keep together
    { stack: [...buildOrderStructureChart(orderStructure)], unbreakable: true },
    { text: '\n' },

    { text: '', pageBreak: 'after' }
  ];

  // ========================================================================
  // SECTION 3: THROUGHPUT
  // ========================================================================

  const throughputSection = [
    sectionHeader('Throughput Analysis', '03'),
    { text: '\n', fontSize: 4 },
    {
      text: 'Throughput patterns reveal seasonal peaks, weekly cycles, and capacity requirements essential for system dimensioning and staffing optimization.',
      fontSize: 10, color: COLORS.grayDark, lineHeight: 1.45, margin: [0, 0, 0, 14]
    },

    // Monthly subsection — keep header + table together
    { stack: [subSectionHeader('Monthly Throughput'), buildMonthlyTable(throughputMonthly)], unbreakable: true },
    { text: '\n' },
    // Monthly chart — keep together
    { stack: [...buildMonthlyChart(throughputMonthly)], unbreakable: true },
    { text: '\n\n' },

    // Weekday subsection — keep header + table together
    { stack: [subSectionHeader('Weekday Distribution'), buildWeekdayTable(throughputWeekday)], unbreakable: true },
    { text: '\n' },
    // Weekday chart — keep together
    { stack: [...buildWeekdayChart(throughputWeekday)], unbreakable: true },

    { text: '', pageBreak: 'after' }
  ];

  // ========================================================================
  // SECTION 4: ABC CLASSIFICATION
  // ========================================================================

  const abcSection = [
    sectionHeader('ABC / Pareto Analysis', '04'),
    { text: '\n', fontSize: 4 },
    {
      text: 'The ABC classification distributes SKUs by order frequency and volume, identifying fast movers (A-items) that benefit most from automation investment versus slow movers (C-items) suited for conventional storage.',
      fontSize: 10, color: COLORS.grayDark, lineHeight: 1.45, margin: [0, 0, 0, 14]
    },

    // Gini + ABC table — keep together
    {
      stack: [
        abc.gini ? {
          table: {
            widths: ['*'],
            body: [[{
              text: [
                { text: 'Gini Coefficient: ', fontSize: 10, color: COLORS.grayDark },
                { text: String(abc.gini), fontSize: 14, bold: true, color: COLORS.navy },
                { text: '  —  A higher Gini coefficient indicates more concentrated demand among fewer SKUs, increasing the case for automated fast-mover handling.', fontSize: 9, color: COLORS.gray }
              ],
              margin: [12, 10, 12, 10]
            }]]
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => COLORS.gold, vLineColor: () => COLORS.gold },
          fillColor: COLORS.goldPale,
          margin: [0, 0, 0, 14]
        } : { text: '' },
        buildABCTable(abc)
      ],
      unbreakable: true
    },
    { text: '\n' },

    // ABC donut charts — keep together
    { stack: [...buildABCCharts(abc)], unbreakable: true },
    { text: '\n' },

    // Top SKUs — keep header + table together
    { stack: [subSectionHeader('Top 10 SKUs by Pick Frequency'), buildTopSKUTable(abc)], unbreakable: true },

    { text: '', pageBreak: 'after' }
  ];

  // ========================================================================
  // SECTION 5: FIT ANALYSIS
  // ========================================================================

  const fitSection = [
    sectionHeader('Fit / No-Fit Analysis', '05'),
    { text: '\n', fontSize: 4 },
    {
      text: 'This analysis evaluates each SKU\'s physical dimensions against standard GEBHARDT bin sizes (600×400mm footprint), determining the percentage of inventory suitable for automated bin storage systems such as StoreBiter or FlatPick.',
      fontSize: 10, color: COLORS.grayDark, lineHeight: 1.45, margin: [0, 0, 0, 14]
    },

    // Summary
    {
      columns: [
        metricBox('Items with Dimensions', fmtNum(fit.items_with_dimensions || 0)),
        metricBox('Without Dimensions', fmtNum(fit.items_without_dimensions || 0)),
        metricBox('Overall Bin-Capable', skus.bin_capable_pct != null ? `${skus.bin_capable_pct}%` : '—'),
      ],
      columnGap: 10,
      margin: [0, 0, 0, 14],
      unbreakable: true
    },

    // Fit table + chart — keep together
    {
      stack: [
        buildFitTable(fit),
        { text: '\n' },
        ...buildFitChart(fit)
      ],
      unbreakable: true
    },

    { text: '\n' },
    { text: '', pageBreak: 'after' }
  ];

  // ========================================================================
  // SECTION 6: PRODUCT RECOMMENDATIONS
  // ========================================================================

  const productSection = [
    sectionHeader('GEBHARDT Product Recommendations', '06'),
    { text: '\n', fontSize: 4 },
    {
      text: 'Based on the complete warehouse data analysis — including order structure, throughput patterns, ABC classification, and dimensional fit — the following GEBHARDT intralogistics solutions are recommended for this operation.',
      fontSize: 10, color: COLORS.grayDark, lineHeight: 1.45, margin: [0, 0, 0, 14]
    },

    // Product scores chart — keep together
    { stack: [...buildProductScoresChart(recommendations)], unbreakable: true },
    { text: '\n' },
    ...buildRecommendationCards(recommendations)
  ];

  // ========================================================================
  // SECTION 7: BENEFIT PROJECTIONS (if computed)
  // ========================================================================

  const benefitSection = benefitData.projections ? [
    { text: '', pageBreak: 'after' },
    sectionHeader('Client Benefit Projections', '07'),
    { text: '\n', fontSize: 4 },
    {
      text: 'Data-driven ROI projections based on your warehouse analytics and the GEBHARDT product matching. These projections are derived from actual operational data combined with industry benchmarks for similar automation implementations.',
      fontSize: 10, color: COLORS.grayDark, lineHeight: 1.45, margin: [0, 0, 0, 14]
    },

    // ROI charts — keep together
    { stack: [...buildROICharts(benefitData)], unbreakable: true },
    { text: '\n' },
    // ROI summary table — keep together
    { stack: [buildROISummaryTable(benefitData.summary || {})], unbreakable: true },
    { text: '\n' },

    // Warehouse automation benefits — keep header + table together
    { stack: [subSectionHeader('Warehouse Automation Benefits'), buildBenefitsTable((benefitData.projections || []).filter(p => p.category === 'warehouse_automation'))], unbreakable: true },
    { text: '\n' },

    // Platform & AI benefits — keep header + table together
    { stack: [subSectionHeader('Platform & AI Benefits'), buildBenefitsTable((benefitData.projections || []).filter(p => p.category === 'platform_ai'))], unbreakable: true }
  ] : [];

  // ========================================================================
  // CLOSING PAGE
  // ========================================================================

  const closingPage = [
    { text: '', pageBreak: 'after' },
    { text: '\n\n\n\n\n\n\n' },
    {
      canvas: [{ type: 'line', x1: 180, y1: 0, x2: 335, y2: 0, lineWidth: 1.5, lineColor: COLORS.gold }]
    },
    { text: '\n\n' },
    { text: 'Next Steps', fontSize: 22, bold: true, color: COLORS.navy, alignment: 'center' },
    { text: '\n', fontSize: 8 },
    {
      ol: [
        { text: 'Review this analysis report with your operations and engineering teams.', fontSize: 11, color: COLORS.grayDark, lineHeight: 1.6 },
        { text: 'Schedule a detailed consultation with GEBHARDT to discuss the recommended solutions.', fontSize: 11, color: COLORS.grayDark, lineHeight: 1.6 },
        { text: 'Define pilot scope and implementation timeline for priority systems.', fontSize: 11, color: COLORS.grayDark, lineHeight: 1.6 },
        { text: 'Request a detailed engineering proposal and site assessment.', fontSize: 11, color: COLORS.grayDark, lineHeight: 1.6 }
      ],
      margin: [60, 0, 60, 0]
    },
    { text: '\n\n\n' },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COLORS.grayLight }]
    },
    { text: '\n\n' },
    { text: 'GEBHARDT Intralogistics Group', fontSize: 13, bold: true, color: COLORS.navy, alignment: 'center' },
    { text: 'www.gebhardt-group.com', fontSize: 10, color: COLORS.blue, alignment: 'center', margin: [0, 4, 0, 0] },
    { text: '\n\n' },
    {
      table: {
        widths: ['*'],
        body: [[{
          text: 'This report was generated by PINAXIS — the AI-powered warehouse data analytics platform. All projections are based on the operational data provided and industry benchmarks. Actual results may vary based on implementation specifics.',
          fontSize: 8, color: COLORS.gray, italics: true, alignment: 'center', lineHeight: 1.4, margin: [20, 8, 20, 8]
        }]]
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => COLORS.grayLight }
    }
  ];

  // ========================================================================
  // DOCUMENT DEFINITION
  // ========================================================================

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [42, 65, 42, 55],

    header: (currentPage, pageCount) => {
      if (currentPage === 1) return null;
      return {
        margin: [42, 18, 42, 0],
        columns: [
          {
            stack: [
              { text: 'PINAXIS', fontSize: 10, bold: true, color: COLORS.blue, characterSpacing: 2 },
              { text: 'Warehouse Analytics Report', fontSize: 7, color: COLORS.gray }
            ]
          },
          {
            stack: [
              { text: project.company_name || '', fontSize: 9, color: COLORS.navy, alignment: 'right', bold: true },
              { text: reportDate, fontSize: 7, color: COLORS.gray, alignment: 'right' }
            ]
          }
        ]
      };
    },

    footer: (currentPage, pageCount) => {
      if (currentPage === 1) return null;
      return {
        margin: [42, 0, 42, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COLORS.grayLight }] },
          {
            columns: [
              { text: 'Confidential — Powered by RinglyPro AI Division', fontSize: 7, color: COLORS.gray, margin: [0, 6, 0, 0] },
              { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: COLORS.navy, alignment: 'right', margin: [0, 5, 0, 0], bold: true }
            ]
          }
        ]
      };
    },

    content: [
      ...coverPage,
      ...execSummary,
      ...orderSection,
      ...throughputSection,
      ...abcSection,
      ...fitSection,
      ...productSection,
      ...benefitSection,
      ...closingPage
    ],

    defaultStyle: {
      font: 'Roboto',
      fontSize: 10
    }
  };

  const PdfMake = require('pdfmake/build/pdfmake');
  const vfsFonts = require('pdfmake/build/vfs_fonts');
  PdfMake.vfs = vfsFonts.pdfMake ? vfsFonts.pdfMake.vfs : vfsFonts.vfs;

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = PdfMake.createPdf(docDefinition);
      pdfDoc.getBuffer((buffer) => {
        resolve(Buffer.from(buffer));
      });
    } catch (err) {
      reject(err);
    }
  });
}


// ============================================================================
// COMPONENT BUILDERS
// ============================================================================

function sectionHeader(title, number) {
  return {
    stack: [
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 515, h: 36, color: COLORS.navy, r: 4 }
        ]
      },
      {
        columns: [
          { text: number, fontSize: 14, bold: true, color: COLORS.gold, width: 35 },
          { text: title, fontSize: 15, bold: true, color: COLORS.white, width: '*' }
        ],
        margin: [14, -28, 0, 0]
      },
      { text: '', margin: [0, 6, 0, 0] }
    ]
  };
}

function subSectionHeader(title) {
  return {
    stack: [
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 16, color: COLORS.blue }]
      },
      { text: title, fontSize: 12, bold: true, color: COLORS.navy, margin: [12, -15, 0, 8] }
    ]
  };
}

function kpiCard(label, value, sub, accentColor) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: label, fontSize: 8, color: COLORS.gray, characterSpacing: 0.8 },
          { text: value, fontSize: 22, bold: true, color: accentColor || COLORS.navy, margin: [0, 2, 0, 1] },
          { text: sub || '', fontSize: 8, color: COLORS.gray }
        ],
        margin: [12, 10, 12, 10]
      }]]
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: (i) => i === 0 ? 3 : 1,
      hLineColor: () => COLORS.grayLight,
      vLineColor: (i) => i === 0 ? (accentColor || COLORS.navy) : COLORS.grayLight
    }
  };
}

function metricBox(label, value) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: value, fontSize: 16, bold: true, color: COLORS.navy, alignment: 'center' },
          { text: label, fontSize: 8, color: COLORS.gray, alignment: 'center', margin: [0, 2, 0, 0] }
        ],
        margin: [6, 8, 6, 8]
      }]]
    },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0,
      hLineColor: () => COLORS.grayLight
    },
    fillColor: COLORS.offWhite
  };
}

function keyFindingsBlock(overview, orderStructure, abc, fit, recommendations, benefitData) {
  const findings = [];
  const skus = overview.skus || {};
  const orders = overview.orders || {};

  if (skus.bin_capable_pct != null) {
    findings.push(`${skus.bin_capable_pct}% of SKUs are bin-capable for automated storage within standard 600×400mm containers.`);
  }
  if (orderStructure.single_line_pct != null) {
    findings.push(`${orderStructure.single_line_pct}% of orders are single-line, indicating strong suitability for goods-to-person automation.`);
  }
  if (abc.gini) {
    findings.push(`Gini coefficient of ${abc.gini} shows ${parseFloat(abc.gini) > 0.6 ? 'highly concentrated' : 'moderately distributed'} demand, ${parseFloat(abc.gini) > 0.6 ? 'favoring targeted A-item automation.' : 'supporting broader automation coverage.'}`);
  }
  if (recommendations.length > 0) {
    findings.push(`${recommendations.length} GEBHARDT products recommended, with ${recommendations[0].product_name} scoring highest at ${recommendations[0].fit_score}/100.`);
  }
  if (benefitData.summary?.annual_savings_high) {
    findings.push(`Projected annual savings potential of up to ${fmtCurrency(benefitData.summary.annual_savings_high)} through automation.`);
  }

  if (findings.length === 0) return { text: '' };

  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: 'KEY FINDINGS', fontSize: 10, bold: true, color: COLORS.navy, characterSpacing: 1.5, margin: [0, 0, 0, 8] },
          ...findings.map((f, i) => ({
            columns: [
              { text: `${i + 1}.`, fontSize: 10, color: COLORS.blue, bold: true, width: 18 },
              { text: f, fontSize: 10, color: COLORS.grayDark, lineHeight: 1.4 }
            ],
            margin: [0, 0, 0, 6]
          }))
        ],
        margin: [14, 14, 14, 14]
      }]]
    },
    layout: {
      hLineWidth: () => 1.5, vLineWidth: (i) => i === 0 ? 3 : 1.5,
      hLineColor: () => COLORS.blue, vLineColor: () => COLORS.blue
    },
    fillColor: COLORS.blueLight,
    margin: [0, 0, 0, 0],
    unbreakable: true
  };
}


// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildOrderHistogramTable(orderStructure) {
  const histogram = orderStructure.histogram || [];
  if (histogram.length === 0) return { text: 'No order structure data available.', fontSize: 10, color: COLORS.gray, italics: true };

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Lines per Order', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'Order Count', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: '% Share', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: 'Cumulative %', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' }
        ],
        ...histogram.map((h, i) => [
          { text: h.label, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
          { text: fmtNum(h.count), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: `${h.pct}%`, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: `${h.cumulative_pct}%`, fontSize: 9, color: COLORS.navy, bold: true, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' }
        ])
      ]
    },
    layout: executiveTableLayout
  };
}

function buildMonthlyTable(throughput) {
  const months = throughput.months || [];
  if (months.length === 0) return { text: 'No monthly data available.', fontSize: 10, color: COLORS.gray, italics: true };

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Month', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'Orders', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: 'Orderlines', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: 'Units', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' }
        ],
        ...months.map((m, i) => [
          { text: m.month, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
          { text: fmtNum(m.orders), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: fmtNum(m.orderlines), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: fmtNum(Math.round(m.units)), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' }
        ])
      ]
    },
    layout: executiveTableLayout
  };
}

function buildWeekdayTable(throughput) {
  const weekdays = throughput.weekdays || [];
  if (weekdays.length === 0) return { text: 'No weekday data available.', fontSize: 10, color: COLORS.gray, italics: true };

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Day', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'Orders', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: 'Orderlines', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: 'Units', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' }
        ],
        ...weekdays.map((d, i) => [
          { text: d.day, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
          { text: fmtNum(d.orders), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: fmtNum(d.orderlines), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: fmtNum(Math.round(d.units)), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' }
        ])
      ]
    },
    layout: executiveTableLayout
  };
}

function buildABCTable(abc) {
  const classes = abc.classes || {};
  const rows = ['A', 'B', 'C'].filter(c => classes[c]).map((c, i) => {
    const cls = classes[c];
    const labels = { A: 'A — Fast Movers', B: 'B — Medium Movers', C: 'C — Slow Movers' };
    const clrs = { A: COLORS.green, B: COLORS.amber, C: COLORS.gray };
    return [
      { text: labels[c], fontSize: 9, bold: c === 'A', color: clrs[c], fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
      { text: fmtNum(cls.count || 0), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
      { text: `${cls.pct || 0}%`, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
      { text: `${cls.volume_pct || 0}%`, fontSize: 9, color: COLORS.navy, bold: true, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' }
    ];
  });

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Classification', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'SKU Count', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: '% of SKUs', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: '% of Volume', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' }
        ],
        ...rows
      ]
    },
    layout: executiveTableLayout
  };
}

function buildTopSKUTable(abc) {
  const topSkus = abc.top_skus || [];
  if (topSkus.length === 0) return { text: '' };

  return {
    table: {
      headerRows: 1,
      widths: [25, '*', 'auto', 'auto', 40],
      body: [
        [
          { text: '#', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [6, 6, 6, 6], alignment: 'center' },
          { text: 'SKU', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'Picks', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: '% Total', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: 'Class', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [6, 6, 6, 6], alignment: 'center' }
        ],
        ...topSkus.slice(0, 10).map((s, i) => {
          const clsColor = s.class === 'A' ? COLORS.green : s.class === 'B' ? COLORS.amber : COLORS.gray;
          return [
            { text: (i + 1).toString(), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [6, 5, 6, 5], alignment: 'center' },
            { text: s.sku, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
            { text: fmtNum(Math.round(s.picks)), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
            { text: `${s.pct}%`, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
            { text: s.class, fontSize: 9, bold: true, color: clsColor, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [6, 5, 6, 5], alignment: 'center' }
          ];
        })
      ]
    },
    layout: executiveTableLayout
  };
}

function buildFitTable(fit) {
  const bins = fit.bins || [];
  if (bins.length === 0) return { text: 'No fit analysis data available.', fontSize: 10, color: COLORS.gray, italics: true };

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Bin Size (L×W×H mm)', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'Fitting SKUs', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: '% of Measured', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' },
          { text: '% of Total', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'right' }
        ],
        ...bins.map((b, i) => [
          { text: b.name, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
          { text: fmtNum(b.fit_count), fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: `${b.fit_pct}%`, fontSize: 9, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' },
          { text: `${b.fit_pct_total}%`, fontSize: 9, color: COLORS.navy, bold: true, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'right' }
        ])
      ]
    },
    layout: executiveTableLayout
  };
}

function buildRecommendationCards(recommendations) {
  if (!recommendations || recommendations.length === 0) return [{ text: 'No recommendations available.', fontSize: 10, color: COLORS.gray, italics: true }];

  const content = [];
  for (const rec of recommendations) {
    const scoreColor = rec.fit_score >= 70 ? COLORS.green : rec.fit_score >= 40 ? COLORS.amber : COLORS.gray;

    content.push({
      // Each recommendation card is unbreakable
      unbreakable: true,
      stack: [{
        table: {
          widths: [70, '*'],
          body: [[
            {
              stack: [
                { text: Math.round(rec.fit_score), fontSize: 28, bold: true, color: scoreColor, alignment: 'center' },
                { text: '/ 100', fontSize: 9, color: COLORS.gray, alignment: 'center' },
                { text: 'FIT SCORE', fontSize: 7, color: COLORS.gray, alignment: 'center', characterSpacing: 1, margin: [0, 2, 0, 0] }
              ],
              margin: [0, 12, 0, 12]
            },
            {
              stack: [
                { text: rec.product_name, fontSize: 13, bold: true, color: COLORS.navy },
                { text: rec.product_category, fontSize: 9, color: COLORS.blue, margin: [0, 2, 0, 5] },
                { text: rec.description || rec.rationale || '', fontSize: 9, color: COLORS.grayDark, lineHeight: 1.35 }
              ],
              margin: [8, 10, 8, 10]
            }
          ]]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: (i) => i === 0 ? 3 : 1,
          hLineColor: () => COLORS.grayLight,
          vLineColor: (i) => i === 0 ? scoreColor : COLORS.grayLight
        },
        margin: [0, 4, 0, 4]
      }]
    });
  }

  return content;
}

function buildROISummaryTable(summary) {
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          { text: 'AUTOMATION\nREADINESS', fontSize: 8, bold: true, color: COLORS.white, fillColor: COLORS.navy, alignment: 'center', margin: [6, 8, 6, 8], characterSpacing: 0.5 },
          { text: 'EST. ANNUAL\nSAVINGS', fontSize: 8, bold: true, color: COLORS.white, fillColor: COLORS.navy, alignment: 'center', margin: [6, 8, 6, 8], characterSpacing: 0.5 },
          { text: 'PAYBACK\nPERIOD', fontSize: 8, bold: true, color: COLORS.white, fillColor: COLORS.navy, alignment: 'center', margin: [6, 8, 6, 8], characterSpacing: 0.5 },
          { text: 'HIGH-CONFIDENCE\nBENEFITS', fontSize: 8, bold: true, color: COLORS.white, fillColor: COLORS.navy, alignment: 'center', margin: [6, 8, 6, 8], characterSpacing: 0.5 }
        ],
        [
          { text: `${summary.automation_readiness_score || 0}/100`, fontSize: 18, bold: true, color: COLORS.navy, alignment: 'center', margin: [6, 12, 6, 12] },
          { text: `${fmtCurrency(summary.annual_savings_low)} – ${fmtCurrency(summary.annual_savings_high)}`, fontSize: 11, color: COLORS.green, alignment: 'center', bold: true, margin: [6, 14, 6, 14] },
          { text: `${summary.payback_months_low || 12}–${summary.payback_months_high || 24} mo.`, fontSize: 12, color: COLORS.navy, alignment: 'center', bold: true, margin: [6, 14, 6, 14] },
          { text: `${summary.high_confidence_count || 0} of ${summary.total_projections || 0}`, fontSize: 14, color: COLORS.navy, alignment: 'center', bold: true, margin: [6, 14, 6, 14] }
        ]
      ]
    },
    layout: accentTableLayout
  };
}

function buildBenefitsTable(projections) {
  if (!projections || projections.length === 0) return { text: 'No projections available.', fontSize: 10, color: COLORS.gray, italics: true };

  const confLabel = { high: 'High', medium: 'Medium', low: 'Benchmark' };
  const confColor = { high: COLORS.green, medium: COLORS.amber, low: COLORS.gray };

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', '*'],
      body: [
        [
          { text: 'Benefit Area', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] },
          { text: 'Improvement', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'center' },
          { text: 'Confidence', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6], alignment: 'center' },
          { text: 'Key Driver', fontSize: 9, bold: true, color: COLORS.white, fillColor: COLORS.navy, margin: [8, 6, 8, 6] }
        ],
        ...projections.map((p, i) => [
          { text: p.title, fontSize: 9, bold: true, color: COLORS.grayDark, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] },
          { text: `+${p.improvement_pct}%`, fontSize: 10, bold: true, color: COLORS.green, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'center' },
          { text: confLabel[p.confidence] || p.confidence, fontSize: 9, color: confColor[p.confidence] || COLORS.gray, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5], alignment: 'center' },
          { text: p.data_drivers?.[0]?.explanation || '', fontSize: 8, color: COLORS.gray, fillColor: i % 2 === 0 ? COLORS.offWhite : COLORS.white, margin: [8, 5, 8, 5] }
        ])
      ]
    },
    layout: executiveTableLayout
  };
}


// ============================================================================
// CHART INTEGRATION HELPERS
// ============================================================================

function buildOrderStructureChart(orderStructure) {
  const histogram = orderStructure.histogram || [];
  if (histogram.length === 0) return [];
  const svg = buildBarChartSvg(
    histogram.map(h => ({ label: h.label, value: h.count })),
    { width: 480, height: 200, barColor: COLORS.blue }
  );
  return svg ? [{ svg, width: 480, alignment: 'center' }] : [];
}

function buildMonthlyChart(throughput) {
  const months = throughput.months || [];
  if (months.length === 0) return [];
  const svg = buildGroupedBarChartSvg(
    months.map(m => ({ label: m.month, orders: m.orders, orderlines: m.orderlines })),
    { width: 480, height: 210, labelKey: 'label', keys: ['orders', 'orderlines'], colors: [COLORS.blue, COLORS.green], legends: ['Orders', 'Orderlines'] }
  );
  return svg ? [{ svg, width: 480, alignment: 'center' }] : [];
}

function buildWeekdayChart(throughput) {
  const weekdays = throughput.weekdays || [];
  if (weekdays.length === 0) return [];
  const svg = buildBarChartSvg(
    weekdays.map(d => ({ label: d.day, value: d.orderlines })),
    { width: 480, height: 200, barColor: COLORS.green }
  );
  return svg ? [{ svg, width: 480, alignment: 'center' }] : [];
}

function buildABCCharts(abc) {
  const classes = abc.classes || {};
  const segments = [];
  if (classes.A) segments.push({ label: 'A — Fast', value: classes.A.volume_pct || 0, color: COLORS.green });
  if (classes.B) segments.push({ label: 'B — Medium', value: classes.B.volume_pct || 0, color: COLORS.amber });
  if (classes.C) segments.push({ label: 'C — Slow', value: classes.C.volume_pct || 0, color: COLORS.gray });
  if (segments.length === 0) return [];

  const volDonut = buildDonutChartSvg(segments, { width: 215, height: 195, title: 'Volume %' });
  const skuSeg = [];
  if (classes.A) skuSeg.push({ label: 'A — Fast', value: classes.A.pct || 0, color: COLORS.green });
  if (classes.B) skuSeg.push({ label: 'B — Medium', value: classes.B.pct || 0, color: COLORS.amber });
  if (classes.C) skuSeg.push({ label: 'C — Slow', value: classes.C.pct || 0, color: COLORS.gray });
  const skuDonut = buildDonutChartSvg(skuSeg, { width: 215, height: 195, title: 'SKU %' });

  if (!volDonut || !skuDonut) return [];
  return [{
    columns: [
      { svg: volDonut, width: 215, alignment: 'center' },
      { svg: skuDonut, width: 215, alignment: 'center' }
    ],
    columnGap: 20
  }];
}

function buildFitChart(fit) {
  const bins = fit.bins || [];
  if (bins.length === 0) return [];
  const svg = buildHorizontalBarChartSvg(
    bins.map(b => ({ label: b.name, value: b.fit_pct || 0 })),
    { width: 480, barHeight: 24, maxValue: 100, showPct: true }
  );
  return svg ? [{ svg, width: 480, alignment: 'center' }] : [];
}

function buildProductScoresChart(recommendations) {
  if (!recommendations || recommendations.length === 0) return [];
  const svg = buildHorizontalBarChartSvg(
    recommendations.map(r => ({ label: `${r.product_name} (${r.product_category})`, value: r.fit_score })),
    { width: 480, barHeight: 26, maxValue: 100, showPct: false }
  );
  return svg ? [{ svg, width: 480, alignment: 'center' }] : [];
}

function buildROICharts(benefitData) {
  const content = [];
  const summary = benefitData.summary || {};
  const projections = benefitData.projections || [];

  const gaugeSvg = buildGaugeSvg(summary.automation_readiness_score || 0, { width: 180, height: 120 });
  const barSvg = buildHorizontalBarChartSvg(
    projections.map(p => ({ label: p.title, value: p.improvement_pct })),
    {
      width: 300, barHeight: 20, maxValue: 100, showPct: true,
      colorFn: (v) => v >= 80 ? COLORS.green : v >= 40 ? COLORS.blue : COLORS.amber
    }
  );

  if (gaugeSvg && barSvg) {
    content.push({
      columns: [
        {
          stack: [
            subSectionHeader('Automation Readiness'),
            { svg: gaugeSvg, width: 180, alignment: 'center' }
          ],
          width: 190
        },
        {
          stack: [
            subSectionHeader('Benefit Improvements'),
            { svg: barSvg, width: 300, alignment: 'center' }
          ],
          width: '*'
        }
      ],
      columnGap: 12
    });
  }

  return content;
}


module.exports = { generate };
