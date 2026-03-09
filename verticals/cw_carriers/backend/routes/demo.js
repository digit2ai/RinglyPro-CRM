const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(auth);

// POST /upload — upload JSON or CSV demo data
router.post('/upload', asyncHandler(async (req, res) => {
  const { data_type, data, format } = req.body;
  // data_type: 'contacts' | 'loads' | 'calls'
  // format: 'json' | 'csv'
  // data: array of objects (JSON) or CSV string

  if (!data_type || !data) {
    return res.status(400).json({ error: 'data_type and data required' });
  }

  let records;
  if (format === 'csv' && typeof data === 'string') {
    records = parseCsv(data);
  } else if (Array.isArray(data)) {
    records = data;
  } else {
    return res.status(400).json({ error: 'data must be an array (JSON) or a CSV string with format=csv' });
  }

  if (!records.length) {
    return res.status(400).json({ error: 'No records found in uploaded data' });
  }

  const results = { inserted: 0, errors: [], total: records.length };

  if (data_type === 'contacts') {
    for (const r of records) {
      try {
        await sequelize.query(
          `INSERT INTO cw_contacts (contact_type, company_name, full_name, email, phone, freight_types, lanes, volume_estimate, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          { bind: [
            r.contact_type || r.type || 'prospect',
            r.company_name || r.company || null,
            r.full_name || r.name || null,
            r.email || null,
            r.phone || null,
            r.freight_types ? (Array.isArray(r.freight_types) ? r.freight_types : r.freight_types.split(',').map(s => s.trim())) : null,
            r.lanes ? (Array.isArray(r.lanes) ? r.lanes : r.lanes.split(',').map(s => s.trim())) : null,
            r.volume_estimate || r.volume || null
          ] }
        );
        results.inserted++;
      } catch (e) {
        results.errors.push({ row: results.inserted + results.errors.length + 1, error: e.message });
      }
    }
  } else if (data_type === 'loads') {
    for (const r of records) {
      try {
        await sequelize.query(
          `INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date, rate_usd, status, broker_notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          { bind: [
            r.load_ref || r.ref || `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            r.origin || null,
            r.destination || null,
            r.freight_type || r.type || null,
            r.weight_lbs || r.weight || null,
            r.pickup_date || r.pickup || null,
            r.delivery_date || r.delivery || null,
            r.rate_usd || r.rate || null,
            r.status || 'open',
            r.broker_notes || r.notes || null
          ] }
        );
        results.inserted++;
      } catch (e) {
        results.errors.push({ row: results.inserted + results.errors.length + 1, error: e.message });
      }
    }
  } else if (data_type === 'calls') {
    for (const r of records) {
      try {
        await sequelize.query(
          `INSERT INTO cw_call_logs (call_sid, direction, call_type, from_number, to_number, duration_sec, transcript, ai_summary, outcome, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          { bind: [
            r.call_sid || `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            r.direction || 'outbound',
            r.call_type || r.type || 'carrier_coverage',
            r.from_number || r.from || null,
            r.to_number || r.to || null,
            r.duration_sec || r.duration || 0,
            r.transcript || null,
            r.ai_summary || r.summary || null,
            r.outcome || 'completed'
          ] }
        );
        results.inserted++;
      } catch (e) {
        results.errors.push({ row: results.inserted + results.errors.length + 1, error: e.message });
      }
    }
  } else {
    return res.status(400).json({ error: 'Invalid data_type. Use: contacts, loads, or calls' });
  }

  res.json({ success: true, results });
}));

// POST /generate — generate sample demo data
router.post('/generate', asyncHandler(async (req, res) => {
  const { type, count = 10 } = req.body;

  const cities = ['Tampa', 'Chicago', 'Dallas', 'Atlanta', 'Miami', 'Houston', 'Phoenix', 'Denver', 'Seattle', 'Boston', 'New York', 'Los Angeles'];
  const freightTypes = ['dry_van', 'reefer', 'flatbed', 'ltl'];
  const companyNames = ['PepsiCo Logistics', 'Agri-Dairy Corp', 'Fresh Farms Inc', 'Steel Works LLC', 'Auto Parts Express', 'National Freight Co', 'Green Valley Produce', 'Blue Ridge Carriers', 'Midwest Transport', 'Pacific Coast Freight'];
  const outcomes = ['qualified', 'booked', 'declined', 'escalated', 'voicemail', 'completed'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let inserted = 0;
  const n = Math.min(parseInt(count), 100);

  if (type === 'contacts' || type === 'all') {
    for (let i = 0; i < n; i++) {
      const ctype = pick(['shipper', 'carrier', 'carrier', 'carrier', 'prospect']);
      const company = pick(companyNames) + ` ${i + 1}`;
      await sequelize.query(
        `INSERT INTO cw_contacts (contact_type, company_name, full_name, email, phone, freight_types, lanes, volume_estimate, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        { bind: [ctype, company, `Demo Contact ${i + 1}`, `demo${i + 1}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
          `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`,
          [pick(freightTypes), pick(freightTypes)],
          [`${pick(cities)}-${pick(cities)}`],
          pick(['high', 'medium', 'low'])] }
      );
      inserted++;
    }
  }

  if (type === 'loads' || type === 'all') {
    for (let i = 0; i < n; i++) {
      const origin = pick(cities);
      let dest = pick(cities);
      while (dest === origin) dest = pick(cities);
      const daysOut = Math.floor(Math.random() * 14) + 1;
      const pickup = new Date(Date.now() + daysOut * 86400000).toISOString().split('T')[0];
      const delivery = new Date(Date.now() + (daysOut + 2 + Math.floor(Math.random() * 3)) * 86400000).toISOString().split('T')[0];
      await sequelize.query(
        `INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date, rate_usd, status, broker_notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        { bind: [`DEMO-${1000 + i}`, origin, dest, pick(freightTypes),
          Math.floor(10000 + Math.random() * 40000), pickup, delivery,
          Math.floor(1500 + Math.random() * 4000),
          pick(['open', 'open', 'open', 'covered', 'in_transit', 'delivered']),
          `Demo load ${i + 1}`] }
      );
      inserted++;
    }
  }

  if (type === 'calls' || type === 'all') {
    for (let i = 0; i < n; i++) {
      await sequelize.query(
        `INSERT INTO cw_call_logs (call_sid, direction, call_type, from_number, to_number, duration_sec, ai_summary, outcome, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - interval '${Math.floor(Math.random() * 7)} days')`,
        { bind: [`DEMO-CALL-${Date.now()}-${i}`, pick(['inbound', 'outbound']),
          pick(['carrier_coverage', 'status_update', 'lead_qualification', 'inbound_shipper']),
          `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`,
          `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`,
          Math.floor(30 + Math.random() * 300),
          `Demo call summary #${i + 1}: ${pick(['Carrier interested in load', 'Shipper confirmed volume', 'Left voicemail', 'Booked load successfully', 'Needs follow-up'])}`,
          pick(outcomes)] }
      );
      inserted++;
    }
  }

  res.json({ success: true, message: `Generated ${inserted} demo records`, inserted });
}));

// DELETE /clear — clear all demo data
// Must handle FK constraints: call_logs.contact_id -> contacts
router.delete('/clear', asyncHandler(async (req, res) => {
  const { type } = req.query;
  let deleted = {};

  // When clearing contacts (or all), first remove call logs that reference demo contacts
  if (type === 'contacts' || type === 'all') {
    // Delete call logs referencing demo contacts (FK constraint)
    await sequelize.query(`
      DELETE FROM cw_call_logs WHERE contact_id IN (
        SELECT id FROM cw_contacts WHERE full_name LIKE 'Demo%' OR email LIKE 'demo%'
      )
    `);
  }

  if (type === 'calls' || type === 'all') {
    const [, meta] = await sequelize.query(`DELETE FROM cw_call_logs WHERE call_sid LIKE 'DEMO%'`);
    deleted.calls = meta?.rowCount || 0;
  }
  if (type === 'loads' || type === 'all') {
    const [, meta] = await sequelize.query(`DELETE FROM cw_loads WHERE load_ref LIKE 'DEMO%' OR broker_notes LIKE 'Demo%'`);
    deleted.loads = meta?.rowCount || 0;
  }
  if (type === 'contacts' || type === 'all') {
    const [, meta] = await sequelize.query(`DELETE FROM cw_contacts WHERE full_name LIKE 'Demo%' OR email LIKE 'demo%'`);
    deleted.contacts = meta?.rowCount || 0;
  }

  res.json({ success: true, deleted });
}));

// GET /preview — preview uploaded data before importing
router.post('/preview', asyncHandler(async (req, res) => {
  const { data, format } = req.body;
  let records;
  if (format === 'csv' && typeof data === 'string') {
    records = parseCsv(data);
  } else if (Array.isArray(data)) {
    records = data;
  } else {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  res.json({
    success: true,
    preview: {
      total: records.length,
      columns: records.length > 0 ? Object.keys(records[0]) : [],
      sample: records.slice(0, 5)
    }
  });
}));

// CSV parser helper
function parseCsv(csvString) {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase().replace(/\s+/g, '_'));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"/, '').replace(/"$/, ''));
    const record = {};
    headers.forEach((h, idx) => { record[h] = values[idx] || ''; });
    records.push(record);
  }
  return records;
}

module.exports = router;
