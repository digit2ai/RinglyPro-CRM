'use strict';

const { format, subDays } = require('date-fns');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Adding additional month of varied data...');

    // Get existing data
    const [organizations] = await queryInterface.sequelize.query(
      'SELECT id FROM organizations LIMIT 1'
    );
    const orgId = organizations[0].id;

    const [regions] = await queryInterface.sequelize.query(
      'SELECT id FROM regions LIMIT 1'
    );
    const regionId = regions[0].id;

    const [districts] = await queryInterface.sequelize.query(
      'SELECT id FROM districts LIMIT 1'
    );
    const districtId = districts[0].id;

    const [stores] = await queryInterface.sequelize.query(
      'SELECT id FROM stores'
    );

    const [kpiDefinitions] = await queryInterface.sequelize.query(
      'SELECT id, kpi_code FROM kpi_definitions'
    );

    console.log(`Found ${stores.length} stores and ${kpiDefinitions.length} KPIs`);

    // Add 7 more stores with varied scenarios
    const newStores = [
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-004',
        name: 'Dollar Tree - Brooklyn Heights',
        address: '200 Montague Street',
        city: 'Brooklyn',
        state: 'NY',
        zip_code: '11201',
        manager_name: 'David Williams',
        manager_phone: '+1-555-0204',
        manager_email: 'david.williams@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-005',
        name: 'Dollar Tree - Queens Center',
        address: '90-15 Queens Blvd',
        city: 'Queens',
        state: 'NY',
        zip_code: '11373',
        manager_name: 'Lisa Anderson',
        manager_phone: '+1-555-0205',
        manager_email: 'lisa.anderson@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-006',
        name: 'Dollar Tree - Bronx Mall',
        address: '2100 Bartow Avenue',
        city: 'Bronx',
        state: 'NY',
        zip_code: '10475',
        manager_name: 'James Rodriguez',
        manager_phone: '+1-555-0206',
        manager_email: 'james.rodriguez@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-007',
        name: 'Dollar Tree - Staten Island',
        address: '2655 Richmond Avenue',
        city: 'Staten Island',
        state: 'NY',
        zip_code: '10314',
        manager_name: 'Maria Garcia',
        manager_phone: '+1-555-0207',
        manager_email: 'maria.garcia@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-008',
        name: 'Dollar Tree - Long Island City',
        address: '48-17 Queens Blvd',
        city: 'Long Island City',
        state: 'NY',
        zip_code: '11101',
        manager_name: 'Robert Taylor',
        manager_phone: '+1-555-0208',
        manager_email: 'robert.taylor@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-009',
        name: 'Dollar Tree - Harlem',
        address: '2090 Frederick Douglass Blvd',
        city: 'New York',
        state: 'NY',
        zip_code: '10026',
        manager_name: 'Patricia Thomas',
        manager_phone: '+1-555-0209',
        manager_email: 'patricia.thomas@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: orgId,
        region_id: regionId,
        district_id: districtId,
        store_code: 'DT-010',
        name: 'Dollar Tree - Lower East Side',
        address: '145 Essex Street',
        city: 'New York',
        state: 'NY',
        zip_code: '10002',
        manager_name: 'Jennifer Lee',
        manager_phone: '+1-555-0210',
        manager_email: 'jennifer.lee@dollartree.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('stores', newStores);
    console.log(`✓ Created ${newStores.length} additional stores`);

    // Get all stores now (including new ones)
    const [allStores] = await queryInterface.sequelize.query(
      'SELECT id FROM stores'
    );

    // Generate varied KPI data for last 30 days for ALL stores
    const kpiMetrics = [];
    const healthSnapshots = [];
    const alerts = [];
    const tasks = [];

    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const metricDate = format(subDays(new Date(), dayOffset), 'yyyy-MM-dd');

      for (const store of allStores) {
        let storeHealthScore = 0;
        let greenCount = 0;
        let yellowCount = 0;
        let redCount = 0;
        let overallStatus = 'green';
        let escalationLevel = 0;

        // Create varied scenarios for different stores
        const storeIndex = allStores.indexOf(store);
        const isProblematicStore = storeIndex % 3 === 0; // Every 3rd store has issues
        const isCriticalStore = storeIndex === 1 || storeIndex === 5; // Stores 1 and 5 are critical

        for (const kpi of kpiDefinitions) {
          let value, comparisonValue, variance, status;

          // Generate realistic values based on KPI type and store scenario
          if (kpi.kpi_code === 'sales') {
            const baseValue = 12000 + Math.random() * 4000;
            value = isProblematicStore ? baseValue * 0.85 : baseValue;
            comparisonValue = baseValue;
            variance = ((value - comparisonValue) / comparisonValue) * 100;
            status = variance >= -2 ? 'green' : variance >= -6 ? 'yellow' : 'red';
          } else if (kpi.kpi_code === 'traffic') {
            const baseValue = 400 + Math.random() * 150;
            value = isProblematicStore ? baseValue * 0.9 : baseValue;
            comparisonValue = baseValue;
            variance = ((value - comparisonValue) / comparisonValue) * 100;
            status = variance >= -5 ? 'green' : variance >= -10 ? 'yellow' : 'red';
          } else if (kpi.kpi_code === 'conversion_rate') {
            const baseValue = 30 + Math.random() * 10;
            value = isProblematicStore ? baseValue * 0.92 : baseValue;
            comparisonValue = baseValue;
            variance = ((value - comparisonValue) / comparisonValue) * 100;
            status = variance >= -3 ? 'green' : variance >= -8 ? 'yellow' : 'red';
          } else if (kpi.kpi_code === 'labor_coverage') {
            const baseValue = 95 + Math.random() * 5;
            value = isCriticalStore ? baseValue * 0.87 : (isProblematicStore ? baseValue * 0.92 : baseValue);
            comparisonValue = baseValue;
            variance = ((value - comparisonValue) / comparisonValue) * 100;
            status = variance >= -2 ? 'green' : variance >= -6 ? 'yellow' : 'red';
          } else {
            // Default KPI
            const baseValue = 85 + Math.random() * 10;
            value = isProblematicStore ? baseValue * 0.9 : baseValue;
            comparisonValue = baseValue;
            variance = ((value - comparisonValue) / comparisonValue) * 100;
            status = variance >= -3 ? 'green' : variance >= -7 ? 'yellow' : 'red';
          }

          // Count statuses
          if (status === 'green') greenCount++;
          else if (status === 'yellow') yellowCount++;
          else if (status === 'red') redCount++;

          kpiMetrics.push({
            store_id: store.id,
            kpi_definition_id: kpi.id,
            metric_date: metricDate,
            value: Math.round(value * 100) / 100,
            comparison_value: Math.round(comparisonValue * 100) / 100,
            variance_pct: Math.round(variance * 100) / 100,
            status: status,
            metadata: JSON.stringify({
              day_of_week: format(subDays(new Date(), dayOffset), 'EEEE'),
              is_weekend: [0, 6].includes(subDays(new Date(), dayOffset).getDay())
            }),
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        // Calculate health score
        storeHealthScore = (greenCount * 100 + yellowCount * 75 + redCount * 40) / kpiDefinitions.length;

        // Determine overall status and escalation
        if (redCount > 0) {
          overallStatus = 'red';
          escalationLevel = isCriticalStore ? 3 : 2;
        } else if (yellowCount > 0) {
          overallStatus = 'yellow';
          escalationLevel = 1;
        }

        const actionRequired = redCount > 0 || (yellowCount > 2);

        healthSnapshots.push({
          store_id: store.id,
          snapshot_date: metricDate,
          overall_status: overallStatus,
          health_score: Math.round(storeHealthScore * 10) / 10,
          red_kpi_count: redCount,
          yellow_kpi_count: yellowCount,
          green_kpi_count: greenCount,
          escalation_level: escalationLevel,
          action_required: actionRequired,
          summary: actionRequired
            ? `Store has ${redCount} red KPIs and ${yellowCount} yellow KPIs requiring attention.`
            : 'All metrics within acceptable ranges.',
          created_at: new Date(),
          updated_at: new Date()
        });

        // Create alerts for red KPIs in last 7 days
        if (dayOffset < 7 && redCount > 0) {
          const redKpi = kpiDefinitions.find((k, idx) => {
            const metric = kpiMetrics.find(m =>
              m.store_id === store.id &&
              m.kpi_definition_id === k.id &&
              m.metric_date === metricDate &&
              m.status === 'red'
            );
            return metric;
          });

          if (redKpi) {
            alerts.push({
              store_id: store.id,
              kpi_definition_id: redKpi.id,
              severity: 'red',
              escalation_level: escalationLevel,
              status: dayOffset < 3 ? 'active' : 'acknowledged',
              title: `🔴 ${redKpi.kpi_code} performance critical`,
              message: `${redKpi.kpi_code} is significantly below target`,
              requires_acknowledgment: true,
              alert_date: subDays(new Date(), dayOffset),
              expires_at: subDays(new Date(), dayOffset - 1),
              acknowledged_at: dayOffset < 3 ? null : subDays(new Date(), dayOffset - 1),
              acknowledged_by: dayOffset < 3 ? null : 'System Auto-Ack',
              metadata: JSON.stringify({
                kpi_value: 87,
                threshold_value: 95,
                variance_pct: -10.5
              }),
              created_at: new Date(),
              updated_at: new Date()
            });

            // Create corresponding tasks
            tasks.push({
              store_id: store.id,
              kpi_definition_id: redKpi.id,
              title: `Address critical ${redKpi.kpi_code} issue`,
              description: `Investigate and resolve ${redKpi.kpi_code} performance gap`,
              assigned_to_role: 'store_manager',
              priority: 1,
              status: dayOffset < 2 ? 'pending' : (dayOffset < 5 ? 'in_progress' : 'completed'),
              due_date: subDays(new Date(), dayOffset - 2),
              completed_at: dayOffset >= 5 ? subDays(new Date(), dayOffset - 3) : null,
              created_at: new Date(),
              updated_at: new Date()
            });
          }
        }
      }
    }

    // Insert all metrics
    console.log(`Inserting ${kpiMetrics.length} KPI metrics...`);
    await queryInterface.bulkInsert('kpi_metrics', kpiMetrics);
    console.log(`✓ Created KPI metrics`);

    console.log(`Inserting ${healthSnapshots.length} health snapshots...`);
    await queryInterface.bulkInsert('store_health_snapshots', healthSnapshots);
    console.log(`✓ Created health snapshots`);

    if (alerts.length > 0) {
      console.log(`Inserting ${alerts.length} alerts...`);
      await queryInterface.bulkInsert('alerts', alerts);
      console.log(`✓ Created alerts`);
    }

    if (tasks.length > 0) {
      console.log(`Inserting ${tasks.length} tasks...`);
      await queryInterface.bulkInsert('tasks', tasks);
      console.log(`✓ Created tasks`);
    }

    console.log('\n📊 Summary:');
    console.log(`   Total Stores: ${allStores.length}`);
    console.log(`   KPI Metrics: ${kpiMetrics.length}`);
    console.log(`   Health Snapshots: ${healthSnapshots.length}`);
    console.log(`   Alerts: ${alerts.length}`);
    console.log(`   Tasks: ${tasks.length}`);
    console.log('✅ Additional data seeding complete!\n');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('tasks', null, {});
    await queryInterface.bulkDelete('alerts', null, {});
    await queryInterface.bulkDelete('store_health_snapshots', null, {});
    await queryInterface.bulkDelete('kpi_metrics', null, {});
    await queryInterface.bulkDelete('stores', { store_code: { [Sequelize.Op.in]: ['DT-004', 'DT-005', 'DT-006', 'DT-007', 'DT-008', 'DT-009', 'DT-010'] } }, {});
  }
};
