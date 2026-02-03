'use strict';

const { Op } = require('sequelize');
const { KpiMetric, KpiDefinition, KpiThreshold, Store } = require('../../models');
const { subDays, format } = require('date-fns');

/**
 * KPI Calculator Service
 * Calculates KPI values, rolling baselines, variances, and determines status
 */
class KpiCalculatorService {
  /**
   * Calculate and store KPI metric for a specific store and date
   * @param {number} storeId - Store ID
   * @param {string} kpiCode - KPI code (sales, traffic, conversion_rate, etc.)
   * @param {Date} metricDate - Date of the metric
   * @param {number} value - Actual KPI value
   * @param {object} metadata - Additional context
   * @returns {Promise<object>} Created KPI metric with status
   */
  async calculateAndStoreKpi(storeId, kpiCode, metricDate, value, metadata = {}) {
    try {
      // Get KPI definition
      const store = await Store.findByPk(storeId, {
        include: [{ model: require('../../models').Organization, as: 'organization' }]
      });

      if (!store) {
        throw new Error(`Store ${storeId} not found`);
      }

      const kpiDefinition = await KpiDefinition.findOne({
        where: {
          organization_id: store.organization_id,
          kpi_code: kpiCode,
          is_active: true
        }
      });

      if (!kpiDefinition) {
        throw new Error(`KPI definition ${kpiCode} not found for organization ${store.organization_id}`);
      }

      // Get threshold configuration (store-specific or org-level)
      const threshold = await this.getThreshold(store.organization_id, kpiDefinition.id, storeId);

      if (!threshold) {
        throw new Error(`No threshold configured for KPI ${kpiCode}`);
      }

      // Calculate comparison value based on comparison_basis
      const comparisonValue = await this.calculateComparisonBaseline(
        storeId,
        kpiDefinition.id,
        metricDate,
        threshold.comparison_basis
      );

      // Calculate variance percentage
      const variancePct = this.calculateVariance(value, comparisonValue);

      // Determine status (green/yellow/red)
      const status = this.determineStatus(variancePct, threshold);

      // Store the metric
      const kpiMetric = await KpiMetric.create({
        store_id: storeId,
        kpi_definition_id: kpiDefinition.id,
        metric_date: format(new Date(metricDate), 'yyyy-MM-dd'),
        metric_timestamp: new Date(),
        value,
        comparison_value: comparisonValue,
        comparison_type: threshold.comparison_basis,
        variance_pct: variancePct,
        status,
        metadata
      });

      return {
        ...kpiMetric.toJSON(),
        kpi_code: kpiCode,
        kpi_name: kpiDefinition.name,
        threshold: {
          green_min: threshold.green_min,
          yellow_min: threshold.yellow_min,
          red_threshold: threshold.red_threshold
        }
      };
    } catch (error) {
      console.error(`Error calculating KPI ${kpiCode} for store ${storeId}:`, error);
      throw error;
    }
  }

  /**
   * Get applicable threshold for a KPI (store-specific or org-level default)
   */
  async getThreshold(organizationId, kpiDefinitionId, storeId) {
    // Try store-specific threshold first
    let threshold = await KpiThreshold.findOne({
      where: {
        kpi_definition_id: kpiDefinitionId,
        store_id: storeId
      }
    });

    // Fall back to org-level default
    if (!threshold) {
      threshold = await KpiThreshold.findOne({
        where: {
          organization_id: organizationId,
          kpi_definition_id: kpiDefinitionId,
          store_id: null
        }
      });
    }

    return threshold;
  }

  /**
   * Calculate rolling 4-week baseline average
   */
  async calculateRolling4WeekBaseline(storeId, kpiDefinitionId, targetDate) {
    const endDate = subDays(new Date(targetDate), 1); // Day before target
    const startDate = subDays(endDate, 27); // 4 weeks (28 days)

    const metrics = await KpiMetric.findAll({
      where: {
        store_id: storeId,
        kpi_definition_id: kpiDefinitionId,
        metric_date: {
          [Op.between]: [
            format(startDate, 'yyyy-MM-dd'),
            format(endDate, 'yyyy-MM-dd')
          ]
        }
      },
      order: [['metric_date', 'ASC']]
    });

    if (metrics.length === 0) {
      return null;
    }

    const sum = metrics.reduce((acc, m) => acc + parseFloat(m.value), 0);
    return sum / metrics.length;
  }

