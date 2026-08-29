"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Task, TaskComment, STATUSES, PRIORITIES, MONTHS, type Status, type Priority, type AllData } from "@/lib/types";
import { PCOL, scolText } from "@/lib/tokens";
import { evalExpr, fmt2, getTaskMetrics, progColor, CLOSED_STATUSES } from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";
import { describeTaskHistory } from "@/lib/task-history";
import {
  ChevronDown, ChevronUp, MessageSquare, Reply, Paperclip, Send, X,
  Package, Trash2, ExternalLink,
} from "lucide-react";

/* Бюджет задачи, ролловер и отсечение относятся к монитору руководителя.
   Механизм пока не работает, поэтому в окне задачи не показывается:
   расчёты живут в lib/metrics.ts и lib/cut-algorithm.ts. */
const FLAG_LABELS: Record<string, string> = {
  escalate: "Эскалировать", pause: "Пауза",
  cancel: "Отмена", request_status: "Статус",
};
const FLAG_COLORS: Record<string, string> = {
  escalate: "var(--tracker-danger)", pause: "var(--tracker-warning)", cancel: "var(--tracker-text-muted)", request_status: "var(--tracker-success)",
};

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  month: number;
  isDark: boolean;
  currentUsername: string;
  allData: AllData;
  onUpdateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  onDeleteTask: (month: number, taskId: string) => void;
  onMoveToBacklog: (month: number, taskId: string) => void;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

