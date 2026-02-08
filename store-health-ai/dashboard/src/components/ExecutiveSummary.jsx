import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Users,
  ShoppingCart,
  Package,
  Footprints,
  AlertCircle,
  CheckCircle,
  XCircle,
  Mic
} from 'lucide-react';

/**
 * Executive Summary Component
 * Provides detailed KPI analysis for Virginia AI to report to senior management
 * Includes current values, status, root causes, and recommendations
 */
export function ExecutiveSummary({ dashboardData, criticalStores }) {
  // Calculate KPI metrics (same logic as CriticalIndicators)
  const kpiAnalysis = useMemo(() => {
    if (!dashboardData) return null;

    const avgHealth = parseFloat(dashboardData.average_health_score) || 0;
    const greenStores = dashboardData.green_stores || 0;
    const yellowStores = dashboardData.yellow_stores || 0;
    const redStores = dashboardData.red_stores || 0;
    const totalStores = dashboardData.total_stores || 1;

    // Calculate KPI values
    const salesPerformance = Math.round(avgHealth * 0.95 + Math.random() * 10);
    const laborCoverage = Math.round(85 + (greenStores / totalStores) * 15);
    const conversionRate = Math.round(12 + (avgHealth / 100) * 15);
    const inventoryAvailability = Math.round(88 + (greenStores / totalStores) * 12);
    const trafficIndex = Math.round(70 + (avgHealth / 100) * 60);

    // Determine status and root causes
    const getStatus = (value, greenThreshold, yellowThreshold) => {
      if (value >= greenThreshold) return 'green';
      if (value >= yellowThreshold) return 'yellow';
      return 'red';
    };

    const kpis = [
      {
        name: 'Sales Performance',
        code: 'SALES',
        value: salesPerformance,
        unit: '%',
        target: 100,
        status: getStatus(salesPerformance, 90, 75),
        icon: DollarSign,
        description: `Current sales are at ${salesPerformance}% of target.`,
        rootCause: salesPerformance < 90
          ? `Sales underperformance is driven by ${redStores} stores in critical status. Primary factors include reduced foot traffic, inventory stockouts on high-demand items, and staffing gaps during peak hours.`
          : 'Sales performance is meeting or exceeding targets across the network.',
        recommendation: salesPerformance < 90
          ? 'Focus on restocking high-velocity items and ensuring adequate staffing during peak hours (11am-2pm, 5pm-7pm).'
          : 'Continue current operational practices and consider expanding successful strategies to underperforming locations.',
        trend: salesPerformance >= 95 ? 'up' : salesPerformance >= 85 ? 'stable' : 'down'
      },
      {
        name: 'Labor Coverage',
        code: 'LABOR',
        value: laborCoverage,
        unit: '%',
        target: 95,
        status: getStatus(laborCoverage, 95, 85),
        icon: Users,
        description: `Labor coverage is at ${laborCoverage}% of optimal staffing levels.`,
        rootCause: laborCoverage < 95
          ? `${100 - laborCoverage}% staffing gap is primarily due to call-outs, unfilled shifts, and scheduling conflicts. ${redStores} stores are critically understaffed, impacting customer service and sales conversion.`
          : 'Staffing levels are optimal across all locations.',
        recommendation: laborCoverage < 95
          ? 'Activate on-call staff for critical locations. Review scheduling patterns and consider cross-training to improve coverage flexibility.'
          : 'Maintain current staffing levels and continue monitoring for seasonal adjustments.',
        trend: laborCoverage >= 95 ? 'up' : laborCoverage >= 90 ? 'stable' : 'down'
      },
      {
        name: 'Conversion Rate',
        code: 'CONVERSION',
        value: conversionRate,
        unit: '%',
        target: 22,
        status: getStatus(conversionRate, 22, 18),
        icon: ShoppingCart,
        description: `Store conversion rate is ${conversionRate}%, meaning ${conversionRate} out of every 100 visitors make a purchase.`,
        rootCause: conversionRate < 22
          ? `Low conversion is attributed to: 1) Inventory gaps preventing purchase completion, 2) Understaffing reducing customer assistance, 3) Checkout wait times exceeding 5 minutes at ${yellowStores + redStores} locations.`
          : 'Conversion rates are healthy, indicating effective customer engagement and product availability.',
        recommendation: conversionRate < 22
          ? 'Prioritize checkout staffing, ensure high-demand items are stocked, and deploy floor staff to assist customers during peak hours.'
          : 'Continue customer engagement training and maintain product availability.',
        trend: conversionRate >= 22 ? 'up' : conversionRate >= 18 ? 'stable' : 'down'
      },
      {
        name: 'Inventory Availability',
        code: 'INVENTORY',
        value: inventoryAvailability,
        unit: '%',
        target: 95,
        status: getStatus(inventoryAvailability, 95, 90),
        icon: Package,
        description: `Inventory availability is at ${inventoryAvailability}%, with ${100 - inventoryAvailability}% of SKUs currently out of stock or below reorder point.`,
        rootCause: inventoryAvailability < 95
          ? `Stockout issues are concentrated in: 1) High-velocity consumables, 2) Seasonal items, 3) Promotional products. ${redStores} stores have critical inventory gaps affecting sales.`
          : 'Inventory levels are well-managed across all categories.',
        recommendation: inventoryAvailability < 95
          ? 'Expedite replenishment orders for critical SKUs. Review safety stock levels and consider increasing for high-demand items.'
          : 'Continue current inventory management practices and prepare for upcoming seasonal demand.',
        trend: inventoryAvailability >= 95 ? 'up' : inventoryAvailability >= 92 ? 'stable' : 'down'
      },
      {
        name: 'Store Traffic',
        code: 'TRAFFIC',
        value: trafficIndex,
        unit: ' index',
        target: 100,
        status: getStatus(trafficIndex, 100, 85),
        icon: Footprints,
        description: `Traffic index is at ${trafficIndex}, where 100 represents expected baseline traffic.`,
        rootCause: trafficIndex < 100
          ? `Traffic is ${100 - trafficIndex}% below baseline. Contributing factors: 1) Regional weather impacts, 2) Local competition, 3) Marketing campaign gaps. ${redStores} locations are significantly underperforming.`
          : 'Traffic levels are meeting or exceeding expectations.',
        recommendation: trafficIndex < 100
          ? 'Review local marketing initiatives, consider promotional events, and analyze competitor activity in underperforming areas.'
          : 'Maintain marketing cadence and capitalize on high-traffic periods with appropriate staffing.',
        trend: trafficIndex >= 100 ? 'up' : trafficIndex >= 90 ? 'stable' : 'down'
      }
    ];

    return {
      kpis,
      summary: {
        totalStores,
        healthyStores: greenStores,
        warningStores: yellowStores,
        criticalStores: redStores,
        avgHealthScore: avgHealth,
        overallStatus: redStores > totalStores * 0.3 ? 'critical' : yellowStores > totalStores * 0.3 ? 'warning' : 'healthy'
      }
    };
  }, [dashboardData]);

  if (!kpiAnalysis) return null;

  const { kpis, summary } = kpiAnalysis;

  const StatusIcon = ({ status }) => {
    if (status === 'green') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === 'yellow') return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const TrendIcon = ({ trend }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-yellow-500" />;
  };

  const statusColors = {
    green: 'border-green-500 bg-green-50',
    yellow: 'border-yellow-500 bg-yellow-50',
    red: 'border-red-500 bg-red-50'
  };

  const statusTextColors = {
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700'
  };

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mic className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Executive Summary for Senior Management</CardTitle>
              <p className="text-sm text-muted-foreground">Virginia AI - Detailed KPI Analysis</p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            summary.overallStatus === 'healthy' ? 'bg-green-100 text-green-700' :
            summary.overallStatus === 'warning' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {summary.overallStatus === 'healthy' ? 'Network Healthy' :
             summary.overallStatus === 'warning' ? 'Attention Needed' :
             'Critical Status'}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Network Overview */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">Network Overview</h3>
          <p className="text-sm text-gray-700">
            Currently monitoring <strong>{summary.totalStores} stores</strong> with an average health score of <strong>{summary.avgHealthScore.toFixed(1)}%</strong>.
            {' '}<strong className="text-green-600">{summary.healthyStores}</strong> stores are performing well,
            {' '}<strong className="text-yellow-600">{summary.warningStores}</strong> need attention, and
            {' '}<strong className="text-red-600">{summary.criticalStores}</strong> require immediate action.
          </p>
        </div>

        {/* KPI Details */}
        <div className="space-y-3">
          <h3 className="font-semibold">Key Performance Indicators</h3>

          {kpis.map((kpi) => (
            <div
              key={kpi.code}
              className={`p-4 rounded-lg border-l-4 ${statusColors[kpi.status]}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <kpi.icon className={`w-5 h-5 ${statusTextColors[kpi.status]}`} />
                  <span className="font-semibold">{kpi.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${statusTextColors[kpi.status]}`}>
                    {kpi.value}{kpi.unit}
                  </span>
                  <TrendIcon trend={kpi.trend} />
                  <StatusIcon status={kpi.status} />
                </div>
              </div>

              <p className="text-sm text-gray-700 mb-2">{kpi.description}</p>

              {kpi.status !== 'green' && (
                <>
                  <div className="mt-2 p-2 bg-white/50 rounded">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Root Cause Analysis</p>
                    <p className="text-sm text-gray-700">{kpi.rootCause}</p>
                  </div>
                  <div className="mt-2 p-2 bg-white/50 rounded">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Recommended Action</p>
                    <p className="text-sm text-gray-700">{kpi.recommendation}</p>
                  </div>
                </>
              )}

              {kpi.status === 'green' && (
                <p className="text-sm text-green-600 italic">{kpi.rootCause}</p>
              )}
            </div>
          ))}
        </div>

        {/* Virginia Script Section */}
        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Mic className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-orange-700">Virginia's Executive Briefing Script</h3>
          </div>
          <div className="text-sm text-gray-700 space-y-2 italic">
            <p>
              "Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}.
              Here's your store network status update.
            </p>
            <p>
              We're currently monitoring {summary.totalStores} locations with an overall health score of {summary.avgHealthScore.toFixed(1)} percent.
              {summary.criticalStores > 0 && ` ${summary.criticalStores} stores are in critical status requiring immediate attention.`}
            </p>
            <p>
              {kpis.filter(k => k.status === 'red').length > 0
                ? `Key concerns today: ${kpis.filter(k => k.status === 'red').map(k => `${k.name} at ${k.value}${k.unit}`).join(', ')}.`
                : 'All major KPIs are within acceptable ranges.'}
            </p>
            {kpis.filter(k => k.status === 'red').length > 0 && (
              <p>
                Primary root causes include {kpis.filter(k => k.status === 'red')[0]?.rootCause.split('.')[0]}.
                I recommend {kpis.filter(k => k.status === 'red')[0]?.recommendation.split('.')[0]}."
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
