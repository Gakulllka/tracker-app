"use client";

/**
 * OwnerNotificationsPanel — поп-ап ленты уведомлений владельца домена
 * (ТЗ, блок 2.2).
 *
 * Открывается по колокольчику. В строке видно: кто, что сделал, когда,
 * в какой задаче и домене, а для правок — что именно изменилось,
 * с прежним и новым значением. Клик по строке ведёт к задаче.
 *
 * Источник — /api/owner-notifications, лента строится из ActivityLog.
 * Данные подгружаются порциями по мере прокрутки.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2, RefreshCw, Check, X } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface FieldChange { field: string; label: string; from: string; to: string }

export interface OwnerNotification {
  id: string;
  kind: "task" | "backlog" | "question" | "access";
  action: string;
  actionLabel: string;
  author: string;
  domainId: string;
  domainName: string;
  taskId: string | null;
  taskNum: string;
  taskName: string;
  monthKey: string | null;
  changes: FieldChange[];
  createdAt: string;
  /** Для kind="access": id запроса (для approve/reject). */
  requestId?: string;
}

export interface OwnerNotificationsPanelProps {
  token: string;
  /** Переход к задаче: домен, месяц ("YYYY-MM") и id строки. */
  onOpenTask?: (domainId: string, monthKey: string | null, taskId: string) => void;
}

const PAGE = 40;
/** Ключ последнего просмотра. Прочитанным считается всё, что старше метки. */
const SEEN_KEY = "tracker-notifications-seen-at";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

export function OwnerNotificationsPanel({ token, onOpenTask }: OwnerNotificationsPanelProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OwnerNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // Метка последнего просмотра. Читаем в инициализаторе: он выполняется
  // один раз и только на клиенте, где localStorage доступен.
  const [seenAt, setSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(SEEN_KEY) || 0);
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (before?: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const url = new URL("/api/owner-notifications", window.location.origin);
      url.searchParams.set("limit", String(PAGE));
      if (before) url.searchParams.set("before", before);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const next: OwnerNotification[] = data.items || [];
      setItems(prev => {
        if (!before) return next;
        // Dedup по id — на стыке страниц сервер может вернуть уже загруженный
        // элемент (особенно вопросы: клиентский курсор answerDate/questionDate
        // может не совпадать с серверным фильтром по createdAt).
        const existing = new Set(prev.map(i => i.id));
        return [...prev, ...next.filter(i => !existing.has(i.id))];
      });
      setHasMore(Boolean(data.hasMore));
    } catch {
      /* сеть недоступна — лента просто не обновится */
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Периодически обновляем счётчик, даже когда панель закрыта.
  // setState вызывается не в теле эффекта, а асинхронно внутри load(),
  // иначе получается лишний каскадный рендер.
  useEffect(() => {
    const t0 = setTimeout(() => { void load(); }, 0);
    const i = setInterval(() => { if (!open) void load(); }, 60_000);
    return () => { clearTimeout(t0); clearInterval(i); };
  }, [load, open]);

  // Догрузка по прокрутке.
  useEffect(() => {
    const node = sentinelRef.current;
    const root = listRef.current;
    if (!open || !node || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && items.length > 0) {
        load(items[items.length - 1].createdAt);
      }
    }, { root, rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, [open, hasMore, loading, items, load]);

  const unread = items.filter(i => new Date(i.createdAt).getTime() > seenAt).length;

  const markSeen = useCallback(() => {
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    setSeenAt(now);
  }, []);

  /** Одобрить/отклонить запрос доступа. */
  const resolveAccess = useCallback(async (requestId: string, action: "approve" | "reject") => {
    try {
      await fetch("/api/domains/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token, action, requestId }),
      });
      // Удаляем обработанный запрос из ленты.
      setItems(prev => prev.filter(i => !(i.kind === "access" && i.requestId === requestId)));
    } catch { /* ignore — обновится при следующем poll */ }
  }, [token]);

  return (
    <Popover
      open={open}
      onOpenChange={o => { setOpen(o); if (o) { load(); } else { markSeen(); } }}
    >
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
          style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
          aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center tabular-nums"
              style={{ background: "#C6453F", color: "#fff" }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="p-0 w-[380px] max-w-[92vw]"
        style={{
          background: "var(--tracker-bg-card, var(--card))",
          border: "1px solid var(--tracker-border, var(--border))",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--tracker-border, var(--border))" }}
        >
          <div className="flex flex-col leading-tight">
            <span
              className="font-mono uppercase"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--tracker-text-muted, var(--muted-foreground))" }}
            >
              Мои домены
            </span>
            <span className="text-sm font-semibold">Уведомления</span>
          </div>
          <Button
            variant="ghost" size="sm" className="h-7 px-2"
            onClick={() => load()} disabled={loading}
            aria-label="Обновить"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>

        <div ref={listRef} style={{ maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain" }}>
          {items.length === 0 && !loading ? (
            <p
              className="px-4 py-8 text-center text-sm"
              style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
            >
              Пока ничего. Здесь появятся изменения, которые сделали другие
              в ваших доменах.
            </p>
          ) : (
            <>
              {items.map(n => {
                const isUnread = new Date(n.createdAt).getTime() > seenAt;
                const clickable = Boolean(n.taskId && onOpenTask);
                return (
                  <div
                    key={n.id}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => { onOpenTask?.(n.domainId, n.monthKey, n.taskId!); setOpen(false); markSeen(); } : undefined}
                    onKeyDown={clickable ? e => { if (e.key === "Enter") { onOpenTask?.(n.domainId, n.monthKey, n.taskId!); setOpen(false); markSeen(); } } : undefined}
                    className="px-4 py-3 transition-colors"
                    style={{
                      borderBottom: "1px solid var(--tracker-border, var(--border))",
                      cursor: clickable ? "pointer" : "default",
                      background: isUnread ? "var(--tracker-accent-bg, transparent)" : "transparent",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">
                        <b>{n.author}</b>{" "}
                        <span style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                          {n.actionLabel}
                        </span>
                      </span>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ fontSize: 11, color: "var(--tracker-text-muted, var(--muted-foreground))" }}
                      >
                        {relTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-[13px] font-medium truncate">
                      {n.taskNum ? `#${n.taskNum} · ` : ""}{n.taskName || "Без названия"}
                    </p>

                    {n.changes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {n.changes.slice(0, 4).map(c => (
                          <li key={c.field} style={{ fontSize: 11.5 }}>
                            <span style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                              {c.label}:
                            </span>{" "}
                            <s style={{ opacity: 0.6 }}>{c.from}</s> → <b>{c.to}</b>
                          </li>
                        ))}
                        {n.changes.length > 4 && (
                          <li style={{ fontSize: 11.5, color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                            и ещё {n.changes.length - 4}
                          </li>
                        )}
                      </ul>
                    )}

                    {n.domainName && (
                      <span
                        className="inline-block mt-1.5 font-mono uppercase"
                        style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--tracker-text-muted, var(--muted-foreground))" }}
                      >
                        {n.domainName}
                      </span>
                    )}

                    {n.kind === "access" && n.requestId && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); resolveAccess(n.requestId!, "approve"); }}
                        >
                          <Check className="size-3" /> Выдать
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); resolveAccess(n.requestId!, "reject"); }}
                        >
                          <X className="size-3" /> Отклонить
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
              {loading && items.length > 0 && (
                <p className="py-3 text-center" style={{ fontSize: 12, color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                  Загрузка…
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
