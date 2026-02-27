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

  const usagePercent = minutesTotal > 0 ? (minutesUsed / minutesTotal) * 100 : 0;
  const minutesTrend = usagePercent >= 90 ? 'critical' : usagePercent >= 70 ? 'warn' : 'ok';

  // Format seconds to Xm Xs
  const fmtDur = (s) => {
    if (!s || s <= 0) return '0s';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    if (m === 0) return `${sec}s`;
    if (sec === 0) return `${m}m`;
    return `${m}m ${sec}s`;
  };

  // Determine color for a value within zones
  const getZoneColor = (value, zones) => {
    for (const zone of zones) {
      if (value >= zone.min && value < zone.max) {
        return zone.color;
      }
    }
    const last = zones[zones.length - 1];
    return value >= last.max ? last.color : zones[0].color;
  };

  const colorMap = {
    green: '#10b981',
    yellow: '#f59e0b',
    red: '#ef4444',
    cyan: '#06b6d4',
  };

  // Define zones for each KPI
  const callsMax = Math.max(50, Math.ceil(totalCalls * 1.5 / 25) * 25);
  const callsZones = [
    { min: 0, max: callsMax, color: 'cyan' },
  ];
  const durationZones = [
    { min: 0, max: 30, color: 'red' },
    { min: 30, max: 120, color: 'yellow' },
    { min: 120, max: 600, color: 'green' },
  ];
  const minutesZones = [
    { min: 0, max: minutesTotal * 0.7, color: 'green' },
    { min: minutesTotal * 0.7, max: minutesTotal * 0.9, color: 'yellow' },
    { min: minutesTotal * 0.9, max: minutesTotal, color: 'red' },
  ];
  const todayZones = [
    { min: 0, max: 50, color: 'cyan' },
  ];

  // Tape Indicator component
  const TapeIndicator = ({ value, min, max, label, unit, suffix, icon: Icon, zones, trend, decimals = 0, isPrimary = false }) => {
    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    let color = '#ef4444';
    let bgColor = 'bg-red-500/20';
    let borderColor = 'border-red-500';

    const zoneColor = getZoneColor(value, zones);
    if (zoneColor === 'green') { color = '#10b981'; bgColor = 'bg-green-500/20'; borderColor = 'border-green-500'; }
    else if (zoneColor === 'yellow') { color = '#f59e0b'; bgColor = 'bg-yellow-500/20'; borderColor = 'border-yellow-500'; }
    else if (zoneColor === 'cyan') { color = '#06b6d4'; bgColor = 'bg-cyan-500/20'; borderColor = 'border-cyan-500'; }

    const numTicks = 11;
    const ticks = Array.from({ length: numTicks }, (_, i) => {
      const tickValue = min + (i / (numTicks - 1)) * (max - min);
      const tickPercentage = ((tickValue - min) / (max - min)) * 100;
      return { value: tickValue, percentage: tickPercentage };
    });

    const widthClass = isPrimary ? 'w-16 sm:w-40' : 'w-14 sm:w-32';
    const borderClass = isPrimary
      ? 'border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20'
      : 'border-2 border-gray-700';

    return (
      <div className="flex flex-col items-center flex-1 min-w-0">
        {/* Label */}
        <div className="mb-1 sm:mb-2 text-center">
          {Icon && <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 mx-auto mb-0.5" />}
          <div className="text-cyan-400 text-[9px] sm:text-xs font-mono tracking-wider">{label}</div>
          {isPrimary && <div className="text-gray-500 text-[7px] sm:text-[10px] font-mono hidden sm:block">PRIMARY</div>}
        </div>

        {/* Tape Display */}
        <div className={`relative ${widthClass} h-32 sm:h-60 bg-black rounded-lg ${borderClass} overflow-hidden mx-auto`}>
          {/* Zone color bars */}
          {zones.map((zone, i) => {
            const zoneStart = Math.max(0, ((zone.min - min) / (max - min)) * 100);
            const zoneEnd = Math.min(100, ((zone.max - min) / (max - min)) * 100);
            return (
              <div
                key={i}
                className="absolute left-0 right-0"
                style={{
                  bottom: `${zoneStart}%`,
                  height: `${zoneEnd - zoneStart}%`,
                  backgroundColor: zone.color === 'green' ? 'rgba(16, 185, 129, 0.12)' :
                                   zone.color === 'yellow' ? 'rgba(245, 158, 11, 0.12)' :
                                   zone.color === 'cyan' ? 'rgba(6, 182, 212, 0.08)' :
                                   'rgba(239, 68, 68, 0.12)'
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
              <div className={`${i % 2 === 0 ? 'w-2.5 sm:w-4' : 'w-1 sm:w-2'} h-px bg-gray-600`}></div>
              {i % 2 === 0 && (
                <div className="text-gray-500 text-[6px] sm:text-[9px] font-mono ml-0.5 sm:ml-1 hidden sm:block">
                  {Math.round(tick.value)}
                </div>
              )}
            </div>
          ))}

          {/* Current value indicator */}
          <div
            className="absolute left-0 right-0 transition-all duration-1000 ease-out"
            style={{ bottom: `${Math.max(2, Math.min(95, percentage))}%` }}
          >
            {/* White reference line */}
            <div className="absolute left-0 right-0 h-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]" style={{ top: '-1px' }}></div>

            {/* Value box */}
            <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${bgColor} ${borderColor} border sm:border-2 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-l-lg shadow-lg`}>
              <div className={`${isPrimary ? 'text-sm sm:text-xl' : 'text-[11px] sm:text-sm'} font-bold font-mono whitespace-nowrap`} style={{ color }}>
                {decimals > 0 ? parseFloat(value || 0).toFixed(decimals) : Math.round(parseFloat(value || 0))}
                {suffix && <span className="text-[7px] sm:text-[10px] ml-0.5">{suffix}</span>}
              </div>
              {isPrimary && unit && (
                <div className="text-gray-400 text-[6px] sm:text-[9px] font-mono text-center">{unit}</div>
              )}
            </div>
          </div>

          {/* Trend arrow */}
          <div className="absolute top-1 sm:top-2 right-1 sm:right-2">
            {trend === 'up' && <TrendingUp className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-green-400" />}
            {trend === 'down' && <TrendingDown className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-red-400" />}
            {(trend === 'stable' || trend === 'ok') && <Minus className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-cyan-400" />}
            {trend === 'warn' && <TrendingUp className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-yellow-400" />}
            {trend === 'critical' && <TrendingUp className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-red-400" />}
          </div>
        </div>

        {/* Unit label below tape */}
        <div className="mt-0.5 sm:mt-1 text-gray-500 text-[7px] sm:text-[10px] font-mono">{unit}</div>
      </div>
    );
  };

  // Digital readout card for the summary row
  const DigitalReadout = ({ label, value, unit, icon: Icon, color = '#06b6d4' }) => (
    <div className="flex flex-col items-center p-2 sm:p-3 bg-gray-900/80 rounded-lg border border-gray-800 flex-1 min-w-0">
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color }} />}
        <span className="text-gray-500 text-[8px] sm:text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono font-bold text-lg sm:text-2xl" style={{ color }}>{value}</div>
      {unit && <div className="text-gray-600 text-[7px] sm:text-[9px] font-mono mt-0.5">{unit}</div>}
    </div>
  );

  if (isLoading) {
    return (
      <div className="bg-gradient-to-b from-gray-950 to-black p-4 sm:p-6 rounded-xl border-2 border-gray-800 shadow-2xl">
        <div className="flex items-center justify-center h-48 sm:h-64">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <div className="text-cyan-400 font-mono text-xs sm:text-sm animate-pulse">LOADING INSTRUMENTS...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Glass Cockpit Panel */}
      <div className="bg-gradient-to-b from-gray-950 to-black p-3 sm:p-6 rounded-xl border-2 border-gray-800 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
            <div className="text-cyan-400 text-xs sm:text-sm font-mono tracking-wider font-bold">CALL CENTER</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono">
              <div className={`w-1.5 h-1.5 rounded-full ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
              <span className="text-gray-400">SYS</span>
            </div>
            <div className="text-gray-500 text-[10px] sm:text-xs font-mono">
              {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </div>
          </div>
        </div>

        {/* Digital Readout Summary Row */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 mb-4 sm:mb-6">
          <DigitalReadout
            label="Calls"
            value={totalCalls.toLocaleString()}
            unit="TOTAL"
            icon={Phone}
            color="#06b6d4"
          />
          <DigitalReadout
            label="Avg Dur"
            value={fmtDur(avgDuration)}
            unit="PER CALL"
            icon={Timer}
            color={avgDuration >= 120 ? '#10b981' : avgDuration >= 30 ? '#f59e0b' : avgDuration > 0 ? '#ef4444' : '#06b6d4'}
          />
          <DigitalReadout
            label="Minutes"
            value={Math.round(minutesUsed).toLocaleString()}
            unit={`/ ${minutesTotal.toLocaleString()}`}
            icon={Clock}
            color={usagePercent >= 90 ? '#ef4444' : usagePercent >= 70 ? '#f59e0b' : '#10b981'}
          />
          <DigitalReadout
            label="Today"
            value={callsToday.toLocaleString()}
            unit="CALLS"
            icon={PhoneCall}
            color="#06b6d4"
          />
        </div>

        {/* Tape Indicators Row */}
        <div className="flex gap-2 sm:gap-6 pb-3 justify-center">
          <TapeIndicator
            value={totalCalls}
            min={0}
            max={callsMax}
            label="CALLS"
            unit="TOTAL"
            icon={Phone}
            trend={totalCalls > 0 ? 'up' : 'stable'}
            zones={callsZones}
          />

          <TapeIndicator
            value={avgDuration}
            min={0}
            max={600}
            label="AVG DUR"
            unit="SECONDS"
            suffix="s"
            icon={Timer}
            trend={avgDuration >= 120 ? 'up' : avgDuration >= 30 ? 'stable' : 'down'}
            zones={durationZones}
          />

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
            zones={minutesZones}
          />

          <TapeIndicator
            value={callsToday}
            min={0}
            max={50}
            label="TODAY"
            unit="CALLS"
            icon={PhoneCall}
            trend={callsToday >= 5 ? 'up' : callsToday >= 1 ? 'stable' : 'down'}
            zones={todayZones}
          />
        </div>

        {/* Usage Progress Bar */}
        <div className="pt-3 sm:pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-gray-400 text-[10px] sm:text-xs font-mono tracking-wider">USAGE</div>
            <div className="font-mono text-[10px] sm:text-xs font-bold" style={{
              color: usagePercent >= 90 ? '#ef4444' : usagePercent >= 70 ? '#f59e0b' : '#10b981'
            }}>
              {usagePercent.toFixed(1)}%
            </div>
          </div>
          <div className="w-full h-2.5 sm:h-3.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(1, Math.min(usagePercent, 100))}%`,
                background: usagePercent >= 90
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : usagePercent >= 70
                  ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                  : 'linear-gradient(90deg, #10b981, #059669)',
                boxShadow: `0 0 10px ${usagePercent >= 90 ? 'rgba(239,68,68,0.5)' : usagePercent >= 70 ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.4)'}`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <div className="text-gray-500 text-[9px] sm:text-[11px] font-mono">
              {Math.round(minutesUsed)} MIN USED
            </div>
            <div className="text-gray-500 text-[9px] sm:text-[11px] font-mono">
              {Math.round(Math.max(0, minutesTotal - minutesUsed))} MIN REMAINING
            </div>
          </div>
        </div>

        {/* Status Footer */}
        <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
          <div className="flex gap-4 sm:gap-6 text-[10px] sm:text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500/30 border border-green-500 rounded shadow-[0_0_4px_rgba(16,185,129,0.3)]"></div>
              <span className="text-gray-400">OK</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-500/30 border border-yellow-500 rounded shadow-[0_0_4px_rgba(245,158,11,0.3)]"></div>
              <span className="text-gray-400">WARN</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500/30 border border-red-500 rounded shadow-[0_0_4px_rgba(239,68,68,0.3)]"></div>
              <span className="text-gray-400">LIMIT</span>
            </div>
          </div>
          <div className="text-gray-600 text-[9px] sm:text-[10px] font-mono">
            {minutesTotal.toLocaleString()} MIN PLAN
          </div>
        </div>
      </div>
    </div>
  );
}
