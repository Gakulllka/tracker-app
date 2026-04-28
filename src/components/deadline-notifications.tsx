'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  deadline?: string;
  planHours?: number;
  factHours?: number;
}

interface Notification {
  id: string;
  type: 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'hours_overdue';
  taskId: string;
  taskTitle: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'critical' | 'warning' | 'info';
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  isPanelOpen: boolean;
  togglePanel: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

export function NotificationProvider({ tasks, children }: { tasks: Task[]; children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem('emk-read-notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem('emk-dismissed-notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thisWeekEnd = new Date(today);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

    const newNotifications: Notification[] = [];

    tasks.forEach(task => {
      if (task.status === 'Завершена' || task.status === 'Отменена') return;

      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());

        if (deadlineDate < today) {
          const daysOverdue = Math.floor((today.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
          newNotifications.push({
            id: `overdue-${task.id}`,
            type: 'overdue',
            taskId: task.id,
            taskTitle: task.title,
            message: `Просрочено на ${daysOverdue} дн.`,
            timestamp: task.deadline,
            read: readIds.has(`overdue-${task.id}`),
            priority: task.priority === 'Высокий' ? 'critical' : 'warning',
          });
        } else if (deadlineDate.getTime() === today.getTime()) {
          newNotifications.push({
            id: `today-${task.id}`,
            type: 'today',
            taskId: task.id,
            taskTitle: task.title,
            message: 'Дедлайн сегодня',
            timestamp: task.deadline,
            read: readIds.has(`today-${task.id}`),
            priority: task.priority === 'Высокий' ? 'warning' : 'info',
          });
        } else if (deadlineDate.getTime() === tomorrow.getTime()) {
          newNotifications.push({
            id: `tomorrow-${task.id}`,
            type: 'tomorrow',
            taskId: task.id,
            taskTitle: task.title,
            message: 'Дедлайн завтра',
            timestamp: task.deadline,
            read: readIds.has(`tomorrow-${task.id}`),
            priority: 'info',
          });
        } else if (deadlineDate <= thisWeekEnd) {
          newNotifications.push({
            id: `week-${task.id}`,
            type: 'this_week',
            taskId: task.id,
            taskTitle: task.title,
            message: `Дедлайн ${deadline.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
            timestamp: task.deadline,
            read: readIds.has(`week-${task.id}`),
            priority: 'info',
          });
        }
      }

      if (task.factHours && task.planHours && task.factHours > task.planHours) {
        const overPercent = Math.round(((task.factHours - task.planHours) / task.planHours) * 100);
        newNotifications.push({
          id: `hours-${task.id}`,
          type: 'hours_overdue',
          taskId: task.id,
          taskTitle: task.title,
          message: `Перерасход часов: +${overPercent}% (план: ${task.planHours}ч, факт: ${task.factHours}ч)`,
          timestamp: new Date().toISOString(),
          read: readIds.has(`hours-${task.id}`),
          priority: overPercent > 50 ? 'critical' : overPercent > 25 ? 'warning' : 'info',
        });
      }
    });

    const priorityOrder = { critical: 0, warning: 1, info: 2 };
    const typeOrder = { overdue: 0, today: 1, tomorrow: 2, hours_overdue: 3, this_week: 4 };
    newNotifications.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return typeOrder[a.type] - typeOrder[b.type];
    });

    setNotifications(newNotifications.filter(n => !dismissedIds.has(n.id)));
  }, [tasks, readIds, dismissedIds]);

  useEffect(() => {
    localStorage.setItem('emk-read-notifications', JSON.stringify([...readIds]));
  }, [readIds]);

  useEffect(() => {
    localStorage.setItem('emk-dismissed-notifications', JSON.stringify([...dismissedIds]));
  }, [dismissedIds]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    setReadIds(prev => new Set([...prev, id]));
  }, []);

  const markAllAsRead = useCallback(() => {
    setReadIds(prev => new Set([...prev, ...notifications.map(n => n.id)]));
  }, [notifications]);

  const dismissNotification = useCallback((id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        isPanelOpen,
        togglePanel: () => setIsPanelOpen(prev => !prev),
      }}
    >
      {children}
      {isPanelOpen && (
        <NotificationPanel
          notifications={notifications}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onDismiss={dismissNotification}
          onClose={() => setIsPanelOpen(false)}
        />
      )}
    </NotificationContext.Provider>
  );
}

export function NotificationBell() {
  const { unreadCount, togglePanel, isPanelOpen, notifications } = useNotifications();
  const criticalCount = notifications.filter(n => !n.read && n.priority === 'critical').length;

  return (
    <button
      onClick={togglePanel}
      className={`relative p-2.5 rounded-xl transition-all duration-200 ${
        isPanelOpen
          ? 'bg-indigo-100 text-indigo-600'
          : unreadCount > 0
          ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
      }`}
      title="Уведомления"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {unreadCount > 0 && (
        <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white ${
          criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'
        }`}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

function NotificationPanel({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClose,
}: {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}) {
  const unread = notifications.filter(n => !n.read);
  const typeConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
    overdue: {
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      color: 'text-red-600', bgColor: 'bg-red-50',
    },
    today: {
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      color: 'text-amber-600', bgColor: 'bg-amber-50',
    },
    tomorrow: {
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      color: 'text-blue-600', bgColor: 'bg-blue-50',
    },
    this_week: {
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      color: 'text-purple-600', bgColor: 'bg-purple-50',
    },
    hours_overdue: {
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
      color: 'text-orange-600', bgColor: 'bg-orange-50',
    },
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-2xl border-l border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">Уведомления</h2>
            {unread.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{unread.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button onClick={onMarkAllAsRead} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Прочитать все</button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto h-[calc(100%-65px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <svg className="w-16 h-16 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-sm font-medium">Нет уведомлений</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifications.map(notification => {
                const config = typeConfig[notification.type];
                return (
                  <div key={notification.id} onClick={() => onMarkAsRead(notification.id)} className={`px-5 py-4 transition-all duration-200 cursor-pointer hover:bg-gray-50 ${!notification.read ? 'bg-indigo-50/30' : ''}`}>
                    <div className="flex gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bgColor} ${config.color}`}>{config.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-800' : 'font-medium text-gray-600'}`}>{notification.taskTitle}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{notification.message}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }} className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {!notification.read && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                          {notification.priority === 'critical' && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">КРИТИЧНО</span>}
                          {notification.priority === 'warning' && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">ВНИМАНИЕ</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}