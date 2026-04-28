'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export function AnimatedCounter({
  value,
  duration = 800,
  className = '',
  prefix = '',
  suffix = '',
}: {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + (end - start) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    prevValue.current = value;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}{displayValue.toLocaleString('ru-RU')}{suffix}
    </span>
  );
}

export function AnimatedProgressBar({
  value,
  max = 100,
  height = 6,
  colorScheme = 'auto',
  showLabel = false,
  className = '',
}: {
  value: number;
  max?: number;
  height?: number;
  colorScheme?: 'auto' | 'green' | 'yellow' | 'red' | 'indigo';
  showLabel?: boolean;
  className?: string;
}) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setWidth(percentage);
    });
    return () => cancelAnimationFrame(timer);
  }, [percentage]);

  const getColor = () => {
    if (colorScheme !== 'auto') return colorScheme;
    if (percentage >= 80) return 'green';
    if (percentage >= 50) return 'yellow';
    return 'red';
  };

  const colorMap = {
    green: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
    yellow: 'bg-gradient-to-r from-amber-400 to-amber-500',
    red: 'bg-gradient-to-r from-red-400 to-red-500',
    indigo: 'bg-gradient-to-r from-indigo-400 to-indigo-500',
  };

  const color = getColor();

  return (
    <div className={className}>
      <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height }}>
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${colorMap[color]}`} style={{ width: `${width}%` }} />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500">{value} из {max}</span>
          <span className={`text-xs font-semibold ${
            color === 'green' ? 'text-emerald-600' :
            color === 'yellow' ? 'text-amber-600' :
            color === 'red' ? 'text-red-600' : 'text-indigo-600'
          }`}>{percentage}%</span>
        </div>
      )}
    </div>
  );
}

export function AnimatedCheckbox({
  checked,
  onChange,
  size = 'md',
  color = 'indigo',
}: {
  checked: boolean;
  onChange?: () => void;
  size?: 'sm' | 'md' | 'lg';
  color?: 'indigo' | 'green' | 'blue';
}) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  const colorMap = {
    indigo: 'bg-indigo-500 border-indigo-500',
    green: 'bg-emerald-500 border-emerald-500',
    blue: 'bg-blue-500 border-blue-500',
  };

  return (
    <button
      onClick={onChange}
      className={`${sizeMap[size]} rounded border-2 transition-all duration-200 flex items-center justify-center ${
        checked ? `${colorMap[color]} scale-100` : 'border-gray-300 hover:border-gray-400 scale-100'
      }`}
    >
      {checked && (
        <svg className="w-3/4 h-3/4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" strokeDasharray={24} strokeDashoffset={0} style={{ animation: 'check-draw 0.3s ease-out' }} />
        </svg>
      )}
    </button>
  );
}

export function StaggeredList({ children, staggerDelay = 50, className = '' }: { children: React.ReactNode[]; staggerDelay?: number; className?: string }) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <div key={index} className="animate-row-enter" style={{ animationDelay: `${index * staggerDelay}ms` }}>
          {child}
        </div>
      ))}
    </div>
  );
}

export function ContentTransition({
  children,
  transitionKey,
  className = '',
}: {
  children: React.ReactNode;
  transitionKey: string | number;
  className?: string;
}) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevKey = useRef(transitionKey);

  useEffect(() => {
    if (prevKey.current !== transitionKey) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayChildren(children);
        setIsTransitioning(false);
        prevKey.current = transitionKey;
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setDisplayChildren(children);
    }
  }, [transitionKey, children]);

  return (
    <div className={`transition-all duration-150 ${isTransitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'} ${className}`}>
      {displayChildren}
    </div>
  );
}

