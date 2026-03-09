/**
 * PDF Report Generation Routes
 * GET endpoints return downloadable PDFs
 */
const express = require('express');
const router = express.Router();
const reports = require('../services/reports.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET /qbr - Quarterly Business Review PDF
router.get('/qbr', async (req, res) => {
  try {
    const { shipper_name, quarter, year } = req.query;
    const pdfBuffer = await reports.generateQBR({ shipper_name, quarter, year });
    const filename = `CW-Carriers-QBR${quarter ? `-Q${quarter}` : ''}${year ? `-${year}` : ''}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('CW QBR report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /lanes - Lane Profitability PDF
router.get('/lanes', async (req, res) => {
  try {
    const pdfBuffer = await reports.generateLaneReport();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="CW-Carriers-Lane-Report.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('CW lane report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /carriers - Carrier Performance PDF
router.get('/carriers', async (req, res) => {
  try {
    const pdfBuffer = await reports.generateCarrierReport();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="CW-Carriers-Carrier-Report.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('CW carrier report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /list - List available report types
router.get('/list', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'qbr', name: 'Quarterly Business Review', description: 'Full QBR with KPIs, lanes, carriers, and recent loads', params: 'shipper_name, quarter, year' },
      { id: 'lanes', name: 'Lane Profitability Report', description: 'Revenue and rate analysis by lane' },
      { id: 'carriers', name: 'Carrier Performance Report', description: 'Carrier scoring by delivery rate and volume' }
    ]
  });
});

module.exports = router;
