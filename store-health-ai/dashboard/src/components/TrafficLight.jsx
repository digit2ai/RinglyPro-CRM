import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Traffic Light Component (Horizontal)
 * Visual traffic light indicator showing overall store health status
 * with risk percentage displayed on the active light
 */
export function TrafficLight({ redStores = 0, yellowStores = 0, greenStores = 0, totalStores = 0 }) {
  // Determine active status
  const getActiveStatus = () => {
    if (redStores > 0) return 'red';
    if (yellowStores > 0) return 'yellow';
    return 'green';
  };

  // Calculate risk percentage (stores not green / total)
  const getRiskPercentage = () => {
    if (totalStores === 0) return 0;
    const atRisk = redStores + yellowStores;
    return Math.round((atRisk / totalStores) * 100);
  };

  const activeStatus = getActiveStatus();
  const riskPercentage = getRiskPercentage();

  return (
    <div className="flex items-center gap-3">
      {/* Traffic Light Housing - Horizontal */}
      <div className="relative bg-gray-800 rounded-full px-2 py-1.5 shadow-lg">
        <div className="flex flex-row gap-1.5">
          {/* Red Light */}
          <div
            className={cn(
              'w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center transition-all duration-300',
              activeStatus === 'red'
                ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                : 'bg-red-900/30'
            )}
          >
            {activeStatus === 'red' && (
              <span className="text-[8px] font-bold text-white">{riskPercentage}%</span>
            )}
          </div>

          {/* Yellow Light */}
          <div
            className={cn(
              'w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center transition-all duration-300',
              activeStatus === 'yellow'
                ? 'bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.8)]'
                : 'bg-yellow-900/30'
            )}
          >
            {activeStatus === 'yellow' && (
              <span className="text-[8px] font-bold text-gray-800">{riskPercentage}%</span>
            )}
          </div>

          {/* Green Light */}
          <div
            className={cn(
              'w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center transition-all duration-300',
              activeStatus === 'green'
                ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)]'
                : 'bg-green-900/30'
            )}
          >
            {activeStatus === 'green' && (
              <span className="text-[8px] font-bold text-white">{riskPercentage}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Status Text */}
      <div className="flex flex-col">
        <span
          className={cn(
            'text-sm font-semibold',
            activeStatus === 'red' && 'text-red-500',
            activeStatus === 'yellow' && 'text-yellow-500',
            activeStatus === 'green' && 'text-green-500'
          )}
        >
          {activeStatus === 'red' && 'Critical'}
          {activeStatus === 'yellow' && 'Warning'}
          {activeStatus === 'green' && 'Healthy'}
        </span>
        <span className="text-xs text-muted-foreground">
          {riskPercentage}% at risk
        </span>
      </div>
    </div>
  );
}
