const express = require('express');
const router = express.Router();
const { seedDemoData } = require('../services/seed-demo');

router.post('/seed', async (req, res) => {
  try {
    const tenant_id = req.body.tenant_id || 'logistics';
    const result = await seedDemoData(tenant_id);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[demo-seed] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  const path = require('path');
  const sequelize = require(path.join(__dirname, '../../../cw_carriers/backend/services/db.cw'));
  const tables = ['lg_carriers','lg_trucks','lg_drivers','lg_shippers','lg_loads','lg_quotes','lg_dispatches','lg_rate_benchmarks','lg_compliance'];
  const counts = {};
  for (const t of tables) {
    try {
      const [r] = await sequelize.query(`SELECT COUNT(*)::int as c FROM ${t}`);
      counts[t] = r[0].c;
    } catch(e) { counts[t] = 0; }
  }
  res.json({ success: true, data: counts });
});

module.exports = router;
