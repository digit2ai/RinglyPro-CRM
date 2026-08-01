// routes/ingest.js — POST /api/v1/ingest
// JWT-gated daily batch upload. Accepts JSON rows or raw CSV, runs the full
// detect -> price -> classify pipeline, persists, and returns the receipt.
//
// PRIVACY/LOGGING: never logs the uploaded payload. Row counts and summary
// figures only — the feed carries store economics, and a full-body log turns
// every crash dump into a data leak.
'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { requireJwt } = require('../lib/auth');
const pipeline = require('../lib/pipeline');
const store = require('../lib/store');

const MAX_ROWS = 50000;

/**
 * Minimal dependency-free CSV parser. Handles quoted fields and embedded
 * commas — enough for a POS extract, and it keeps the sub-app dependency-free.
 * Numeric-looking and boolean-looking values are coerced so the rule engine
 * sees real types rather than strings.
 */
function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];

  const splitRow = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      let v = cells[idx];
      if (v === undefined || v === '') { obj[h] = null; return; }
      if (/^-?\d+(\.\d+)?$/.test(v)) obj[h] = parseFloat(v);
      else if (/^(true|false)$/i.test(v)) obj[h] = v.toLowerCase() === 'true';
      else obj[h] = v;
    });
    rows.push(obj);
  }
  return rows;
}

function extractRows(req) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('text/csv') || typeof req.body === 'string') {
    return { rows: parseCsv(req.body), source: 'csv' };
  }
  const b = req.body || {};
  if (Array.isArray(b)) return { rows: b, source: 'json' };
  if (Array.isArray(b.rows)) return { rows: b.rows, source: 'json' };
  if (typeof b.csv === 'string') return { rows: parseCsv(b.csv), source: 'csv' };
  return { rows: [], source: 'json' };
}

router.post('/', requireJwt, async (req, res) => {
  try {
    const { rows, source } = extractRows(req);

    if (!rows.length) {
      return res.status(400).json({
        error: 'no_rows',
        detail: 'Send {rows:[...]}, a bare JSON array, {csv:"..."} or text/csv.'
      });
    }
    if (rows.length > MAX_ROWS) {
      return res.status(413).json({ error: 'too_many_rows', max: MAX_ROWS, received: rows.length });
    }

    const tenantId = req.tenant_id || 1;
    const batchId = crypto.randomUUID();
    const eventDate = (req.body && req.body.event_date) || new Date().toISOString().slice(0, 10);

    const result = pipeline.run(rows, { tenant_id: tenantId, batch_id: batchId, event_date: eventDate });

    // Store id for the batch header: whatever the rows agree on, else mixed.
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id || r.store || '').trim()).filter(Boolean)));
    const storeId = storeIds.length === 1 ? storeIds[0] : (storeIds.length ? 'MULTI' : null);

    await store.saveEvents(result.events);

    await store.saveInventory(rows.slice(0, MAX_ROWS).map((r) => ({
      tenant_id: tenantId,
      batch_id: batchId,
      store_id: String(r.store_id || r.store || '').trim() || 'UNKNOWN',
      sku: String(r.sku || r.item_id || '').trim() || 'UNKNOWN',
      product_name: r.product_name || r.description || null,
      category: r.category || null,
      on_hand: Number.isFinite(parseFloat(r.on_hand)) ? Math.trunc(parseFloat(r.on_hand)) : null,
      unit_price: r.unit_price ?? null,
      margin: r.margin ?? null,
      avg_velocity: r.avg_velocity ?? null,
      forecast_velocity: r.forecast_velocity ?? null,
      shelf_capacity: r.shelf_capacity ?? null,
      min_shelf_qty: r.min_shelf_qty ?? null,
      shelf_empty: r.shelf_empty ?? null,
      po_open: r.po_open ?? null,
      po_filled: r.po_filled ?? null,
      recent_delivery: r.recent_delivery ?? null,
      is_out_of_stock: false,
      snapshot_date: eventDate,
      created_at: new Date()
    })));

    await store.saveBatch({
      tenant_id: tenantId,
      batch_id: batchId,
      store_id: storeId,
      row_count: rows.length,
      oos_detected: result.events.length,
      total_skus: result.total_skus,
      skipped: result.skipped,
      lost_sales_usd: result.summary.lost_sales_usd,
      lost_gross_profit_usd: result.summary.lost_gross_profit_usd,
      source,
      ingested_at: new Date()
    });

    // Summary-only log. No payload.
    console.log(`[retail-oos] ingest tenant=${tenantId} store=${storeId} rows=${rows.length} oos=${result.events.length} lost=$${result.summary.lost_sales_usd}`);

    res.status(201).json({
      ingested: rows.length,
      oos_detected: result.events.length,
      batch_id: batchId,
      store_id: storeId,
      total_skus: result.total_skus,
      skipped: result.skipped,
      summary: result.summary,
      root_cause_mix: result.root_cause_mix,
      layer_mix: result.layer_mix
    });
  } catch (err) {
    console.error('[retail-oos] ingest error:', err.message);
    res.status(500).json({ error: 'ingest_failed', detail: err.message });
  }
});

module.exports = router;
