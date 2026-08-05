"use client";
/**
 * NotificationsBell — колокольчик уведомлений.
 *
 * Типы уведомлений:
 *  1. Запросы доступа к доменам (входящие + свои)
 *  2. Комментарии к задачам в доменах, где пользователь — редактор
 *  3. Вопросы в доменах, где пользователь — редактор
 *
 * Всегда отображается (даже без уведомлений).
 */
import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Check, X, Clock, MessageSquare, HelpCircle } from "lucide-react";

export interface AccessRequest {
  id: string;
  domainId: string;
  domainName: string;
  userId: string;
  username: string;
  displayName: string;
  status: string;
  createdAt: string;
  canResolve: boolean;
}

interface TaskComment {
  id: string;
  domainId: string;
  domainName: string;
  taskId: string;
  taskNum: string;
  taskName: string;
  author: string;
  text: string;
  date: string;
  type: "task_comment";
}

interface QuestionNotification {
  id: string;
  domainId: string;
  domainName: string;
  questionId: string;
  questionText: string;
  author: string;
  hasNewAnswer: boolean;
  type: "question";
}

interface NotificationsBellProps {
  token: string;
  currentUserId: string;
  toast: (opts: { title: string; description?: string }) => void;
  onResolved?: () => void;
}

export function NotificationsBell({ token, currentUserId, toast, onResolved }: NotificationsBellProps) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [questionNotifications, setQuestionNotifications] = useState<QuestionNotification[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"access" | "comments" | "questions">("access");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.accessRequests)) setRequests(data.accessRequests);
      if (Array.isArray(data.taskComments)) setTaskComments(data.taskComments);
      if (Array.isArray(data.questionNotifications)) setQuestionNotifications(data.questionNotifications);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const interval = setInterval(load, 30_000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [load]);

  const incoming = requests.filter(
    (r) => r.status === "pending" && r.canResolve && r.userId !== currentUserId
  );
  const own = requests.filter((r) => r.userId === currentUserId);
  const accessCount = incoming.length;
  const commentsCount = taskComments.length;
  const questionsCount = questionNotifications.length;
  const totalCount = accessCount + commentsCount + questionsCount;

  const resolve = async (requestId: string, action: "approve" | "reject") => {
    setBusy(requestId);
    try {
      const res = await fetch("/api/domains/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token, action, requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: action === "approve" ? "Доступ выдан" : "Запрос отклонён",
        });
        await load();
        if (action === "approve") onResolved?.();
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось обработать запрос" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения с сервером" });
    } finally {
      setBusy(null);
    }
  };

  const tabs = [
    { key: "access" as const, label: "Доступ", count: accessCount },
    { key: "comments" as const, label: "Комментарии", count: commentsCount },
    { key: "questions" as const, label: "Вопросы", count: questionsCount },
  ].filter((t) => t.count > 0 || t.key === "access");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rail-iconbtn size-8 shrink-0 relative rounded-lg flex items-center justify-center transition-colors"
          title="Уведомления"
        >
          <Bell className="size-3.5" />
          {totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: "#ef4444" }}>
              {totalCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-80 p-0 rounded-xl ink-pop overflow-hidden">
        {/* ── Вкладки ── */}
        {tabs.length > 1 && (
          <div className="flex border-b" style={{ borderColor: "rgba(250,250,248,0.12)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors relative"
                style={{
                  color: activeTab === tab.key ? "#FAFAF8" : "rgba(250,250,248,0.5)",
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] font-bold"
                    style={{ background: activeTab === tab.key ? "#FAFAF8" : "rgba(250,250,248,0.2)", color: activeTab === tab.key ? "#17181C" : "#FAFAF8" }}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: "#FAFAF8" }} />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
          {/* ── Доступ ── */}
          {activeTab === "access" && (
            <>
              {incoming.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(250,250,248,0.55)" }}>
                    Запросы на редактирование
                  </p>
                  {incoming.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.displayName || r.username}</span>
                        <span style={{ color: "rgba(250,250,248,0.5)" }}> → </span>
                        <span className="font-medium truncate">{r.domainName}</span>
                      </div>
                      <Button size="icon" variant="ghost" className="size-6 text-green-500 hover:text-green-400 hover:bg-[rgba(74,222,128,0.12)]"
                        disabled={busy === r.id} onClick={() => resolve(r.id, "approve")} title="Выдать доступ">
                        <Check className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-6 text-red-400 hover:text-red-300 hover:bg-[rgba(248,113,113,0.12)]"
                        disabled={busy === r.id} onClick={() => resolve(r.id, "reject")} title="Отклонить">
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {own.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(250,250,248,0.55)" }}>
                    Мои запросы
                  </p>
                  {own.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className="font-medium truncate flex-1">{r.domainName}</span>
                      {r.status === "pending" && (
                        <span className="flex items-center gap-1 text-amber-400"><Clock className="size-3" /> ожидает</span>
                      )}
                      {r.status === "approved" && (
                        <span className="flex items-center gap-1 text-green-400"><Check className="size-3" /> одобрен</span>
                      )}
                      {r.status === "rejected" && (
                        <span className="flex items-center gap-1 text-red-400"><X className="size-3" /> отклонён</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {incoming.length === 0 && own.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: "rgba(250,250,248,0.4)" }}>
                  Нет запросов доступа
                </p>
              )}
            </>
          )}

          {/* ── Комментарии к задачам ── */}
          {activeTab === "comments" && (
            <>
              {taskComments.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(250,250,248,0.55)" }}>
                    Комментарии к задачам
                  </p>
                  {taskComments.map((c) => (
                    <div key={c.id} className="rounded-lg p-2.5 text-xs" style={{ background: "rgba(250,250,248,0.05)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <MessageSquare className="size-3" style={{ color: "rgba(250,250,248,0.5)" }} />
                        <span className="font-medium" style={{ color: "rgba(250,250,248,0.7)" }}>
                          {c.domainName}
                        </span>
                        {c.taskNum && (
                          <span className="font-mono" style={{ color: "rgba(250,250,248,0.4)" }}>
                            №{c.taskNum}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2" style={{ color: "rgba(250,250,248,0.85)" }}>
                        {c.text}
                      </p>
                      {c.date && (
                        <p className="mt-1 text-[10px]" style={{ color: "rgba(250,250,248,0.35)" }}>
                          {c.date}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: "rgba(250,250,248,0.4)" }}>
                  Нет комментариев к задачам
                </p>
              )}
            </>
          )}

          {/* ── Вопросы ── */}
          {activeTab === "questions" && (
            <>
              {questionNotifications.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(250,250,248,0.55)" }}>
                    Вопросы по доменам
                  </p>
                  {questionNotifications.map((q) => (
                    <div key={q.id} className="rounded-lg p-2.5 text-xs" style={{ background: "rgba(250,250,248,0.05)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <HelpCircle className="size-3" style={{ color: q.hasNewAnswer ? "#3FB574" : "rgba(250,250,248,0.5)" }} />
                        <span className="font-medium" style={{ color: "rgba(250,250,248,0.7)" }}>
                          {q.domainName}
                        </span>
                        <span className="text-[10px]" style={{ color: "rgba(250,250,248,0.4)" }}>
                          от {q.author}
                        </span>
                      </div>
                      <p className="line-clamp-2" style={{ color: "rgba(250,250,248,0.85)" }}>
                        {q.questionText}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: "rgba(250,250,248,0.4)" }}>
                  Нет вопросов
                </p>
              )}
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
