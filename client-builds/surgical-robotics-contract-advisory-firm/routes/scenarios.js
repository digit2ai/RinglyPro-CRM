// =====================================================
// routes/scenarios.js — saved scenarios, tenant-scoped, write-authenticated.
//
// Reads of the MODEL are public; reads of SAVED SCENARIOS are not, because a
// saved scenario carries a name and notes Greg wrote. Every method here filters
// on tenant_id, and a cross-tenant id resolves to 404 rather than 403 — a 403
// confirms the row exists.
//
// PROJECTIONS ARE RECOMPUTED SERVER-SIDE ON SAVE, never accepted from the
// client. A stored projection that does not follow from its stored inputs is
// the same class of defect as a hardcoded figure in the HTML.
//
// The CSV export is the practical stand-in for the "editable model in Excel and
// Google Sheets" the teaser promised. It carries the year-by-year table AND an
// assumptions block naming every input, its value, its basis and its source —
// because a projection handed over without its assumptions is how a number
// escapes into a deck and stops being checkable.
// =====================================================

'use strict';

const express = require('express');
const auth = require('../lib/auth');
const { scopeTenant } = require('../lib/tenant');
const model = require('../lib/model');
const benchmarks = require('../lib/benchmarks');
const { buildPayload } = require('./calculate');

const MAX_NAME = 200;
const MAX_NOTES = 4000;

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

function toCsv(scenario) {
  const p = scenario.projections;
  const lines = [];

  lines.push(csvRow(['RoboNegotiate fee-on-savings model']));
  lines.push(csvRow(['Scenario', scenario.name]));
  lines.push(csvRow(['Model version', scenario.model_version]));
  lines.push(csvRow(['Saved', new Date(scenario.created_at).toISOString()]));
  if (scenario.notes) lines.push(csvRow(['Notes', scenario.notes]));
  lines.push('');

  lines.push(csvRow(['PROJECTION']));
  lines.push(csvRow([
    'Year', 'Active clients', 'New clients needed', 'Retained clients',
    'Leverage factor', 'Fee per client (USD)', 'Revenue (USD)',
    'Cost (USD)', 'Net (USD)', 'Partners required',
    'Cumulative revenue (USD)', 'Cumulative net (USD)',
  ]));
  for (const r of p.perYear) {
    lines.push(csvRow([
      r.year, r.active_clients, r.arrivals_needed, r.retained_clients,
      r.leverage_factor, r.effective_fee_per_client_usd, r.revenue_usd,
      r.cost_usd, r.net_usd, r.required_partners,
      r.cumulative_revenue_usd, r.cumulative_net_usd,
    ]));
  }
  lines.push('');

  lines.push(csvRow(['CUMULATIVE']));
  lines.push(csvRow(['Horizon', 'Revenue (USD)', 'Net (USD)']));
  lines.push(csvRow(['Year 1', p.cumulative.y1, p.cumulative.net_y1]));
  lines.push(csvRow(['Years 1-5', p.cumulative.y5, p.cumulative.net_y5]));
  lines.push(csvRow(['Years 1-10', p.cumulative.y10, p.cumulative.net_y10]));
  lines.push('');

  lines.push(csvRow(['MARKET BY TIER']));
  lines.push(csvRow(['Tier', 'IDN count', 'Annual spend per IDN (USD)', 'Tier total annual (USD)', 'Share of modelled market']));
  for (const t of p.perTier) {
    lines.push(csvRow([t.label, t.idn_count, t.annual_spend_per_idn_usd, t.annual_spend_total_usd, t.share_of_tam]));
  }
  lines.push(csvRow(['Modelled market total', '', '', p.tam_usd, '']));
  lines.push('');

  lines.push(csvRow(['NAMED ACCOUNT PIPELINE']));
  lines.push(csvRow(['Account', 'Tier', 'Systems', 'Annual spend (USD)', 'Entered as', 'Note']));
  for (const a of p.pipeline) {
    lines.push(csvRow([
      a.name, a.tier, a.systems, a.annual_spend_usd,
      a.spend_was_tcv ? `Total contract value over ${a.tcv_years} years` : 'Annual',
      a.tcv_note || a.contract_note || '',
    ]));
  }
  lines.push('');

  lines.push(csvRow(['ASSUMPTIONS AND PROVENANCE']));
  lines.push(csvRow(['Input', 'Value', 'Unit', 'Basis', 'As of', 'Source']));
  for (const e of p.provenance.entries) {
    lines.push(csvRow([
      e.label,
      Array.isArray(e.value) ? e.value.join(' | ') : e.value,
      e.unit, e.basis, e.as_of, e.source,
    ]));
  }
  lines.push('');

  lines.push(csvRow(['RECONCILIATION']));
  lines.push(csvRow(['Check', 'Modelled market (USD)', 'Anchor (USD)', 'Status', 'Note']));
  for (const r of p.reconciliation) {
    lines.push(csvRow([r.anchor_label, r.tam_usd, r.anchor_usd, r.status, r.note]));
  }
  lines.push('');

  lines.push(csvRow(['WHAT HAS TO BE TRUE']));
  lines.push(csvRow(['Driver', 'Claim', 'Five-year swing (USD)']));
  for (const w of p.what_has_to_be_true) {
    lines.push(csvRow([w.driver, w.claim, w.swing_usd]));
  }

  return `${lines.join('\n')}\n`;
}

