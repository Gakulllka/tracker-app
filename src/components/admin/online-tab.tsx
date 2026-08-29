"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Loader2, RefreshCw } from "lucide-react";
import { getToken, apiHeaders, formatDate, timeAgo, type Session } from "@/components/admin/shared";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

/** Вкладка «Онлайн»: активные сессии, принудительный выход. */

export function OnlineTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [kickTarget, setKickTarget] = useState<Session | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Подсветить «только что обновили» — тонкий feedback на авторефрешe.
  const [refreshedAt, setRefreshedAt] = useState<number>(0);

  /** silent=true → не показывать спиннер (используется в авто-pull). */
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions?token=${getToken()}`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
        setRefreshedAt(Date.now());
      }
    } catch { /* ignore */ }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Автообновление каждые 30 секунд, пока вкладка видна.
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetchSessions(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSessions]);

  const handleKick = async () => {
    if (!kickTarget) return;
    try {
      await fetch("/api/admin/sessions", {
        method: "DELETE", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), sessionId: kickTarget.id }),
      });
      setKickTarget(null);
      fetchSessions();
    } catch { /* ignore */ }
  };

  const onlineCount = sessions.filter((s) => s.isOnline).length;
  const inactiveCount = sessions.length - onlineCount;

  // Время последнего обновления для подсказки в шапке
  const refreshedAgo = refreshedAt
    ? Math.max(0, Math.floor((Date.now() - refreshedAt) / 1000))
    : 0;
  void refreshedAgo; // зарезервировано: пока показываем «Обновлено сейчас» по факту наличия данных

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--tracker-success)] animate-pulse" />
            <span className="text-sm font-medium text-[var(--tracker-text-main)]">Онлайн: {onlineCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--tracker-border)]" />
            <span className="text-sm font-medium text-[var(--tracker-text-muted)]">Неактивны: {inactiveCount}</span>
          </div>
          <span className="text-xs text-[var(--tracker-text-muted)]">Считается онлайн ≤ 2 мин с последнего пинга</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--tracker-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Авто-обновление 30 сек
          </label>
          <Button variant="outline" size="sm" onClick={() => fetchSessions()} className="gap-2">
            <RefreshCw className="w-3 h-3" /> Обновить
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--tracker-text-muted)]" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--tracker-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--tracker-bg-main)] border-b border-[var(--tracker-border)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--tracker-text-muted)]">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--tracker-text-muted)]">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--tracker-text-muted)]">Где</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--tracker-text-muted)]">IP-адрес</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--tracker-text-muted)]">Последняя активность</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--tracker-text-muted)]">Длительность</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--tracker-text-muted)]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-[var(--tracker-text-muted)]">Нет активных сессий</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className={`border-b border-[var(--tracker-border)] ${s.isOnline ? "bg-[color-mix(in_srgb,var(--tracker-success)_10%,transparent)]/30" : "bg-[var(--tracker-bg-main)]/30"}`}>
                  <td className="px-4 py-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full inline-block ${s.isOnline ? "bg-[var(--tracker-success)]" : "bg-[var(--tracker-border)]"}`}
                      title={s.isOnline ? "Онлайн" : "Неактивен"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--tracker-text-main)]">{s.user.displayName || s.user.username}</div>
                    <div className="text-xs text-[var(--tracker-text-muted)]">@{s.user.username} ({s.user.role.name})</div>
                  </td>
                  <td className="px-4 py-3">
                    {s.currentPage ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--tracker-accent-bg)] text-[var(--tracker-text-muted)] font-mono text-xs">
                        {s.currentPage.length > 36 ? s.currentPage.slice(0, 34) + "…" : s.currentPage}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--tracker-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--tracker-text-muted)] font-mono text-xs">{s.ipAddress || "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--tracker-text-muted)]" title={formatDate(s.lastActivity)}>
                    {timeAgo(s.lastActivity)}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--tracker-text-muted)]">
                    {(() => {
                      const ms = Date.now() - new Date(s.createdAt).getTime();
                      const h = Math.floor(ms / 3600000);
                      const m = Math.floor((ms % 3600000) / 60000);
                      return h > 0 ? `${h} ч. ${m} мин.` : `${m} мин.`;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setKickTarget(s)} className="gap-1 text-orange-500 hover:text-orange-600 hover:bg-orange-50">
                      <LogOut className="w-4 h-4" /> Завершить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kick Confirm */}
      <ConfirmDialog
        open={!!kickTarget}
        title="Завершить сессию?"
        message={`Пользователь "${kickTarget?.user.displayName || kickTarget?.user.username}" будет разлогинен и перенаправлен на страницу входа.`}
        onConfirm={handleKick}
        onCancel={() => setKickTarget(null)}
      />
    </div>
  );
}
