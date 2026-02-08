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

// Reseed snapshots - regenerates 2 months of realistic KPI metrics and snapshots
router.get('/reseed', async (req, res) => {
  try {
    const { sequelize } = require('../../models');

    // Get store IDs and names
    const [stores] = await sequelize.query(`SELECT id, name FROM stores WHERE status = 'active' ORDER BY id`);
    const [kpiDefs] = await sequelize.query(`SELECT id, kpi_code FROM kpi_definitions ORDER BY id`);

    if (stores.length === 0) {
      return res.json({ error: 'No stores found. Run /health/seed first.' });
    }

    if (kpiDefs.length === 0) {
      return res.json({ error: 'No KPI definitions found. Run /health/seed first.' });
    }

    // Clear existing snapshots and metrics
    await sequelize.query('DELETE FROM store_health_snapshots');
    await sequelize.query('DELETE FROM kpi_metrics');

    let metricsCreated = 0;
    let snapshotsCreated = 0;

    // Define store performance profiles for realistic data
    // Each store has a "base performance" that determines how well they typically do
    const storeProfiles = {
      // High performers (consistently green)
      1: { basePerformance: 0.95, volatility: 0.08, trend: 0.002 },   // Manhattan 42nd St - flagship
      6: { basePerformance: 0.92, volatility: 0.10, trend: 0.001 },   // Upper East Side - wealthy area

      // Good performers (mostly green, occasional yellow)
      2: { basePerformance: 0.88, volatility: 0.12, trend: 0.001 },   // Brooklyn Heights
      8: { basePerformance: 0.87, volatility: 0.11, trend: 0.000 },   // Greenwich Village

      // Average performers (mix of green/yellow)
      3: { basePerformance: 0.82, volatility: 0.15, trend: -0.001 },  // Queens Plaza
      9: { basePerformance: 0.80, volatility: 0.14, trend: 0.000 },   // Williamsburg
      10: { basePerformance: 0.78, volatility: 0.13, trend: 0.001 },  // Long Island City

      // Struggling stores (frequent yellow, some red)
      4: { basePerformance: 0.72, volatility: 0.18, trend: -0.002 },  // Bronx Fordham
      7: { basePerformance: 0.70, volatility: 0.20, trend: -0.001 },  // Harlem 125th

      // Problem store (frequent red, needs attention)
      5: { basePerformance: 0.65, volatility: 0.22, trend: -0.003 },  // Staten Island Mall
    };

    // KPI-specific variance (some KPIs are harder to hit than others)
    const kpiDifficulty = {
      'SALES_DAILY': 1.0,      // Base difficulty
      'LABOR_HOURS': 1.1,      // Labor is tricky to manage
      'CONVERSION_RATE': 0.95, // Slightly easier
      'INVENTORY_LEVEL': 1.05, // Inventory management challenges
      'TRAFFIC': 0.9,          // Traffic is external, easier to hit
    };

    // Create metrics and snapshots for last 60 days (2 months)
    const DAYS = 60;

    for (let day = 0; day < DAYS; day++) {
      // Add some weekly patterns (weekends are different)
      const dayOfWeek = (new Date().getDay() - day + 70) % 7; // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const weekendBoost = isWeekend ? 0.03 : 0; // Slightly better on weekends

      for (const store of stores) {
        const profile = storeProfiles[store.id] || { basePerformance: 0.80, volatility: 0.15, trend: 0 };

        // Calculate store's performance for this day
        // Includes: base + trend over time + weekend effect + random daily variance
        const trendEffect = profile.trend * (DAYS - day); // Trend effect increases over time
        const dailyVariance = (Math.random() - 0.5) * profile.volatility;
        const storePerformance = profile.basePerformance + trendEffect + weekendBoost + dailyVariance;

        let greenCount = 0, yellowCount = 0, redCount = 0;

        for (const kpi of kpiDefs) {
          const difficulty = kpiDifficulty[kpi.kpi_code] || 1.0;

          // Calculate this KPI's performance
          // Add KPI-specific random variance
          const kpiVariance = (Math.random() - 0.5) * 0.15;
          const kpiPerformance = (storePerformance / difficulty) + kpiVariance;

          // Convert performance to a percentage variance from target
          // Performance of 1.0 = on target, 0.9 = -10%, 0.8 = -20%
          const variancePct = (kpiPerformance - 1.0) * 100;

          // Calculate actual value (target * performance)
          const targetValue = 100;
          const value = targetValue * Math.max(0.3, kpiPerformance); // Floor at 30% of target

          // Determine status based on variance thresholds
          let status;
          if (variancePct >= -10) {
            status = 'green';
            greenCount++;
          } else if (variancePct >= -25) {
            status = 'yellow';
            yellowCount++;
          } else {
            status = 'red';
            redCount++;
          }

          await sequelize.query(`
            INSERT INTO kpi_metrics (store_id, kpi_definition_id, metric_date, metric_timestamp, value, variance_pct, status, created_at, updated_at)
            VALUES (${store.id}, ${kpi.id}, CURRENT_DATE - ${day}, NOW(), ${value.toFixed(2)}, ${variancePct.toFixed(2)}, '${status}', NOW(), NOW())
          `);
          metricsCreated++;
        }

        // Determine overall store status
        const overallStatus = redCount > 0 || yellowCount >= 2 ? 'red' : (yellowCount > 0 ? 'yellow' : 'green');
        const total = greenCount + yellowCount + redCount;
        const healthScore = total > 0 ? (greenCount * 100 + yellowCount * 60) / total : 100;
        const escalationLevel = (redCount > 0 || yellowCount >= 2) ? 2 : (yellowCount > 0 ? 1 : 0);
        const actionRequired = redCount > 0 || yellowCount > 1;

        await sequelize.query(`
          INSERT INTO store_health_snapshots (store_id, snapshot_date, overall_status, health_score, green_kpi_count, yellow_kpi_count, red_kpi_count, escalation_level, action_required, created_at, updated_at)
          VALUES (${store.id}, CURRENT_DATE - ${day}, '${overallStatus}', ${healthScore.toFixed(2)}, ${greenCount}, ${yellowCount}, ${redCount}, ${escalationLevel}, ${actionRequired}, NOW(), NOW())
        `);
        snapshotsCreated++;
      }
    }

    res.json({
      status: 'reseeded',
      stores: stores.length,
      kpis: kpiDefs.length,
      days: DAYS,
      metricsCreated,
      snapshotsCreated,
      profiles: Object.entries(storeProfiles).map(([id, p]) => ({
        store_id: id,
        performance: p.basePerformance,
        category: p.basePerformance >= 0.9 ? 'high' : p.basePerformance >= 0.8 ? 'good' : p.basePerformance >= 0.75 ? 'average' : 'struggling'
      }))
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

// Seed alerts and tasks based on current store health
router.get('/seed-alerts', async (req, res) => {
  try {
    const { sequelize } = require('../../models');

    // First check what columns exist in alerts table
    const [alertCols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts'
    `);
    const alertColNames = alertCols.map(c => c.column_name);

    // Get critical stores (red/yellow status)
    const [stores] = await sequelize.query(`
      SELECT s.id, s.store_code, s.name, s.manager_name,
             shs.health_score, shs.escalation_level, shs.overall_status as status
      FROM stores s
      JOIN store_health_snapshots shs ON s.id = shs.store_id
      WHERE shs.snapshot_date = CURRENT_DATE
        AND shs.overall_status IN ('red', 'yellow')
      ORDER BY shs.health_score ASC
      LIMIT 10
    `);

    if (stores.length === 0) {
      return res.json({ status: 'no_critical_stores', message: 'No stores in red/yellow status today', alertColumns: alertColNames });
    }

    // Get KPI definitions
    const [kpiDefs] = await sequelize.query(`SELECT id, kpi_code, name FROM kpi_definitions LIMIT 5`);
    const kpiMap = {};
    kpiDefs.forEach(k => kpiMap[k.kpi_code] = k);

    // Alert templates
    const alertTemplates = [
      { kpi: 'SALES_DAILY', title: 'Sales Below Target', severity: 'red' },
      { kpi: 'LABOR_HOURS', title: 'Staffing Coverage Critical', severity: 'yellow' },
      { kpi: 'INVENTORY_LEVEL', title: 'Inventory Stockout Alert', severity: 'red' },
      { kpi: 'CONVERSION_RATE', title: 'Low Conversion Rate', severity: 'yellow' },
      { kpi: 'TRAFFIC', title: 'Traffic Below Baseline', severity: 'yellow' }
    ];

    let alertCount = 0;
    let taskCount = 0;

    for (const store of stores) {
      const numAlerts = store.status === 'red' ? 3 : 1;

      for (let i = 0; i < numAlerts && i < alertTemplates.length; i++) {
        const template = alertTemplates[i];
        const kpiDef = kpiMap[template.kpi];
        if (!kpiDef) continue;

        const variance = Math.round(15 + Math.random() * 20);
        const severity = store.status === 'red' ? 'red' : template.severity;
        const message = `${store.name} - ${template.title}: ${variance}% below target. Immediate attention required.`;

        // Build dynamic insert based on available columns
        const cols = ['store_id', 'kpi_definition_id', 'severity', 'status', 'title', 'message', 'alert_date', 'created_at', 'updated_at'];
        const vals = [`${store.id}`, `${kpiDef.id}`, `'${severity}'`, `'active'`, `'${template.title}'`, `'${message.replace(/'/g, "''")}'`, 'CURRENT_DATE', 'NOW()', 'NOW()'];

        if (alertColNames.includes('escalation_level')) {
          cols.push('escalation_level');
          vals.push(`${store.escalation_level || 1}`);
        }
        if (alertColNames.includes('requires_acknowledgment')) {
          cols.push('requires_acknowledgment');
          vals.push('true');
        }
        if (alertColNames.includes('expires_at')) {
          cols.push('expires_at');
          vals.push("NOW() + INTERVAL '24 hours'");
        }

        await sequelize.query(`INSERT INTO alerts (${cols.join(', ')}) VALUES (${vals.join(', ')})`);
        alertCount++;
      }

      // Create tasks for red stores
      if (store.status === 'red') {
        const [taskCols] = await sequelize.query(`
          SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'
        `);
        const taskColNames = taskCols.map(c => c.column_name);

        const taskTemplates = [
          { title: `Contact Manager at ${store.name}`, priority: 1, role: 'District Manager' },
          { title: `Review Inventory at ${store.name}`, priority: 2, role: 'Inventory Manager' },
          { title: `Staffing Review for ${store.name}`, priority: 2, role: 'HR Manager' }
        ];

        for (const task of taskTemplates) {
          const desc = `Follow up on critical KPI issues. Store health score is ${store.health_score}%.`;

          const cols = ['store_id', 'title', 'description', 'status', 'created_at', 'updated_at'];
          const vals = [`${store.id}`, `'${task.title.replace(/'/g, "''")}'`, `'${desc}'`, `'pending'`, 'NOW()', 'NOW()'];

          if (taskColNames.includes('priority')) {
            cols.push('priority');
            vals.push(`${task.priority}`);
          }
          if (taskColNames.includes('assigned_to_role')) {
            cols.push('assigned_to_role');
            vals.push(`'${task.role}'`);
          }
          if (taskColNames.includes('due_date')) {
            cols.push('due_date');
            vals.push("CURRENT_DATE + INTERVAL '2 days'");
          }

          await sequelize.query(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${vals.join(', ')})`);
          taskCount++;
        }
      }
    }

    res.json({
      status: 'seeded',
      criticalStores: stores.length,
      alertsCreated: alertCount,
      tasksCreated: taskCount,
      alertColumns: alertColNames
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;
