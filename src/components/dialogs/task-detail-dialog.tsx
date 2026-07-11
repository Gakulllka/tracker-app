"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Task, TaskComment, STATUSES, PRIORITIES, MONTHS, PCOL, PHASE_COLORS, scolText, type Status, type Priority, type AllData } from "@/lib/types";
import { calcRollover, R2, MONTH_CAPACITY, evalExpr, fmt2, getTaskMetrics, progColor } from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";
import {
  MessageSquare, Reply, Paperclip, Send, X, Package, Trash2, ExternalLink, Wallet } from "lucide-react";

/** Бюджетный функционал скрыт по решению владельца (код сохранён). */
const SHOW_BUDGET = false;

const FLAG_LABELS: Record<string, string> = {
  escalate: "Эскалировать", pause: "Пауза",
  cancel: "Отмена", request_status: "Статус",
};
const FLAG_COLORS: Record<string, string> = {
  escalate: "#E24B4A", pause: "#BA7517", cancel: "#6B7280", request_status: "#1D9E75",
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
  usedHoursInMonth: number;
  monthCapacity?: number;
  isFirstToCutIds?: Set<string>;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

export function TaskDetailDialog({
  open, onOpenChange, task, month, isDark, currentUsername, allData, onUpdateTask,
  onDeleteTask, onMoveToBacklog, usedHoursInMonth, monthCapacity = MONTH_CAPACITY, isFirstToCutIds,
}: TaskDetailDialogProps) {
  const snapshot = useTaskStore(s => s.snapshot);

  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const planHNum = parseFloat(task.planH) || 0;
  const [budgetInput, setBudgetInput] = useState<string>(
    String(task.totalBudgetRequested ?? (planHNum >= 100 ? planHNum : "")),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (open) {
      setBudgetInput(String(task.totalBudgetRequested ?? (planHNum >= 100 ? planHNum : "")));
    }
  }, [open, task.totalBudgetRequested, planHNum]);

  const comments: TaskComment[] = task.taskComments || [];

  const budgetNum = parseFloat(budgetInput) || 0;
  const usedExcludingSelf = Math.max(0, usedHoursInMonth - (task.budgetAllocated ?? 0));
  const { budgetAllocated: previewAllocated, budgetRollover: previewRollover } =
    calcRollover(budgetNum, usedExcludingSelf, monthCapacity);
  const freeHours = Math.max(0, monthCapacity - usedExcludingSelf);

  const flash = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); };

  const handleSaveBudget = () => {
    setIsSaving(true);
    const total = parseFloat(budgetInput) || 0;
    const { budgetAllocated, budgetRollover } = calcRollover(total, usedExcludingSelf, monthCapacity);
    onUpdateTask(month, task.id, "totalBudgetRequested", total);
    onUpdateTask(month, task.id, "budgetAllocated", budgetAllocated);
    onUpdateTask(month, task.id, "budgetRollover", budgetRollover);
    setTimeout(() => { setIsSaving(false); flash(); }, 300);
  };

  const handleAccept = () => {
    snapshot();
    onUpdateTask(month, task.id, "approvalStatus", "approved");
    onUpdateTask(month, task.id, "executiveFlag", undefined);
    flash();
  };

  const handleReject = () => {
    snapshot();
    onUpdateTask(month, task.id, "approvalStatus", "rejected");
    onUpdateTask(month, task.id, "budgetAllocated", 0);
    onUpdateTask(month, task.id, "totalBudgetRequested", 0);
    onUpdateTask(month, task.id, "executiveFlag", undefined);
    flash();
  };

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

  const isPending = task.approvalStatus === "pending";
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

  const planfixUrl = task.num ? `https://emk.planfix.ru/task/${task.num}` : null;

  const renderComment = (c: TaskComment, depth: number = 0) => (
    <div key={c.id} className="group" style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      <div className="flex gap-3 py-3" style={{ borderBottom: "1px solid var(--tracker-border, var(--border))" }}>
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
                      style={{ borderColor: "var(--tracker-border, var(--border))" }}>
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
        className="p-0 gap-0 rounded-2xl border overflow-hidden"
        style={{
          background: "var(--tracker-bg-card, var(--background))",
          borderColor: "var(--tracker-border)",
          width: "min(1200px, 94vw)",
          height: "min(860px, 92vh)",
          maxWidth: "min(1200px, 94vw)",
          maxHeight: "min(860px, 92vh)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{task.num ? `#${task.num}` : ""} {task.name || "Без названия"}</DialogTitle>
          <DialogDescription>Детали задачи и обсуждение</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-full overflow-hidden">

          {/* ═══════════════════ ЛЕВАЯ КОЛОНКА ═══════════════════ */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ borderRight: "1px solid var(--tracker-border, var(--border))" }}>

            {/* ── Sticky Header ── */}
            <div className="shrink-0 p-4 pb-3 border-b" style={{ borderColor: "var(--tracker-border, var(--border))", background: "var(--tracker-bg, var(--background))" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-lg font-bold" style={{ color: "var(--tracker-text-main, #17181C)" }}>
                      {task.name || "Без названия"}
                    </span>
                    {task.num && <span className="text-sm font-mono" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>#{task.num}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                      style={{ color: scolText(task.status, isDark) || "#888", background: (scolText(task.status, isDark) || "#888") + "18" }}>
                      {task.status}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                      style={{ color: PCOL[task.priority] || "#888", background: (PCOL[task.priority] || "#888") + "20" }}>
                      {task.priority}
                    </span>
                    <span className="text-sm tabular-nums" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                      {task.planH || "0"}ч план / {task.factH || "0"}ч факт / <span style={{ color: maxCum <= evalExpr(task.planH) ? "#1D9E75" : "#E24B4A" }}>{fmt2(maxCum)}ч</span> итого
                    </span>
                    {SHOW_BUDGET && (task.budgetAllocated ?? 0) > 0 && (
                      <span className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(29,158,117,0.1)", color: "#1D9E75" }}>
                        {task.budgetAllocated}ч
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {savedFlash && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg"
                      style={{ background: "rgba(29,158,117,0.12)", color: "#1D9E75" }}>
                      ✓ Сохранено
                    </span>
                  )}
                  {planfixUrl && (
                    <a href={planfixUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
                      style={{ background: "var(--tracker-accent, #17181C)", color: "var(--tracker-accent-contrast, #F5F5F2)" }}>
                      <ExternalLink className="size-4" /> Открыть в PlanFix
                    </a>
                  )}
                  <button className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "var(--tracker-accent, #17181C)", color: "var(--tracker-accent-contrast, #F5F5F2)" }}
                    onClick={() => { snapshot(); onMoveToBacklog(month, task.id); onOpenChange(false); }}>
                    <Package className="size-4" /> В беклог
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                    style={{ background: "var(--tracker-accent, #17181C)", color: "var(--tracker-danger, #E0706A)" }}
                    onClick={() => { snapshot(); onDeleteTask(month, task.id); onOpenChange(false); }}>
                    <Trash2 className="size-4" /> Удалить
                  </button>
                </div>
              </div>

              {isPending && (
                <div className="mt-2.5 rounded-xl p-2.5 border flex items-center justify-between"
                  style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.3)" }}>
                  <span className="text-xs font-medium" style={{ color: "#854F0B" }}>Ожидает подтверждения БА</span>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-[11px] rounded-lg px-3" style={{ background: "#1D9E75", color: "#fff" }} onClick={handleAccept}>Принять</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-lg px-3" style={{ borderColor: "#E24B4A", color: "#E24B4A" }} onClick={handleReject}>Отклонить</Button>
                  </div>
                </div>
              )}
              {isRejected && (
                <div className="mt-2.5 rounded-xl p-2.5 border text-xs" style={{ background: "rgba(226,75,74,0.06)", borderColor: "rgba(226,75,74,0.2)", color: "#A32D2D" }}>
                  Задача отклонена БА.
                </div>
              )}
              {hasFlag && task.executiveFlag && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge className="text-[10px] px-2 py-0.5 rounded-full border"
                    style={{ background: FLAG_COLORS[task.executiveFlag] + "18", color: FLAG_COLORS[task.executiveFlag], borderColor: FLAG_COLORS[task.executiveFlag] + "40" }}>
                    {FLAG_LABELS[task.executiveFlag] ?? task.executiveFlag}
                  </Badge>
                  <button className="text-[10px] hover:text-destructive" style={{ color: "var(--tracker-text-muted)" }}
                    onClick={() => onUpdateTask(month, task.id, "executiveFlag", undefined)}>Снять</button>
                </div>
              )}
            </div>

            {/* ── Scrollable Content ── */}
            <div className="flex-1 overflow-y-auto">

            {/* ── Основная информация ── */}
            <div className="px-5 py-4">
              <SectionTitle>Основная информация</SectionTitle>

              {/* Ряд 1: Название + Номер */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="col-span-3">
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--tracker-text-main, #17181C)" }}>Название задачи</label>
                  <input className="field-input h-10 text-base w-full font-medium" value={task.name}
                    onChange={e => handleFieldUpdate("name", e.target.value)} placeholder="Название задачи" />
                </div>
                <div className="col-span-1">
                  <EditField label="Номер" value={task.num || ""} onChange={v => handleFieldUpdate("num", v)} />
                </div>
              </div>

              {/* Ряд 2: План + Факт + Итого */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <EditField label="План (ч)" value={task.planH || ""} onChange={v => handleFieldUpdate("planH", v)} />
                </div>
                <div>
                  <EditField label="Факт (ч)" value={task.factH || ""} onChange={v => handleFieldUpdate("factH", v)} />
                </div>
                <div>
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--tracker-text-main, #17181C)" }}>Итого (ч)</label>
                  <div className="field-input h-10 flex items-center text-base font-semibold tabular-nums"
                    style={{ color: maxCum <= maxMonthPlan ? "#1D9E75" : "#E24B4A" }}>
                    {fmt2(maxCum)}
                  </div>
                </div>
              </div>

              {/* Статус */}
              <div className="mb-4">
                <label className="mb-1.5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--tracker-accent-contrast, #F5F5F2)", background: "var(--tracker-accent, #17181C)" }}>Статус</label>

                {/* Виджет прогресса */}
                {(() => {
                  const plan = evalExpr(task.planH);
                  const fact = evalExpr(task.factH);
                  const isClosed = ["Завершена", "Контроль на прод", "Выполненная", "Отменено", "Отложена"].includes(task.status);
                  const pct = isClosed ? 100 : (plan > 0 ? Math.min(100, Math.round(fact / plan * 100)) : 0);
                  const over = fact > plan && plan > 0;
                  const barColor = isClosed ? "#1D9E75" : over ? "#E24B4A" : "#1D9E75";
                  return (
                    <div className="mb-3 p-3 rounded-xl" style={{ background: "var(--tracker-accent-soft, rgba(23,24,28,0.05))", border: "1px solid var(--tracker-border, #DEDDD6)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: "var(--tracker-text-muted, #5D5D57)" }}>Прогресс</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: barColor }}>{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--tracker-border, #DEDDD6)" }}>
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: "var(--tracker-text-muted, #5D5D57)" }}>
                        <span>Факт: {fmt2(fact)}ч</span>
                        <span>План: {fmt2(plan)}ч</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Компактные статусы */}
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { items: [STATUSES.IDEA, STATUSES.NEW], color: PHASE_COLORS.new },
                    { items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS], color: PHASE_COLORS.in_progress },
                    { items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE], color: PHASE_COLORS.done },
                    { items: [STATUSES.POSTPONED, STATUSES.CANCEL], color: PHASE_COLORS.cancel },
                  ]).map((group) =>
                    group.items.map((s) => (
                      <button key={s}
                        onClick={() => handleFieldUpdate("status", s)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${task.status === s ? "" : "opacity-60 hover:opacity-100"}`}
                        style={{
                          color: scolText(s, isDark) || "#888",
                          background: (scolText(s, isDark) || "#888") + "20",
                          outline: task.status === s ? `2px solid ${scolText(s, isDark) || "#888"}` : "none",
                          outlineOffset: "2px",
                        }}>
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--tracker-accent-contrast, #F5F5F2)", background: "var(--tracker-accent, #17181C)" }}>Приоритет</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(PRIORITIES).map(p => (
                    <button key={p}
                      onClick={() => handleFieldUpdate("priority", p)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${task.priority === p ? "" : "opacity-60 hover:opacity-100"}`}
                      style={{
                        color: PCOL[p],
                        background: PCOL[p] + "20",
                        outline: task.priority === p ? `2px solid ${PCOL[p]}` : "none",
                        outlineOffset: "2px",
                      }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Часы по месяцам ── */}
            {monthBreakdown.length > 0 && (
              <div className="px-5 py-4 border-t" style={{ borderColor: "var(--tracker-border, var(--border))" }}>
                <SectionTitle>Часы по месяцам</SectionTitle>

                {/* Mini bar chart */}
                <div className="flex items-end gap-2 h-32 mb-4 px-1">
                  {monthBreakdown.map((r) => {
                    const maxVal = Math.max(maxMonthPlan, maxCum, 1);
                    const planPx = Math.max((r.planH / maxVal) * 100, 3);
                    const cumPx = Math.max((r.cumulative / maxVal) * 100, 3);
                    const over = r.cumulative > r.planH && r.planH > 0;
                    return (
                      <div key={r.month} className="flex-1 flex flex-col items-center min-w-0">
                        <div className="w-full flex items-end justify-center gap-1" style={{ height: "96px" }}>
                          <div className="flex-1 rounded-t-md transition-all" style={{ height: `${planPx}%`, background: "color-mix(in srgb, var(--tracker-text-muted, #94a3b8) 30%, transparent)", minHeight: "4px" }} title={`План: ${fmt2(r.planH)}ч`} />
                          <div className="flex-1 rounded-t-md transition-all" style={{ height: `${cumPx}%`, background: over ? "#E24B4A" : "#1D9E75", minHeight: "4px" }} title={`Факт: ${fmt2(r.factH)}ч`} />
                        </div>
                        <span className="text-[9px] mt-1.5 font-semibold" style={{ color: "var(--tracker-text-muted)" }}>
                          {MONTHS[r.month].substring(0, 3).toLowerCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Легенда */}
                <div className="flex items-center justify-center gap-4 mb-3 text-[9px]" style={{ color: "var(--tracker-text-muted)" }}>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: "color-mix(in srgb, var(--tracker-text-muted, #94a3b8) 30%, transparent)" }} />План</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#1D9E75]" />Факт</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#E24B4A]" />Превышение</span>
                </div>

                {/* Таблица */}
                <div className="rounded-xl overflow-hidden border text-xs" style={{ borderColor: "var(--tracker-border, var(--border))" }}>
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--tracker-accent-bg, rgba(29,158,117,0.06))" }}>
                        {["Месяц", "План", "Факт", "Итого", "Статус"].map((h, i) => (
                          <th key={h} className="text-[9px] uppercase tracking-wider font-semibold px-2.5 py-1.5"
                            style={{ textAlign: i === 0 ? "left" : i === 4 ? "center" : "right", color: "var(--tracker-text-muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthBreakdown.map((r) => {
                        const over = r.cumulative > r.planH && r.planH > 0;
                        return (
                          <tr key={r.month} style={{ borderTop: "1px solid var(--tracker-border, var(--border))" }}>
                            <td className="px-2.5 py-1.5 font-medium">{MONTHS[r.month]}</td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums" style={{ color: "var(--tracker-text-muted)" }}>{fmt2(r.planH)}ч</td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt2(r.factH)}ч</td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold" style={{ color: over ? "#E24B4A" : "#1D9E75" }}>{fmt2(r.cumulative)}ч</td>
                            <td className="px-2.5 py-1.5 text-center">
                              <span className="text-[9px] font-medium" style={{ color: scolText(r.status as Status, isDark) }}>{r.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--tracker-border, var(--border))", background: "var(--tracker-accent-bg, rgba(29,158,117,0.03))" }}>
                        <td className="px-2.5 py-1.5 font-bold">Итого</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold" style={{ color: "var(--tracker-text-muted)" }}>{fmt2(maxMonthPlan)}ч</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{fmt2(totalFact)}ч</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums font-bold" style={{ color: maxCum <= maxMonthPlan ? "#1D9E75" : "#E24B4A" }}>{fmt2(maxCum)}ч</td>
                        <td className="px-2.5 py-1.5 text-center text-[9px]" style={{ color: "var(--tracker-text-muted)" }}>{monthBreakdown.length} мес.</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Бюджет (скрыт: SHOW_BUDGET=false, код сохранён) ── */}
            {SHOW_BUDGET && (
            <div className="px-5 py-4 border-t" style={{ borderColor: "var(--tracker-border, var(--border))" }}>
              <SectionTitle>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-md"
                  style={{ background: "rgba(29,158,117,0.12)", color: "#1D9E75" }}><Wallet className="size-3" /></span>
                Бюджет
              </SectionTitle>

              <div className="rounded-xl p-3.5 mb-4 grid grid-cols-3 gap-3 text-center text-sm"
                style={{ background: "var(--tracker-accent-bg, rgba(29,158,117,0.06))", border: "1px solid var(--tracker-border, var(--border))" }}>
                <div><p className="text-[10px] mb-1" style={{ color: "var(--tracker-text-muted)" }}>Лимит</p><p className="font-bold text-base">{monthCapacity}ч</p></div>
                <div><p className="text-[10px] mb-1" style={{ color: "var(--tracker-text-muted)" }}>Занято</p><p className="font-bold text-base">{R2(usedExcludingSelf)}ч</p></div>
                <div><p className="text-[10px] mb-1" style={{ color: "var(--tracker-text-muted)" }}>Свободно</p>
                  <p className="font-bold text-base" style={{ color: freeHours > 0 ? "#1D9E75" : "#E24B4A" }}>{freeHours}ч</p></div>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <input type="number" min={0} step={1} className="flex-1 h-9 rounded-xl border px-3 text-sm outline-none focus:ring-2 tabular-nums"
                  style={{ background: "var(--tracker-bg)", borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                  value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                  placeholder={planHNum >= 100 ? String(planHNum) : "0"} />
                <span className="text-sm" style={{ color: "var(--tracker-text-muted)" }}>ч</span>
                <Button size="sm" className="h-9 text-sm px-5 rounded-xl" style={{ background: "var(--tracker-accent, #1D9E75)", color: "#fff" }}
                  disabled={isSaving || budgetNum <= 0} onClick={handleSaveBudget}>
                  {isSaving ? "…" : "Сохранить"}
                </Button>
              </div>

              {budgetNum > 0 && (
                <div className="rounded-xl p-3 text-sm space-y-1.5" style={{ background: "var(--tracker-bg)", border: "1px solid var(--tracker-border)" }}>
                  <div className="flex justify-between"><span style={{ color: "var(--tracker-text-muted)" }}>В этом месяце</span><span className="font-bold" style={{ color: "#1D9E75" }}>{previewAllocated}ч</span></div>
                  {previewRollover > 0 && <div className="flex justify-between"><span style={{ color: "var(--tracker-text-muted)" }}>Ролловер</span><span className="font-bold" style={{ color: "#BA7517" }}>{previewRollover}ч</span></div>}
                  {previewRollover === 0 && <p className="text-xs" style={{ color: "#1D9E75" }}>✓ Влезает в текущий месяц</p>}
                </div>
              )}

              {(task.totalBudgetRequested !== undefined) && (
                <div className="mt-3 pt-3 border-t space-y-1 text-xs" style={{ borderColor: "var(--tracker-border)" }}>
                  <div className="flex justify-between"><span style={{ color: "var(--tracker-text-muted)" }}>Запрошено</span><span className="tabular-nums">{task.totalBudgetRequested ?? 0}ч</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--tracker-text-muted)" }}>Выделено</span><span className="tabular-nums" style={{ color: "#1D9E75" }}>{task.budgetAllocated ?? 0}ч</span></div>
                  {(task.budgetRollover ?? 0) > 0 && <div className="flex justify-between"><span style={{ color: "var(--tracker-text-muted)" }}>Перенос</span><span className="tabular-nums" style={{ color: "#BA7517" }}>{task.budgetRollover}ч</span></div>}
                </div>
              )}

              <label className="flex items-center gap-2.5 mt-3 cursor-pointer text-sm">
                <input type="checkbox" className="w-4 h-4 rounded accent-blue-500" checked={!!task.excludeFromCut}
                  onChange={() => onUpdateTask(month, task.id, "excludeFromCut", !task.excludeFromCut)} />
                <span style={{ color: "var(--tracker-text-muted)" }}>Не отсекать при нехватке</span>
              </label>
            </div>
            )}
            </div>{/* end scrollable content */}
          </div>{/* end left column */}

          {/* ═══════════════════ ПРАВАЯ КОЛОНКА: Комментарии ═══════════════════ */}
          <div className="w-full md:w-[38%] md:min-w-[320px] flex flex-col overflow-hidden border-t md:border-t-0"
            style={{ borderColor: "var(--tracker-border, var(--border))" }}>
            <div className="px-5 py-4 flex items-center justify-between border-b shrink-0"
              style={{ borderColor: "var(--tracker-border, var(--border))" }}>
              <h4 className="paper-eyebrow flex items-center gap-2">
                <MessageSquare className="size-3.5" />
                Комментарии · {comments.length}
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {comments.length === 0 && (
                <p className="text-sm" style={{ color: "var(--tracker-text-muted)" }}>Пока нет комментариев</p>
              )}
              {comments.map(c => renderComment(c))}
            </div>

            {/* New comment input */}
            <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--tracker-border, var(--border))" }}>
              <div className="flex flex-col gap-2">
                {replyTo && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    <Reply className="size-3.5" /> Ответ
                    <button onClick={() => setReplyTo(null)} className="hover:text-destructive"><X className="size-3.5" /></button>
                  </div>
                )}
                <textarea ref={textareaRef}
                  className="w-full text-sm p-3 rounded-2xl border outline-none resize-none min-h-[56px]"
                  style={{ background: "var(--tracker-bg)", borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                  placeholder="Написать комментарий..." value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment(); }} />

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att, i) => (
                      <div key={i} className="relative group/att">
                        {att.startsWith("data:image/") ? (
                          <img src={att} alt="Вложение" className="h-16 w-16 rounded-xl object-cover" />
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-xl border flex items-center gap-1 h-16"
                            style={{ borderColor: "var(--tracker-border)" }}><Paperclip className="size-3.5" /> Файл</span>
                        )}
                        <button className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100"
                          onClick={() => setAttachments(p => p.filter((_, j) => j !== i))}>
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: "var(--tracker-accent-bg, rgba(29,158,117,0.1))", color: "var(--tracker-accent-fg-dark, var(--foreground))" }}>
                    {currentUsername?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls" onChange={handleFileSelect} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" /></Button>
                  <div className="flex-1" />
                  <Button size="sm" className="h-8 text-xs font-semibold rounded-full px-4"
                    style={{ background: "var(--tracker-accent, #17181C)", color: "var(--tracker-accent-contrast, #F5F5F2)" }}
                    disabled={!newComment.trim() && attachments.length === 0} onClick={addComment}>
                    <Send className="size-3.5 mr-1.5" /> Отправить
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg"
      style={{ color: "var(--tracker-accent-contrast, #F5F5F2)", background: "var(--tracker-accent, #17181C)" }}>
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
        color: active ? "var(--tracker-accent-fg, #1D9E75)" : "var(--tracker-text-muted)",
        background: active ? "var(--tracker-accent-bg, rgba(29,158,117,0.12))" : "transparent",
      }}
      onClick={onClick}>
      {icon} {label}
    </button>
  );
}
