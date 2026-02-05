import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { X, TrendingUp, TrendingDown, Minus, Store, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * KPI Drill-down Modal
 * Shows detailed breakdown of a KPI by store
 */
export function KpiDrilldownModal({ kpiCode, kpiName, isOpen, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['kpi-breakdown', kpiCode],
    queryFn: () => dashboardApi.getKpiBreakdown(kpiCode),
    enabled: isOpen && !!kpiCode,
  });

  if (!isOpen) return null;

  const breakdown = data?.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-950">
          <div>
            <h2 className="text-lg font-bold text-white">{kpiName} Breakdown</h2>
            <p className="text-sm text-gray-400">Store-by-store performance analysis</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-400">
              Failed to load data
            </div>
          ) : breakdown ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {breakdown.summary.overall_performance}%
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Overall Performance</div>
                </div>
                <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {breakdown.summary.green_stores}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">On Target</div>
                </div>
                <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {breakdown.summary.yellow_stores}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Warning</div>
                </div>
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {breakdown.summary.red_stores}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Critical</div>
                </div>
              </div>

              {/* Store List */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-400 mb-3">
                  Store Performance (worst to best)
                </div>
                {breakdown.stores.map((store) => (
                  <div
                    key={store.store_id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg border transition-colors',
                      store.status === 'green' && 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20',
                      store.status === 'yellow' && 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20',
                      store.status === 'red' && 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Status icon */}
                      {store.status === 'green' && <CheckCircle className="w-5 h-5 text-green-400" />}
                      {store.status === 'yellow' && <AlertTriangle className="w-5 h-5 text-yellow-400" />}
                      {store.status === 'red' && <AlertTriangle className="w-5 h-5 text-red-400" />}

                      <div>
                        <div className="font-medium text-white">{store.store_name}</div>
                        <div className="text-xs text-gray-400">{store.store_code} • {store.location}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Variance */}
                      <div className="text-right">
                        <div className={cn(
                          'text-lg font-bold',
                          store.variance_pct >= -10 && 'text-green-400',
                          store.variance_pct < -10 && store.variance_pct >= -25 && 'text-yellow-400',
                          store.variance_pct < -25 && 'text-red-400'
                        )}>
                          {store.variance_pct >= 0 ? '+' : ''}{store.variance_pct.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-400">variance</div>
                      </div>

                      {/* Performance bar */}
                      <div className="w-24">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all',
                              store.status === 'green' && 'bg-green-500',
                              store.status === 'yellow' && 'bg-yellow-500',
                              store.status === 'red' && 'bg-red-500'
                            )}
                            style={{ width: `${Math.max(0, Math.min(100, store.performance))}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 text-center mt-1">
                          {store.performance}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-950">
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>Data as of {breakdown?.date || 'today'}</span>
            <span>Click outside or press ESC to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
