const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');
const axios = require('axios');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(auth);

// GET / — load all settings
router.get('/', asyncHandler(async (req, res) => {
  // Ensure settings table exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cw_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(128) UNIQUE NOT NULL,
      setting_value TEXT,
      setting_type VARCHAR(32) DEFAULT 'string',
      category VARCHAR(64),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const [rows] = await sequelize.query(`SELECT * FROM cw_settings ORDER BY category, setting_key`);

  // Group by category
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  res.json({ success: true, data: grouped, all: rows });
}));

// PUT / — save settings (batch upsert)
router.put('/', asyncHandler(async (req, res) => {
  const { settings } = req.body; // [{ key, value, type, category }]
  if (!settings || !Array.isArray(settings)) {
    return res.status(400).json({ error: 'settings array required' });
  }

  for (const s of settings) {
    await sequelize.query(`
      INSERT INTO cw_settings (setting_key, setting_value, setting_type, category, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        setting_type = EXCLUDED.setting_type,
        category = EXCLUDED.category,
        updated_at = NOW()
    `, { bind: [s.key, s.value || '', s.type || 'string', s.category || 'general'] });
  }

  res.json({ success: true, message: `${settings.length} settings saved` });
}));

// POST /hubspot/test — test HubSpot connection with provided API key
router.post('/hubspot/test', asyncHandler(async (req, res) => {
  const { access_token } = req.body;
  const token = access_token || process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return res.json({ success: false, message: 'No access token provided' });
  }

  try {
    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json({
      success: true,
      message: 'HubSpot connected successfully',
      account: { total_contacts: response.data?.total || 0 }
    });
  } catch (err) {
    res.json({
      success: false,
      message: err.response?.data?.message || err.message,
      status: err.response?.status
    });
  }
}));

// --- Webhook Configuration ---

// GET /webhooks — list configured webhooks
router.get('/webhooks', asyncHandler(async (req, res) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cw_webhooks (
      id SERIAL PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      url VARCHAR(512) NOT NULL,
      method VARCHAR(8) DEFAULT 'POST',
      headers JSONB DEFAULT '{}',
      auth_type VARCHAR(32) DEFAULT 'none',
      auth_value TEXT,
      event_types TEXT[],
      is_active BOOLEAN DEFAULT TRUE,
      last_triggered_at TIMESTAMPTZ,
      last_status INTEGER,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const [rows] = await sequelize.query(`SELECT * FROM cw_webhooks ORDER BY created_at DESC`);
  res.json({ success: true, data: rows });
}));

// POST /webhooks — create webhook
router.post('/webhooks', asyncHandler(async (req, res) => {
  const { name, url, method, headers, auth_type, auth_value, event_types } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });

  const [result] = await sequelize.query(`
    INSERT INTO cw_webhooks (name, url, method, headers, auth_type, auth_value, event_types, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *
  `, { bind: [name, url, method || 'POST', JSON.stringify(headers || {}), auth_type || 'none', auth_value || null, event_types || null] });

  res.status(201).json({ success: true, data: result[0] });
}));

// PUT /webhooks/:id — update webhook
router.put('/webhooks/:id', asyncHandler(async (req, res) => {
  const { name, url, method, headers, auth_type, auth_value, event_types, is_active } = req.body;
  const [result] = await sequelize.query(`
    UPDATE cw_webhooks SET
      name = COALESCE($1, name), url = COALESCE($2, url),
      method = COALESCE($3, method), headers = COALESCE($4, headers),
      auth_type = COALESCE($5, auth_type), auth_value = COALESCE($6, auth_value),
      event_types = COALESCE($7, event_types), is_active = COALESCE($8, is_active),
      updated_at = NOW()
    WHERE id = $9 RETURNING *
  `, { bind: [name, url, method, headers ? JSON.stringify(headers) : null, auth_type, auth_value, event_types, is_active, req.params.id] });

  if (!result.length) return res.status(404).json({ error: 'Webhook not found' });
  res.json({ success: true, data: result[0] });
}));

