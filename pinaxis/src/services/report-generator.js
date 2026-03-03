'use strict';

const PdfPrinter = require('pdfmake');

// Font definitions for pdfmake
const fonts = {
  Roboto: {
    normal: require.resolve('pdfmake/build/vfs_fonts.js') ? undefined : undefined
  }
};

/**
 * Generate PDF analysis report for a PINAXIS project
 */
async function generate(project) {
  const analysisMap = {};
  for (const r of (project.analysisResults || [])) {
    analysisMap[r.analysis_type] = r.result_data;
  }

  const recommendations = (project.recommendations || []).sort((a, b) => b.fit_score - a.fit_score);

  const overview = analysisMap.overview_kpis || {};
  const orderStructure = analysisMap.order_structure || {};
  const abc = analysisMap.abc_classification || {};
  const fit = analysisMap.fit_analysis || {};
  const throughputMonthly = analysisMap.throughput_monthly || {};
  const throughputWeekday = analysisMap.throughput_weekday || {};

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

      { text: '', pageBreak: 'after' },

      // Section 3: Throughput
      { text: '3. Throughput Analysis', style: 'sectionTitle' },
      { text: '\n' },

      { text: '3.1 Monthly Throughput', style: 'subsectionTitle' },
      buildMonthlyTable(throughputMonthly),
      { text: '\n' },

      { text: '3.2 Weekday Distribution', style: 'subsectionTitle' },
      buildWeekdayTable(throughputWeekday),

      { text: '', pageBreak: 'after' },

      // Section 4: ABC Classification
      { text: '4. ABC Classification', style: 'sectionTitle' },
      { text: `Gini Coefficient: ${abc.gini || 'N/A'}  —  Higher values indicate more concentrated demand.`, style: 'bodyText' },
      { text: '\n' },

      buildABCTable(abc),
      { text: '\n' },
      buildTopSKUTable(abc),

      { text: '', pageBreak: 'after' },

      // Section 5: Fit Analysis
      { text: '5. Fit / No-Fit Analysis', style: 'sectionTitle' },
      { text: 'Analysis of SKU dimensions against standard GEBHARDT bin sizes (600x400mm footprint).', style: 'bodyText' },
      { text: '\n' },

      buildFitTable(fit),

      { text: '\n\n' },

      // Section 6: Product Recommendations
      { text: '6. GEBHARDT Product Recommendations', style: 'sectionTitle' },
      { text: 'Based on the warehouse data analysis, the following GEBHARDT products are recommended:', style: 'bodyText' },
      { text: '\n' },

      ...buildRecommendationCards(recommendations)
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

module.exports = { generate };
