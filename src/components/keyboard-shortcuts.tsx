'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface ShortcutAction {
  id: string;
  label: string;
  description: string;
  keys: string[];
  category: 'navigation' | 'actions' | 'view' | 'general';
  handler: () => void;
}

interface KeyboardShortcutsContextType {
  registerShortcut: (action: ShortcutAction) => void;
  unregisterShortcut: (id: string) => void;
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | null>(null);

export function useKeyboardShortcuts() {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  return ctx;
}

export function KeyboardShortcutsProvider({
  children,
  shortcuts,
}: {
  children: React.ReactNode;
  shortcuts: ShortcutAction[];
}) {
  const [registeredShortcuts, setRegisteredShortcuts] = useState<ShortcutAction[]>(shortcuts);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const registerShortcut = useCallback((action: ShortcutAction) => {
    setRegisteredShortcuts(prev => {
      const filtered = prev.filter(s => s.id !== action.id);
      return [...filtered, action];
    });
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    setRegisteredShortcuts(prev => prev.filter(s => s.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape') {
          (target as HTMLInputElement).blur();
          return;
        }
        if (!(e.metaKey || e.ctrlKey)) return;
      }

      const pressed = new Set<string>();
      if (e.metaKey || e.ctrlKey) pressed.add('ctrl');
      if (e.shiftKey) pressed.add('shift');
      if (e.altKey) pressed.add('alt');
      pressed.add(e.key.toLowerCase());

      for (const shortcut of registeredShortcuts) {
        const shortcutKeys = new Set(shortcut.keys.map(k => k.toLowerCase()));
        if (
          shortcutKeys.size === pressed.size &&
          [...shortcutKeys].every(k => pressed.has(k))
        ) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.handler();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [registeredShortcuts]);

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        registerShortcut,
        unregisterShortcut,
        isHelpOpen,
        openHelp: () => setIsHelpOpen(true),
        closeHelp: () => setIsHelpOpen(false),
      }}
    >
      {children}
      {isHelpOpen && (
        <ShortcutsHelpModal shortcuts={registeredShortcuts} onClose={() => setIsHelpOpen(false)} />
      )}
    </KeyboardShortcutsContext.Provider>
  );
}

function ShortcutsHelpModal({ shortcuts, onClose }: { shortcuts: ShortcutAction[]; onClose: () => void }) {
  const categories: Record<string, { label: string; icon: string }> = {
    navigation: { label: 'Навигация', icon: '🧭' },
    actions: { label: 'Действия', icon: '⚡' },
    view: { label: 'Вид', icon: '👁' },
    general: { label: 'Общие', icon: '⚙️' },
  };

  const grouped = shortcuts.reduce<Record<string, ShortcutAction[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">⌨️</div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Горячие клавиши</h2>
                <p className="text-xs text-gray-400">Быстрые действия с клавиатуры</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh] space-y-6">
            {Object.entries(grouped).map(([category, items]) => {
              const cat = categories[category] || { label: category, icon: '📌' };
              return (
                <div key={category}>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
                    <span>{cat.icon}</span>
                    {cat.label}
                  </h3>
                  <div className="space-y-1">
                    {items.map(shortcut => (
                      <div key={shortcut.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                        <div>
                          <p className="text-sm font-medium text-gray-700">{shortcut.label}</p>
                          <p className="text-xs text-gray-400">{shortcut.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span className="text-xs text-gray-300">+</span>}
                              <kbd className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 text-xs font-semibold rounded-lg border ${
                                key === 'ctrl' || key === 'shift' || key === 'alt' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-white text-gray-700 border-gray-300 shadow-sm'
                              }`}>
                                {formatKey(key)}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400 text-center">
              Нажмите <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-semibold">?</kbd> для справки
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    ctrl: '⌘', shift: '⇧', alt: '⌥', enter: '↵', escape: 'Esc',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', backspace: '⌫', delete: '⌦', tab: '⇥', ' ': 'Space',
  };
  return map[key.toLowerCase()] || key.toUpperCase();
}

export function ShortcutHint({ shortcut, className = '' }: { shortcut: string[]; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {shortcut.map((key, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-[9px] text-gray-300">+</span>}
          <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded">
            {formatKey(key)}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  );
}

export function getDefaultShortcuts(actions: {
  onSearch?: () => void;
  onNewTask?: () => void;
  onToggleFilters?: () => void;
  onSave?: () => void;
  onRefresh?: () => void;
  onToggleView?: () => void;
  onShowHelp?: () => void;
  onNextTask?: () => void;
  onPrevTask?: () => void;
  onEditTask?: () => void;
  onDeleteTask?: () => void;
  onExport?: () => void;
  onGoDashboard?: () => void;
  onGoTable?: () => void;
  onGoKanban?: () => void;
  onClose?: () => void;
}): ShortcutAction[] {
  return [
    { id: 'search', label: 'Поиск', description: 'Открыть строку поиска', keys: ['ctrl', 'k'], category: 'navigation', handler: actions.onSearch || (() => {}) },
    { id: 'go-dashboard', label: 'Дашборд', description: 'Перейти к дашборду', keys: ['ctrl', '1'], category: 'navigation', handler: actions.onGoDashboard || (() => {}) },
    { id: 'go-table', label: 'Таблица', description: 'Перейти к таблице', keys: ['ctrl', '2'], category: 'navigation', handler: actions.onGoTable || (() => {}) },
    { id: 'go-kanban', label: 'Канбан', description: 'Перейти к канбану', keys: ['ctrl', '3'], category: 'navigation', handler: actions.onGoKanban || (() => {}) },
    { id: 'new-task', label: 'Новая задача', description: 'Создать задачу', keys: ['ctrl', 'n'], category: 'actions', handler: actions.onNewTask || (() => {}) },
    { id: 'edit-task', label: 'Редактировать', description: 'Редактировать задачу', keys: ['ctrl', 'e'], category: 'actions', handler: actions.onEditTask || (() => {}) },
    { id: 'delete-task', label: 'Удалить', description: 'Удалить задачу', keys: ['ctrl', 'delete'], category: 'actions', handler: actions.onDeleteTask || (() => {}) },
    { id: 'next-task', label: 'Следующая', description: 'К следующей задаче', keys: ['j'], category: 'navigation', handler: actions.onNextTask || (() => {}) },
    { id: 'prev-task', label: 'Предыдущая', description: 'К предыдущей задаче', keys: ['k'], category: 'navigation', handler: actions.onPrevTask || (() => {}) },
    { id: 'toggle-filters', label: 'Фильтры', description: 'Показать/скрыть фильтры', keys: ['ctrl', 'f'], category: 'view', handler: actions.onToggleFilters || (() => {}) },
    { id: 'toggle-view', label: 'Переключить вид', description: 'Сменить вид', keys: ['ctrl', 'b'], category: 'view', handler: actions.onToggleView || (() => {}) },
    { id: 'save', label: 'Сохранить', description: 'Сохранить изменения', keys: ['ctrl', 's'], category: 'general', handler: actions.onSave || (() => {}) },
    { id: 'refresh', label: 'Обновить', description: 'Обновить данные', keys: ['ctrl', 'r'], category: 'general', handler: actions.onRefresh || (() => {}) },
    { id: 'export', label: 'Экспорт', description: 'Экспортировать', keys: ['ctrl', 'shift', 'e'], category: 'general', handler: actions.onExport || (() => {}) },
    { id: 'help', label: 'Справка', description: 'Показать подсказки', keys: ['?'], category: 'general', handler: actions.onShowHelp || (() => {}) },
  ];
}