"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { getToken, formatDate, ACTION_LABELS, actionBadgeClass, type LogEntry } from "@/components/admin/shared";

/** Вкладка «Логи»: журнал действий из ActivityLog с фильтрами и выгрузкой. */

export function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const [filterAction, setFilterAction] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ token: getToken(), limit: String(limit), offset: String(offset) });
      if (filterAction) params.set("action", filterAction);
      if (filterSearch) params.set("search", filterSearch);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      const res = await fetch(`/api/admin/logs?${params}`);
      const data = await res.json();
      if (data.success) { setLogs(data.logs); setTotal(data.total); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [offset, filterAction, filterSearch, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const hasDetails = (log: LogEntry) => log.oldValue || log.newValue;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Поиск в логах..." value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setOffset(0); }} className="pl-9 w-64" />
        </div>
        <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
          <option value="">Все действия</option>
          <optgroup label="Задачи">
            <option value="task_create">Создание задачи</option>
            <option value="task_update">Обновление задачи</option>
            <option value="task_delete">Удаление задачи</option>
          </optgroup>
          <optgroup label="Пользователи">
            <option value="login">Вход</option>
            <option value="logout">Выход</option>
            <option value="register">Регистрация</option>
            <option value="user_update">Обновление пользователя</option>
            <option value="user_block">Блокировка</option>
            <option value="user_unblock">Разблокировка</option>
            <option value="user_delete">Удаление пользователя</option>
            <option value="session_end">Завершение сессии</option>
          </optgroup>
          <optgroup label="Роли и права">
            <option value="role_create">Создание роли</option>
            <option value="role_update">Обновление роли</option>
            <option value="role_delete">Удаление роли</option>
            <option value="role_change">Смена роли пользователя</option>
            <option value="permission_change">Смена прав</option>
          </optgroup>
        </select>
        <input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        <span className="text-gray-400 text-sm">—</span>
        <input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        <Button variant="outline" size="sm" onClick={() => { setFilterAction(""); setFilterSearch(""); setFilterDateFrom(""); setFilterDateTo(""); setOffset(0); }} className="gap-2">
          <RefreshCw className="w-3 h-3" /> Сбросить
        </Button>
      </div>

      <div className="text-xs text-gray-400">Всего записей: {total}</div>

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-1">
          {logs.length === 0 && <div className="text-center py-12 text-gray-400">Нет записей</div>}
          {logs.map((log) => (
            <div key={log.id} className="border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <span className="text-xs text-gray-400 whitespace-nowrap w-40">{formatDate(log.createdAt)}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${actionBadgeClass(log.action)}`}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
                <span className="text-sm font-medium text-gray-700">{log.username || "Система"}</span>
                <span className="text-sm text-gray-500 flex-1 truncate">
                  {log.entityType ? `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}` : ""}
                </span>
                {hasDetails(log) && (expandedId === log.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
              </div>
              {expandedId === log.id && hasDetails(log) && (
                <div className="px-4 pb-3 pt-0 border-t border-gray-100 bg-gray-50/50">
                  <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
                    {log.oldValue && (
                      <div>
                        <div className="font-medium text-gray-500 mb-1">Было:</div>
                        <pre className="bg-white rounded p-2 text-gray-600 overflow-x-auto max-h-32">{(() => { try { return JSON.stringify(JSON.parse(log.oldValue), null, 2); } catch { return log.oldValue; } })()}</pre>
                      </div>
                    )}
                    {log.newValue && (
                      <div>
                        <div className="font-medium text-gray-500 mb-1">Стало:</div>
                        <pre className="bg-white rounded p-2 text-gray-600 overflow-x-auto max-h-32">{(() => { try { return JSON.stringify(JSON.parse(log.newValue), null, 2); } catch { return log.newValue; } })()}</pre>
                      </div>
                    )}
                    {log.ipAddress && (
                      <div className="col-span-2 text-gray-400">IP: {log.ipAddress}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-gray-400">Показано {offset + 1}–{Math.min(offset + limit, total)} из {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>Назад</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}>Далее</Button>
          </div>
        </div>
      )}
    </div>
  );
}
