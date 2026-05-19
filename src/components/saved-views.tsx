'use client';

import React, { useState, useCallback, useEffect } from 'react';

interface FilterState {
  search: string;
  status: string[];
  priority: string[];
  assignee: string[];
  month: string[];
  hoursRange: 'all' | 'overdue' | 'underway' | 'completed';
}

interface SavedView {
  id: string;
  name: string;
  filters: FilterState;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  createdAt: string;
  isDefault?: boolean;
  icon?: string;
  color?: string;
}

const PRESET_VIEWS: SavedView[] = [
  {
    id: 'preset-all',
    name: 'Все задачи',
    filters: { search: '', status: [], priority: [], assignee: [], month: [], hoursRange: 'all' },
    createdAt: '',
    isDefault: true,
    icon: '📋',
    color: '#6366f1',
  },
  {
    id: 'preset-my',
    name: 'Мои задачи',
    filters: { search: '', status: ['В работе', 'Новая'], priority: [], assignee: [], month: [], hoursRange: 'all' },
    createdAt: '',
    icon: '👤',
    color: '#3b82f6',
  },
  {
    id: 'preset-overdue',
    name: 'Перерасход часов',
    filters: { search: '', status: [], priority: ['Высокий'], assignee: [], month: [], hoursRange: 'overdue' },
    createdAt: '',
    icon: '🔥',
    color: '#ef4444',
  },
  {
    id: 'preset-review',
    name: 'На проверке',
    filters: { search: '', status: ['На проверке'], priority: [], assignee: [], month: [], hoursRange: 'all' },
    createdAt: '',
    icon: '🔍',
    color: '#8b5cf6',
  },
];

export function useSavedViews(currentFilters: FilterState) {
  const [views, setViews] = useState<SavedView[]>(() => {
    if (typeof window === 'undefined') return PRESET_VIEWS;
    try {
      const saved = localStorage.getItem('delta-saved-views');
      if (saved) {
        const parsed = JSON.parse(saved) as SavedView[];
        return [...PRESET_VIEWS, ...parsed.filter(v => !v.id.startsWith('preset-'))];
      }
    } catch {}
    return PRESET_VIEWS;
  });

  const [activeViewId, setActiveViewId] = useState<string>('preset-all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const customViews = views.filter(v => !v.id.startsWith('preset-'));
    localStorage.setItem('delta-saved-views', JSON.stringify(customViews));
  }, [views]);

  const saveCurrentView = useCallback((name: string, icon?: string, color?: string) => {
    const newView: SavedView = {
      id: `custom-${Date.now()}`,
      name,
      filters: { ...currentFilters },
      createdAt: new Date().toISOString(),
      icon: icon || '📌',
      color: color || '#6366f1',
    };
    setViews(prev => [...prev, newView]);
    setActiveViewId(newView.id);
    return newView;
  }, [currentFilters]);

  const updateView = useCallback((id: string) => {
    setViews(prev =>
      prev.map(v =>
        v.id === id ? { ...v, filters: { ...currentFilters } } : v
      )
    );
  }, [currentFilters]);

  const deleteView = useCallback((id: string) => {
    setViews(prev => prev.filter(v => v.id !== id));
    if (activeViewId === id) setActiveViewId('preset-all');
  }, [activeViewId]);

  const activeView = views.find(v => v.id === activeViewId) || PRESET_VIEWS[0];

  return {
    views,
    activeViewId,
    activeView,
    setActiveViewId,
    saveCurrentView,
    updateView,
    deleteView,
  };
}

export function ViewSwitcher({
  views,
  activeViewId,
  onSelect,
  onSave,
  onUpdate,
  onDelete,
  hasUnsavedChanges,
}: {
  views: SavedView[];
  activeViewId: string;
  onSelect: (id: string) => void;
  onSave: (name: string, icon?: string, color?: string) => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  hasUnsavedChanges: boolean;
}) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewIcon, setNewViewIcon] = useState('📌');
  const [newViewColor, setNewViewColor] = useState('#6366f1');

  const handleSave = () => {
    if (newViewName.trim()) {
      onSave(newViewName.trim(), newViewIcon, newViewColor);
      setNewViewName('');
      setShowSaveDialog(false);
    }
  };

  const availableIcons = ['📌', '⭐', '🔥', '🎯', '📊', '✅', '⚡', '🏷️', '📝', '🚀'];
  const availableColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 overflow-x-auto max-w-[600px]">
        {views.map(view => {
          const isActive = view.id === activeViewId;
          const isCustom = view.id.startsWith('custom-');

          return (
            <div key={view.id} className="relative group">
              <button
                onClick={() => onSelect(view.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                }`}
              >
                <span className="text-xs">{view.icon}</span>
                {view.name}
                {isActive && hasUnsavedChanges && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>

              {isCustom && (
                <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-50">
                  <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px]">
                    <button
                      onClick={(e) => { e.stopPropagation(); onUpdate(view.id); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                    >
                      Обновить
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(view.id); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasUnsavedChanges && (
        <button
          onClick={() => setShowSaveDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-200"
        >
          Сохранить вид
        </button>
      )}

      {showSaveDialog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowSaveDialog(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[400px] p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Сохранить представление</h3>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Название</label>
                <input
                  type="text"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Например: Срочные задачи"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Иконка</label>
                <div className="flex gap-2 flex-wrap">
                  {availableIcons.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setNewViewIcon(icon)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        newViewIcon === icon ? 'bg-indigo-100 ring-2 ring-indigo-300 scale-110' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Цвет</label>
                <div className="flex gap-2">
                  {availableColors.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewViewColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newViewColor === color ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color, '--tw-ring-color': color } as React.CSSProperties}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSave}
                  disabled={!newViewName.trim()}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}