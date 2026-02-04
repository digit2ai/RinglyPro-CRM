'use strict';

const { format, subDays, addDays } = require('date-fns');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🌱 Seeding 1 month of Store Health AI dummy data...');

    const today = new Date();
    const startDate = subDays(today, 30); // 30 days ago

    // 1. Create Organization
    const [orgResult] = await queryInterface.bulkInsert('organizations', [
      {
        name: 'Dollar Tree Stores',
        timezone: 'America/New_York',
        config: JSON.stringify({
          businessHours: { open: '08:00', close: '22:00' },
          alertChannels: ['email', 'sms', 'push'],
          escalationEnabled: true
        }),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], { returning: true });

    const orgId = orgResult?.id || 1;
    console.log(`✅ Created organization (ID: ${orgId})`);

    // 2. Create Regions
    const [regionResult] = await queryInterface.bulkInsert('regions', [
      {
        organization_id: orgId,
        name: 'Northeast Region',
        manager_name: 'Sarah Johnson',
        manager_email: 'sarah.johnson@dollartree.com',
        manager_phone: '+12125551234',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], { returning: true });

    const regionId = regionResult?.id || 1;
    console.log(`✅ Created region (ID: ${regionId})`);

    // 3. Create Districts
    const [districtResult] = await queryInterface.bulkInsert('districts', [
      {
        region_id: regionId,
        name: 'NYC Metro District',
        manager_name: 'Michael Chen',
        manager_email: 'michael.chen@dollartree.com',
        manager_phone: '+12125555678',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], { returning: true });

    const districtId = districtResult?.id || 1;
    console.log(`✅ Created district (ID: ${districtId})`);

    // 4. Create Stores (10 stores)
    const stores = [];
    const storeData = [
      { code: 'DT-001', name: 'Manhattan 42nd St', city: 'New York', state: 'NY', zip: '10036', manager: 'John Smith', phone: '+12125551111' },
      { code: 'DT-002', name: 'Brooklyn Heights', city: 'Brooklyn', state: 'NY', zip: '11201', manager: 'Emily Davis', phone: '+17185552222' },
      { code: 'DT-003', name: 'Queens Plaza', city: 'Queens', state: 'NY', zip: '11101', manager: 'Carlos Rodriguez', phone: '+17185553333' },
      { code: 'DT-004', name: 'Bronx Fordham', city: 'Bronx', state: 'NY', zip: '10458', manager: 'Lisa Washington', phone: '+17185554444' },
      { code: 'DT-005', name: 'Staten Island Mall', city: 'Staten Island', state: 'NY', zip: '10314', manager: 'David Kim', phone: '+17185555555' },
      { code: 'DT-006', name: 'Upper East Side', city: 'New York', state: 'NY', zip: '10021', manager: 'Amanda Lee', phone: '+12125556666' },
      { code: 'DT-007', name: 'Harlem 125th', city: 'New York', state: 'NY', zip: '10027', manager: 'Marcus Johnson', phone: '+12125557777' },
      { code: 'DT-008', name: 'Greenwich Village', city: 'New York', state: 'NY', zip: '10012', manager: 'Rachel Green', phone: '+12125558888' },
      { code: 'DT-009', name: 'Williamsburg', city: 'Brooklyn', state: 'NY', zip: '11211', manager: 'Tom Brady', phone: '+17185559999' },
      { code: 'DT-010', name: 'Long Island City', city: 'Queens', state: 'NY', zip: '11101', manager: 'Sarah Parker', phone: '+17185550000' }
    ];

    for (const store of storeData) {
      stores.push({
        organization_id: orgId,
        district_id: districtId,
        store_code: store.code,
        name: store.name,
        address: `123 Main St`,
        city: store.city,
        state: store.state,
        zip: store.zip,
        timezone: 'America/New_York',
        manager_name: store.manager,
        manager_email: `${store.manager.toLowerCase().replace(' ', '.')}@dollartree.com`,
        manager_phone: store.phone,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    const storeResults = await queryInterface.bulkInsert('stores', stores, { returning: true });
    console.log(`✅ Created ${stores.length} stores`);

    // 5. Create KPI Definitions
    const kpiDefs = [
      { code: 'SALES_DAILY', name: 'Daily Sales', category: 'sales', unit: 'USD', calculation_method: 'sum', target_value: 5000 },
      { code: 'LABOR_HOURS', name: 'Labor Hours', category: 'labor', unit: 'hours', calculation_method: 'sum', target_value: 120 },
      { code: 'CONVERSION_RATE', name: 'Conversion Rate', category: 'sales', unit: 'percent', calculation_method: 'percentage', target_value: 35 },
      { code: 'INVENTORY_LEVEL', name: 'Inventory Level', category: 'inventory', unit: 'units', calculation_method: 'count', target_value: 10000 },
      { code: 'TRAFFIC', name: 'Store Traffic', category: 'traffic', unit: 'visitors', calculation_method: 'count', target_value: 200 }
    ];

    const kpiDefResults = await queryInterface.bulkInsert('kpi_definitions',
      kpiDefs.map(kpi => ({
        kpi_code: kpi.code,
        name: kpi.name,
        category: kpi.category,
        unit: kpi.unit,
        calculation_method: kpi.calculation_method,
        target_value: kpi.target_value,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      })),
      { returning: true }
    );
    console.log(`✅ Created ${kpiDefs.length} KPI definitions`);

    // 6. Create KPI Thresholds
    const thresholds = [];
    kpiDefResults.forEach((kpiDef, idx) => {
      const def = kpiDefs[idx];
      thresholds.push({
        kpi_definition_id: kpiDef.id || (idx + 1),
        green_threshold: def.target_value * 0.9, // 90% of target = green
        yellow_threshold: def.target_value * 0.75, // 75% of target = yellow
        red_threshold: def.target_value * 0.6, // 60% of target = red
        comparison_operator: '>=',
        created_at: new Date(),
        updated_at: new Date()
      });
    });

    await queryInterface.bulkInsert('kpi_thresholds', thresholds);
    console.log(`✅ Created ${thresholds.length} KPI thresholds`);

    // 7. Generate 30 days of KPI Metrics for all stores
    console.log('📊 Generating 30 days of KPI metrics...');
    const metrics = [];
    const snapshots = [];
    const alerts = [];
    const tasks = [];

    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const metricDate = format(subDays(today, dayOffset), 'yyyy-MM-dd');

      storeResults.forEach((store, storeIdx) => {
        const storeId = store.id || (storeIdx + 1);

        // Generate metrics with realistic variance
        kpiDefResults.forEach((kpiDef, kpiIdx) => {
          const def = kpiDefs[kpiIdx];
          const baseValue = def.target_value;

          // Simulate realistic performance: some stores perform better/worse
          const storePerformance = 0.7 + (Math.random() * 0.5); // 70-120% performance
          const dailyVariance = 0.85 + (Math.random() * 0.3); // 85-115% daily variance
          const value = baseValue * storePerformance * dailyVariance;

          const variancePct = ((value - baseValue) / baseValue) * 100;

          // Determine status based on thresholds
          let status = 'red';
          if (value >= def.target_value * 0.9) status = 'green';
          else if (value >= def.target_value * 0.75) status = 'yellow';

          metrics.push({
            store_id: storeId,
            kpi_definition_id: kpiDef.id || (kpiIdx + 1),
            metric_date: metricDate,
            value: Math.round(value * 100) / 100,
            comparison_value: baseValue,
            variance_pct: Math.round(variancePct * 100) / 100,
            status,
            data_source: 'simulated',
            created_at: new Date(),
            updated_at: new Date()
          });

          // Create alerts for red/yellow statuses (only for recent 7 days)
          if (dayOffset < 7 && (status === 'red' || status === 'yellow')) {
            const severity = status === 'red' ? 'critical' : 'warning';
            alerts.push({
              store_id: storeId,
              kpi_metric_id: null, // Will be set after metrics are inserted
              alert_type: 'threshold_breach',
              severity,
              status: dayOffset < 2 ? 'open' : 'acknowledged',
              message: `${def.name} is ${status.toUpperCase()} (${Math.round(value)} ${def.unit})`,
              triggered_at: new Date(subDays(today, dayOffset)),
              metadata: JSON.stringify({ kpi_code: def.code, value, target: baseValue }),
              created_at: new Date(),
              updated_at: new Date()
            });
          }
        });

        // Create daily store health snapshot
        const greenCount = metrics.filter(m => m.store_id === storeId && m.metric_date === metricDate && m.status === 'green').length;
        const yellowCount = metrics.filter(m => m.store_id === storeId && m.metric_date === metricDate && m.status === 'yellow').length;
        const redCount = metrics.filter(m => m.store_id === storeId && m.metric_date === metricDate && m.status === 'red').length;

        const totalKpis = kpiDefs.length;
        const healthScore = ((greenCount * 100 + yellowCount * 60) / totalKpis);

        let overallStatus = 'red';
        if (redCount === 0 && yellowCount === 0) overallStatus = 'green';
        else if (redCount === 0) overallStatus = 'yellow';

        snapshots.push({
          store_id: storeId,
          snapshot_date: metricDate,
          overall_status: overallStatus,
          green_count: greenCount,
          yellow_count: yellowCount,
          red_count: redCount,
          health_score: Math.round(healthScore * 100) / 100,
          escalation_level: redCount >= 2 ? 2 : (redCount >= 1 ? 1 : 0),
          metadata: JSON.stringify({ date: metricDate }),
          created_at: new Date(),
          updated_at: new Date()
        });
      });
    }

    await queryInterface.bulkInsert('kpi_metrics', metrics);
    console.log(`✅ Created ${metrics.length} KPI metrics (30 days × 10 stores × 5 KPIs)`);

    await queryInterface.bulkInsert('store_health_snapshots', snapshots);
    console.log(`✅ Created ${snapshots.length} store health snapshots`);

    await queryInterface.bulkInsert('alerts', alerts);
    console.log(`✅ Created ${alerts.length} alerts`);

    // 8. Create tasks for recent alerts
    const recentAlerts = alerts.filter((_, idx) => idx < 20); // First 20 alerts
    recentAlerts.forEach((alert, idx) => {
      tasks.push({
        alert_id: idx + 1, // Will be adjusted after alerts are inserted
        store_id: alert.store_id,
        task_type: alert.severity === 'critical' ? 'escalation' : 'action',
        priority: alert.severity === 'critical' ? 'high' : 'medium',
        title: `Review ${alert.message}`,
        description: `Action required for store health alert`,
        status: idx < 5 ? 'open' : 'in_progress',
        assigned_to: 'Store Manager',
        due_date: addDays(alert.triggered_at, 1),
        created_at: new Date(),
        updated_at: new Date()
      });
    });

    await queryInterface.bulkInsert('tasks', tasks);
    console.log(`✅ Created ${tasks.length} tasks`);

    console.log('✅ Seeding completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - 1 Organization, 1 Region, 1 District`);
    console.log(`   - 10 Stores`);
    console.log(`   - 5 KPI Definitions`);
    console.log(`   - ${metrics.length} KPI Metrics (30 days)`);
    console.log(`   - ${snapshots.length} Store Health Snapshots`);
    console.log(`   - ${alerts.length} Alerts`);
    console.log(`   - ${tasks.length} Tasks`);
  },

  async down(queryInterface, Sequelize) {
    console.log('🗑️  Rolling back seed data...');

    // Delete in reverse order of creation (respecting foreign keys)
    await queryInterface.bulkDelete('tasks', null, {});
    await queryInterface.bulkDelete('alerts', null, {});
    await queryInterface.bulkDelete('store_health_snapshots', null, {});
    await queryInterface.bulkDelete('kpi_metrics', null, {});
    await queryInterface.bulkDelete('kpi_thresholds', null, {});
    await queryInterface.bulkDelete('kpi_definitions', null, {});
    await queryInterface.bulkDelete('stores', null, {});
    await queryInterface.bulkDelete('districts', null, {});
    await queryInterface.bulkDelete('regions', null, {});
    await queryInterface.bulkDelete('organizations', null, {});

    console.log('✅ Rollback completed');
  }
};