export function AnimatedStatusBadge({
  status,
  previousStatus,
  size = 'md',
}: {
  status: string;
  previousStatus?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [isPulsing, setIsPulsing] = useState(false);
  const prevRef = useRef(status);

  useEffect(() => {
    if (prevRef.current !== status && previousStatus) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timer);
    }
    prevRef.current = status;
  }, [status, previousStatus]);

  const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
    'Новая': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
    'В работе': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    'На проверке': { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
    'Завершена': { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    'Отменена': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  };

  const config = statusConfig[status] || statusConfig['Новая'];
  const sizeMap = { sm: 'text-[10px] px-2 py-0.5 gap-1', md: 'text-xs px-2.5 py-1 gap-1.5', lg: 'text-sm px-3 py-1.5 gap-2' };

  return (
    <span className={`relative inline-flex items-center rounded-full font-medium ${config.bg} ${config.text} ${sizeMap[size]}`}>
      {isPulsing && <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: config.dot }} />}
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${isPulsing ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

export function AnimatedDashboardCard({
  title, value, icon, trend, trendLabel, color = 'indigo', delay = 0,
}: {
  title: string; value: number; icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  trendLabel?: string;
  color?: 'indigo' | 'blue' | 'green' | 'amber' | 'red' | 'purple';
  delay?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const colorMap = {
    indigo: { icon: 'bg-indigo-100 text-indigo-600' },
    blue: { icon: 'bg-blue-100 text-blue-600' },
    green: { icon: 'bg-emerald-100 text-emerald-600' },
    amber: { icon: 'bg-amber-100 text-amber-600' },
    red: { icon: 'bg-red-100 text-red-600' },
    purple: { icon: 'bg-purple-100 text-purple-600' },
  };

  const c = colorMap[color];

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5 ${
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    }`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>{icon}</div>
      </div>
      <AnimatedCounter value={value} className="text-3xl font-bold text-gray-800" />
      {trend && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`flex items-center text-xs font-semibold ${trend.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            <svg className={`w-3.5 h-3.5 ${trend.isPositive ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            {Math.abs(trend.value)}%
          </span>
          {trendLabel && <span className="text-xs text-gray-400">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function AnimatedTabs({
  tabs, activeTab, onChange, className = '',
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const activeIndex = tabs.findIndex(t => t.id === activeTab);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <div className={`relative flex items-center bg-gray-100 rounded-xl p-1 ${className}`}>
      <div className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm transition-all duration-300 ease-out"
        style={{ left: `calc(${safeIndex * (100 / tabs.length)}% + 4px)`, width: `calc(${100 / tabs.length}% - 8px)` }} />
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`relative z-10 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
            activeTab === tab.id ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {tab.icon}{tab.label}
        </button>
      ))}
    </div>
  );
}

export function SuccessToast({ message, visible, onHide }: { message: string; visible: boolean; onHide: () => void }) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-fade-in-up">
      <div className="flex items-center gap-3 px-5 py-3 bg-emerald-600 text-white rounded-xl shadow-xl shadow-emerald-600/20">
        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" style={{ animation: 'check-draw 0.3s ease-out' }} />
          </svg>
        </div>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}

export function PageReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className={`transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {children}
    </div>
  );
}

export function useAnimatedRemoval() {
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const animateRemoval = useCallback((id: string, onRemove: (id: string) => void) => {
    setRemovingIds(prev => new Set([...prev, id]));
    setTimeout(() => {
      onRemove(id);
      setRemovingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, 300);
  }, []);

  const isRemoving = useCallback((id: string) => removingIds.has(id), [removingIds]);

  return { animateRemoval, isRemoving };
}

export function RemovableRow({ id, isRemoving, children }: { id: string; isRemoving: boolean; children: React.ReactNode }) {
  return (
    <div className={`transition-all duration-300 origin-left ${
      isRemoving ? 'opacity-0 -translate-x-8 max-h-0 py-0 overflow-hidden' : 'opacity-100 translate-x-0 max-h-20'
    }`}>{children}</div>
  );
}

export function AnimatedMetric({
  value, previousValue, format, className = '',
}: {
  value: number;
  previousValue?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const [flashColor, setFlashColor] = useState<string | null>(null);

  useEffect(() => {
    if (previousValue !== undefined && value !== previousValue) {
      setFlashColor(value > previousValue ? 'text-emerald-600' : 'text-red-600');
      const timer = setTimeout(() => setFlashColor(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [value, previousValue]);

  return (
    <span className={`transition-colors duration-300 ${flashColor || 'text-gray-800'} ${className}`}>
      <AnimatedCounter value={value} />
    </span>
  );
}