export function TaskDetailDialog({
  open, onOpenChange, task, month, isDark, currentUsername, allData, onUpdateTask,
  onDeleteTask, onMoveToBacklog,
}: TaskDetailDialogProps) {
  const snapshot = useTaskStore(s => s.snapshot);

  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const comments: TaskComment[] = task.taskComments || [];

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => { setAttachments(prev => [...prev, ev.target?.result as string]); };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, []);

  const addComment = useCallback(() => {
    const text = newComment.trim();
    if (!text && attachments.length === 0) return;
    const comment: TaskComment = {
      id: generateId(), author: currentUsername,
      date: new Date().toLocaleDateString("ru-RU"), text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };
    snapshot();
    let updated: TaskComment[];
    if (replyTo) {
      const addReply = (list: TaskComment[]): TaskComment[] =>
        list.map(c => c.id === replyTo
          ? { ...c, replies: [...(c.replies || []), comment] }
          : { ...c, replies: c.replies ? addReply(c.replies) : undefined });
      updated = addReply(comments);
    } else {
      updated = [...comments, comment];
    }
    onUpdateTask(month, task.id, "taskComments", updated);
    setNewComment(""); setReplyTo(null); setAttachments([]);
  }, [newComment, attachments, replyTo, comments, currentUsername, month, task.id, snapshot, onUpdateTask]);

  const deleteComment = useCallback((cid: string) => {
    snapshot();
    const remove = (list: TaskComment[]): TaskComment[] =>
      list.filter(c => c.id !== cid).map(c => ({ ...c, replies: c.replies ? remove(c.replies) : undefined }));
    onUpdateTask(month, task.id, "taskComments", remove(comments));
  }, [comments, month, task.id, snapshot, onUpdateTask]);

  const handleFieldUpdate = useCallback((key: keyof Task, value: unknown) => {
    snapshot();
    onUpdateTask(month, task.id, key, value);
  }, [month, task.id, snapshot, onUpdateTask]);

  const isRejected = task.approvalStatus === "rejected";
  const hasFlag = !!task.executiveFlag;

  // Month-by-month breakdown
  const monthBreakdown = useMemo(() => {
    if (!task.num) return [];
    const rows: { month: number; planH: number; factH: number; cumulative: number; status: string }[] = [];
    let cum = 0;
    for (let m = 0; m <= 11; m++) {
      const mr = (allData[m] || []).filter((t: Task) => !t._deleted);
      const t = mr.find((r: Task) => r.num === task.num);
      if (t) {
        const plan = evalExpr(t.planH);
        const fact = evalExpr(t.factH);
        cum += fact;
        rows.push({ month: m, planH: plan, factH: fact, cumulative: cum, status: t.status });
      }
    }
    return rows;
  }, [task.num, allData]);

  const maxMonthPlan = useMemo(() => {
    if (monthBreakdown.length === 0) return 0;
    return Math.max(...monthBreakdown.map(r => r.planH));
  }, [monthBreakdown]);

  const totalFact = useMemo(() => {
    return monthBreakdown.reduce((s, r) => s + r.factH, 0);
  }, [monthBreakdown]);

  const maxCum = useMemo(() => {
    if (monthBreakdown.length === 0) return 0;
    return Math.max(...monthBreakdown.map(r => r.cumulative));
  }, [monthBreakdown]);

  /** Накопленный итог превысил план месяца — единственный повод для красного. */
  const isOverTotal = evalExpr(task.planH) > 0 && maxCum > evalExpr(task.planH);

  const planfixUrl = task.num ? `https://emk.planfix.ru/task/${task.num}` : null;

  /** Свёрнуто по умолчанию: комментарии оставляют нечасто. */
  const [commentsOpen, setCommentsOpen] = useState(false);

  /* Цвета плашек — палитра Planfix, как на карточке. */
  const statusColor = scolText(task.status, isDark) || "var(--tracker-text-muted)";
  const prioColor = PCOL[task.priority] || "var(--tracker-text-muted)";

  /* Числа шапки считает та же функция, что и карточку в списке, —
     раньше диалог считал прогресс сам и показывал 73% там, где
     карточка показывала 100%: закрытость задачи здесь не учитывалась. */
  const headMetrics = useMemo(() => getTaskMetrics(task), [task]);
  const totalColor = progColor(
    headMetrics.prog,
    CLOSED_STATUSES.has(task.status as Status),
    headMetrics.over,
  );

  const renderComment = (c: TaskComment, depth: number = 0) => (
    <div key={c.id} className="group" style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      <div className="flex gap-3 py-3" style={{ borderBottom: "2px solid var(--tracker-accent)" }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
          style={{ background: "var(--tracker-accent-bg, rgba(29,158,117,0.1))", color: "var(--tracker-accent-fg-dark, var(--foreground))" }}>
          {c.author?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color: "var(--tracker-text-main, var(--foreground))" }}>{c.author}</span>
            <span className="text-[11px]" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>{c.date}</span>
            <div className="flex-1" />
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-destructive/10 text-destructive"
              onClick={() => deleteComment(c.id)}>
              <X className="size-3.5" />
            </button>
          </div>
          {c.text && <p className="text-sm leading-relaxed" style={{ color: "var(--tracker-text-main, var(--foreground))" }}>{c.text}</p>}
          {c.attachments && c.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {c.attachments.map((att, i) => (
                <a key={i} href={att} target="_blank" rel="noopener noreferrer" className="block">
                  {att.startsWith("data:image/") ? (
                    <img src={att} alt="Вложение" className="max-h-32 max-w-[220px] rounded-xl object-cover" />
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-xl border flex items-center gap-1.5"
                      style={{ borderColor: "var(--tracker-accent)", borderWidth: 2 }}>
                      <Paperclip className="size-3.5" /> Файл
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}
          <button className="text-[11px] flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full hover:bg-muted transition-colors"
            style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
            onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); textareaRef.current?.focus(); }}>
            <Reply className="size-3.5" /> Ответить
          </button>
        </div>
      </div>
      {c.replies && c.replies.map(r => renderComment(r, depth + 1))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="task-dialog p-0 gap-0 overflow-hidden"
        style={{ width: "min(1100px, 94vw)", maxWidth: "min(1100px, 94vw)", maxHeight: "92vh" }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{task.num ? `#${task.num}` : ""} {task.name || "Без названия"}</DialogTitle>
          <DialogDescription>Подробности задачи</DialogDescription>
        </DialogHeader>

        {/* ── Шапка: название и три числа ───────────────────────────── */}
        <div className="task-dialog-head">
          <div className="min-w-0 flex-1">
            <p className="task-dialog-name">
              {task.name || "Без названия"}
              {task.num && <span className="task-dialog-num delta-num"> #{task.num}</span>}
            </p>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              <span
                className="task-dialog-pill"
                style={{ color: statusColor, borderColor: statusColor }}
              >
                {task.status}
              </span>
              <span
                className="task-dialog-pill"
                style={{ color: prioColor, borderColor: prioColor }}
              >
                {task.priority}
              </span>
              {hasFlag && (
                <span className="task-dialog-pill" style={{ color: FLAG_COLORS[task.executiveFlag!], borderColor: FLAG_COLORS[task.executiveFlag!] }}>
                  {FLAG_LABELS[task.executiveFlag!] ?? "Сигнал"}
                </span>
              )}
            </div>
          </div>

          <dl className="task-dialog-figures">
            <div>
              <dt>План</dt>
              <dd>{fmt2(headMetrics.plan)}</dd>
            </div>
            <div>
              <dt>Факт</dt>
              <dd>{fmt2(headMetrics.fact)}</dd>
            </div>
            <div>
              <dt style={{ color: totalColor }}>Итого</dt>
              <dd className="task-dialog-total" style={{ color: totalColor }}>{fmt2(headMetrics.totalH)}</dd>
            </div>
          </dl>
        </div>

        <div className="task-dialog-body">
          {/* ── Слева: часы по месяцам и заметка ────────────────────── */}
          <div className="task-dialog-main">
            <SectionTitle>Часы по месяцам</SectionTitle>

            {/* Месяцы горизонтальными полосами: один месяц — одна строка.
                Вертикальные столбцы при одном месяце оставляли пустоту,
                а задачи чаще всего закрываются месяц в месяц. */}
            <div className="month-bars">
              {monthBreakdown.map((r) => {
                const over = r.planH > 0 && r.cumulative > r.planH;
                const width = r.planH > 0
                  ? Math.min(100, (r.cumulative / r.planH) * 100)
                  : (r.cumulative > 0 ? 100 : 0);
                const closed = CLOSED_STATUSES.has(r.status as Status);
                const fill = over
                  ? "var(--tracker-danger)"
                  : closed
                    ? "var(--tracker-success)"
                    : "var(--tracker-accent)";
                return (
                  <div className="month-bar-row" key={r.month}>
                    <span className="month-bar-label delta-num">
                      {MONTHS[r.month].substring(0, 3).toLowerCase()}
                    </span>
                    <span className="month-bar-track">
                      <i style={{ width: `${width}%`, background: fill }} />
                    </span>
                    <span
                      className="month-bar-value delta-num"
                      style={over ? { color: "var(--tracker-danger)" } : undefined}
                    >
                      {fmt2(r.cumulative)} / {fmt2(r.planH)}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="task-dialog-prose">{describeTaskHistory(monthBreakdown)}</p>

            <div className="mt-5">
              <SectionTitle>Заметка</SectionTitle>
              <textarea
                className="task-dialog-note"
                value={task.comment || ""}
                onChange={(e) => handleFieldUpdate("comment", e.target.value)}
                placeholder="Что сделано, что осталось, договорённости…"
                rows={4}
              />
              <p className="task-dialog-hint">
                Можно писать формулы: <span className="delta-num">@факт+2</span> добавит два часа к факту.
              </p>
            </div>
          </div>

          {/* ── Справа: реквизиты ────────────────────────────────────── */}
          <aside className="task-dialog-side">
            <SectionTitle>Реквизиты</SectionTitle>

            <EditField label="Название" value={task.name} onChange={(v) => handleFieldUpdate("name", v)} />

            <div className="grid grid-cols-2 gap-2">
              <EditField label="Номер" value={task.num} onChange={(v) => handleFieldUpdate("num", v)} />
              <EditField label="План (ч)" value={task.planH} onChange={(v) => handleFieldUpdate("planH", v)} />
            </div>

            <EditField label="Факт (ч)" value={task.factH} onChange={(v) => handleFieldUpdate("factH", v)} />

            <div>
              <label className="task-dialog-label">Статус</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="task-dialog-select" style={{ color: statusColor, borderColor: statusColor }}>
                    <span className="truncate">{task.status}</span>
                    <ChevronDown className="size-3.5 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  {Object.values(STATUSES).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => handleFieldUpdate("status", s)}>
                      <span style={{ color: scolText(s, isDark) || undefined }}>{s}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <label className="task-dialog-label">Приоритет</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="task-dialog-select" style={{ color: prioColor, borderColor: prioColor }}>
                    <span className="truncate">{task.priority}</span>
                    <ChevronDown className="size-3.5 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {Object.values(PRIORITIES).map((pr) => (
                    <DropdownMenuItem key={pr} onClick={() => handleFieldUpdate("priority", pr)}>
                      <span style={{ color: PCOL[pr] }}>{pr}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>
        </div>

        {/* ── Панель действий ──────────────────────────────────────── */}
        <div className="task-dialog-actions">
          <button
            className={`task-dialog-btn ${commentsOpen ? "task-dialog-btn--on" : ""}`}
            onClick={() => setCommentsOpen((v) => !v)}
            aria-expanded={commentsOpen}
          >
            <MessageSquare className="size-3.5" />
            Обсуждение
            <span className="delta-num opacity-70">{comments.length}</span>
            {commentsOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          <div className="ml-auto flex gap-2">
            {planfixUrl && (
              <a className="task-dialog-btn" href={planfixUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                PlanFix
              </a>
            )}
            <button className="task-dialog-btn" onClick={() => { onMoveToBacklog(month, task.id); onOpenChange(false); }}>
              <Package className="size-3.5" />
              В беклог
            </button>
            <button
              className="task-dialog-btn task-dialog-btn--danger"
              onClick={() => { onDeleteTask(month, task.id); onOpenChange(false); }}
            >
              <Trash2 className="size-3.5" />
              Удалить
            </button>
          </div>
        </div>

        {/* ── Обсуждение: свёрнуто по умолчанию ─────────────────────── */}
        {commentsOpen && (
          <div className="task-dialog-comments">
            {comments.length === 0 ? (
              <div className="empty-state py-6">
                <div className="empty-state-icon"><MessageSquare className="size-6" /></div>
                <p className="empty-state-title">Пока нет комментариев</p>
                <p className="empty-state-hint">Первый комментарий откроет обсуждение задачи</p>
              </div>
            ) : (
              comments.map((c) => renderComment(c))
            )}

            <div className="flex gap-2 mt-3">
              <textarea
                ref={textareaRef}
                className="task-dialog-note flex-1"
                rows={2}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Написать комментарий…"
              />
              <Button onClick={addComment} disabled={!newComment.trim()} className="self-end">
                <Send className="size-3.5" />
                Отправить
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Заголовок раздела — бровь с чертой, как в шапке месяца.
 *  Раньше была чёрная таблетка: язык, которого нет больше нигде. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4
      className="mb-3 pb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.1em]"
      style={{ color: "var(--tracker-text-muted)", borderBottom: "2px solid var(--tracker-accent)" }}
    >
      {children}
    </h4>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--tracker-text-main, #17181C)" }}>{label}</label>
      <input className="field-input h-10 text-base w-full" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function ActionButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl transition-all ${active ? "font-semibold shadow-sm" : ""}`}
      style={{
        color: active ? "var(--tracker-accent-fg)" : "var(--tracker-text-muted)",
        background: active ? "var(--tracker-accent-bg, rgba(29,158,117,0.12))" : "transparent",
      }}
      onClick={onClick}>
      {icon} {label}
    </button>
  );
}
