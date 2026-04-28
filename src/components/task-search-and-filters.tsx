'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  planHours?: number;
  factHours?: number;
  month?: string;
  commentLog?: string[];
}

interface FilterState {
  search: string;
  status: string[];
  priority: string[];
  assignee: string[];
  month: string[];
  hoursRange: 'all' | 'overdue' | 'underway' | 'completed';
}

export function useTaskFilter(tasks: Task[]) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: [],
    priority: [],
    assignee: [],
    month: [],
    hoursRange: 'all',
  });

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const availableOptions = useMemo(() => {
    const statuses = [...new Set(tasks.map(t => t.status))].sort();
    const priorities = [...new Set(tasks.map(t => t.priority))].sort();
    const assignees = [...new Set(tasks.filter(t => t.assignee).map(t => t.assignee!))].sort();
    const months = [...new Set(tasks.filter(t => t.month).map(t => t.month!))].sort();
    return { statuses, priorities, assignees, months };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchAssignee = task.assignee?.toLowerCase().includes(q);
        const matchComments = task.commentLog?.some(c => c.toLowerCase().includes(q));
        if (!matchTitle && !matchAssignee && !matchComments) return false;
      }

      if (filters.status.length > 0 && !filters.status.includes(task.status)) {
        return false;
      }

      if (filters.priority.length > 0 && !filters.priority.includes(task.priority)) {
        return false;
      }

      if (filters.assignee.length > 0 && !filters.assignee.includes(task.assignee || '')) {
        return false;
      }

      if (filters.month.length > 0 && !filters.month.includes(task.month || '')) {
        return false;
      }

      if (filters.hoursRange !== 'all') {
        const plan = task.planHours ?? 0;
        const fact = task.factHours ?? 0;
        switch (filters.hoursRange) {
          case 'overdue':
            if (fact <= plan) return false;
            break;
          case 'underway':
            if (fact === 0 || fact >= plan) return false;
            break;
          case 'completed':
            if (fact < plan) return false;
            break;
        }
      }

      return true;
    });
  }, [tasks, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status.length > 0) count++;
    if (filters.priority.length > 0) count++;
    if (filters.assignee.length > 0) count++;
    if (filters.month.length > 0) count++;
    if (filters.hoursRange !== 'all') count++;
    return count;
  }, [filters]);

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search }));
  }, []);

  const toggleFilter = useCallback((key: keyof Pick<FilterState, 'status' | 'priority' | 'assignee' | 'month'>, value: string) => {
    setFilters(prev => {
      const current = prev[key] as string[];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const setHoursRange = useCallback((hoursRange: FilterState['hoursRange']) => {
    setFilters(prev => ({ ...prev, hoursRange }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      status: [],
      priority: [],
      assignee: [],
      month: [],
      hoursRange: 'all',
    });
  }, []);

  return {
    filters,
    filteredTasks,
    activeFilterCount,
    isFiltersOpen,
    setIsFiltersOpen,
    setSearch,
    toggleFilter,
    setHoursRange,
    clearAllFilters,
    availableOptions,
  };
}

export function SearchBar({
  value,
  onChange,
  onClear,
  resultCount,
  totalCount,
  onToggleFilters,
  activeFilterCount,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
  onToggleFilters: () => void;
  activeFilterCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className={`relative flex-1 max-w-md transition-all duration-200 ${isFocused ? 'ring-2 ring-indigo-500/30' : ''}`}>
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors ${isFocused ? 'border-indigo-300 bg-white' : 'border-gray-200 bg-gray-50 hover:bg-white'}`}>
          <svg className={`w-4 h-4 flex-shrink-0 transition-colors ${isFocused ? 'text-indigo-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Поиск задач, исполнителей..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400"
          />

          {value && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {resultCount} из {totalCount}
            </span>
          )}

          {value && (
            <button
              onClick={onClear}
              className="p-0.5 rounded-md hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {!value && !isFocused && (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-white border border-gray-200 rounded">
              <span className="text-xs">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      <button
        onClick={onToggleFilters}
        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${activeFilterCount > 0 ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-white hover:border-gray-300'}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Фильтры
        {activeFilterCount > 0 && (
          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}

export function FilterPanel({
  filters,
  availableOptions,
  onToggleFilter,
  onSetHoursRange,
  onClearAll,
  activeFilterCount,
}: {
  filters: FilterState;
  availableOptions: { statuses: string[]; priorities: string[]; assignees: string[]; months: string[]; };
  onToggleFilter: (key: 'status' | 'priority' | 'assignee' | 'month', value: string) => void;
  onSetHoursRange: (range: FilterState['hoursRange']) => void;
  onClearAll: () => void;
  activeFilterCount: number;
}) {
  const statusColors: Record<string, string> = {
    'Новая': 'bg-blue-100 text-blue-700 border-blue-200',
    'В работе': 'bg-amber-100 text-amber-700 border-amber-200',
    'На проверке': 'bg-purple-100 text-purple-700 border-purple-200',
    'Завершена': 'bg-green-100 text-green-700 border-green-200',
    'Отменена': 'bg-gray-100 text-gray-600 border-gray-200',
  };

  const priorityColors: Record<string, string> = {
    'Высокий': 'bg-red-100 text-red-700 border-red-200',
    'Средний': 'bg-amber-100 text-amber-700 border-amber-200',
    'Низкий': 'bg-green-100 text-green-700 border-green-200',
  };

  const FilterChip = ({ label, active, colorClass, onClick }: { label: string; active: boolean; colorClass?: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${active ? colorClass || 'bg-indigo-100 text-indigo-700 border-indigo-200 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Фильтры</h3>
        {activeFilterCount > 0 && (
          <button onClick={onClearAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            Сбросить все
          </button>
        )}
      </div>

      {availableOptions.statuses.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Статус</label>
          <div className="flex flex-wrap gap-2">
            {availableOptions.statuses.map(status => (
              <FilterChip key={status} label={status} active={filters.status.includes(status)} colorClass={statusColors[status]} onClick={() => onToggleFilter('status', status)} />
            ))}
          </div>
        </div>
      )}

      {availableOptions.priorities.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Приоритет</label>
          <div className="flex flex-wrap gap-2">
            {availableOptions.priorities.map(priority => (
              <FilterChip key={priority} label={priority} active={filters.priority.includes(priority)} colorClass={priorityColors[priority]} onClick={() => onToggleFilter('priority', priority)} />
            ))}
          </div>
        </div>
      )}

      {availableOptions.assignees.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Исполнитель</label>
          <div className="flex flex-wrap gap-2">
            {availableOptions.assignees.map(assignee => (
              <FilterChip key={assignee} label={assignee} active={filters.assignee.includes(assignee)} onClick={() => onToggleFilter('assignee', assignee)} />
            ))}
          </div>
        </div>
      )}

      {availableOptions.months.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Месяц</label>
          <div className="flex flex-wrap gap-2">
            {availableOptions.months.map(month => (
              <FilterChip key={month} label={month} active={filters.month.includes(month)} onClick={() => onToggleFilter('month', month)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Отклонение по часам</label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all' as const, label: 'Все' },
            { value: 'overdue' as const, label: 'Перерасход' },
            { value: 'underway' as const, label: 'В процессе' },
            { value: 'completed' as const, label: 'В рамках' },
          ].map(opt => (
            <FilterChip key={opt.value} label={opt.label} active={filters.hoursRange === opt.value} onClick={() => onSetHoursRange(opt.value)} />
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <div className="flex flex-wrap gap-2">
            {filters.status.map(s => (
              <span key={`status-${s}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                {s}
                <button onClick={() => onToggleFilter('status', s)} className="p-0.5 rounded hover:bg-indigo-100">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {filters.priority.map(p => (
              <span key={`priority-${p}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                {p}
                <button onClick={() => onToggleFilter('priority', p)} className="p-0.5 rounded hover:bg-indigo-100">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}