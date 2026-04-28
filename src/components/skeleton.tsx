'use client';

import React from 'react';

export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
}) {
  const roundedMap = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    full: 'rounded-full',
  };

  return (
    <div
      className={`bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer ${roundedMap[rounded]} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton
            height={14}
            width={i === 0 ? '70%' : i === 1 ? '40%' : '50%'}
            rounded="md"
          />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1">
            <Skeleton height={12} width={i === 0 ? 80 : 60} rounded="md" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex gap-4 items-center" style={{ opacity: 1 - (i * 0.06) }}>
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="flex-1">
                <Skeleton
                  height={14}
                  width={j === 0 ? '65%' : '45%'}
                  rounded="md"
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton height={14} width={100} rounded="md" />
        <Skeleton height={32} width={32} rounded="lg" />
      </div>
      <Skeleton height={32} width={80} rounded="md" />
      <div className="flex items-center gap-2">
        <Skeleton height={10} width={60} rounded="full" />
        <Skeleton height={10} width={80} rounded="md" />
      </div>
    </div>
  );
}

export function DashboardSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <DashboardCardSkeleton key={i} />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-6">
          <Skeleton height={18} width={140} rounded="md" />
          <div className="flex gap-2">
            <Skeleton height={30} width={60} rounded="lg" />
            <Skeleton height={30} width={60} rounded="lg" />
          </div>
        </div>
        <Skeleton height={240} width="100%" rounded="lg" />
      </div>
    </div>
  );
}

export function KanbanColumnSkeleton() {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col rounded-xl bg-gray-50/50">
      <div className="px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton height={10} width={10} rounded="full" />
          <Skeleton height={14} width={80} rounded="md" />
        </div>
        <Skeleton height={18} width={24} rounded="full" />
      </div>
      <div className="px-2 py-1 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 space-y-2.5">
            <Skeleton height={14} width="70%" rounded="md" />
            <div className="flex items-center justify-between">
              <Skeleton height={18} width={60} rounded="full" />
              <Skeleton height={24} width={24} rounded="full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton height={10} width={40} rounded="md" />
              <Skeleton height={10} width={40} rounded="md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: columns }).map((_, i) => (
        <KanbanColumnSkeleton key={i} />
      ))}
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
      <div className="flex items-center gap-4">
        <Skeleton height={28} width={140} rounded="md" />
        <div className="flex gap-1">
          <Skeleton height={32} width={80} rounded="lg" />
          <Skeleton height={32} width={80} rounded="lg" />
          <Skeleton height={32} width={80} rounded="lg" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton height={32} width={180} rounded="lg" />
        <Skeleton height={32} width={32} rounded="lg" />
        <Skeleton height={32} width={32} rounded="full" />
      </div>
    </div>
  );
}

export function PageSkeleton({ view = 'table' }: { view?: 'table' | 'kanban' | 'dashboard' }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderSkeleton />
      <div className="p-6">
        {view === 'table' && <TableSkeleton />}
        {view === 'kanban' && <KanbanSkeleton />}
        {view === 'dashboard' && <DashboardSkeleton />}
      </div>
    </div>
  );
}