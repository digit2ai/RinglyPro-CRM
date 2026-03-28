import React from 'react';

export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-dark-700 rounded animate-pulse`} />;
}

export function SkeletonCard() {
  return (
    <div className="card space-y-4">
      <SkeletonLine width="w-1/3" height="h-5" />
      <SkeletonLine width="w-full" />
      <SkeletonLine width="w-2/3" />
      <div className="flex gap-4">
        <SkeletonLine width="w-1/4" height="h-8" />
        <SkeletonLine width="w-1/4" height="h-8" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card">
      <div className="flex gap-4 mb-6">
        <SkeletonLine width="w-1/4" height="h-6" />
        <div className="flex-1" />
        <SkeletonLine width="w-20" height="h-6" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: cols }).map((_, j) => (
              <SkeletonLine key={j} width={j === 0 ? 'w-20' : 'flex-1'} height="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <SkeletonLine width="w-64" height="h-8" />
        <SkeletonLine width="w-48" height="h-4" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="card flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-dark-700 animate-pulse" />
            <div className="flex-1 space-y-2">
              <SkeletonLine width="w-24" height="h-4" />
              <SkeletonLine width="w-16" height="h-3" />
            </div>
          </div>
        ))}
      </div>
      <SkeletonTable />
    </div>
  );
}
