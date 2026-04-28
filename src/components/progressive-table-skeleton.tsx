'use client';

import React, { useEffect, useState } from 'react';
import { Skeleton } from './skeleton';

export function ProgressiveTableSkeleton({ totalRows = 10 }: { totalRows?: number }) {
  const [visibleRows, setVisibleRows] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleRows(prev => {
        if (prev >= totalRows) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [totalRows]);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
        {[80, 60, 50, 70, 40, 50].map((w, i) => (
          <div key={i} className="flex-1">
            <Skeleton height={12} width={w} rounded="md" />
          </div>
        ))}
      </div>

      {Array.from({ length: visibleRows }).map((_, i) => (
        <div
          key={i}
          className="px-4 py-3.5 flex gap-4 border-b border-gray-50 animate-fade-in"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {[75, 45, 55, 60, 35, 50].map((baseW, j) => (
            <div key={j} className="flex-1">
              <Skeleton
                height={14}
                width={`${baseW}%`}
                rounded="md"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}