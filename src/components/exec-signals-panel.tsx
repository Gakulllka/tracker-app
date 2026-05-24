"use client";

/**
 * ExecutiveSignalsPanel — двусторонняя система уведомлений «Руководитель ↔ БА».
 *
 * Для БА (isAdmin=false):
 *   - Кнопка-колокол в шапке со счётчиком pending-запросов
 *   - Sheet справа: список задач с запросами руководителя
 *   - Можно принять каждый запрос или отклонить с пояснением
 *   - Задачи в таблице фильтруются (showOnlySignals)
 *
 * Для Руководителя (isAdmin=true):
 *   - Кнопка-колокол: pending (жёлтый) + rejected (красный) счётчики
 *   - Sheet: список задач, которые БА не подтвердил / отклонил
 *   - Кнопка «Создать вопрос» по проблемной задаче → создаёт вопрос с привязкой taskId
 *   - Из вопроса: можно изменить план/факт/статус задачи
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Task, STATUSES, PRIORITIES, Status, Priority } from "@/lib/types";
import { evalExpr, R2 } from "@/lib/metrics";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignalItem {
  task: Task;
  month: number;
  monthName: string;
  type: "pending_add"       // руководитель хочет добавить задачу из беклога
      | "pending_budget"    // руководитель хочет увеличить бюджет / ролловер
      | "executive_flag"    // руководитель поставил флаг (эскалация, пауза и пр.)
      | "rejected";         // БА отклонил — руководитель видит
}

export interface ExecSignalsPanelProps {
  /** Задачи всех месяцев */
  allTasks: Record<number, Task[]>;
  /** Беклог */
  backlogTasks: Task[];
  /** Лимит месяца */
  monthCapacity: number;
  /** Текущий пользователь — руководитель или БА */
  isAdmin: boolean;
  currentUsername: string;
  /** Обновить задачу */
  onUpdateTask: (month: number, taskId: string, updates: Partial<Task>) => void;
  /** Создать вопрос с привязкой к задаче */
  onCreateLinkedQuestion: (text: string, author: string, linkedTaskId: string, linkedTaskName: string) => void;
  /** Переключить фильтр задач в таблице */
  onFilterSignals: (on: boolean) => void;
  filterActive: boolean;
  /** Перейти на вкладку вопросов */
  onGoToQuestions?: () => void;
}

const FLAG_LABELS: Record<string, string> = {
  escalate: "⚡ Эскалировать",
  pause: "⏸ Поставить на паузу",
  cancel: "✖ Отменить",
  request_status: "❓ Запросить статус",
};
const FLAG_COLORS: Record<string, string> = {
  escalate: "#ef4444", pause: "#6b7280", cancel: "#ef4444", request_status: "#6366f1",
};

const T = { color: "var(--tracker-text-main, var(--foreground))" } as const;
const M = { color: "var(--tracker-text-muted, var(--muted-foreground))" } as const;

// ─── Main component ───────────────────────────────────────────────────────────