  /**
   * Calculate same period last year baseline
   */
  async calculateSamePeriodLYBaseline(storeId, kpiDefinitionId, targetDate) {
    const lastYearDate = new Date(targetDate);
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);

    const metric = await KpiMetric.findOne({
      where: {
        store_id: storeId,
        kpi_definition_id: kpiDefinitionId,
        metric_date: format(lastYearDate, 'yyyy-MM-dd')
      }
    });

    return metric ? parseFloat(metric.value) : null;
  }

  /**
   * Calculate comparison baseline based on comparison_basis
   */
  async calculateComparisonBaseline(storeId, kpiDefinitionId, metricDate, comparisonBasis) {
    switch (comparisonBasis) {
      case 'rolling_4w':
        return await this.calculateRolling4WeekBaseline(storeId, kpiDefinitionId, metricDate);

      case 'same_period_ly':
        return await this.calculateSamePeriodLYBaseline(storeId, kpiDefinitionId, metricDate);

      case 'absolute':
        return 0; // For absolute thresholds, no comparison needed

      case 'budget':
        // TODO: Implement budget comparison if budget data is available
        return null;

      default:
        return await this.calculateRolling4WeekBaseline(storeId, kpiDefinitionId, metricDate);
    }
  }

  /**
   * Calculate variance percentage
   */
  calculateVariance(actualValue, baselineValue) {
    if (!baselineValue || baselineValue === 0) {
      return 0;
    }

    return ((actualValue - baselineValue) / baselineValue) * 100;
  }

  /**
   * Determine status based on variance and thresholds
   */
  determineStatus(variancePct, threshold) {
    // For positive thresholds (like labor coverage ratio where higher is better)
    if (threshold.green_min > 0 && threshold.green_min > threshold.red_threshold) {
      if (variancePct >= threshold.green_min) return 'green';
      if (variancePct >= threshold.yellow_min) return 'yellow';
      return 'red';
    }

    // For negative thresholds (like sales variance where closer to 0 or positive is better)
    if (variancePct >= threshold.green_min) return 'green';
    if (variancePct >= threshold.yellow_min) return 'yellow';
    return 'red';
  }

  /**
   * Batch calculate KPIs for a store on a specific date
   * @param {number} storeId - Store ID
   * @param {Date} metricDate - Date of metrics
   * @param {object} kpiValues - Object with kpi_code: value pairs
   */
  async batchCalculateKpis(storeId, metricDate, kpiValues) {
    const results = [];

    for (const [kpiCode, value] of Object.entries(kpiValues)) {
      try {
        const result = await this.calculateAndStoreKpi(storeId, kpiCode, metricDate, value);
        results.push(result);
      } catch (error) {
        console.error(`Failed to calculate ${kpiCode}:`, error.message);
        results.push({
          kpi_code: kpiCode,
          error: error.message,
          success: false
        });
      }
    }

    return results;
  }

  /**
   * Get latest KPI status for a store
   */
  async getLatestKpiStatus(storeId) {
    const metrics = await KpiMetric.findAll({
      where: { store_id: storeId },
      include: [
        {
          model: KpiDefinition,
          as: 'kpiDefinition',
          attributes: ['id', 'kpi_code', 'name', 'category', 'unit']
        }
      ],
      order: [['metric_date', 'DESC']],
      limit: 50
    });

    // Group by KPI and get the latest
    const latestByKpi = {};
    metrics.forEach(metric => {
      const kpiCode = metric.kpiDefinition.kpi_code;
      if (!latestByKpi[kpiCode]) {
        latestByKpi[kpiCode] = metric;
      }
    });

    return Object.values(latestByKpi);
  }
}

module.exports = new KpiCalculatorService();
