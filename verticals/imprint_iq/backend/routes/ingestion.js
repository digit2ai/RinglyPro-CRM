/**
 * ImprintIQ — Data Ingestion Routes
 * POST /upload, POST /paste, GET /status, DELETE /reset, GET /templates/:type
 */

const express = require('express');
const router = express.Router();
const {
  parseCSV, mapColumns, insertRows, getStatus, resetData, TEMPLATES
} = require('../services/ingestion.iq');

const TENANT = 'imprint_iq';
const VALID_TYPES = ['customers', 'quotes', 'orders', 'calls', 'invoices', 'products'];

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ───── POST /upload — CSV text upload ─────
router.post('/upload', asyncHandler(async (req, res) => {
  const { type, csv_text, filename } = req.body;
  const tenantId = req.body.tenant_id || TENANT;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (!csv_text) {
    return res.status(400).json({ success: false, error: 'No csv_text provided' });
  }

  // Parse CSV
  const rows = parseCSV(csv_text);
  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No data rows found in CSV' });
  }

  // Auto-map columns
  const csvHeaders = Object.keys(rows[0]);
  const { mapping, unmapped } = mapColumns(csvHeaders, type);

  if (Object.keys(mapping).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Could not map any columns. Check your CSV headers match the expected format.',
      your_headers: csvHeaders,
      expected_fields: Object.keys(require('../services/ingestion.iq').SCHEMA_MAP[type] || {})
    });
  }

  // Insert
  const results = await insertRows(type, rows, mapping, tenantId);

  res.json({
    success: true,
    rows_imported: results.imported,
    rows_skipped: results.skipped,
    errors: results.errors,
    mapping_used: mapping,
    unmapped_columns: unmapped,
    filename: filename || 'upload',
    total_rows: rows.length
  });
}));

// ───── POST /paste — Tab-separated paste from spreadsheet ─────
router.post('/paste', asyncHandler(async (req, res) => {
  const { type, data } = req.body;
  const tenantId = req.body.tenant_id || TENANT;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (!data) {
    return res.status(400).json({ success: false, error: 'No data provided' });
  }

  // Parse (auto-detects tab vs comma)
  const rows = parseCSV(data);
  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No data rows found' });
  }

  // Auto-map columns
  const csvHeaders = Object.keys(rows[0]);
  const { mapping, unmapped } = mapColumns(csvHeaders, type);

  if (Object.keys(mapping).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Could not map any columns.',
      your_headers: csvHeaders
    });
  }

  const results = await insertRows(type, rows, mapping, tenantId);

  res.json({
    success: true,
    rows_imported: results.imported,
    rows_skipped: results.skipped,
    errors: results.errors,
    mapping_used: mapping,
    unmapped_columns: unmapped,
    total_rows: rows.length
  });
}));

// ───── POST /preview — Preview mapping without inserting ─────
router.post('/preview', asyncHandler(async (req, res) => {
  const { type, csv_text, data } = req.body;
  const text = csv_text || data;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: `Invalid type` });
  }
  if (!text) {
    return res.status(400).json({ success: false, error: 'No data provided' });
  }

  const rows = parseCSV(text);
  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No data rows found' });
  }

  const csvHeaders = Object.keys(rows[0]);
  const { mapping, unmapped } = mapColumns(csvHeaders, type);

  // Return preview of first 5 rows with mapped field names
  const preview = rows.slice(0, 5).map(row => {
    const mapped = {};
    for (const [csvCol, m] of Object.entries(mapping)) {
      mapped[m.field] = row[csvCol];
    }
    return mapped;
  });

  res.json({
    success: true,
    mapping,
    unmapped_columns: unmapped,
    preview_rows: preview,
    total_rows: rows.length,
    csv_headers: csvHeaders
  });
}));

// ───── GET /status — Data counts per table ─────
router.get('/status', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;
  const counts = await getStatus(tenantId);
  res.json({ success: true, counts });
}));

// ───── DELETE /reset — Clear all imported data ─────
router.delete('/reset', asyncHandler(async (req, res) => {
  const tenantId = req.body.tenant_id || req.query.tenant_id || TENANT;
  const deleted = await resetData(tenantId);
  res.json({
    success: true,
    message: `All data cleared for tenant ${tenantId}`,
    deleted
  });
}));

// ───── GET /templates/:type — Download CSV template ─────
router.get('/templates/:type', asyncHandler(async (req, res) => {
  const { type } = req.params;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const template = TEMPLATES[type];
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found for this type' });
  }

  // Add a sample row
  const sampleRows = {
    customers: '\n"Acme Corp","John Doe","john@acme.com","555-0100","Technology","125000","2026-01-15","123 Main St","Dallas","TX","75201","active","Enterprise account"',
    quotes: '\n"Q-2026-001","Custom Pens - Spring Gala","4500.00","38.5","sent","website","2026-02-01"',
    orders: '\n"ORD-2026-001","Branded Tote Bags","8200.00","3280.00","42.0","in_production","partial","2026-02-15"',
    calls: '\n"inbound","555-0100","555-0200","245","quote_requested","Rachel","2026-03-01 10:30:00"',
    invoices: '\n"INV-2026-001","5000.00","412.50","5412.50","2500.00","partial","2026-03-15","2026-02-20"',
    products: '\n"PEN-001","Classic Ballpoint Pen","Writing Instruments","2.50","0.85","BIC","100","active"'
  };

  const csv = template + (sampleRows[type] || '');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=imprintiq_${type}_template.csv`);
  res.send(csv);
}));

module.exports = router;
