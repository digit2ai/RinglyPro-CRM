/**
 * PDF Report Generation Service
 * Uses pdfmake to generate QBR, lane, carrier, and coverage reports.
 */
const PdfPrinter = require('pdfmake');
const sequelize = require('./db.cw');

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

const printer = new PdfPrinter(fonts);

const COLORS = {
  gold: '#C8962A',
  blue: '#1A4FA8',
  dark: '#0D1117',
  green: '#238636',
  red: '#F85149',
  grey: '#8B949E',
  lightGrey: '#F3F4F6'
};

/**
 * Generate QBR (Quarterly Business Review) report
 */
async function generateQBR(options = {}) {
  const { shipper_name, quarter, year } = options;

  // Fetch data
  const [loads] = await sequelize.query(
    `SELECT l.*, cc.company_name as carrier_name
     FROM cw_loads l
     LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
     ORDER BY l.created_at DESC LIMIT 100`
  );

  const [lanes] = await sequelize.query(
    `SELECT origin, destination, COUNT(*) as total_loads,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
      AVG(rate_usd) as avg_rate, SUM(rate_usd) as total_revenue
     FROM cw_loads GROUP BY origin, destination ORDER BY total_loads DESC LIMIT 15`
  );

  const [carriers] = await sequelize.query(
    `SELECT c.company_name, COUNT(l.id) as total_loads,
      COUNT(l.id) FILTER (WHERE l.status = 'delivered') as delivered,
      AVG(l.rate_usd) as avg_rate
     FROM cw_contacts c LEFT JOIN cw_loads l ON l.carrier_id = c.id
     WHERE c.contact_type = 'carrier'
     GROUP BY c.company_name ORDER BY total_loads DESC LIMIT 10`
  );

  const [[stats]] = await sequelize.query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
      COUNT(*) FILTER (WHERE status = 'open') as open_loads,
      SUM(rate_usd) as total_revenue, AVG(rate_usd) as avg_rate
     FROM cw_loads`
  );

  const [[callStats]] = await sequelize.query(
    `SELECT COUNT(*) as total_calls, COUNT(*) FILTER (WHERE outcome = 'completed') as completed,
      COUNT(*) FILTER (WHERE outcome = 'booked') as booked
     FROM cw_call_logs`
  );

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const qLabel = quarter && year ? `Q${quarter} ${year}` : reportDate;

  const docDefinition = {
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    pageMargins: [40, 60, 40, 50],
    header: {
      columns: [
        { text: 'CW CARRIERS USA — QUARTERLY BUSINESS REVIEW', style: 'headerText', margin: [40, 20, 0, 0] },
        { text: qLabel, alignment: 'right', style: 'headerDate', margin: [0, 20, 40, 0] }
      ]
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'Powered by RinglyPro AI | Digit2AI LLC', style: 'footerText', margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'footerText', margin: [0, 0, 40, 0] }
      ]
    }),
    content: [
      // Title
      { text: 'Quarterly Business Review', style: 'title' },
      { text: shipper_name ? `Prepared for ${shipper_name}` : 'CW Carriers USA, Inc.', style: 'subtitle' },
      { text: `Report Date: ${reportDate}`, style: 'date' },
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: COLORS.gold }] },
      '\n',

      // KPI Summary
      { text: 'KEY PERFORMANCE INDICATORS', style: 'sectionHeader' },
      {
        columns: [
          kpiBox('Total Loads', stats.total || 0),
          kpiBox('Delivered', stats.delivered || 0),
          kpiBox('Open', stats.open_loads || 0),
          kpiBox('Avg Rate', `$${parseFloat(stats.avg_rate || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`),
          kpiBox('Revenue', `$${parseFloat(stats.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
        ],
        columnGap: 8
      },
      '\n',
      {
        columns: [
          kpiBox('Total Calls', callStats.total_calls || 0),
          kpiBox('Completed', callStats.completed || 0),
          kpiBox('Booked', callStats.booked || 0)
        ],
        columnGap: 8
      },
      '\n\n',

      // Lane Profitability
      { text: 'LANE PROFITABILITY', style: 'sectionHeader' },
      lanes.length ? {
        table: {
          headerRows: 1,
          widths: ['*', '*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Origin', style: 'tableHeader' },
              { text: 'Destination', style: 'tableHeader' },
              { text: 'Loads', style: 'tableHeader' },
              { text: 'Delivered', style: 'tableHeader' },
              { text: 'Avg Rate', style: 'tableHeader' },
              { text: 'Revenue', style: 'tableHeader' }
            ],
            ...lanes.map(l => [
              l.origin || '—',
              l.destination || '—',
              { text: String(l.total_loads), alignment: 'center' },
              { text: String(l.delivered), alignment: 'center' },
              { text: `$${parseFloat(l.avg_rate || 0).toFixed(0)}`, alignment: 'right' },
              { text: `$${parseFloat(l.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, alignment: 'right' }
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      } : { text: 'No lane data available', style: 'empty' },
      '\n\n',

      // Carrier Performance
      { text: 'CARRIER PERFORMANCE', style: 'sectionHeader' },
      carriers.length ? {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Carrier', style: 'tableHeader' },
              { text: 'Total Loads', style: 'tableHeader' },
              { text: 'Delivered', style: 'tableHeader' },
              { text: 'Avg Rate', style: 'tableHeader' },
              { text: 'Delivery %', style: 'tableHeader' }
            ],
            ...carriers.map(c => {
              const pct = c.total_loads > 0 ? ((c.delivered / c.total_loads) * 100).toFixed(0) : '0';
              return [
                c.company_name || '—',
                { text: String(c.total_loads), alignment: 'center' },
                { text: String(c.delivered), alignment: 'center' },
                { text: `$${parseFloat(c.avg_rate || 0).toFixed(0)}`, alignment: 'right' },
                { text: `${pct}%`, alignment: 'center', color: parseInt(pct) >= 90 ? COLORS.green : parseInt(pct) >= 70 ? COLORS.gold : COLORS.red }
              ];
            })
          ]
        },
        layout: 'lightHorizontalLines'
      } : { text: 'No carrier data available', style: 'empty' },
      '\n\n',

      // Recent Loads
      { text: 'RECENT LOADS', style: 'sectionHeader' },
      loads.length ? {
        table: {
          headerRows: 1,
          widths: ['auto', '*', '*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Ref', style: 'tableHeader' },
              { text: 'Origin', style: 'tableHeader' },
              { text: 'Destination', style: 'tableHeader' },
              { text: 'Type', style: 'tableHeader' },
              { text: 'Rate', style: 'tableHeader' },
              { text: 'Status', style: 'tableHeader' }
            ],
            ...loads.slice(0, 25).map(l => [
              l.load_ref || `#${l.id}`,
              l.origin || '—',
              l.destination || '—',
              l.freight_type || '—',
              { text: l.rate_usd ? `$${parseFloat(l.rate_usd).toLocaleString()}` : '—', alignment: 'right' },
              { text: (l.status || '—').toUpperCase(), fontSize: 8, color: l.status === 'delivered' ? COLORS.green : l.status === 'open' ? COLORS.blue : COLORS.gold }
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      } : { text: 'No loads available', style: 'empty' }
    ],
    styles: {
      title: { fontSize: 24, bold: true, color: COLORS.dark, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 14, color: COLORS.gold, margin: [0, 0, 0, 4] },
      date: { fontSize: 10, color: COLORS.grey, margin: [0, 0, 0, 8] },
      sectionHeader: { fontSize: 12, bold: true, color: COLORS.blue, margin: [0, 0, 0, 8], decoration: 'underline' },
      tableHeader: { bold: true, fontSize: 9, color: COLORS.dark, fillColor: COLORS.lightGrey },
      headerText: { fontSize: 8, color: COLORS.grey, bold: true },
      headerDate: { fontSize: 8, color: COLORS.gold },
      footerText: { fontSize: 7, color: COLORS.grey },
      empty: { fontSize: 10, color: COLORS.grey, italics: true }
    }
  };

  return generatePdfBuffer(docDefinition);
}

/**
 * Generate Lane Report
 */
async function generateLaneReport() {
  const [lanes] = await sequelize.query(
    `SELECT origin, destination, COUNT(*) as total_loads,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
      COUNT(*) FILTER (WHERE status = 'open') as open_loads,
      AVG(rate_usd) as avg_rate, SUM(rate_usd) as total_revenue,
      MIN(rate_usd) as min_rate, MAX(rate_usd) as max_rate
     FROM cw_loads GROUP BY origin, destination ORDER BY total_revenue DESC`
  );

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const docDefinition = {
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    pageMargins: [40, 40, 40, 50],
    footer: (currentPage, pageCount) => ({
      text: `Powered by RinglyPro AI | Page ${currentPage}/${pageCount}`,
      alignment: 'center', fontSize: 7, color: COLORS.grey, margin: [0, 10, 0, 0]
    }),
    content: [
      { text: 'Lane Profitability Report', style: 'title' },
      { text: `CW Carriers USA — ${reportDate}`, style: 'subtitle' },
      '\n',
      lanes.length ? {
        table: {
          headerRows: 1,
          widths: ['*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            ['Origin', 'Destination', 'Loads', 'Delivered', 'Avg Rate', 'Min/Max', 'Revenue'].map(h => ({ text: h, style: 'tableHeader' })),
            ...lanes.map(l => [
              l.origin || '—', l.destination || '—',
              { text: String(l.total_loads), alignment: 'center' },
              { text: String(l.delivered), alignment: 'center' },
              { text: `$${parseFloat(l.avg_rate || 0).toFixed(0)}`, alignment: 'right' },
              { text: `$${parseFloat(l.min_rate || 0).toFixed(0)}–$${parseFloat(l.max_rate || 0).toFixed(0)}`, alignment: 'right', fontSize: 8 },
              { text: `$${parseFloat(l.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, alignment: 'right', bold: true }
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      } : { text: 'No lane data', style: 'empty' }
    ],
    styles: {
      title: { fontSize: 22, bold: true, color: COLORS.dark },
      subtitle: { fontSize: 12, color: COLORS.gold, margin: [0, 0, 0, 8] },
      tableHeader: { bold: true, fontSize: 9, fillColor: COLORS.lightGrey },
      empty: { fontSize: 10, color: COLORS.grey, italics: true }
    }
  };

  return generatePdfBuffer(docDefinition);
}

/**
 * Generate Carrier Performance Report
 */
async function generateCarrierReport() {
  const [carriers] = await sequelize.query(
    `SELECT c.company_name, c.phone, c.email,
      COUNT(l.id) as total_loads,
      COUNT(l.id) FILTER (WHERE l.status = 'delivered') as delivered,
      COUNT(l.id) FILTER (WHERE l.status = 'in_transit') as in_transit,
      AVG(l.rate_usd) as avg_rate, SUM(l.rate_usd) as total_revenue
     FROM cw_contacts c LEFT JOIN cw_loads l ON l.carrier_id = c.id
     WHERE c.contact_type = 'carrier'
     GROUP BY c.company_name, c.phone, c.email
     ORDER BY total_loads DESC`
  );

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const docDefinition = {
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    pageMargins: [40, 40, 40, 50],
    footer: (currentPage, pageCount) => ({
      text: `Powered by RinglyPro AI | Page ${currentPage}/${pageCount}`,
      alignment: 'center', fontSize: 7, color: COLORS.grey, margin: [0, 10, 0, 0]
    }),
    content: [
      { text: 'Carrier Performance Report', style: 'title' },
      { text: `CW Carriers USA — ${reportDate}`, style: 'subtitle' },
      '\n',
      carriers.length ? {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            ['Carrier', 'Loads', 'Delivered', 'Avg Rate', 'Revenue', 'Score'].map(h => ({ text: h, style: 'tableHeader' })),
            ...carriers.map(c => {
              const pct = c.total_loads > 0 ? ((c.delivered / c.total_loads) * 100).toFixed(0) : '0';
              return [
                c.company_name || '—',
                { text: String(c.total_loads), alignment: 'center' },
                { text: String(c.delivered), alignment: 'center' },
                { text: `$${parseFloat(c.avg_rate || 0).toFixed(0)}`, alignment: 'right' },
                { text: `$${parseFloat(c.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, alignment: 'right' },
                { text: `${pct}%`, alignment: 'center', bold: true, color: parseInt(pct) >= 90 ? COLORS.green : parseInt(pct) >= 70 ? COLORS.gold : COLORS.red }
              ];
            })
          ]
        },
        layout: 'lightHorizontalLines'
      } : { text: 'No carrier data', style: 'empty' }
    ],
    styles: {
      title: { fontSize: 22, bold: true, color: COLORS.dark },
      subtitle: { fontSize: 12, color: COLORS.gold, margin: [0, 0, 0, 8] },
      tableHeader: { bold: true, fontSize: 9, fillColor: COLORS.lightGrey },
      empty: { fontSize: 10, color: COLORS.grey, italics: true }
    }
  };

  return generatePdfBuffer(docDefinition);
}

/**
 * Helper: KPI box for summary section
 */
function kpiBox(label, value) {
  return {
    stack: [
      { text: String(value), fontSize: 18, bold: true, color: COLORS.blue, alignment: 'center' },
      { text: label, fontSize: 8, color: COLORS.grey, alignment: 'center', margin: [0, 2, 0, 0] }
    ],
    margin: [0, 0, 0, 4]
  };
}

/**
 * Convert pdfmake doc to Buffer
 */
function generatePdfBuffer(docDefinition) {
  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', chunk => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

module.exports = {
  generateQBR,
  generateLaneReport,
  generateCarrierReport
};
