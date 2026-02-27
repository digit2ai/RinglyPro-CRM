import React from 'react';
import { TrendingUp, TrendingDown, Minus, Phone, Clock, Timer, PhoneCall } from 'lucide-react';

/**
 * Glass Cockpit Display for Web Call Center
 * Garmin G1000-inspired tape indicators for call center KPIs
 */
export function CallCenterCockpit({ stats, isLoading }) {
  const totalCalls = stats?.totalCalls || 0;
  const minutesUsed = stats?.minutesUsed || 0;
  const minutesTotal = stats?.minutesTotal || 1000;
  const avgDuration = stats?.avgDuration || 0;
  const callsToday = stats?.callsToday || 0;

  // Calculate usage percentage for minutes
  const usagePercent = minutesTotal > 0 ? (minutesUsed / minutesTotal) * 100 : 0;

  // Determine trends based on data
  const minutesTrend = usagePercent >= 90 ? 'critical' : usagePercent >= 70 ? 'warn' : 'ok';
  const callsTodayTrend = callsToday >= 5 ? 'up' : callsToday >= 1 ? 'stable' : 'down';

  // Tape Indicator component
  const TapeIndicator = ({ value, min, max, label, unit, suffix, icon: Icon, zones, trend, decimals = 0, isPrimary = false }) => {
    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    // Determine color based on zones
    let color = '#ef4444';
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
        } else if (zone.color === 'cyan') {
          color = '#06b6d4';
          bgColor = 'bg-cyan-500/20';
          borderColor = 'border-cyan-500';
        }
        break;
      }
    }
    // Also check the last zone (value >= zone.max of last zone)
    const lastZone = zones[zones.length - 1];
    if (value >= lastZone.max) {
      if (lastZone.color === 'green') {
        color = '#10b981';
        bgColor = 'bg-green-500/20';
        borderColor = 'border-green-500';
      } else if (lastZone.color === 'red') {
        color = '#ef4444';
        bgColor = 'bg-red-500/20';
        borderColor = 'border-red-500';
      }
    }

    // Generate tick marks
    const numTicks = 11;
    const ticks = Array.from({ length: numTicks }, (_, i) => {
      const tickValue = min + (i / (numTicks - 1)) * (max - min);
      const tickPercentage = ((tickValue - min) / (max - min)) * 100;
      return { value: tickValue, percentage: tickPercentage };
    });

    const widthClass = isPrimary ? 'w-14 sm:w-40' : 'w-12 sm:w-32';
    const heightClass = isPrimary ? 'h-28 sm:h-64' : 'h-28 sm:h-64';
    const borderClass = isPrimary
      ? 'border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20'
      : 'border-2 border-gray-700';

    return (
      <div className="flex flex-col items-center flex-shrink-0">
        {/* Icon + Label */}
        <div className="mb-1 sm:mb-2 text-center">
          {Icon && <Icon className="w-3 h-3 sm:w-4 sm:h-4 text-cyan-400 mx-auto mb-0.5" />}
          <div className="text-cyan-400 text-[8px] sm:text-xs font-mono tracking-wider">{label}</div>
          {isPrimary && <div className="text-gray-500 text-[8px] sm:text-[10px] font-mono hidden sm:block">PRIMARY</div>}
        </div>

        {/* Tape Display */}
        <div className={`relative ${widthClass} ${heightClass} bg-black rounded-lg ${borderClass} overflow-hidden`}>
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
                                   zone.color === 'cyan' ? 'rgba(6, 182, 212, 0.15)' :
                                   'rgba(239, 68, 68, 0.15)'
                }}
              />
            );
          })}

          {/* Tick marks */}
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex items-center"
              style={{ bottom: `${tick.percentage}%` }}
            >
              <div className={`${i % 2 === 0 ? 'w-2 sm:w-3' : 'w-1 sm:w-2'} h-px bg-gray-500`}></div>
              {i % 2 === 0 && (
                <div className="text-gray-400 text-[7px] sm:text-[9px] font-mono ml-0.5 sm:ml-1 hidden sm:block">
                  {Math.round(tick.value)}
                </div>
              )}
            </div>
          ))}

          {/* Current value indicator */}
          <div
            className="absolute left-0 right-0 transition-all duration-1000 ease-out"
            style={{ bottom: `${percentage}%` }}
          >
            {/* Center reference line */}
            <div className="absolute left-0 right-0 h-0.5 bg-white shadow-lg" style={{ top: '-1px' }}></div>

            {/* Value box */}
            <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${bgColor} ${borderColor} border sm:border-2 px-1 sm:px-2 py-0.5 sm:py-1 rounded-l-lg shadow-lg`}>
              <div className={`${isPrimary ? 'text-base sm:text-2xl' : 'text-xs sm:text-sm'} font-bold font-mono whitespace-nowrap`} style={{ color }}>
                {decimals > 0 ? parseFloat(value || 0).toFixed(decimals) : Math.round(parseFloat(value || 0))}
                {suffix && <span className="text-[8px] sm:text-xs ml-0.5">{suffix}</span>}
              </div>
              {isPrimary && unit && (
                <div className="text-gray-400 text-[7px] sm:text-[9px] font-mono text-center">{unit}</div>
              )}
            </div>
          </div>

          {/* Trend arrow */}
          <div className="absolute top-1 sm:top-2 right-1 sm:right-2">
            {trend === 'up' && <TrendingUp className="w-2 h-2 sm:w-3 sm:h-3 text-green-400" />}
            {trend === 'down' && <TrendingDown className="w-2 h-2 sm:w-3 sm:h-3 text-red-400" />}
            {(trend === 'stable' || trend === 'ok') && <Minus className="w-2 h-2 sm:w-3 sm:h-3 text-cyan-400" />}
            {trend === 'warn' && <TrendingUp className="w-2 h-2 sm:w-3 sm:h-3 text-yellow-400" />}
            {trend === 'critical' && <TrendingUp className="w-2 h-2 sm:w-3 sm:h-3 text-red-400" />}
          </div>
        </div>

        {/* Unit label */}
        <div className="mt-0.5 sm:mt-1 text-gray-500 text-[8px] sm:text-[10px] font-mono">{unit}</div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-gradient-to-b from-gray-950 to-black p-3 sm:p-6 rounded-xl border-2 border-gray-800 shadow-2xl">
        <div className="flex items-center justify-center h-64">
          <div className="text-cyan-400 font-mono text-sm animate-pulse">LOADING INSTRUMENTS...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {/* Glass Cockpit Panel */}
      <div className="bg-gradient-to-b from-gray-950 to-black p-3 sm:p-6 rounded-xl border-2 border-gray-800 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <div className="text-cyan-400 text-xs sm:text-sm font-mono tracking-wider">CALL CENTER</div>
          </div>
          <div className="text-gray-500 text-[10px] sm:text-xs font-mono">
            {new Date().toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>

        {/* Tape Indicators Row */}
        <div className="flex justify-between sm:justify-center gap-1 sm:gap-8 pb-2">

          {/* TOTAL CALLS */}
          <TapeIndicator
            value={totalCalls}
            min={0}
            max={Math.max(100, Math.ceil(totalCalls * 1.5 / 50) * 50)}
            label="CALLS"
            unit="TOTAL"
            icon={Phone}
            trend={totalCalls > 0 ? 'up' : 'stable'}
            zones={[
              { min: 0, max: Math.max(100, Math.ceil(totalCalls * 1.5 / 50) * 50) * 0.25, color: 'cyan' },
              { min: Math.max(100, Math.ceil(totalCalls * 1.5 / 50) * 50) * 0.25, max: Math.max(100, Math.ceil(totalCalls * 1.5 / 50) * 50) * 0.6, color: 'cyan' },
              { min: Math.max(100, Math.ceil(totalCalls * 1.5 / 50) * 50) * 0.6, max: Math.max(100, Math.ceil(totalCalls * 1.5 / 50) * 50), color: 'green' },
            ]}
          />

          {/* AVG DURATION */}
          <TapeIndicator
            value={avgDuration}
            min={0}
            max={600}
            label="AVG DUR"
            unit="SECONDS"
            suffix="s"
            icon={Timer}
            trend={avgDuration >= 120 ? 'up' : avgDuration >= 30 ? 'stable' : 'down'}
            zones={[
              { min: 0, max: 30, color: 'red' },
              { min: 30, max: 120, color: 'yellow' },
              { min: 120, max: 600, color: 'green' },
            ]}
          />

          {/* MINUTES USED - Primary Center Indicator */}
          <TapeIndicator
            value={minutesUsed}
            min={0}
            max={minutesTotal}
            label="MINUTES"
            unit={`/ ${minutesTotal}`}
            icon={Clock}
            isPrimary={true}
            trend={minutesTrend}
            decimals={1}
            zones={[
              { min: 0, max: minutesTotal * 0.7, color: 'green' },
              { min: minutesTotal * 0.7, max: minutesTotal * 0.9, color: 'yellow' },
              { min: minutesTotal * 0.9, max: minutesTotal, color: 'red' },
            ]}
          />

          {/* CALLS TODAY */}
          <TapeIndicator
            value={callsToday}
            min={0}
            max={50}
            label="TODAY"
            unit="CALLS"
            icon={PhoneCall}
            trend={callsTodayTrend}
            zones={[
              { min: 0, max: 5, color: 'cyan' },
              { min: 5, max: 20, color: 'green' },
              { min: 20, max: 50, color: 'green' },
            ]}
          />
        </div>

        {/* Usage Bar */}
        <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-gray-400 text-[10px] sm:text-xs font-mono">USAGE</div>
            <div className="font-mono text-[10px] sm:text-xs" style={{
              color: usagePercent >= 90 ? '#ef4444' : usagePercent >= 70 ? '#f59e0b' : '#10b981'
            }}>
              {usagePercent.toFixed(1)}%
            </div>
          </div>
          <div className="w-full h-2 sm:h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.min(usagePercent, 100)}%`,
                backgroundColor: usagePercent >= 90 ? '#ef4444' : usagePercent >= 70 ? '#f59e0b' : '#10b981',
                boxShadow: `0 0 8px ${usagePercent >= 90 ? 'rgba(239,68,68,0.5)' : usagePercent >= 70 ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)'}`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <div className="text-gray-500 text-[9px] sm:text-[10px] font-mono">
              {Math.round(minutesUsed)} MIN USED
            </div>
            <div className="text-gray-500 text-[9px] sm:text-[10px] font-mono">
              {Math.round(Math.max(0, minutesTotal - minutesUsed))} MIN REMAINING
            </div>
          </div>
        </div>

        {/* Status Footer */}
        <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
          <div className="flex gap-3 sm:gap-6 text-[10px] sm:text-xs font-mono">
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-500/30 border border-green-500 rounded"></div>
              <span className="text-gray-400">OK</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-yellow-500/30 border border-yellow-500 rounded"></div>
              <span className="text-gray-400">WARN</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-red-500/30 border border-red-500 rounded"></div>
              <span className="text-gray-400">LIMIT</span>
            </div>
          </div>
          <div className="text-gray-600 text-[9px] sm:text-[10px] font-mono">
            {minutesTotal} MIN PLAN
          </div>
        </div>
      </div>
    </div>
  );
}
