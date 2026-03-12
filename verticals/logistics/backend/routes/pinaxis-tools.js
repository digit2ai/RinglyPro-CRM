/**
 * PINAXIS Logistics Suite — API Routes
 * POST /api/pinaxis/estimate-tokens
 * POST /api/pinaxis/save-estimate
 * GET  /api/pinaxis/get-estimates
 * POST /api/pinaxis/generate-contract
 * GET  /api/pinaxis/get-contracts
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const sequelize = require('../services/db.lg');
const getContractHTML = require('../templates/pinaxis-contract.template');
const authMiddleware = require('../middleware/auth.lg');

// Protect all pinaxis routes — require authenticated admin
router.use(authMiddleware(['admin']));

// ── Model pricing ────────────────────────────────────────────
const MODEL_PRICING = {
  sonnet:  { input: 3.00,  output: 15.00 },
  haiku:   { input: 0.80,  output: 4.00  },
  opus:    { input: 15.00, output: 75.00 },
};

// ── Inline migration ─────────────────────────────────────────
(async () => {
  try {
    const migrationPath = path.join(__dirname, '..', 'migrations', '002_pinaxis_tools.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await sequelize.query(sql);
      console.log('  ✅ PINAXIS tools schema initialized');
    }
  } catch (err) {
    console.error('  ⚠️ PINAXIS migration error:', err.message);
  }
})();

// ── POST /estimate-tokens ────────────────────────────────────
router.post('/estimate-tokens', (req, res) => {
  try {
    const { model = 'sonnet', markup = 0.30, labor_savings = 390000, scenarios = [] } = req.body;
    const pricing = MODEL_PRICING[model] || MODEL_PRICING.sonnet;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const scenarioBreakdown = scenarios.filter(s => s.enabled !== false).map(s => {
      const inputTokens = (s.calls || 0) * (s.input_tokens || 0);
      const outputTokens = (s.calls || 0) * (s.output_tokens || 0);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      const inputCost = (inputTokens / 1_000_000) * pricing.input;
      const outputCost = (outputTokens / 1_000_000) * pricing.output;
      return { id: s.id, name: s.name, calls: s.calls, input_tokens: inputTokens, output_tokens: outputTokens, cost: Math.round((inputCost + outputCost) * 100) / 100 };
    });

    const monthly_api_cost = Math.round(scenarioBreakdown.reduce((sum, s) => sum + s.cost, 0) * 100) / 100;
    const monthly_billed = Math.round(monthly_api_cost * (1 + markup) * 100) / 100;
    const monthly_margin = Math.round((monthly_billed - monthly_api_cost) * 100) / 100;
    const roi_ratio = monthly_billed > 0 ? Math.round((labor_savings / monthly_billed) * 100) / 100 : 0;
    const annual_billed = Math.round(monthly_billed * 12 * 100) / 100;
    const annual_margin = Math.round(monthly_margin * 12 * 100) / 100;

    const contract_clause = `Token consumption is billed monthly at actual API cost + ${Math.round(markup * 100)}%. Estimated monthly consumption: ${(totalInputTokens + totalOutputTokens).toLocaleString()} tokens (~$${monthly_billed.toFixed(2)}/month). Overage beyond 150% of baseline billed at same rate with 5-day notice.`;

    res.json({
      monthly_api_cost,
      monthly_billed,
      monthly_margin,
      roi_ratio,
      annual_billed,
      annual_margin,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      scenario_breakdown: scenarioBreakdown,
      contract_clause,
      model,
      markup,
      labor_savings,
    });
  } catch (error) {
    console.error('estimate-tokens error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /save-estimate ──────────────────────────────────────
router.post('/save-estimate', async (req, res) => {
  try {
    const tenant_id = req.body.tenant_id || 1;
    const { client_name, model, markup, scenarios, monthly_cost, monthly_billed, monthly_margin, labor_savings, roi_ratio } = req.body;

    const [results] = await sequelize.query(`
      INSERT INTO logistics_token_estimates (tenant_id, client_name, model, markup, scenarios, monthly_cost, monthly_billed, monthly_margin, labor_savings, roi_ratio)
      VALUES (:tenant_id, :client_name, :model, :markup, :scenarios, :monthly_cost, :monthly_billed, :monthly_margin, :labor_savings, :roi_ratio)
      RETURNING id
    `, {
      replacements: {
        tenant_id,
        client_name: client_name || null,
        model: model || 'sonnet',
        markup: markup || 0.30,
        scenarios: JSON.stringify(scenarios || []),
        monthly_cost: monthly_cost || 0,
        monthly_billed: monthly_billed || 0,
        monthly_margin: monthly_margin || 0,
        labor_savings: labor_savings || 0,
        roi_ratio: roi_ratio || 0,
      },
    });

    res.json({ id: results[0].id, saved: true });
  } catch (error) {
    console.error('save-estimate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /get-estimates ───────────────────────────────────────
router.get('/get-estimates', async (req, res) => {
  try {
    const tenant_id = req.query.tenant_id || 1;
    const [estimates] = await sequelize.query(
      'SELECT * FROM logistics_token_estimates WHERE tenant_id = :tenant_id ORDER BY created_at DESC LIMIT 50',
      { replacements: { tenant_id } }
    );
    res.json({ success: true, data: estimates });
  } catch (error) {
    console.error('get-estimates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /generate-contract ──────────────────────────────────
router.post('/generate-contract', async (req, res) => {
  try {
    const tenant_id = req.body.tenant_id || 1;
    const data = req.body;

    // Generate HTML from template
    const html = getContractHTML(data);

    // Save contract record
    const [results] = await sequelize.query(`
      INSERT INTO logistics_contracts (tenant_id, client_name, client_address, effective_date, implementation_fee, monthly_retainer, token_markup, initial_term_months, onboarding_hours, impl_timeline_weeks, jurisdiction, linked_estimate_id, status)
      VALUES (:tenant_id, :client_name, :client_address, :effective_date, :implementation_fee, :monthly_retainer, :token_markup, :initial_term_months, :onboarding_hours, :impl_timeline_weeks, :jurisdiction, :linked_estimate_id, 'draft')
      RETURNING id
    `, {
      replacements: {
        tenant_id,
        client_name: data.client_name || null,
        client_address: data.client_address || null,
        effective_date: data.effective_date || null,
        implementation_fee: data.implementation_fee || 0,
        monthly_retainer: data.monthly_retainer || 0,
        token_markup: data.token_markup || 30,
        initial_term_months: data.initial_term_months || 24,
        onboarding_hours: data.onboarding_hours || 10,
        impl_timeline_weeks: data.impl_timeline_weeks || 8,
        jurisdiction: data.jurisdiction || 'Florida',
        linked_estimate_id: data.linked_estimate_id || null,
      },
    });

    const contractId = results[0].id;

    // Generate PDF via pdfmake (already in package.json)
    let pdfPath = null;
    try {
      const htmlPdf = require('html-pdf-node');
      const pdfBuffer = await htmlPdf.generatePdf(
        { content: html },
        { format: 'Letter', margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' } }
      );
      const uploadsDir = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'logistics', 'contracts');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      pdfPath = path.join(uploadsDir, `contract-${contractId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);

      await sequelize.query(
        'UPDATE logistics_contracts SET pdf_path = :pdf_path WHERE id = :id',
        { replacements: { pdf_path: pdfPath, id: contractId } }
      );
    } catch (pdfErr) {
      console.error('PDF generation error (non-fatal):', pdfErr.message);
    }

    // Generate DOCX
    let docxPath = null;
    try {
      const docx = require('docx');
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = docx;

      const sections = [];
      const titlePara = new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ENTERPRISE SERVICES AGREEMENT', bold: true, size: 36, font: 'Georgia' })] });
      const partiesPara = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
        new TextRun({ text: `This Enterprise Services Agreement is entered into as of ${data.effective_date || '___'} by and between:`, size: 20, font: 'Georgia' }),
        new TextRun({ text: '\n', break: 1 }),
        new TextRun({ text: 'Digit2AI LLC d/b/a RinglyPro', bold: true, size: 20, font: 'Georgia' }),
        new TextRun({ text: ' ("Provider")', size: 20, font: 'Georgia' }),
        new TextRun({ text: '\nand\n', break: 1, size: 20, font: 'Georgia' }),
        new TextRun({ text: data.client_name || '___', bold: true, size: 20, font: 'Georgia' }),
        new TextRun({ text: ' ("Client")', size: 20, font: 'Georgia' }),
      ]});

      const makeSectionHeader = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 }, children: [new TextRun({ text, bold: true, size: 26, font: 'Georgia', color: '1B2A4A' })] });
      const makePara = (text) => new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text, size: 22, font: 'Georgia' })] });

      const docChildren = [
        titlePara, partiesPara,
        makeSectionHeader('1. SCOPE OF SERVICES'),
        makePara(`Provider shall deliver AI-powered analytics and automation via the RinglyPro AI platform. Implementation: ${data.impl_timeline_weeks || 8} weeks. Onboarding: ${data.onboarding_hours || 10} hours.`),
        makeSectionHeader('2. FEES & TOKEN CONSUMPTION'),
        makePara(`Implementation Fee: ${Number(data.implementation_fee || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`),
        makePara(`Monthly Retainer: ${Number(data.monthly_retainer || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`),
        makePara(`Token Markup: ${data.token_markup || 30}% over actual API cost. Overage beyond 150% billed at same rate with 5-day notice.`),
        makeSectionHeader('3. TERM'),
        makePara(`Initial Term: ${data.initial_term_months || 24} months from Effective Date. Auto-renews for 12-month periods unless 60 days' notice given.`),
        makeSectionHeader('4. NON-CIRCUMVENTION'),
        makePara('During the term and for 24 months thereafter, Client shall not replicate or reverse engineer Provider\'s platform, tools, or methodologies.'),
        makeSectionHeader('5. GOVERNING LAW'),
        makePara('This Agreement is governed by the laws of the State of Florida.'),
      ];

      const doc = new Document({ sections: [{ children: docChildren }] });
      const buffer = await Packer.toBuffer(doc);

      const uploadsDir = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'logistics', 'contracts');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      docxPath = path.join(uploadsDir, `contract-${contractId}.docx`);
      fs.writeFileSync(docxPath, buffer);

      await sequelize.query(
        'UPDATE logistics_contracts SET docx_path = :docx_path WHERE id = :id',
        { replacements: { docx_path: docxPath, id: contractId } }
      );
    } catch (docxErr) {
      console.error('DOCX generation error (non-fatal):', docxErr.message);
    }

    res.json({
      success: true,
      contract_id: contractId,
      html_preview: html,
      pdf_available: !!pdfPath,
      docx_available: !!docxPath,
    });
  } catch (error) {
    console.error('generate-contract error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /get-contracts ───────────────────────────────────────
router.get('/get-contracts', async (req, res) => {
  try {
    const tenant_id = req.query.tenant_id || 1;
    const [contracts] = await sequelize.query(
      'SELECT * FROM logistics_contracts WHERE tenant_id = :tenant_id ORDER BY created_at DESC LIMIT 50',
      { replacements: { tenant_id } }
    );
    res.json({ success: true, data: contracts });
  } catch (error) {
    console.error('get-contracts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /download/:type/:id ──────────────────────────────────
router.get('/download/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const col = type === 'pdf' ? 'pdf_path' : 'docx_path';
    const [rows] = await sequelize.query(
      `SELECT ${col}, client_name FROM logistics_contracts WHERE id = :id`,
      { replacements: { id } }
    );
    if (!rows.length || !rows[0][col]) return res.status(404).json({ error: 'File not found' });

    const filePath = rows[0][col];
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    const ext = type === 'pdf' ? 'pdf' : 'docx';
    const mime = type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const clientSlug = (rows[0].client_name || 'contract').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    res.setHeader('Content-Disposition', `attachment; filename="pinaxis-agreement-${clientSlug}.${ext}"`);
    res.setHeader('Content-Type', mime);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('download error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
