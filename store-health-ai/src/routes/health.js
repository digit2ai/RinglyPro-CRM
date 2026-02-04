'use strict';

const express = require('express');
const router = express.Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get('/', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;

  try {
    // Try to load models (may fail if DB not set up)
    const { sequelize } = require('../../models');
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
    dbError = error.message;
  }

  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  };

  if (dbError) {
    response.database_error = dbError;
  }

  res.json(response);
});

// Debug endpoint to test Store model
router.get('/debug', async (req, res) => {
  try {
    const { Store, sequelize } = require('../../models');

    // Raw SQL count
    const [rawCount] = await sequelize.query('SELECT COUNT(*) as count FROM stores');

    // Model count
    const modelCount = await Store.count();

    // Model findAll
    const stores = await Store.findAll({ limit: 3 });

    // Get database name
    const [dbInfo] = await sequelize.query('SELECT current_database() as db');

    res.json({
      database: dbInfo[0].db,
      rawSqlCount: rawCount[0].count,
      modelCount,
      storesFound: stores.length,
      sampleStores: stores.map(s => ({ id: s.id, code: s.store_code, name: s.name }))
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

// Seed endpoint - creates tables and data
router.get('/seed', async (req, res) => {
  try {
    const { sequelize } = require('../../models');

    // Check if data already exists
    const [existing] = await sequelize.query('SELECT COUNT(*) as count FROM stores');
    if (parseInt(existing[0].count) > 0) {
      return res.json({ status: 'already_seeded', storeCount: existing[0].count });
    }

    // Create organization
    let [org] = await sequelize.query(`SELECT id FROM organizations WHERE name = 'Dollar Tree Stores' LIMIT 1`);
    if (org.length === 0) {
      await sequelize.query(`INSERT INTO organizations (name, timezone, config, created_at, updated_at) VALUES ('Dollar Tree Stores', 'America/New_York', '{"businessHours":{"open":"08:00","close":"22:00"}}'::jsonb, NOW(), NOW())`);
      [org] = await sequelize.query(`SELECT id FROM organizations WHERE name = 'Dollar Tree Stores' LIMIT 1`);
    }
    const orgId = org[0].id;

    // Create region
    let [region] = await sequelize.query(`SELECT id FROM regions WHERE name = 'Northeast Region' LIMIT 1`);
    if (region.length === 0) {
      await sequelize.query(`INSERT INTO regions (organization_id, name, manager_name, manager_email, created_at, updated_at) VALUES (${orgId}, 'Northeast Region', 'Sarah Johnson', 'sarah@dollartree.com', NOW(), NOW())`);
      [region] = await sequelize.query(`SELECT id FROM regions WHERE name = 'Northeast Region' LIMIT 1`);
    }
    const regionId = region[0].id;

    // Create district
    let [district] = await sequelize.query(`SELECT id FROM districts WHERE name = 'NYC Metro District' LIMIT 1`);
    if (district.length === 0) {
      await sequelize.query(`INSERT INTO districts (organization_id, region_id, name, manager_name, created_at, updated_at) VALUES (${orgId}, ${regionId}, 'NYC Metro District', 'Michael Chen', NOW(), NOW())`);
      [district] = await sequelize.query(`SELECT id FROM districts WHERE name = 'NYC Metro District' LIMIT 1`);
    }
    const districtId = district[0].id;

    // Create 10 stores
    const storeNames = ['Manhattan 42nd St', 'Brooklyn Heights', 'Queens Plaza', 'Bronx Fordham', 'Staten Island Mall',
                        'Upper East Side', 'Harlem 125th', 'Greenwich Village', 'Williamsburg', 'Long Island City'];
    for (let i = 0; i < 10; i++) {
      const code = 'DT-' + String(i+1).padStart(3, '0');
      const [existingStore] = await sequelize.query(`SELECT id FROM stores WHERE store_code = '${code}' LIMIT 1`);
      if (existingStore.length === 0) {
        await sequelize.query(`INSERT INTO stores (organization_id, region_id, district_id, store_code, name, city, state, zip_code, status, created_at, updated_at) VALUES (${orgId}, ${regionId}, ${districtId}, '${code}', '${storeNames[i]}', 'New York', 'NY', '10001', 'active', NOW(), NOW())`);
      }
    }

    // Create KPI definitions
    const kpis = [
      ['SALES_DAILY', 'Daily Sales', 'sales', 'USD', 5000],
      ['LABOR_HOURS', 'Labor Hours', 'labor', 'hours', 120],
      ['CONVERSION_RATE', 'Conversion Rate', 'sales', 'percent', 35],
      ['INVENTORY_LEVEL', 'Inventory Level', 'inventory', 'units', 10000],
      ['TRAFFIC', 'Store Traffic', 'traffic', 'visitors', 200]
    ];
    for (const [code, name, cat, unit, target] of kpis) {
      const [existingKpi] = await sequelize.query(`SELECT id FROM kpi_definitions WHERE kpi_code = '${code}' LIMIT 1`);
      if (existingKpi.length === 0) {
        await sequelize.query(`INSERT INTO kpi_definitions (organization_id, kpi_code, name, category, unit, calculation_method, is_active, created_at, updated_at) VALUES (${orgId}, '${code}', '${name}', '${cat}', '${unit}', 'sum', true, NOW(), NOW())`);
      }
    }

    // Get store IDs and KPI IDs
    const [stores] = await sequelize.query(`SELECT id FROM stores WHERE store_code LIKE 'DT-%' ORDER BY id`);
    const [kpiDefs] = await sequelize.query(`SELECT id FROM kpi_definitions ORDER BY id`);

    // Create metrics and snapshots for last 30 days
    for (let day = 0; day < 30; day++) {
      for (const store of stores) {
        let greenCount = 0, yellowCount = 0, redCount = 0;

        for (const kpi of kpiDefs) {
          const value = Math.random() * 100 + 50;
          const status = Math.random() > 0.6 ? 'green' : (Math.random() > 0.5 ? 'yellow' : 'red');
          if (status === 'green') greenCount++;
          else if (status === 'yellow') yellowCount++;
          else redCount++;

          await sequelize.query(`
            INSERT INTO kpi_metrics (store_id, kpi_definition_id, metric_date, metric_timestamp, value, status, created_at, updated_at)
            SELECT ${store.id}, ${kpi.id}, CURRENT_DATE - ${day}, NOW(), ${value.toFixed(2)}, '${status}', NOW(), NOW()
            WHERE NOT EXISTS (SELECT 1 FROM kpi_metrics WHERE store_id = ${store.id} AND kpi_definition_id = ${kpi.id} AND metric_date = CURRENT_DATE - ${day})
          `);
        }

        const overallStatus = redCount > 0 ? 'red' : (yellowCount > 0 ? 'yellow' : 'green');
        const healthScore = (greenCount * 100 + yellowCount * 60) / 5;

        await sequelize.query(`
          INSERT INTO store_health_snapshots (store_id, snapshot_date, overall_status, health_score, green_kpi_count, yellow_kpi_count, red_kpi_count, escalation_level, action_required, created_at, updated_at)
          SELECT ${store.id}, CURRENT_DATE - ${day}, '${overallStatus}', ${healthScore}, ${greenCount}, ${yellowCount}, ${redCount}, 0, ${redCount > 0}, NOW(), NOW()
          WHERE NOT EXISTS (SELECT 1 FROM store_health_snapshots WHERE store_id = ${store.id} AND snapshot_date = CURRENT_DATE - ${day})
        `);
      }
    }

    const [finalCount] = await sequelize.query('SELECT COUNT(*) as count FROM stores');
    const [metricCount] = await sequelize.query('SELECT COUNT(*) as count FROM kpi_metrics');
    const [snapshotCount] = await sequelize.query('SELECT COUNT(*) as count FROM store_health_snapshots');

    res.json({
      status: 'seeded',
      stores: finalCount[0].count,
      metrics: metricCount[0].count,
      snapshots: snapshotCount[0].count
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;
