'use strict';

const { Op } = require('sequelize');
const { Store, KpiDefinition, KpiMetric, StoreHealthSnapshot } = require('../../models');
const { format, subDays } = require('date-fns');

/**
 * Seed Service
 * Generates dummy KPI metrics and health snapshots for testing
 */
class SeedService {
  /**
   * Generate 30 days of KPI metrics and health snapshots for all stores
   */
  async generateSeedData() {
    console.log('Starting seed data generation...');

    const stores = await Store.findAll({ where: { status: 'active' } });
    const kpiDefinitions = await KpiDefinition.findAll();

    if (stores.length === 0) {
      console.log('No stores found');
      return { success: false, message: 'No stores found' };
    }

    if (kpiDefinitions.length === 0) {
      console.log('No KPI definitions found');
      return { success: false, message: 'No KPI definitions found' };
    }

    console.log(`Found ${stores.length} stores and ${kpiDefinitions.length} KPI definitions`);

    let metricsCreated = 0;
    let snapshotsCreated = 0;

    // Generate data for the last 30 days
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const currentDate = subDays(new Date(), dayOffset);
      const metricDate = format(currentDate, 'yyyy-MM-dd');

      console.log(`Generating data for ${metricDate}...`);

      for (const store of stores) {
        const metrics = [];

        // Generate metrics for each KPI
        for (const kpiDef of kpiDefinitions) {
          const targetValue = parseFloat(kpiDef.target_value) || 100;

          // Generate a value with some variance (70-120% of target)
          const variance = 0.7 + Math.random() * 0.5;
          const value = targetValue * variance;
          const variancePct = ((value - targetValue) / targetValue) * 100;

          // Determine status based on variance
          let status;
          if (variancePct >= -10) {
            status = 'green';
          } else if (variancePct >= -25) {
            status = 'yellow';
          } else {
            status = 'red';
          }

          try {
            const [metric, created] = await KpiMetric.findOrCreate({
              where: {
                store_id: store.id,
                kpi_definition_id: kpiDef.id,
                metric_date: metricDate
              },
              defaults: {
                value: value.toFixed(2),
                comparison_value: targetValue,
                variance_pct: variancePct.toFixed(2),
                status,
                data_source: 'seed'
              }
            });

            if (created) metricsCreated++;
            metrics.push({ status, variancePct });
          } catch (err) {
            console.error(`Error creating metric: ${err.message}`);
          }
        }

        // Create health snapshot based on metrics
        const statusCounts = metrics.reduce(
          (acc, m) => {
            acc[m.status]++;
            return acc;
          },
          { green: 0, yellow: 0, red: 0 }
        );

        // Determine overall status
        let overallStatus;
        if (statusCounts.red > 0 || statusCounts.yellow >= 2) {
          overallStatus = 'red';
        } else if (statusCounts.yellow === 1) {
          overallStatus = 'yellow';
        } else {
          overallStatus = 'green';
        }

        // Calculate health score
        const total = statusCounts.green + statusCounts.yellow + statusCounts.red;
        const healthScore = total > 0
          ? (statusCounts.green * 100 + statusCounts.yellow * 60 + statusCounts.red * 0) / total
          : 100;

        // Determine escalation level
        let escalationLevel = 0;
        if (statusCounts.red > 0 || statusCounts.yellow >= 2) {
          escalationLevel = 2;
        } else if (statusCounts.yellow === 1) {
          escalationLevel = 1;
        }

        // Determine if action required
        const actionRequired = statusCounts.red > 0 || statusCounts.yellow > 1;

        try {
          const [snapshot, created] = await StoreHealthSnapshot.findOrCreate({
            where: {
              store_id: store.id,
              snapshot_date: metricDate
            },
            defaults: {
              overall_status: overallStatus,
              health_score: healthScore.toFixed(2),
              green_kpi_count: statusCounts.green,
              yellow_kpi_count: statusCounts.yellow,
              red_kpi_count: statusCounts.red,
              escalation_level: escalationLevel,
              action_required: actionRequired,
              summary: this.generateSummary(statusCounts, overallStatus)
            }
          });

          if (created) snapshotsCreated++;
        } catch (err) {
          console.error(`Error creating snapshot: ${err.message}`);
        }
      }
    }

    console.log(`Seed complete: ${metricsCreated} metrics, ${snapshotsCreated} snapshots created`);

    return {
      success: true,
      message: `Seed data generated successfully`,
      stats: {
        stores: stores.length,
        days: 30,
        metricsCreated,
        snapshotsCreated
      }
    };
  }

  generateSummary(statusCounts, overallStatus) {
    const total = statusCounts.green + statusCounts.yellow + statusCounts.red;

    if (overallStatus === 'green') {
      return `Store is healthy. All ${total} KPIs are within normal ranges.`;
    }

    if (overallStatus === 'yellow') {
      return `Store has ${statusCounts.yellow} KPI(s) below target. Review recommended.`;
    }

    return `Store requires attention. ${statusCounts.red} critical and ${statusCounts.yellow} warning KPI(s).`;
  }
}

module.exports = new SeedService();
