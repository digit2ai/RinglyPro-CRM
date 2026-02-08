#!/usr/bin/env node
/**
 * Seed alerts and tasks based on current store health data
 * Run: node seed-alerts-tasks.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false
});

async function seedAlertsAndTasks() {
  console.log('🚨 Seeding Alerts and Tasks...\n');

  try {
    // Get critical stores (red status)
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

    console.log(`Found ${stores.length} stores needing alerts\n`);

    // Get KPI definitions
    const [kpiDefs] = await sequelize.query(`
      SELECT id, kpi_code, name FROM kpi_definitions LIMIT 5
    `);

    const kpiMap = {};
    kpiDefs.forEach(k => kpiMap[k.kpi_code] = k);

    // Alert templates (severity: info, warning, critical)
    const alertTemplates = [
      {
        kpi: 'SALES_DAILY',
        title: 'Sales Below Target',
        message: (store, value) => `${store.name} sales are ${value}% below daily target. Immediate attention required.`,
        severity: 'critical'
      },
      {
        kpi: 'LABOR_HOURS',
        title: 'Staffing Coverage Critical',
        message: (store, value) => `${store.name} is understaffed by ${value}%. Customer service may be impacted.`,
        severity: 'warning'
      },
      {
        kpi: 'INVENTORY_LEVEL',
        title: 'Inventory Stockout Alert',
        message: (store, value) => `${store.name} has ${value}% of key SKUs out of stock. Replenishment needed.`,
        severity: 'critical'
      },
      {
        kpi: 'CONVERSION_RATE',
        title: 'Low Conversion Rate',
        message: (store, value) => `${store.name} conversion rate dropped to ${value}%. Review staffing and inventory.`,
        severity: 'warning'
      },
      {
        kpi: 'TRAFFIC',
        title: 'Traffic Below Baseline',
        message: (store, value) => `${store.name} traffic is ${value}% below expected baseline.`,
        severity: 'warning'
      }
    ];

    let alertCount = 0;
    let taskCount = 0;

    for (const store of stores) {
      // Create 1-3 alerts per critical store
      const numAlerts = store.status === 'red' ? 3 : 1;

      for (let i = 0; i < numAlerts && i < alertTemplates.length; i++) {
        const template = alertTemplates[i];
        const kpiDef = kpiMap[template.kpi];
        if (!kpiDef) continue;

        const variance = Math.round(15 + Math.random() * 20);
        const severity = store.status === 'red' ? 'critical' : template.severity;

        // Insert alert
        await sequelize.query(`
          INSERT INTO alerts (
            store_id, kpi_definition_id, alert_type, severity, escalation_level, status,
            title, message, requires_acknowledgment, alert_date, triggered_at, expires_at,
            created_at, updated_at
          ) VALUES (
            :store_id, :kpi_def_id, 'threshold_breach', :severity, :escalation_level, 'open',
            :title, :message, true, CURRENT_DATE, CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP + INTERVAL '24 hours',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `, {
          replacements: {
            store_id: store.id,
            kpi_def_id: kpiDef.id,
            severity: severity,
            escalation_level: store.escalation_level || 1,
            title: template.title,
            message: template.message(store, variance)
          }
        });
        alertCount++;
        console.log(`  ✅ Alert: ${template.title} for ${store.name}`);
      }

      // Create task for each red store
      if (store.status === 'red') {
        const taskTemplates = [
          {
            title: `Contact ${store.manager_name || 'Store Manager'} at ${store.name}`,
            description: `Follow up on critical KPI issues. Store health score is ${store.health_score}%. Review root causes and action plan.`,
            priority: 'urgent',
            role: 'District Manager'
          },
          {
            title: `Review Inventory at ${store.name}`,
            description: 'Check stockout items and expedite replenishment orders for critical SKUs.',
            priority: 'high',
            role: 'Inventory Manager'
          },
          {
            title: `Staffing Review for ${store.name}`,
            description: 'Analyze scheduling gaps and call-out patterns. Consider activating on-call staff.',
            priority: 'high',
            role: 'HR Manager'
          }
        ];

        for (const task of taskTemplates) {
          await sequelize.query(`
            INSERT INTO tasks (
              store_id, task_type, title, description, priority,
              status, assigned_to_role, due_date, created_at, updated_at
            ) VALUES (
              :store_id, 'action', :title, :description, :priority,
              'open', :role, CURRENT_DATE + INTERVAL '2 days',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `, {
            replacements: {
              store_id: store.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              role: task.role
            }
          });
          taskCount++;
          console.log(`  📋 Task: ${task.title}`);
        }
      }
    }

    console.log(`\n✅ Seeded ${alertCount} alerts and ${taskCount} tasks`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

seedAlertsAndTasks()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
