'use strict';

const PdfPrinter = require('pdfmake');

// Font definitions for pdfmake
const fonts = {
  Roboto: {
    normal: require.resolve('pdfmake/build/vfs_fonts.js') ? undefined : undefined
  }
};

// ============================================================================
// SVG CHART BUILDERS
// ============================================================================

const CHART_COLORS = {
  primary: '#3b82f6',
  primaryLight: '#93c5fd',
  green: '#22c55e',
  greenLight: '#86efac',
  amber: '#f59e0b',
  amberLight: '#fcd34d',
  red: '#ef4444',
  slate: '#94a3b8',
  slateLight: '#cbd5e1',
  slateDark: '#475569',
  bg: '#f8fafc',
  gridLine: '#e2e8f0',
  text: '#334155',
  textLight: '#64748b'
};

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function escSvg(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Vertical bar chart SVG
 */
function buildBarChartSvg(data, { width = 500, height = 220, barColor = CHART_COLORS.primary, labelKey = 'label', valueKey = 'value', unit = '' } = {}) {
  if (!data || data.length === 0) return null;

  const margin = { top: 20, right: 15, bottom: 45, left: 55 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const barWidth = Math.min(40, (chartW / data.length) * 0.65);
  const barGap = chartW / data.length;

  // Grid lines
  const gridCount = 4;
  let gridLines = '';
  for (let i = 0; i <= gridCount; i++) {
    const y = margin.top + chartH - (i / gridCount) * chartH;
    const val = Math.round((i / gridCount) * maxVal);
    const label = val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}K` : val;
    gridLines += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${CHART_COLORS.gridLine}" stroke-width="1"/>`;
    gridLines += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="${CHART_COLORS.textLight}" font-size="9" font-family="Helvetica">${label}${unit}</text>`;
  }

  // Bars + labels
  let bars = '';
  data.forEach((d, i) => {
    const val = d[valueKey] || 0;
    const barH = (val / maxVal) * chartH;
    const x = margin.left + i * barGap + (barGap - barWidth) / 2;
    const y = margin.top + chartH - barH;

    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${barColor}" rx="2"/>`;

    // Label below bar
    const labelText = escSvg(d[labelKey] || '');
    const truncLabel = labelText.length > 7 ? labelText.slice(0, 6) + '.' : labelText;
    bars += `<text x="${x + barWidth / 2}" y="${margin.top + chartH + 14}" text-anchor="middle" fill="${CHART_COLORS.textLight}" font-size="8" font-family="Helvetica">${truncLabel}</text>`;
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${CHART_COLORS.bg}" rx="4"/>
    ${gridLines}
    <line x1="${margin.left}" y1="${margin.top + chartH}" x2="${width - margin.right}" y2="${margin.top + chartH}" stroke="${CHART_COLORS.slateDark}" stroke-width="1"/>
    ${bars}
  </svg>`;
}

/**
 * Grouped bar chart SVG (two series)
 */
function buildGroupedBarChartSvg(data, { width = 500, height = 220, labelKey = 'label', keys = [], colors = [], legends = [] } = {}) {
  if (!data || data.length === 0 || keys.length === 0) return null;

  const margin = { top: 25, right: 15, bottom: 45, left: 55 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const maxVal = Math.max(...data.flatMap(d => keys.map(k => d[k] || 0)), 1);
  const groupWidth = chartW / data.length;
  const barWidth = Math.min(20, (groupWidth / (keys.length + 1)) * 0.8);

  // Grid
  const gridCount = 4;
  let gridLines = '';
  for (let i = 0; i <= gridCount; i++) {
    const y = margin.top + chartH - (i / gridCount) * chartH;
    const val = Math.round((i / gridCount) * maxVal);
    const label = val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}K` : val;
    gridLines += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${CHART_COLORS.gridLine}" stroke-width="1"/>`;
    gridLines += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="${CHART_COLORS.textLight}" font-size="9" font-family="Helvetica">${label}</text>`;
  }

  let bars = '';
  data.forEach((d, i) => {
    const gx = margin.left + i * groupWidth;

    keys.forEach((key, ki) => {
      const val = d[key] || 0;
      const barH = (val / maxVal) * chartH;
      const x = gx + (groupWidth - barWidth * keys.length - 4 * (keys.length - 1)) / 2 + ki * (barWidth + 4);
      const y = margin.top + chartH - barH;
      bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${colors[ki] || PALETTE[ki]}" rx="2"/>`;
    });

    const labelText = escSvg(d[labelKey] || '');
    const truncLabel = labelText.length > 5 ? labelText.slice(0, 4) + '.' : labelText;
    bars += `<text x="${gx + groupWidth / 2}" y="${margin.top + chartH + 14}" text-anchor="middle" fill="${CHART_COLORS.textLight}" font-size="8" font-family="Helvetica">${truncLabel}</text>`;
  });

  // Legend
  let legend = '';
  legends.forEach((l, i) => {
    const lx = margin.left + i * 120;
    legend += `<rect x="${lx}" y="5" width="10" height="10" fill="${colors[i] || PALETTE[i]}" rx="2"/>`;
    legend += `<text x="${lx + 14}" y="14" fill="${CHART_COLORS.text}" font-size="9" font-family="Helvetica">${escSvg(l)}</text>`;
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${CHART_COLORS.bg}" rx="4"/>
    ${legend}
    ${gridLines}
    <line x1="${margin.left}" y1="${margin.top + chartH}" x2="${width - margin.right}" y2="${margin.top + chartH}" stroke="${CHART_COLORS.slateDark}" stroke-width="1"/>
    ${bars}
  </svg>`;
}

/**
 * Donut/pie chart SVG
 */
function buildDonutChartSvg(segments, { width = 240, height = 200, title = '' } = {}) {
  if (!segments || segments.length === 0) return null;

  const cx = width / 2;
  const cy = 95;
  const r = 65;
  const innerR = 38;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;

  let paths = '';
  let angle = -Math.PI / 2;

  segments.forEach((seg, i) => {
    const pct = (seg.value || 0) / total;
    const sliceAngle = pct * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sliceAngle);
    const y2 = cy + r * Math.sin(angle + sliceAngle);
    const ix1 = cx + innerR * Math.cos(angle + sliceAngle);
    const iy1 = cy + innerR * Math.sin(angle + sliceAngle);
    const ix2 = cx + innerR * Math.cos(angle);
    const iy2 = cy + innerR * Math.sin(angle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const color = seg.color || PALETTE[i % PALETTE.length];

    paths += `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc},0 ${ix2},${iy2} Z" fill="${color}"/>`;
    angle += sliceAngle;
  });

  // Legend below
  let legend = '';
  const legendY = cy + r + 18;
  const colW = width / Math.min(segments.length, 3);
  segments.forEach((seg, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const lx = col * colW + 10;
    const ly = legendY + row * 16;
    const color = seg.color || PALETTE[i % PALETTE.length];
    const pct = Math.round(((seg.value || 0) / total) * 100);
    legend += `<rect x="${lx}" y="${ly}" width="8" height="8" fill="${color}" rx="2"/>`;
    legend += `<text x="${lx + 12}" y="${ly + 8}" fill="${CHART_COLORS.text}" font-size="8" font-family="Helvetica">${escSvg(seg.label)} (${pct}%)</text>`;
  });

  // Center text
  const centerText = title ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${CHART_COLORS.text}" font-size="11" font-weight="bold" font-family="Helvetica">${escSvg(title)}</text>` : '';

  const totalH = legendY + Math.ceil(segments.length / 3) * 16 + 10;

  return `<svg width="${width}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${totalH}" fill="${CHART_COLORS.bg}" rx="4"/>
    ${paths}
    ${centerText}
    ${legend}
  </svg>`;
}

