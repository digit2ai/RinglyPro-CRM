'use strict';

const { format, subDays } = require('date-fns');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('Seeding test data...');

    // 1. Create organization
    const [org] = await queryInterface.bulkInsert('organizations', [{
      name: 'Dollar Tree Stores',
      timezone: 'America/New_York',
      config: JSON.stringify({
        fiscal_year_start: '02-01',
        currency: 'USD',
        operating_hours: '9am-9pm'
      }),
      created_at: new Date(),
      updated_at: new Date()
    }], { returning: true });

    console.log(`✓ Created organization: ${org.name}`);

    // 2. Create region
    const [region] = await queryInterface.bulkInsert('regions', [{
      organization_id: org.id,
      name: 'Northeast Region',
      manager_name: 'Sarah Johnson',
      manager_email: 'sarah.johnson@dollartree.com',
      manager_phone: '+1-555-0100',
      created_at: new Date(),
      updated_at: new Date()
    }], { returning: true });

    console.log(`✓ Created region: ${region.name}`);

    // 3. Create district
    const [district] = await queryInterface.bulkInsert('districts', [{
      organization_id: org.id,
      region_id: region.id,
      name: 'NYC Metro District',
      manager_name: 'Michael Chen',
      manager_email: 'michael.chen@dollartree.com',
      manager_phone: '+1-555-0101',
      created_at: new Date(),
      updated_at: new Date()
    }], { returning: true });

    console.log(`✓ Created district: ${district.name}`);

    // 4. Create stores
    const stores = await queryInterface.bulkInsert('stores', [
      {
        organization_id: org.id,
        region_id: region.id,
        district_id: district.id,
        store_code: 'DT-001',
        name: 'Dollar Tree - Manhattan 42nd St',
        address: '123 West 42nd Street',
        city: 'New York',
        state: 'NY',
        zip_code: '10036',
        timezone: 'America/New_York',
        phone: '+1-555-0201',
        manager_name: 'Alice Martinez',
        manager_phone: '+1-555-0202',
        manager_email: 'alice.martinez@dollartree.com',
        status: 'active',
        metadata: JSON.stringify({ size: 'medium', store_type: 'urban' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        region_id: region.id,
        district_id: district.id,
        store_code: 'DT-002',
        name: 'Dollar Tree - Brooklyn Heights',
        address: '456 Atlantic Avenue',
        city: 'Brooklyn',
        state: 'NY',
        zip_code: '11201',
        timezone: 'America/New_York',
        phone: '+1-555-0203',
        manager_name: 'Robert Kim',
        manager_phone: '+1-555-0204',
        manager_email: 'robert.kim@dollartree.com',
        status: 'active',
        metadata: JSON.stringify({ size: 'large', store_type: 'urban' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        region_id: region.id,
        district_id: district.id,
        store_code: 'DT-003',
        name: 'Dollar Tree - Queens Plaza',
        address: '789 Queens Boulevard',
        city: 'Queens',
        state: 'NY',
        zip_code: '11101',
        timezone: 'America/New_York',
        phone: '+1-555-0205',
        manager_name: 'Jennifer Lopez',
        manager_phone: '+1-555-0206',
        manager_email: 'jennifer.lopez@dollartree.com',
        status: 'active',
        metadata: JSON.stringify({ size: 'small', store_type: 'suburban' }),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], { returning: true });

    console.log(`✓ Created ${stores.length} stores`);

    // 5. Create KPI definitions
    const kpiDefs = await queryInterface.bulkInsert('kpi_definitions', [
      {
        organization_id: org.id,
        kpi_code: 'sales',
        name: 'Sales Performance',
        description: 'Total daily sales vs rolling 4-week average',
        unit: '$',
        calculation_method: 'sum',
        category: 'sales',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'traffic',
        name: 'Store Traffic',
        description: 'Daily customer traffic count',
        unit: 'count',
        calculation_method: 'sum',
        category: 'traffic',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'conversion_rate',
        name: 'Conversion Rate',
        description: 'Percentage of visitors who make a purchase',
        unit: '%',
        calculation_method: 'percentage',
        category: 'sales',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'labor_coverage',
        name: 'Labor Coverage Ratio',
        description: 'Available labor hours vs required hours',
        unit: '%',
        calculation_method: 'ratio',
        category: 'labor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'inventory_oos_rate',
        name: 'Out-of-Stock Rate',
        description: 'Percentage of top SKUs out of stock',
        unit: '%',
        calculation_method: 'percentage',
        category: 'inventory',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], { returning: true });

    console.log(`✓ Created ${kpiDefs.length} KPI definitions`);

    // Get KPI IDs for threshold creation
    const kpis = await queryInterface.sequelize.query(
      `SELECT id, kpi_code FROM kpi_definitions WHERE organization_id = ${org.id}`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // 6. Create KPI thresholds (org-level defaults)
    const thresholds = kpis.map(kpi => {
      let config;

      switch(kpi.kpi_code) {
        case 'sales':
          config = { green_min: -2, yellow_min: -6, red_threshold: -6, priority: 1 };
          break;
        case 'traffic':
          config = { green_min: -3, yellow_min: -8, red_threshold: -8, priority: 2 };
          break;
        case 'conversion_rate':
          config = { green_min: -1.5, yellow_min: -3, red_threshold: -3, priority: 2 };
          break;
        case 'labor_coverage':
          config = { green_min: 95, yellow_min: 90, red_threshold: 90, priority: 1 };
          break;
        case 'inventory_oos_rate':
          config = { green_min: 3, yellow_min: 6, red_threshold: 6, priority: 2 };
          break;
        default:
          config = { green_min: -2, yellow_min: -5, red_threshold: -5, priority: 3 };
      }

      return {
        kpi_definition_id: kpi.id,
        organization_id: org.id,
        store_id: null,
        comparison_basis: kpi.kpi_code === 'labor_coverage' ? 'absolute' : 'rolling_4w',
        ...config,
        created_at: new Date(),
        updated_at: new Date()
      };
    });

    await queryInterface.bulkInsert('kpi_thresholds', thresholds);
    console.log(`✓ Created ${thresholds.length} KPI thresholds`);

    // 7. Create historical KPI metrics (last 30 days) for baseline calculation
    const metricsToInsert = [];
    const today = new Date();

    for (let i = 30; i >= 1; i--) {
      const metricDate = format(subDays(today, i), 'yyyy-MM-dd');

      for (const store of stores) {
        for (const kpi of kpis) {
          let baseValue, variance;

          // Generate realistic historical data
          switch(kpi.kpi_code) {
            case 'sales':
              baseValue = 12000 + Math.random() * 3000; // $12k-$15k
              variance = 0; // Historical data is the baseline
              break;
            case 'traffic':
              baseValue = 400 + Math.random() * 100; // 400-500 customers
              variance = 0;
              break;
            case 'conversion_rate':
              baseValue = 30 + Math.random() * 10; // 30-40%
              variance = 0;
              break;
            case 'labor_coverage':
              baseValue = 95 + Math.random() * 5; // 95-100%
              variance = 0;
              break;
            case 'inventory_oos_rate':
              baseValue = 1 + Math.random() * 2; // 1-3%
              variance = 0;
              break;
            default:
              baseValue = 100;
              variance = 0;
          }

          metricsToInsert.push({
            store_id: store.id,
            kpi_definition_id: kpi.id,
            metric_date: metricDate,
            metric_timestamp: new Date(`${metricDate}T23:59:59Z`),
            value: baseValue.toFixed(2),
            comparison_value: null,
            comparison_type: 'rolling_4w',
            variance_pct: variance.toFixed(2),
            status: 'green',
            metadata: JSON.stringify({ historical: true }),
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }
    }

    await queryInterface.bulkInsert('kpi_metrics', metricsToInsert);
    console.log(`✓ Created ${metricsToInsert.length} historical KPI metrics (30 days)`);

    // 8. Create call scripts
    await queryInterface.bulkInsert('call_scripts', [
      {
        organization_id: org.id,
        script_type: 'green',
        version: 1,
        script_content: 'Good morning {manager_name}. Your store {store_name} is green across all core KPIs today. Sales, staffing, and inventory are tracking within healthy ranges. No action is required right now. I\'ll continue monitoring and notify you only if something changes.',
        variables: JSON.stringify(['store_name', 'manager_name']),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        script_type: 'yellow',
        version: 1,
        script_content: 'Good morning {manager_name}. Here\'s your store status for {store_name}. One item needs attention. {kpi_name} is slightly below target at {variance}% variance. I\'ve created a task to review this today. Would you like help taking action now, or will you handle it manually?',
        variables: JSON.stringify(['store_name', 'manager_name', 'kpi_name', 'variance']),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        script_type: 'red',
        version: 1,
        script_content: 'Good morning {manager_name}. I\'m calling because {store_name} is at risk today. {kpi_name} is below the safe threshold at {variance}% variance. If unaddressed, this may result in lost sales or customer impact. I\'ve created a priority task that needs action now. Say \'yes\' if you want me to assist, or \'later\' if you\'ll handle it manually.',
        variables: JSON.stringify(['store_name', 'manager_name', 'kpi_name', 'variance']),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    console.log(`✓ Created 3 call scripts`);

    // 9. Create escalation rules
    const salesKpi = kpis.find(k => k.kpi_code === 'sales');
    const laborKpi = kpis.find(k => k.kpi_code === 'labor_coverage');

    await queryInterface.bulkInsert('escalation_rules', [
      {
        organization_id: org.id,
        kpi_definition_id: salesKpi.id,
        trigger_condition: 'status_red',
        duration_hours: 24,
        from_level: 2,
        to_level: 3,
        action: 'ai_call',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_definition_id: laborKpi.id,
        trigger_condition: 'status_red',
        duration_hours: 24,
        from_level: 2,
        to_level: 3,
        action: 'ai_call',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_definition_id: null,
        trigger_condition: 'status_red',
        duration_hours: 48,
        from_level: 3,
        to_level: 4,
        action: 'regional_escalation',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    console.log(`✓ Created 3 escalation rules`);

    // 10. Create system config
    await queryInterface.bulkInsert('system_config', [
      {
        organization_id: org.id,
        config_key: 'voice_provider',
        config_value: JSON.stringify({ provider: 'twilio', enabled: false }),
        description: 'AI voice call provider configuration',
        is_active: true,
        updated_by: 'system',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        config_key: 'alert_channels',
        config_value: JSON.stringify({ push: true, sms: false, email: true }),
        description: 'Alert delivery channels',
        is_active: true,
        updated_by: 'system',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        config_key: 'sla_hours',
        config_value: JSON.stringify({ sales: 24, labor: 24, inventory: 72 }),
        description: 'SLA hours by category',
        is_active: true,
        updated_by: 'system',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    console.log(`✓ Created 3 system config entries`);

    console.log('\n✅ Seed data complete!');
    console.log(`   Organization: ${org.name}`);
    console.log(`   Stores: ${stores.length}`);
    console.log(`   KPIs: ${kpiDefs.length}`);
    console.log(`   Historical Metrics: ${metricsToInsert.length}`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('system_config', null, {});
    await queryInterface.bulkDelete('escalation_rules', null, {});
    await queryInterface.bulkDelete('call_scripts', null, {});
    await queryInterface.bulkDelete('kpi_metrics', null, {});
    await queryInterface.bulkDelete('kpi_thresholds', null, {});
    await queryInterface.bulkDelete('kpi_definitions', null, {});
    await queryInterface.bulkDelete('stores', null, {});
    await queryInterface.bulkDelete('districts', null, {});
    await queryInterface.bulkDelete('regions', null, {});
    await queryInterface.bulkDelete('organizations', null, {});
  }
};