function scenarioRoutes({ store }) {
  const router = express.Router();

  router.get('/api/v1/scenarios', auth.requireAuth, scopeTenant, async (req, res) => {
    try {
      const rows = await store.listScenarios(req.tenant_id);
      return res.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          notes: r.notes,
          model_version: r.model_version,
          created_at: r.created_at,
          cumulative: r.projections && r.projections.cumulative,
        })),
      });
    } catch (err) {
      console.error('[srcaf] scenarios list error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not list scenarios' });
    }
  });

  router.post('/api/v1/scenarios', auth.requireAuth, scopeTenant, async (req, res) => {
    try {
      const body = req.body || {};
      const name = String(body.name || '').trim().slice(0, MAX_NAME);
      if (!name) return res.status(400).json({ success: false, error: 'A scenario name is required' });

      // Recomputed here. A projection is never taken from the client.
      const projections = buildPayload(body.inputs || {});

      const row = await store.createScenario({
        tenant_id: req.tenant_id,
        owner_email: req.session.email,
        name,
        notes: body.notes ? String(body.notes).slice(0, MAX_NOTES) : null,
        inputs: projections.inputs,
        projections,
        model_version: projections.model_version,
      });

      return res.status(201).json({ success: true, data: row });
    } catch (err) {
      console.error('[srcaf] scenario create error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not save the scenario' });
    }
  });

  router.get('/api/v1/scenarios/:id/export.csv', auth.requireAuth, scopeTenant, async (req, res) => {
    try {
      const row = await store.getScenario(req.tenant_id, req.params.id);
      if (!row) return res.status(404).json({ success: false, error: 'Scenario not found' });

      const slug = String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scenario';
      const stamp = new Date(row.created_at).toISOString().slice(0, 10);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="robonegotiate-${slug}-${stamp}.csv"`);
      return res.send(toCsv(row));
    } catch (err) {
      console.error('[srcaf] scenario export error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not export the scenario' });
    }
  });

  router.get('/api/v1/scenarios/:id', auth.requireAuth, scopeTenant, async (req, res) => {
    try {
      const row = await store.getScenario(req.tenant_id, req.params.id);
      if (!row) return res.status(404).json({ success: false, error: 'Scenario not found' });
      return res.json({ success: true, data: row });
    } catch (err) {
      console.error('[srcaf] scenario get error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not load the scenario' });
    }
  });

  router.delete('/api/v1/scenarios/:id', auth.requireAuth, scopeTenant, async (req, res) => {
    try {
      const removed = await store.deleteScenario(req.tenant_id, req.params.id);
      if (!removed) return res.status(404).json({ success: false, error: 'Scenario not found' });
      return res.json({ success: true });
    } catch (err) {
      console.error('[srcaf] scenario delete error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not delete the scenario' });
    }
  });

  return router;
}

module.exports = scenarioRoutes;
module.exports.toCsv = toCsv;
