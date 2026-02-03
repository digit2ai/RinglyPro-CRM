'use strict';

const { Op } = require('sequelize');
const { KpiMetric, Store, KpiDefinition, StoreHealthSnapshot } = require('../../models');
const { format, startOfDay } = require('date-fns');

/**
 * Threshold Checker Service
 * Monitors KPIs against thresholds and generates health snapshots
 */
class ThresholdCheckerService {
  /**
   * Check all KPIs for a store and generate health snapshot
   * @param {number} storeId - Store ID
   * @param {Date} date - Date to check (defaults to today)
   * @returns {Promise<object>} Store health snapshot
   */
  async checkStoreHealth(storeId, date = new Date()) {
    const snapshotDate = format(startOfDay(date), 'yyyy-MM-dd');

    try {
      // Get all KPI metrics for this store on this date
      const metrics = await KpiMetric.findAll({
        where: {
          store_id: storeId,
          metric_date: snapshotDate
        },
        include: [
          {
            model: KpiDefinition,
            as: 'kpiDefinition',
            attributes: ['id', 'kpi_code', 'name', 'category', 'unit']
          }
        ]
      });

      if (metrics.length === 0) {
        console.log(`No metrics found for store ${storeId} on ${snapshotDate}`);
        return null;
      }

      // Count KPIs by status
      const statusCounts = this.countKpisByStatus(metrics);

      // Determine overall store status
      const overallStatus = this.determineOverallStatus(statusCounts);

      // Calculate health score (0-100)
      const healthScore = this.calculateHealthScore(statusCounts);

      // Determine escalation level
      const escalationLevel = this.determineEscalationLevel(statusCounts);

      // Determine if action is required
      const actionRequired = statusCounts.red > 0 || statusCounts.yellow > 1;

      // Generate AI summary
      const summary = this.generateSummary(metrics, statusCounts, overallStatus);

      // Create or update store health snapshot
      const snapshot = await StoreHealthSnapshot.upsert({
        store_id: storeId,
        snapshot_date: snapshotDate,
        overall_status: overallStatus,
        health_score: healthScore,
        red_kpi_count: statusCounts.red,
        yellow_kpi_count: statusCounts.yellow,
        green_kpi_count: statusCounts.green,
        escalation_level: escalationLevel,
        action_required: actionRequired,
        summary,
        metadata: {
          total_kpis_tracked: metrics.length,
          critical_kpis: this.identifyCriticalKpis(metrics)
        }
      });

      return {
        snapshot: snapshot[0],
        metrics: metrics.map(m => ({
          kpi_code: m.kpiDefinition.kpi_code,
          kpi_name: m.kpiDefinition.name,
          value: m.value,
          variance_pct: m.variance_pct,
          status: m.status,
          category: m.kpiDefinition.category
        }))
      };
    } catch (error) {
      console.error(`Error checking store health for ${storeId}:`, error);
      throw error;
    }
  }

  /**
   * Count KPIs by status (red/yellow/green)
   */
  countKpisByStatus(metrics) {
    return metrics.reduce(
      (counts, metric) => {
        counts[metric.status]++;
        counts.total++;
        return counts;
      },
      { red: 0, yellow: 0, green: 0, total: 0 }
    );
  }

  /**
   * Determine overall store status based on KPI counts
   * Rules per spec:
   * - Any red KPI = overall red
   * - Multiple yellow (2+) in same domain = overall red
   * - Single yellow = overall yellow
   * - All green = overall green
   */
  determineOverallStatus(statusCounts) {
    if (statusCounts.red > 0) {
      return 'red';
    }

    if (statusCounts.yellow >= 2) {
      return 'red'; // Multiple yellows = red per spec
    }

    if (statusCounts.yellow === 1) {
      return 'yellow';
    }

    return 'green';
  }

  /**
   * Calculate health score (0-100)
   * Formula: weighted average based on status
   */
  calculateHealthScore(statusCounts) {
    if (statusCounts.total === 0) return 100;

    const greenWeight = 100;
    const yellowWeight = 60;
    const redWeight = 0;

    const totalScore =
      statusCounts.green * greenWeight +
      statusCounts.yellow * yellowWeight +
      statusCounts.red * redWeight;

    return parseFloat((totalScore / statusCounts.total).toFixed(2));
  }

  /**
   * Determine escalation level (0-4) based on status
   * Per spec:
   * Level 0 = All green
   * Level 1 = Yellow
   * Level 2 = Red or multiple yellow
   * Level 3 = Persistent red (handled by EscalationEngine)
   * Level 4 = Regional escalation (handled by EscalationEngine)
   */
  determineEscalationLevel(statusCounts) {
    if (statusCounts.red > 0 || statusCounts.yellow >= 2) {
      return 2; // Red status
    }

    if (statusCounts.yellow === 1) {
      return 1; // Yellow status
    }

    return 0; // Green status
  }