// DELETE /webhooks/:id
router.delete('/webhooks/:id', asyncHandler(async (req, res) => {
  await sequelize.query(`DELETE FROM cw_webhooks WHERE id = $1`, { bind: [req.params.id] });
  res.json({ success: true, message: 'Webhook deleted' });
}));

// POST /webhooks/:id/test — fire a test payload
router.post('/webhooks/:id/test', asyncHandler(async (req, res) => {
  const [[webhook]] = await sequelize.query(`SELECT * FROM cw_webhooks WHERE id = $1`, { bind: [req.params.id] });
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

  const testPayload = {
    event: 'test',
    source: 'cw_carriers',
    timestamp: new Date().toISOString(),
    data: { message: 'Test webhook from CW Carriers CRM', load_ref: 'CW-TEST-001', status: 'open' }
  };

  const hdrs = typeof webhook.headers === 'string' ? JSON.parse(webhook.headers) : (webhook.headers || {});
  hdrs['Content-Type'] = 'application/json';
  if (webhook.auth_type === 'bearer' && webhook.auth_value) {
    hdrs['Authorization'] = `Bearer ${webhook.auth_value}`;
  } else if (webhook.auth_type === 'api_key' && webhook.auth_value) {
    hdrs['X-API-Key'] = webhook.auth_value;
  }

  try {
    const response = await axios({
      method: webhook.method || 'POST',
      url: webhook.url,
      headers: hdrs,
      data: testPayload,
      timeout: 10000
    });
    await sequelize.query(
      `UPDATE cw_webhooks SET last_triggered_at = NOW(), last_status = $1, last_error = NULL WHERE id = $2`,
      { bind: [response.status, webhook.id] }
    );
    res.json({ success: true, status: response.status, message: 'Test webhook sent successfully' });
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    await sequelize.query(
      `UPDATE cw_webhooks SET last_triggered_at = NOW(), last_status = $1, last_error = $2 WHERE id = $3`,
      { bind: [err.response?.status || 0, errMsg, webhook.id] }
    );
    res.json({ success: false, status: err.response?.status, message: errMsg });
  }
}));

// --- RinglyPro Inbound Webhook Endpoint ---
// This is what the warehouse system calls to push data into CW Carriers
router.post('/webhooks/inbound/:event', asyncHandler(async (req, res) => {
  // Log inbound webhook
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cw_webhook_logs (
      id SERIAL PRIMARY KEY,
      direction VARCHAR(8) DEFAULT 'inbound',
      event_type VARCHAR(64),
      source_ip VARCHAR(64),
      payload JSONB,
      status VARCHAR(16) DEFAULT 'received',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sequelize.query(
    `INSERT INTO cw_webhook_logs (direction, event_type, source_ip, payload, status, created_at)
     VALUES ('inbound', $1, $2, $3, 'received', NOW())`,
    { bind: [req.params.event, req.ip, JSON.stringify(req.body)] }
  );

  // Process based on event type
  const event = req.params.event;
  if (event === 'load_update' && req.body.load_ref) {
    await sequelize.query(
      `UPDATE cw_loads SET status = COALESCE($1, status), broker_notes = COALESCE($2, broker_notes), updated_at = NOW() WHERE load_ref = $3`,
      { bind: [req.body.status || null, req.body.notes || null, req.body.load_ref] }
    );
  } else if (event === 'new_load' && req.body.origin) {
    await sequelize.query(
      `INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, rate_usd, status, broker_notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, NOW(), NOW())`,
      { bind: [req.body.load_ref || `CW-WH-${Date.now()}`, req.body.origin, req.body.destination, req.body.freight_type || null, req.body.weight_lbs || null, req.body.rate_usd || null, req.body.notes || null] }
    );
  }

  res.json({ success: true, message: `Event '${event}' received and processed` });
}));

// GET /webhooks/logs — inbound webhook log
router.get('/webhooks/logs', asyncHandler(async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT * FROM cw_webhook_logs ORDER BY created_at DESC LIMIT 50`
  ).catch(() => [[]]);
  res.json({ success: true, data: rows });
}));

module.exports = router;