/**
 * Horizontal bar chart SVG (for product scores, benefits)
 */
function buildHorizontalBarChartSvg(data, { width = 500, barHeight = 24, labelKey = 'label', valueKey = 'value', maxValue = 100, showPct = true, colorFn = null } = {}) {
  if (!data || data.length === 0) return null;

  const margin = { top: 10, right: 50, bottom: 10, left: 160 };
  const chartW = width - margin.left - margin.right;
  const height = margin.top + data.length * (barHeight + 8) + margin.bottom;

  let bars = '';
  data.forEach((d, i) => {
    const val = d[valueKey] || 0;
    const barW = (Math.min(val, maxValue) / maxValue) * chartW;
    const y = margin.top + i * (barHeight + 8);
    const color = colorFn ? colorFn(val) : (val >= 70 ? CHART_COLORS.green : val >= 40 ? CHART_COLORS.amber : CHART_COLORS.slate);

    // Label
    const label = escSvg(d[labelKey] || '');
    const truncLabel = label.length > 22 ? label.slice(0, 21) + '...' : label;
    bars += `<text x="${margin.left - 8}" y="${y + barHeight / 2 + 4}" text-anchor="end" fill="${CHART_COLORS.text}" font-size="9" font-family="Helvetica">${truncLabel}</text>`;

    // Background bar
    bars += `<rect x="${margin.left}" y="${y}" width="${chartW}" height="${barHeight}" fill="${CHART_COLORS.gridLine}" rx="3"/>`;

    // Value bar
    bars += `<rect x="${margin.left}" y="${y}" width="${Math.max(barW, 2)}" height="${barHeight}" fill="${color}" rx="3"/>`;

    // Value label
    const valText = showPct ? `${Math.round(val)}%` : Math.round(val).toString();
    bars += `<text x="${margin.left + chartW + 8}" y="${y + barHeight / 2 + 4}" fill="${CHART_COLORS.text}" font-size="10" font-weight="bold" font-family="Helvetica">${valText}</text>`;
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${CHART_COLORS.bg}" rx="4"/>
    ${bars}
  </svg>`;
}

/**
 * Gauge/speedometer SVG for readiness score
 */
function buildGaugeSvg(score, { width = 200, height = 130 } = {}) {
  const cx = width / 2;
  const cy = 95;
  const r = 70;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const scoreAngle = startAngle + (Math.min(score, 100) / 100) * Math.PI;

  const bgX1 = cx + r * Math.cos(startAngle);
  const bgY1 = cy + r * Math.sin(startAngle);
  const bgX2 = cx + r * Math.cos(endAngle);
  const bgY2 = cy + r * Math.sin(endAngle);

  const valX = cx + r * Math.cos(scoreAngle);
  const valY = cy + r * Math.sin(scoreAngle);
  const largeArc = (scoreAngle - startAngle) > Math.PI ? 1 : 0;

  const color = score >= 70 ? CHART_COLORS.green : score >= 40 ? CHART_COLORS.amber : CHART_COLORS.red;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${CHART_COLORS.bg}" rx="4"/>
    <path d="M${bgX1},${bgY1} A${r},${r} 0 0,1 ${bgX2},${bgY2}" fill="none" stroke="${CHART_COLORS.gridLine}" stroke-width="14" stroke-linecap="round"/>
    <path d="M${bgX1},${bgY1} A${r},${r} 0 ${largeArc},1 ${valX},${valY}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="${CHART_COLORS.text}" font-size="28" font-weight="bold" font-family="Helvetica">${score}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="${CHART_COLORS.textLight}" font-size="10" font-family="Helvetica">/ 100</text>
  </svg>`;
}

/**
 * Generate PDF analysis report for a PINAXIS project
 */
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

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],

    header: (currentPage) => {
      if (currentPage === 1) return null;
      return {
        columns: [
          { text: 'PINAXIS Warehouse Analysis Report', style: 'headerText', margin: [40, 20, 0, 0] },
          { text: `${project.company_name}`, style: 'headerRight', margin: [0, 20, 40, 0], alignment: 'right' }
        ]
      };
    },

    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'Powered by PINAXIS / GEBHARDT', style: 'footerText', margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, style: 'footerText', margin: [0, 0, 40, 0], alignment: 'right' }
      ]
    }),

    content: [
      // Cover page
      { text: '\n\n\n\n', fontSize: 12 },
      { text: 'PINAXIS', style: 'brand', alignment: 'center' },
      { text: 'Warehouse Data Analysis Report', style: 'title', alignment: 'center' },
      { text: '\n' },
      { text: project.company_name, style: 'subtitle', alignment: 'center' },
      { text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, style: 'date', alignment: 'center' },
      { text: `Project Code: ${project.project_code}`, style: 'date', alignment: 'center' },
      { text: '\n\n\n' },
      {
        table: {
          widths: ['*'],
          body: [[{ text: 'Powered by GEBHARDT Intralogistics Group', style: 'gebhardt', alignment: 'center', margin: [0, 10, 0, 10] }]]
        },
        layout: { hLineColor: () => '#3b82f6', vLineColor: () => '#3b82f6' }
      },

      { text: '', pageBreak: 'after' },

      // Section 1: Overview KPIs
      { text: '1. Overview KPIs', style: 'sectionTitle' },
      { text: '\n' },

      buildKPITable(overview),

      { text: '\n' },

      // Section 2: Order Structure
      { text: '2. Order Structure Analysis', style: 'sectionTitle' },
      { text: `Total Orders: ${(orderStructure.total_orders || 0).toLocaleString()}  |  Single-Line: ${orderStructure.single_line_pct || 0}%  |  Multi-Line: ${orderStructure.multi_line_pct || 0}%`, style: 'bodyText' },
      { text: '\n' },

      buildOrderStructureTable(orderStructure),
      { text: '\n' },
      ...buildOrderStructureChart(orderStructure),

      { text: '', pageBreak: 'after' },

      // Section 3: Throughput
      { text: '3. Throughput Analysis', style: 'sectionTitle' },
      { text: '\n' },

      { text: '3.1 Monthly Throughput', style: 'subsectionTitle' },
      buildMonthlyTable(throughputMonthly),
      { text: '\n' },
      ...buildMonthlyChart(throughputMonthly),
      { text: '\n' },

      { text: '3.2 Weekday Distribution', style: 'subsectionTitle' },
      buildWeekdayTable(throughputWeekday),
      { text: '\n' },
      ...buildWeekdayChart(throughputWeekday),

      { text: '', pageBreak: 'after' },

      // Section 4: ABC Classification
      { text: '4. ABC Classification', style: 'sectionTitle' },
      { text: `Gini Coefficient: ${abc.gini || 'N/A'}  —  Higher values indicate more concentrated demand.`, style: 'bodyText' },
      { text: '\n' },

      buildABCTable(abc),
      { text: '\n' },
      ...buildABCCharts(abc),
      { text: '\n' },
      buildTopSKUTable(abc),

      { text: '', pageBreak: 'after' },

      // Section 5: Fit Analysis
      { text: '5. Fit / No-Fit Analysis', style: 'sectionTitle' },
      { text: 'Analysis of SKU dimensions against standard GEBHARDT bin sizes (600x400mm footprint).', style: 'bodyText' },
      { text: '\n' },

      buildFitTable(fit),
      { text: '\n' },
      ...buildFitChart(fit),

      { text: '\n\n' },

      // Section 6: Product Recommendations
      { text: '6. GEBHARDT Product Recommendations', style: 'sectionTitle' },
      { text: 'Based on the warehouse data analysis, the following GEBHARDT products are recommended:', style: 'bodyText' },
      { text: '\n' },

      ...buildProductScoresChart(recommendations),
      { text: '\n' },
      ...buildRecommendationCards(recommendations),

      // Section 7: Client Benefit Projections
      ...(benefitData.projections ? [
        { text: '', pageBreak: 'after' },
        { text: '7. Client Benefit Projections', style: 'sectionTitle' },
        { text: 'Data-driven ROI projections based on your warehouse analytics and GEBHARDT product matching.', style: 'bodyText' },
        { text: '\n' },
        ...buildROICharts(benefitData),
        { text: '\n' },
        buildROISummaryTable(benefitData.summary || {}),
        { text: '\n' },
        { text: '7.1 Warehouse Automation Benefits', style: 'subsectionTitle' },
        buildBenefitsTable((benefitData.projections || []).filter(p => p.category === 'warehouse_automation')),
        { text: '\n' },
        { text: '7.2 Platform & AI Benefits', style: 'subsectionTitle' },
        buildBenefitsTable((benefitData.projections || []).filter(p => p.category === 'platform_ai'))
      ] : [])
    ],

    styles: {
      brand: { fontSize: 36, bold: true, color: '#3b82f6' },
      title: { fontSize: 22, bold: true, color: '#1e293b', margin: [0, 10, 0, 0] },
      subtitle: { fontSize: 16, color: '#475569', margin: [0, 5, 0, 0] },
      date: { fontSize: 12, color: '#94a3b8', margin: [0, 5, 0, 0] },
      gebhardt: { fontSize: 14, bold: true, color: '#3b82f6' },
      sectionTitle: { fontSize: 18, bold: true, color: '#1e293b', margin: [0, 15, 0, 5] },
      subsectionTitle: { fontSize: 14, bold: true, color: '#334155', margin: [0, 10, 0, 5] },
      bodyText: { fontSize: 11, color: '#475569', lineHeight: 1.4 },
      tableHeader: { fontSize: 10, bold: true, color: '#1e293b', fillColor: '#f1f5f9' },
      tableCell: { fontSize: 10, color: '#334155' },
      headerText: { fontSize: 8, color: '#94a3b8' },
      headerRight: { fontSize: 8, color: '#94a3b8' },
      footerText: { fontSize: 8, color: '#94a3b8' },
      recTitle: { fontSize: 14, bold: true, color: '#1e293b' },
      recScore: { fontSize: 24, bold: true, color: '#3b82f6' },
      recDesc: { fontSize: 10, color: '#64748b', lineHeight: 1.3 }
    },

    defaultStyle: {
      font: 'Roboto',
      fontSize: 11
    }
  };

  // Use pdfmake's built-in virtual file system
  const PdfMake = require('pdfmake/build/pdfmake');
  const vfsFonts = require('pdfmake/build/vfs_fonts');
  PdfMake.vfs = vfsFonts.pdfMake ? vfsFonts.pdfMake.vfs : vfsFonts.vfs;

  return new Promise((resolve, reject) => {
    const pdfDoc = PdfMake.createPdf(docDefinition);
    pdfDoc.getBuffer((buffer) => {
      resolve(Buffer.from(buffer));
    });
  });
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildKPITable(overview) {
  const skus = overview.skus || {};
  const orders = overview.orders || {};
  const dateRange = overview.date_range || {};

  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          { text: 'Metric', style: 'tableHeader' },
          { text: 'Value', style: 'tableHeader' },
          { text: 'Metric', style: 'tableHeader' },
          { text: 'Value', style: 'tableHeader' }
        ],
        [
          { text: 'Total SKUs', style: 'tableCell' },
          { text: (skus.total || 0).toLocaleString(), style: 'tableCell' },
          { text: 'Total Orders', style: 'tableCell' },
          { text: (orders.total_orders || 0).toLocaleString(), style: 'tableCell' }
        ],
        [
          { text: 'Active SKUs', style: 'tableCell' },
          { text: (skus.active || 0).toLocaleString(), style: 'tableCell' },
          { text: 'Total Orderlines', style: 'tableCell' },
          { text: (orders.total_orderlines || 0).toLocaleString(), style: 'tableCell' }
        ],
        [
          { text: 'Bin-Capable', style: 'tableCell' },
          { text: `${skus.bin_capable || 0} (${skus.bin_capable_pct || 0}%)`, style: 'tableCell' },
          { text: 'Total Units', style: 'tableCell' },
          { text: Math.round(orders.total_units || 0).toLocaleString(), style: 'tableCell' }
        ],
        [
          { text: 'Date Range', style: 'tableCell' },
          { text: `${dateRange.from || 'N/A'} to ${dateRange.to || 'N/A'}`, style: 'tableCell', colSpan: 3 },
          {}, {}
        ]
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildOrderStructureTable(orderStructure) {
  const histogram = orderStructure.histogram || [];
  if (histogram.length === 0) return { text: 'No order structure data available.', style: 'bodyText' };

  return {
    table: {
      widths: ['auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Lines/Order', style: 'tableHeader' },
          { text: 'Orders', style: 'tableHeader' },
          { text: '% Share', style: 'tableHeader' },
          { text: 'Cumulative %', style: 'tableHeader' }
        ],
        ...histogram.map(h => [
          { text: h.label, style: 'tableCell' },
          { text: h.count.toLocaleString(), style: 'tableCell' },
          { text: `${h.pct}%`, style: 'tableCell' },
          { text: `${h.cumulative_pct}%`, style: 'tableCell' }
        ])
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildMonthlyTable(throughput) {
  const months = throughput.months || [];
  if (months.length === 0) return { text: 'No monthly data available.', style: 'bodyText' };

  return {
    table: {
      widths: ['auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Month', style: 'tableHeader' },
          { text: 'Orders', style: 'tableHeader' },
          { text: 'Orderlines', style: 'tableHeader' },
          { text: 'Units', style: 'tableHeader' }
        ],
        ...months.map(m => [
          { text: m.month, style: 'tableCell' },
          { text: m.orders.toLocaleString(), style: 'tableCell' },
          { text: m.orderlines.toLocaleString(), style: 'tableCell' },
          { text: Math.round(m.units).toLocaleString(), style: 'tableCell' }
        ])
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildWeekdayTable(throughput) {
  const weekdays = throughput.weekdays || [];
  if (weekdays.length === 0) return { text: 'No weekday data available.', style: 'bodyText' };

  return {
    table: {
      widths: ['auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Day', style: 'tableHeader' },
          { text: 'Orders', style: 'tableHeader' },
          { text: 'Orderlines', style: 'tableHeader' },
          { text: 'Units', style: 'tableHeader' }
        ],
        ...weekdays.map(d => [
          { text: d.day, style: 'tableCell' },
          { text: d.orders.toLocaleString(), style: 'tableCell' },
          { text: d.orderlines.toLocaleString(), style: 'tableCell' },
          { text: Math.round(d.units).toLocaleString(), style: 'tableCell' }
        ])
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildABCTable(abc) {
  const classes = abc.classes || {};
  return {
    table: {
      widths: ['auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Class', style: 'tableHeader' },
          { text: 'SKU Count', style: 'tableHeader' },
          { text: '% of SKUs', style: 'tableHeader' },
          { text: '% of Volume', style: 'tableHeader' }
        ],
        [
          { text: 'A (Fast Movers)', style: 'tableCell', bold: true },
          { text: (classes.A?.count || 0).toLocaleString(), style: 'tableCell' },
          { text: `${classes.A?.pct || 0}%`, style: 'tableCell' },
          { text: `${classes.A?.volume_pct || 0}%`, style: 'tableCell' }
        ],
        [
          { text: 'B (Medium Movers)', style: 'tableCell' },
          { text: (classes.B?.count || 0).toLocaleString(), style: 'tableCell' },
          { text: `${classes.B?.pct || 0}%`, style: 'tableCell' },
          { text: `${classes.B?.volume_pct || 0}%`, style: 'tableCell' }
        ],
        [
          { text: 'C (Slow Movers)', style: 'tableCell' },
          { text: (classes.C?.count || 0).toLocaleString(), style: 'tableCell' },
          { text: `${classes.C?.pct || 0}%`, style: 'tableCell' },
          { text: `${classes.C?.volume_pct || 0}%`, style: 'tableCell' }
        ]
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildTopSKUTable(abc) {
  const topSkus = abc.top_skus || [];
  if (topSkus.length === 0) return { text: '' };

  return {
    table: {
      widths: ['auto', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: '#', style: 'tableHeader' },
          { text: 'SKU', style: 'tableHeader' },
          { text: 'Picks', style: 'tableHeader' },
          { text: '% of Total', style: 'tableHeader' },
          { text: 'Class', style: 'tableHeader' }
        ],
        ...topSkus.slice(0, 10).map((s, i) => [
          { text: (i + 1).toString(), style: 'tableCell' },
          { text: s.sku, style: 'tableCell' },
          { text: Math.round(s.picks).toLocaleString(), style: 'tableCell' },
          { text: `${s.pct}%`, style: 'tableCell' },
          { text: s.class, style: 'tableCell', bold: s.class === 'A' }
        ])
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildFitTable(fit) {
  const bins = fit.bins || [];
  if (bins.length === 0) return { text: 'No fit analysis data available.', style: 'bodyText' };

  return {
    table: {
      widths: ['auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Bin Size (LxWxH mm)', style: 'tableHeader' },
          { text: 'Fitting SKUs', style: 'tableHeader' },
          { text: '% of Measured', style: 'tableHeader' },
          { text: '% of Total', style: 'tableHeader' }
        ],
        ...bins.map(b => [
          { text: b.name, style: 'tableCell' },
          { text: b.fit_count.toLocaleString(), style: 'tableCell' },
          { text: `${b.fit_pct}%`, style: 'tableCell' },
          { text: `${b.fit_pct_total}%`, style: 'tableCell' }
        ]),
        [
          { text: `Items with dimensions: ${fit.items_with_dimensions || 0}`, style: 'tableCell', colSpan: 2 },
          {},
          { text: `Without: ${fit.items_without_dimensions || 0}`, style: 'tableCell', colSpan: 2 },
          {}
        ]
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

function buildRecommendationCards(recommendations) {
  if (recommendations.length === 0) return [{ text: 'No recommendations available.', style: 'bodyText' }];

  const content = [];
  for (const rec of recommendations) {
    const scoreColor = rec.fit_score >= 70 ? '#22c55e' : rec.fit_score >= 40 ? '#f59e0b' : '#94a3b8';

    content.push({
      table: {
        widths: [80, '*'],
        body: [[
          {
            stack: [
              { text: Math.round(rec.fit_score), style: 'recScore', color: scoreColor, alignment: 'center' },
              { text: '/100', fontSize: 10, color: '#94a3b8', alignment: 'center' }
            ],
            margin: [0, 10, 0, 10]
          },
          {
            stack: [
              { text: rec.product_name, style: 'recTitle' },
              { text: rec.product_category, fontSize: 10, color: '#3b82f6', margin: [0, 2, 0, 4] },
              { text: rec.description, style: 'recDesc' }
            ],
            margin: [0, 8, 0, 8]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => rec.highlighted ? '#3b82f6' : '#e2e8f0',
        vLineColor: () => rec.highlighted ? '#3b82f6' : '#e2e8f0'
      },
      margin: [0, 5, 0, 5]
    });
  }

  return content;
}

function buildROISummaryTable(summary) {
  const fmtCurrency = (v) => {
    if (!v) return 'N/A';
    if (v >= 1000000) return `EUR ${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `EUR ${Math.round(v / 1000)}K`;
    return `EUR ${v.toLocaleString()}`;
  };

  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          { text: 'Automation Readiness', style: 'tableHeader', alignment: 'center' },
          { text: 'Est. Annual Savings', style: 'tableHeader', alignment: 'center' },
          { text: 'Payback Period', style: 'tableHeader', alignment: 'center' },
          { text: 'High-Confidence Benefits', style: 'tableHeader', alignment: 'center' }
        ],
        [
          { text: `${summary.automation_readiness_score || 0}/100`, style: 'tableCell', alignment: 'center', bold: true, fontSize: 14 },
          { text: `${fmtCurrency(summary.annual_savings_low)} – ${fmtCurrency(summary.annual_savings_high)}`, style: 'tableCell', alignment: 'center' },
          { text: `${summary.payback_months_low || 12}–${summary.payback_months_high || 24} months`, style: 'tableCell', alignment: 'center' },
          { text: `${summary.high_confidence_count || 0} of ${summary.total_projections || 0}`, style: 'tableCell', alignment: 'center' }
        ]
      ]
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => '#3b82f6',
      vLineColor: () => '#3b82f6'
    }
  };
}

function buildBenefitsTable(projections) {
  if (!projections || projections.length === 0) return { text: 'No projections available.', style: 'bodyText' };

  const confLabel = { high: 'High', medium: 'Medium', low: 'Benchmark' };

  return {
    table: {
      widths: ['*', 'auto', 'auto', '*'],
      body: [
        [
          { text: 'Benefit', style: 'tableHeader' },
          { text: 'Improvement', style: 'tableHeader' },
          { text: 'Confidence', style: 'tableHeader' },
          { text: 'Key Driver', style: 'tableHeader' }
        ],
        ...projections.map(p => [
          { text: p.title, style: 'tableCell', bold: true },
          { text: `${p.improvement_pct}%`, style: 'tableCell', color: '#22c55e', bold: true },
          { text: confLabel[p.confidence] || p.confidence, style: 'tableCell' },
          { text: p.data_drivers?.[0]?.explanation || '', style: 'tableCell', fontSize: 9 }
        ])
      ]
    },
    layout: 'lightHorizontalLines'
  };
}

// ============================================================================
// CHART INTEGRATION HELPERS — bridge data → SVG charts → pdfmake content
// ============================================================================

function buildOrderStructureChart(orderStructure) {
  const histogram = orderStructure.histogram || [];
  if (histogram.length === 0) return [];

  const svg = buildBarChartSvg(
    histogram.map(h => ({ label: h.label, value: h.count })),
    { width: 500, height: 200, barColor: CHART_COLORS.primary, labelKey: 'label', valueKey: 'value' }
  );
  if (!svg) return [];
  return [{ svg, width: 500, alignment: 'center' }];
}

function buildMonthlyChart(throughput) {
  const months = throughput.months || [];
  if (months.length === 0) return [];

  const svg = buildGroupedBarChartSvg(
    months.map(m => ({ label: m.month, orders: m.orders, orderlines: m.orderlines })),
    { width: 500, height: 220, labelKey: 'label', keys: ['orders', 'orderlines'], colors: [CHART_COLORS.primary, CHART_COLORS.green], legends: ['Orders', 'Orderlines'] }
  );
  if (!svg) return [];
  return [{ svg, width: 500, alignment: 'center' }];
}

function buildWeekdayChart(throughput) {
  const weekdays = throughput.weekdays || [];
  if (weekdays.length === 0) return [];

  const svg = buildBarChartSvg(
    weekdays.map(d => ({ label: d.day, value: d.orderlines })),
    { width: 500, height: 200, barColor: CHART_COLORS.green, labelKey: 'label', valueKey: 'value' }
  );
  if (!svg) return [];
  return [{ svg, width: 500, alignment: 'center' }];
}

function buildABCCharts(abc) {
  const classes = abc.classes || {};
  const segments = [];
  if (classes.A) segments.push({ label: 'A – Fast', value: classes.A.volume_pct || 0, color: CHART_COLORS.green });
  if (classes.B) segments.push({ label: 'B – Medium', value: classes.B.volume_pct || 0, color: CHART_COLORS.amber });
  if (classes.C) segments.push({ label: 'C – Slow', value: classes.C.volume_pct || 0, color: CHART_COLORS.slate });
  if (segments.length === 0) return [];

  const volumeDonut = buildDonutChartSvg(segments, { width: 220, height: 200, title: 'Volume %' });

  const skuSegments = [];
  if (classes.A) skuSegments.push({ label: 'A – Fast', value: classes.A.pct || 0, color: CHART_COLORS.green });
  if (classes.B) skuSegments.push({ label: 'B – Medium', value: classes.B.pct || 0, color: CHART_COLORS.amber });
  if (classes.C) skuSegments.push({ label: 'C – Slow', value: classes.C.pct || 0, color: CHART_COLORS.slate });

  const skuDonut = buildDonutChartSvg(skuSegments, { width: 220, height: 200, title: 'SKU %' });

  if (!volumeDonut || !skuDonut) return [];

  return [{
    columns: [
      { svg: volumeDonut, width: 220, alignment: 'center' },
      { svg: skuDonut, width: 220, alignment: 'center' }
    ],
    columnGap: 20
  }];
}

function buildFitChart(fit) {
  const bins = fit.bins || [];
  if (bins.length === 0) return [];

  const svg = buildHorizontalBarChartSvg(
    bins.map(b => ({ label: b.name, value: b.fit_pct || 0 })),
    { width: 500, barHeight: 26, labelKey: 'label', valueKey: 'value', maxValue: 100, showPct: true }
  );
  if (!svg) return [];
  return [{ svg, width: 500, alignment: 'center' }];
}

function buildProductScoresChart(recommendations) {
  if (!recommendations || recommendations.length === 0) return [];

  const svg = buildHorizontalBarChartSvg(
    recommendations.map(r => ({ label: `${r.product_name} (${r.product_category})`, value: r.fit_score })),
    { width: 500, barHeight: 28, labelKey: 'label', valueKey: 'value', maxValue: 100, showPct: false }
  );
  if (!svg) return [];
  return [{ svg, width: 500, alignment: 'center' }];
}

function buildROICharts(benefitData) {
  const content = [];
  const summary = benefitData.summary || {};
  const projections = benefitData.projections || [];

  // Gauge + benefits horizontal bar side by side
  const gaugeSvg = buildGaugeSvg(summary.automation_readiness_score || 0, { width: 200, height: 130 });

  const benefitBarSvg = buildHorizontalBarChartSvg(
    projections.map(p => ({ label: p.title, value: p.improvement_pct })),
    {
      width: 310,
      barHeight: 20,
      labelKey: 'label',
      valueKey: 'value',
      maxValue: 100,
      showPct: true,
      colorFn: (v) => v >= 80 ? CHART_COLORS.green : v >= 40 ? CHART_COLORS.primary : CHART_COLORS.amber
    }
  );

  if (gaugeSvg && benefitBarSvg) {
    content.push({
      columns: [
        {
          stack: [
            { text: 'Automation Readiness', style: 'subsectionTitle', alignment: 'center' },
            { svg: gaugeSvg, width: 200, alignment: 'center' }
          ],
          width: 200
        },
        {
          stack: [
            { text: 'Benefit Improvements', style: 'subsectionTitle', alignment: 'center' },
            { svg: benefitBarSvg, width: 310, alignment: 'center' }
          ],
          width: '*'
        }
      ],
      columnGap: 10
    });
  }

  return content;
}

module.exports = { generate };