export function ExecSignalsPanel({
  allTasks, backlogTasks, monthCapacity, isAdmin,
  currentUsername, onUpdateTask, onCreateLinkedQuestion,
  onFilterSignals, filterActive, onGoToQuestions,
}: ExecSignalsPanelProps) {
  const [open, setOpen] = useState(false);
  const [rejectDraft, setRejectDraft] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [questionOpen, setQuestionOpen] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [editTaskOpen, setEditTaskOpen] = useState<{ task: Task; month: number } | null>(null);
  const [editDraft, setEditDraft] = useState<{ planH: string; factH: string; status: Status; priority: Priority }>({ planH: "", factH: "", status: STATUSES.NEW, priority: PRIORITIES.MEDIUM });

  // ── Собираем сигналы ──────────────────────────────────────────────────────

  const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

  const signals = useMemo<SignalItem[]>(() => {
    const result: SignalItem[] = [];
    Object.entries(allTasks).forEach(([mStr, tasks]) => {
      const month = Number(mStr);
      const monthName = MONTHS[month] ?? `Месяц ${month + 1}`;
      tasks.filter(t => !t._deleted).forEach(t => {
        if (t.approvalStatus === "rejected") {
          result.push({ task: t, month, monthName, type: "rejected" });
          return;
        }
        if (t.approvalStatus === "pending") {
          const planH = evalExpr(t.planH);
          if (planH > monthCapacity || (t.budgetRollover ?? 0) > 0) {
            result.push({ task: t, month, monthName, type: "pending_budget" });
          } else {
            result.push({ task: t, month, monthName, type: "pending_add" });
          }
          return;
        }
        if (t.executiveFlag) {
          result.push({ task: t, month, monthName, type: "executive_flag" });
        }
      });
    });
    return result;
  }, [allTasks, monthCapacity]);

  // Для БА — только pending + флаги (не rejected, они для руководителя)
  const baSignals = useMemo(() =>
    signals.filter(s => s.type !== "rejected"),
  [signals]);

  // Для руководителя — rejected + pending (БА не подтвердил)
  const managerSignals = useMemo(() =>
    signals.filter(s => s.type === "rejected" || s.type === "pending_add" || s.type === "pending_budget"),
  [signals]);

  const visibleSignals = isAdmin ? managerSignals : baSignals;
  const pendingCount = signals.filter(s => s.type !== "rejected").length;
  const rejectedCount = signals.filter(s => s.type === "rejected").length;
  const totalCount = isAdmin ? managerSignals.length : baSignals.length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAccept = useCallback((s: SignalItem) => {
    onUpdateTask(s.month, s.task.id, {
      approvalStatus: "approved",
      executiveFlag: undefined,
    });
  }, [onUpdateTask]);

  const handleReject = useCallback((s: SignalItem) => {
    const reason = rejectDraft[s.task.id] || "";
    onUpdateTask(s.month, s.task.id, {
      approvalStatus: "rejected",
      budgetAllocated: 0,
      // Сохраняем причину в комментарий
      comment: reason ? `[Отклонено БА: ${reason}]\n${s.task.comment || ""}` : s.task.comment,
    });
    setRejectOpen(null);
  }, [onUpdateTask, rejectDraft]);

  const handleClearFlag = useCallback((s: SignalItem) => {
    onUpdateTask(s.month, s.task.id, { executiveFlag: undefined });
  }, [onUpdateTask]);

  const handleCreateQuestion = useCallback((s: SignalItem) => {
    if (!questionText.trim()) return;
    onCreateLinkedQuestion(questionText.trim(), currentUsername, s.task.id, s.task.name || s.task.num || "");
    setQuestionText("");
    setQuestionOpen(null);
    onGoToQuestions?.();
  }, [questionText, currentUsername, onCreateLinkedQuestion, onGoToQuestions]);

  const handleEditTask = useCallback(() => {
    if (!editTaskOpen) return;
    onUpdateTask(editTaskOpen.month, editTaskOpen.task.id, {
      planH: editDraft.planH || editTaskOpen.task.planH,
      factH: editDraft.factH || editTaskOpen.task.factH,
      status: editDraft.status,
      priority: editDraft.priority,
    });
    setEditTaskOpen(null);
  }, [editTaskOpen, editDraft, onUpdateTask]);

  // ── Bell button ───────────────────────────────────────────────────────────

  const bellColor = rejectedCount > 0 ? "#ef4444" : pendingCount > 0 ? "#f59e0b" : undefined;

  return (
    <>
      {/* ── Кнопка-колокол в шапке ── */}
      <button
        className="relative h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
        style={{
          background: open || filterActive ? "var(--tracker-accent-bg)" : "transparent",
          color: bellColor ?? "var(--tracker-text-muted)",
        }}
        title={isAdmin
          ? `Сигналы: ${pendingCount} pending, ${rejectedCount} отклонено`
          : `Запросы руководителя: ${baSignals.length}`}
        onClick={() => setOpen(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {totalCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5"
            style={{ background: bellColor ?? "var(--tracker-accent)" }}
          >
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>

      {/* ── Кнопка-фильтр для БА ── */}
      {!isAdmin && baSignals.length > 0 && (
        <button
          className="h-7 px-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
          style={{
            background: filterActive ? "rgba(245,158,11,0.12)" : "transparent",
            color: filterActive ? "#d97706" : "var(--tracker-text-muted)",
            border: filterActive ? "1px solid rgba(245,158,11,0.3)" : "1px solid var(--tracker-border)",
          }}
          title={filterActive ? "Показать все задачи" : "Показать только задачи с запросами руководителя"}
          onClick={() => onFilterSignals(!filterActive)}
        >
          {filterActive ? "✕ Снять фильтр" : `⚡ Запросы (${baSignals.length})`}
        </button>
      )}

      {/* ── Sheet ── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[460px] overflow-y-auto"
          style={{ background: "var(--tracker-bg-card, var(--card))", borderLeft: "1px solid var(--tracker-border)" }}>
          <SheetHeader className="pb-3">
            <SheetTitle className="text-base flex items-center gap-2" style={T}>
              {isAdmin ? "🔔 Статус запросов" : "🔔 Запросы руководителя"}
            </SheetTitle>
            <div className="flex gap-2 flex-wrap mt-1">
              {pendingCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}>
                  ⏳ {pendingCount} ожидают БА
                </span>
              )}
              {rejectedCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
                  ✖ {rejectedCount} отклонено
                </span>
              )}
              {totalCount === 0 && (
                <span className="text-xs" style={M}>Нет активных запросов</span>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-3 mt-2">
            {visibleSignals.length === 0 && (
              <div className="text-center py-12">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm font-medium" style={T}>Всё подтверждено</p>
                <p className="text-xs mt-1" style={M}>Нет запросов, требующих внимания</p>
              </div>
            )}

            {visibleSignals.map(s => (
              <SignalCard
                key={`${s.month}_${s.task.id}`}
                signal={s}
                isAdmin={isAdmin}
                rejectOpen={rejectOpen === s.task.id}
                rejectDraft={rejectDraft[s.task.id] || ""}
                questionOpen={questionOpen === s.task.id}
                questionText={questionText}
                onAccept={() => handleAccept(s)}
                onRejectOpen={() => setRejectOpen(rejectOpen === s.task.id ? null : s.task.id)}
                onRejectDraftChange={v => setRejectDraft(d => ({ ...d, [s.task.id]: v }))}
                onRejectConfirm={() => handleReject(s)}
                onClearFlag={() => handleClearFlag(s)}
                onQuestionOpen={() => {
                  setQuestionOpen(questionOpen === s.task.id ? null : s.task.id);
                  setQuestionText(s.type === "rejected"
                    ? `По задаче "${s.task.name || s.task.num}": не согласен с отклонением. Причина?`
                    : `По задаче "${s.task.name || s.task.num}": нужно обсудить.`);
                }}
                onQuestionTextChange={setQuestionText}
                onQuestionSubmit={() => handleCreateQuestion(s)}
                onEditOpen={() => {
                  setEditTaskOpen({ task: s.task, month: s.month });
                  setEditDraft({
                    planH: s.task.planH,
                    factH: s.task.factH,
                    status: s.task.status,
                    priority: s.task.priority,
                  });
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Диалог редактирования задачи из вопроса (для руководителя) ── */}
      {editTaskOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={e => e.target === e.currentTarget && setEditTaskOpen(null)}>
          <div className="rounded-2xl shadow-2xl p-6 w-[360px] space-y-4"
            style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border)" }}>
            <div>
              <h2 className="font-bold text-base" style={T}>✏️ Изменить задачу</h2>
              <p className="text-xs mt-0.5 truncate" style={M}>
                {editTaskOpen.task.name || editTaskOpen.task.num || "Без названия"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={M}>План, ч</label>
                <Input value={editDraft.planH} onChange={e => setEditDraft(d => ({ ...d, planH: e.target.value }))}
                  className="h-9 text-sm"
                  style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))", color: "var(--tracker-text-main)" }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={M}>Факт, ч</label>
                <Input value={editDraft.factH} onChange={e => setEditDraft(d => ({ ...d, factH: e.target.value }))}
                  className="h-9 text-sm"
                  style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))", color: "var(--tracker-text-main)" }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={M}>Статус</label>
                <Select value={editDraft.status} onValueChange={v => setEditDraft(d => ({ ...d, status: v as Status }))}>
                  <SelectTrigger className="h-9 text-xs" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(STATUSES).map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={M}>Приоритет</label>
                <Select value={editDraft.priority} onValueChange={v => setEditDraft(d => ({ ...d, priority: v as Priority }))}>
                  <SelectTrigger className="h-9 text-xs" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(PRIORITIES).map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditTaskOpen(null)}>Отмена</Button>
              <Button size="sm" className="flex-1" style={{ background: "var(--tracker-accent)", color: "#fff" }} onClick={handleEditTask}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── SignalCard ───────────────────────────────────────────────────────────────

interface SignalCardProps {
  signal: SignalItem;
  isAdmin: boolean;
  rejectOpen: boolean;
  rejectDraft: string;
  questionOpen: boolean;
  questionText: string;
  onAccept: () => void;
  onRejectOpen: () => void;
  onRejectDraftChange: (v: string) => void;
  onRejectConfirm: () => void;
  onClearFlag: () => void;
  onQuestionOpen: () => void;
  onQuestionTextChange: (v: string) => void;
  onQuestionSubmit: () => void;
  onEditOpen: () => void;
}

function SignalCard({
  signal: s, isAdmin,
  rejectOpen, rejectDraft, questionOpen, questionText,
  onAccept, onRejectOpen, onRejectDraftChange, onRejectConfirm,
  onClearFlag, onQuestionOpen, onQuestionTextChange, onQuestionSubmit, onEditOpen,
}: SignalCardProps) {
  const { task, monthName, type } = s;
  const planH = evalExpr(task.planH);
  const factH = evalExpr(task.factH);
  const budget = task.budgetAllocated ?? planH;

  const borderColor =
    type === "rejected" ? "rgba(239,68,68,0.4)" :
    type === "executive_flag" ? `${FLAG_COLORS[task.executiveFlag ?? ""] ?? "#6366f1"}60` :
    "rgba(245,158,11,0.35)";

  const headerBg =
    type === "rejected" ? "rgba(239,68,68,0.06)" :
    type === "executive_flag" ? "rgba(99,102,241,0.06)" :
    "rgba(245,158,11,0.06)";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
      {/* Header */}
      <div className="px-3 py-2.5 flex items-start gap-2" style={{ background: headerBg }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <TypeBadge type={type} flag={task.executiveFlag} />
            <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>{monthName}</span>
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--tracker-text-main)" }}>
            {task.name || task.num || "Без названия"}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-xs border-b" style={{ borderColor: "var(--tracker-border)" }}>
        <div>
          <p style={{ color: "var(--tracker-text-muted)" }}>План</p>
          <p className="font-bold tabular-nums" style={{ color: "var(--tracker-text-main)" }}>{planH}ч</p>
        </div>
        <div>
          <p style={{ color: "var(--tracker-text-muted)" }}>Бюджет мес.</p>
          <p className="font-bold tabular-nums" style={{ color: budget > planH * 0.8 ? "#f59e0b" : "#3b82f6" }}>{budget}ч</p>
        </div>
        {(task.budgetRollover ?? 0) > 0 && (
          <div>
            <p style={{ color: "var(--tracker-text-muted)" }}>Ролловер</p>
            <p className="font-bold tabular-nums" style={{ color: "#f59e0b" }}>{task.budgetRollover}ч →</p>
          </div>
        )}
        {factH > 0 && (
          <div>
            <p style={{ color: "var(--tracker-text-muted)" }}>Факт</p>
            <p className="font-bold tabular-nums" style={{ color: "#22c55e" }}>{factH}ч</p>
          </div>
        )}
      </div>

      {/* Причина отклонения (для руководителя) */}
      {type === "rejected" && task.comment?.startsWith("[Отклонено БА:") && (
        <div className="px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.04)", color: "#dc2626" }}>
          {task.comment.match(/\[Отклонено БА: ([^\]]*)\]/)?.[1] || "Без пояснения"}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2.5 space-y-2">
        {/* БА: принять / отклонить */}
        {!isAdmin && type !== "rejected" && (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-7 text-xs" style={{ background: "#22c55e", color: "#fff" }} onClick={onAccept}>
              ✅ Принять
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={onRejectOpen}>
              ✖ Отклонить
            </Button>
          </div>
        )}

        {/* БА: форма отклонения */}
        {!isAdmin && rejectOpen && (
          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border text-xs px-2 py-1.5 resize-none outline-none focus:ring-1"
              rows={2}
              placeholder="Укажите причину отклонения…"
              style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))", color: "var(--tracker-text-main)" }}
              value={rejectDraft}
              onChange={e => onRejectDraftChange(e.target.value)}
            />
            <Button size="sm" className="w-full h-7 text-xs" style={{ background: "#ef4444", color: "#fff" }} onClick={onRejectConfirm}>
              Подтвердить отклонение
            </Button>
          </div>
        )}

        {/* БА: снять флаг руководителя */}
        {!isAdmin && type === "executive_flag" && task.executiveFlag && (
          <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg"
            style={{ background: `${FLAG_COLORS[task.executiveFlag] ?? "#6366f1"}10`, color: FLAG_COLORS[task.executiveFlag] ?? "#6366f1" }}>
            <span className="font-medium">{FLAG_LABELS[task.executiveFlag] ?? task.executiveFlag}</span>
            <button className="text-[10px] underline hover:no-underline" onClick={onClearFlag}>Снять</button>
          </div>
        )}

        {/* Руководитель: создать вопрос / редактировать */}
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
              style={{ borderColor: "var(--tracker-border)" }}
              onClick={onQuestionOpen}>
              💬 Создать вопрос
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
              style={{ borderColor: "var(--tracker-border)" }}
              onClick={onEditOpen}>
              ✏️ Изменить задачу
            </Button>
          </div>
        )}

        {/* Форма создания вопроса */}
        {questionOpen && (
          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border text-xs px-2 py-1.5 resize-none outline-none focus:ring-1"
              rows={3}
              style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))", color: "var(--tracker-text-main)" }}
              value={questionText}
              onChange={e => onQuestionTextChange(e.target.value)}
              placeholder="Текст вопроса…"
            />
            <Button size="sm" className="w-full h-7 text-xs"
              style={{ background: "var(--tracker-accent)", color: "#fff" }}
              disabled={!questionText.trim()}
              onClick={onQuestionSubmit}>
              Создать вопрос и перейти
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TypeBadge ────────────────────────────────────────────────────────────────

function TypeBadge({ type, flag }: { type: SignalItem["type"]; flag?: string }) {
  if (type === "rejected") return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
      ✖ Отклонено БА
    </span>
  );
  if (type === "pending_budget") return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}>
      📅 Ролловер / превышение
    </span>
  );
  if (type === "executive_flag") return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
      {FLAG_LABELS[flag ?? ""] ?? "Флаг"}
    </span>
  );
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-dashed" style={{ borderColor: "rgba(245,158,11,0.4)", color: "#d97706" }}>
      ⏳ Ожидает подтверждения
    </span>
  );
}
