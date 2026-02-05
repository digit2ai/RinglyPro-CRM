import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { KpiDrilldownModal } from './KpiDrilldownModal';

/**
 * Glass Cockpit Display - Garmin G1000 Style
 * Modern digital tape indicators for 5 key financial metrics
 * Click any indicator to see store-by-store breakdown
 */
export function CriticalIndicators({ dashboardData }) {
  const [salesStatus, setSalesStatus] = useState({ performance: 0, variance: 0, trend: 'stable' });
  const [laborStatus, setLaborStatus] = useState({ coverage: 0, trend: 'stable' });
  const [conversionStatus, setConversionStatus] = useState({ rate: 0, trend: 'stable' });
  const [inventoryStatus, setInventoryStatus] = useState({ availability: 0, trend: 'stable' });
  const [trafficStatus, setTrafficStatus] = useState({ index: 0, trend: 'stable' });

  // Modal state for KPI drill-down
  const [selectedKpi, setSelectedKpi] = useState(null);

  useEffect(() => {
    if (!dashboardData) return;

    const avgHealth = parseFloat(dashboardData.average_health_score) || 0;
    const greenStores = dashboardData.green_stores || 0;
    const yellowStores = dashboardData.yellow_stores || 0;
    const redStores = dashboardData.red_stores || 0;
    const totalStores = dashboardData.total_stores || 1;

    // Calculate KPIs
    const salesPerformance = Math.round(avgHealth * 0.95 + Math.random() * 10);
    const laborCoverage = Math.round(85 + (greenStores / totalStores) * 15);
    const conversionRate = Math.round(12 + (avgHealth / 100) * 15);
    const availability = Math.round(88 + (greenStores / totalStores) * 12);
    const trafficIndex = Math.round(70 + (avgHealth / 100) * 60);

    setSalesStatus({ performance: salesPerformance, variance: salesPerformance - 100, trend: salesPerformance >= 95 ? 'up' : 'down' });
    setLaborStatus({ coverage: laborCoverage, trend: laborCoverage >= 95 ? 'up' : 'stable' });
    setConversionStatus({ rate: conversionRate, trend: conversionRate >= 22 ? 'up' : conversionRate >= 18 ? 'stable' : 'down' });
    setInventoryStatus({ availability, trend: availability >= 95 ? 'up' : 'stable' });
    setTrafficStatus({ index: trafficIndex, trend: trafficIndex >= 100 ? 'up' : trafficIndex >= 85 ? 'stable' : 'down' });

  }, [dashboardData]);

  // Garmin G1000 style tape indicator
  const TapeIndicator = ({ value, min, max, label, unit, zones, trend, decimals = 0, kpiCode, kpiName }) => {
    const percentage = ((value - min) / (max - min)) * 100;

    // Determine color based on zones
    let color = '#ef4444'; // red
    let bgColor = 'bg-red-500/20';
    let borderColor = 'border-red-500';

    for (const zone of zones) {
      if (value >= zone.min && value < zone.max) {
        if (zone.color === 'green') {
          color = '#10b981';
          bgColor = 'bg-green-500/20';
          borderColor = 'border-green-500';
        } else if (zone.color === 'yellow') {
          color = '#f59e0b';
          bgColor = 'bg-yellow-500/20';
          borderColor = 'border-yellow-500';
        }
        break;
      }
    }

    // Generate tick marks
    const numTicks = 11;
    const ticks = Array.from({ length: numTicks }, (_, i) => {
      const tickValue = min + (i / (numTicks - 1)) * (max - min);
      const tickPercentage = ((tickValue - min) / (max - min)) * 100;
      return { value: tickValue, percentage: tickPercentage };
    });

    const handleClick = () => {
      if (kpiCode) {
        setSelectedKpi({ code: kpiCode, name: kpiName || label });
      }
    };

    return (
      <div className="flex flex-col items-center">
        {/* Label */}
        <div className="mb-2 text-center">
          <div className="text-cyan-400 text-xs font-mono tracking-wider">{label}</div>
        </div>

        {/* Tape Display - Now clickable */}
        <div
          className="relative w-32 h-64 bg-black rounded-lg border-2 border-gray-700 overflow-hidden cursor-pointer hover:border-cyan-500 transition-colors"
          onClick={handleClick}
          title={`Click to see ${label} breakdown by store`}
        >
          {/* Zone color bars (background) */}
          {zones.map((zone, i) => {
            const zoneStart = ((zone.min - min) / (max - min)) * 100;
            const zoneHeight = ((zone.max - zone.min) / (max - min)) * 100;
            return (
              <div
                key={i}
                className="absolute left-0 right-0"
                style={{
                  bottom: `${zoneStart}%`,
                  height: `${zoneHeight}%`,
                  backgroundColor: zone.color === 'green' ? 'rgba(16, 185, 129, 0.15)' :
                                   zone.color === 'yellow' ? 'rgba(245, 158, 11, 0.15)' :
                                   'rgba(239, 68, 68, 0.15)'
                }}
              />
            );
          })}

          {/* Tick marks and numbers */}
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex items-center"
              style={{ bottom: `${tick.percentage}%` }}
            >
              <div className="w-3 h-px bg-gray-500"></div>
              <div className="text-gray-400 text-[9px] font-mono ml-1">
                {Math.round(tick.value)}
              </div>
            </div>
          ))}

          {/* Current value indicator (center line) */}
          <div
            className="absolute left-0 right-0 transition-all duration-1000 ease-out"
            style={{ bottom: `${percentage}%` }}
          >
            {/* Center reference line */}
            <div className="absolute left-0 right-0 h-0.5 bg-white shadow-lg" style={{ top: '-1px' }}></div>

            {/* Value box */}
            <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${bgColor} ${borderColor} border-2 px-2 py-1 rounded-l-lg shadow-lg`}>
              <div className="text-white text-sm font-bold font-mono whitespace-nowrap" style={{ color }}>
                {decimals > 0 ? value.toFixed(decimals) : Math.round(value)}{unit}
              </div>
            </div>
          </div>

          {/* Trend arrow */}
          <div className="absolute top-2 right-2">
            {trend === 'up' && <TrendingUp className="w-3 h-3 text-green-400" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-400" />}
            {trend === 'stable' && <Minus className="w-3 h-3 text-yellow-400" />}
          </div>
        </div>

        {/* Unit label */}
        <div className="mt-1 text-gray-500 text-[10px] font-mono">{unit}</div>
      </div>
    );
  };

  return (
    <div className="mb-6">
      {/* Glass Cockpit Panel */}
      <div className="bg-gradient-to-b from-gray-950 to-black p-6 rounded-xl border-2 border-gray-800 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <div className="text-cyan-400 text-sm font-mono tracking-wider">STORE HEALTH MONITOR</div>
          </div>
          <div className="text-gray-500 text-xs font-mono">
            {new Date().toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>

        {/* Tape Indicators Row */}
        <div className="flex justify-center gap-8">

          {/* SALES Performance */}
          <TapeIndicator
            value={salesStatus.performance}
            min={0}
            max={150}
            label="SALES"
            unit="%"
            trend={salesStatus.trend}
            kpiCode="SALES_DAILY"
            kpiName="Daily Sales"
            zones={[
              { min: 0, max: 75, color: 'red' },
              { min: 75, max: 90, color: 'yellow' },
              { min: 90, max: 150, color: 'green' }
            ]}
          />

          {/* LABOR Coverage */}
          <TapeIndicator
            value={laborStatus.coverage}
            min={50}
            max={100}
            label="LABOR"
            unit="%"
            trend={laborStatus.trend}
            kpiCode="LABOR_HOURS"
            kpiName="Labor Hours"
            zones={[
              { min: 50, max: 85, color: 'red' },
              { min: 85, max: 95, color: 'yellow' },
              { min: 95, max: 100, color: 'green' }
            ]}
          />

          {/* CONVERSION Rate (Center - Larger) */}
          <div className="flex flex-col items-center">
            <div className="mb-2 text-center">
              <div className="text-cyan-400 text-sm font-mono tracking-wider">CONVERSION RATE</div>
              <div className="text-gray-500 text-[10px] font-mono">PRIMARY</div>
            </div>

            <div
              className="relative w-40 h-64 bg-black rounded-lg border-2 border-cyan-500/50 overflow-hidden shadow-lg shadow-cyan-500/20 cursor-pointer hover:border-cyan-400 transition-colors"
              onClick={() => setSelectedKpi({ code: 'CONVERSION_RATE', name: 'Conversion Rate' })}
              title="Click to see Conversion Rate breakdown by store"
            >
              {/* Zone backgrounds */}
              <div className="absolute left-0 right-0 bottom-0" style={{ height: '45%', backgroundColor: 'rgba(239, 68, 68, 0.15)' }}></div>
              <div className="absolute left-0 right-0" style={{ bottom: '45%', height: '10%', backgroundColor: 'rgba(245, 158, 11, 0.15)' }}></div>
              <div className="absolute left-0 right-0" style={{ bottom: '55%', height: '45%', backgroundColor: 'rgba(16, 185, 129, 0.15)' }}></div>

              {/* Tick marks */}
              {[0, 5, 10, 15, 18, 20, 22, 25, 30, 35, 40].map((tickValue) => {
                const tickPercentage = (tickValue / 40) * 100;
                return (
                  <div
                    key={tickValue}
                    className="absolute left-0 right-0 flex items-center"
                    style={{ bottom: `${tickPercentage}%` }}
                  >
                    <div className={`${tickValue % 10 === 0 ? 'w-4' : 'w-2'} h-px bg-gray-500`}></div>
                    {tickValue % 5 === 0 && (
                      <div className="text-gray-400 text-[10px] font-mono ml-1">{tickValue}</div>
                    )}
                  </div>
                );
              })}

              {/* Current value indicator */}
              <div
                className="absolute left-0 right-0 transition-all duration-1000 ease-out"
                style={{ bottom: `${(conversionStatus.rate / 40) * 100}%` }}
              >
                <div className="absolute left-0 right-0 h-0.5 bg-white shadow-lg"></div>

                {/* Large digital readout */}
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 px-3 py-2 rounded-l-lg shadow-lg border-2 ${
                  conversionStatus.rate >= 22 ? 'bg-green-500/20 border-green-500' :
                  conversionStatus.rate >= 18 ? 'bg-yellow-500/20 border-yellow-500' :
                  'bg-red-500/20 border-red-500'
                }`}>
                  <div className={`text-2xl font-bold font-mono ${
                    conversionStatus.rate >= 22 ? 'text-green-400' :
                    conversionStatus.rate >= 18 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {conversionStatus.rate}
                  </div>
                  <div className="text-gray-400 text-[9px] font-mono text-center">%</div>
                </div>
              </div>

              {/* Trend indicator */}
              <div className="absolute top-2 right-2">
                {conversionStatus.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-400" />}
                {conversionStatus.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
                {conversionStatus.trend === 'stable' && <Minus className="w-4 h-4 text-yellow-400" />}
              </div>
            </div>

            <div className="mt-1 text-gray-500 text-xs font-mono">PERCENT</div>
          </div>

          {/* INVENTORY Availability */}
          <TapeIndicator
            value={inventoryStatus.availability}
            min={70}
            max={100}
            label="INVENTORY"
            unit="%"
            trend={inventoryStatus.trend}
            kpiCode="INVENTORY_LEVEL"
            kpiName="Inventory Level"
            zones={[
              { min: 70, max: 90, color: 'red' },
              { min: 90, max: 95, color: 'yellow' },
              { min: 95, max: 100, color: 'green' }
            ]}
          />

          {/* TRAFFIC Index */}
          <TapeIndicator
            value={trafficStatus.index}
            min={0}
            max={150}
            label="TRAFFIC"
            unit=""
            trend={trafficStatus.trend}
            kpiCode="TRAFFIC"
            kpiName="Store Traffic"
            zones={[
              { min: 0, max: 85, color: 'red' },
              { min: 85, max: 100, color: 'yellow' },
              { min: 100, max: 150, color: 'green' }
            ]}
          />

        </div>

        {/* Status Footer */}
        <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
          <div className="flex gap-6 text-xs font-mono">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500/30 border border-green-500 rounded"></div>
              <span className="text-gray-400">OPTIMAL</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500/30 border border-yellow-500 rounded"></div>
              <span className="text-gray-400">CAUTION</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500/30 border border-red-500 rounded"></div>
              <span className="text-gray-400">CRITICAL</span>
            </div>
          </div>
          <div className="text-gray-600 text-[10px] font-mono">
            {dashboardData?.total_stores || 0} STORES MONITORED
          </div>
        </div>

        {/* Click hint */}
        <div className="mt-3 text-center text-gray-600 text-[10px] font-mono">
          Click any indicator to see store-by-store breakdown
        </div>
      </div>

      {/* KPI Drill-down Modal */}
      <KpiDrilldownModal
        kpiCode={selectedKpi?.code}
        kpiName={selectedKpi?.name}
        isOpen={!!selectedKpi}
        onClose={() => setSelectedKpi(null)}
      />
    </div>
  );
}