  /**
   * Identify critical KPIs (labor is most critical per spec)
   */
  identifyCriticalKpis(metrics) {
    return metrics
      .filter(m => m.status === 'red' || (m.status === 'yellow' && m.kpiDefinition.category === 'labor'))
      .map(m => ({
        kpi_code: m.kpiDefinition.kpi_code,
        kpi_name: m.kpiDefinition.name,
        status: m.status,
        variance_pct: m.variance_pct
      }));
  }

  /**
   * Generate AI summary of store health
   */
  generateSummary(metrics, statusCounts, overallStatus) {
    const criticalKpis = metrics.filter(m => m.status === 'red');
    const yellowKpis = metrics.filter(m => m.status === 'yellow');

    if (overallStatus === 'green') {
      return `Store is healthy. All ${statusCounts.total} KPIs are tracking within normal ranges.`;
    }

    if (overallStatus === 'yellow' && yellowKpis.length === 1) {
      const kpi = yellowKpis[0];
      return `Store has one area of concern. ${kpi.kpiDefinition.name} is ${Number(kpi.variance_pct).toFixed(1)}% below target. Review recommended.`;
    }

    if (overallStatus === 'red') {
      const issues = [];

      if (criticalKpis.length > 0) {
        issues.push(
          ...criticalKpis.map(
            m => `${m.kpiDefinition.name} is critical (${Number(m.variance_pct).toFixed(1)}% variance)`
          )
        );
      }

      if (yellowKpis.length > 1) {
        issues.push(`${yellowKpis.length} KPIs below target`);
      }

      return `Store requires immediate attention. ${issues.join('. ')}. Immediate action required.`;
    }

    return `Store health: ${statusCounts.green} green, ${statusCounts.yellow} yellow, ${statusCounts.red} red KPIs.`;
  }

  /**
   * Check health for all active stores
   * @param {Date} date - Date to check
   * @returns {Promise<array>} Array of store health snapshots
   */
  async checkAllStoresHealth(date = new Date()) {
    const stores = await Store.findAll({
      where: { status: 'active' }
    });

    const results = [];

    for (const store of stores) {
      try {
        const health = await this.checkStoreHealth(store.id, date);
        if (health) {
          results.push({
            store_id: store.id,
            store_name: store.name,
            store_code: store.store_code,
            ...health
          });
        }
      } catch (error) {
        console.error(`Failed to check health for store ${store.id}:`, error.message);
        results.push({
          store_id: store.id,
          store_name: store.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get stores requiring action
   * @param {Date} date - Date to check
   * @returns {Promise<array>} Stores with action_required = true
   */
  async getStoresRequiringAction(date = new Date()) {
    const snapshotDate = format(startOfDay(date), 'yyyy-MM-dd');

    const snapshots = await StoreHealthSnapshot.findAll({
      where: {
        snapshot_date: snapshotDate,
        action_required: true
      },
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'store_code', 'name', 'manager_name', 'manager_phone', 'manager_email']
        }
      ],
      order: [['escalation_level', 'DESC'], ['health_score', 'ASC']]
    });

    return snapshots;
  }

  /**
   * Get dashboard overview for date
   */
  async getDashboardOverview(date = new Date()) {
    const snapshotDate = format(startOfDay(date), 'yyyy-MM-dd');

    const snapshots = await StoreHealthSnapshot.findAll({
      where: { snapshot_date: snapshotDate },
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'store_code', 'name']
        }
      ]
    });

    const summary = {
      total_stores: snapshots.length,
      green_stores: snapshots.filter(s => s.overall_status === 'green').length,
      yellow_stores: snapshots.filter(s => s.overall_status === 'yellow').length,
      red_stores: snapshots.filter(s => s.overall_status === 'red').length,
      stores_requiring_action: snapshots.filter(s => s.action_required).length,
      average_health_score: snapshots.reduce((sum, s) => sum + parseFloat(s.health_score), 0) / snapshots.length || 0,
      critical_stores: snapshots
        .filter(s => s.escalation_level >= 2)
        .map(s => ({
          store_id: s.store.id,
          store_code: s.store.store_code,
          store_name: s.store.name,
          overall_status: s.overall_status,
          health_score: s.health_score,
          escalation_level: s.escalation_level
        }))
    };

    return summary;
  }
}

module.exports = new ThresholdCheckerService();
