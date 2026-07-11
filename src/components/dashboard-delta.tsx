"use client";

/**
 * DashboardDelta — Монитор Руководителя.
 * Визуал по макету primer.html, логика по ТЗ «Экосистема Delta».
 *
 * Строка 1: Здоровье | Capacity Gauge | График движения бюджета
 * Строка 2: Карта рисков (пузырьки)
 * Строка 3: Поп-ап задачи + Калькулятор (Sheet)
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ScatterChart, Scatter, ZAxis, ResponsiveContainer,
} from "recharts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Task, STATUSES, MONTHS } from "@/lib/types";
import {
  R2, evalExpr, calcMonthBudgetUsed, MONTH_CAPACITY, fmt2, calcDaysInStatus,
} from "@/lib/metrics";
import { computeFirstToCut } from "@/lib/cut-algorithm";

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ScatterPoint {
  x: number; y: number; z: number;
  name: string; num: string; status: string;
  priorityLabel: string; planH: number; budgetH: number; factH: number;
  daysInStatus: number; isPending: boolean; isFirstToCut: boolean;
  color: string; task: Task;
}

interface DashboardDeltaProps {
  tasks: Task[];
  backlogTasks: Task[];
  monthCapacity?: number;
  onSetMonthCapacity?: (hours: number) => void;
  monthlyFact: number[];
  monthlyAllocated: number[];
  currentMonth: number;
  currentYear: number;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  isDark?: boolean;
}

// ─── Константы ────────────────────────────────────────────────────────────────

const PRIORITY_NUM: Record<string, number> = {
  "Наивысший": 1, "Высокий": 2, "Средний": 3, "Низкий": 4, "Очередь": 5,
};

const PRIORITY_LABEL: Record<string, string> = {
  "Наивысший": "P1", "Высокий": "P2", "Средний": "P3", "Низкий": "P4", "Очередь": "P5",
};

// Группы статусов для цвета пузыря
function getBubbleColor(task: Task): { color: string; isAhead: boolean } {
  const fact = evalExpr(task.factH);
  const plan = evalExpr(task.planH);
  const s = task.status as string;

  const isDone = s === STATUSES.DONE || s === STATUSES.COMPLETED || s === STATUSES.PROD_CHECK;
  if (isDone && fact > 0 && fact < plan) return { color: "#a3e635", isAhead: true };
  if (isDone) return { color: "#15803d", isAhead: false };

  if (s === STATUSES.POSTPONED || s === STATUSES.CANCEL || s === "Блокер") return { color: "#ef4444", isAhead: false };

  const inWork = [STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS,
    STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.PROD_CHECK, STATUSES.ANALYSIS];
  if (inWork.includes(s as never)) return { color: "#f59e0b", isAhead: false };

  return { color: "#60a5fa", isAhead: false }; // Новая / Идея
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CARD = {
  background: "var(--tracker-bg-card, var(--card))",
  border: "1px solid var(--tracker-border, var(--border))",
  borderRadius: "1rem",
  padding: "1.25rem",
} as const;

const TEXT_MAIN = { color: "var(--tracker-text-main, var(--foreground))" } as const;
const TEXT_MUTED = { color: "var(--tracker-text-muted, var(--muted-foreground))" } as const;
const TEXT_ACCENT = { color: "var(--tracker-accent-fg-dark, var(--foreground))" } as const;

// ─── ScatterTooltip ───────────────────────────────────────────────────────────

function BubbleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-lg text-xs z-50"
      style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))", maxWidth: 240 }}>
      <p className="font-semibold mb-1.5 truncate" style={TEXT_ACCENT}>{d.name || d.num || "—"}</p>
      <div className="space-y-0.5" style={TEXT_MUTED}>
        <p>Приоритет: <b style={TEXT_MAIN}>{d.priorityLabel}</b></p>
        <p>Дней в статусе: <b style={TEXT_MAIN}>{d.daysInStatus}</b></p>
        <p>Оценка: <b style={TEXT_MAIN}>{d.planH}ч</b></p>
        <p>Бюджет в месяце: <b style={{ color: "#60a5fa" }}>{d.budgetH}ч</b>{d.planH > 100 ? " (Ролловер)" : ""}</p>
        <p>Факт: <b style={{ color: "#22c55e" }}>{d.factH}ч</b></p>
        {d.isPending && <p className="font-semibold mt-1" style={{ color: "#f59e0b" }}>⏳ Ожидает подтверждения БА</p>}
      </div>
    </div>
  );
}

// ─── RiskMatrix ───────────────────────────────────────────────────────────────
// Y = приоритет (1-5), X = каждый статус задачи (как во вкладке Задачи)

const RISK_STATUSES: { value: string; label: string }[] = [
  { value: "Идея",                       label: "Идея" },
  { value: "Новая",                      label: "Новая" },
  { value: "Анализ",                     label: "Анализ" },
  { value: "Согласование",               label: "Согласование" },
  { value: "В очереди на разработку",    label: "В очереди" },
  { value: "Разработка",                 label: "Разработка" },
  { value: "Тестирование",               label: "Тестирование" },
  { value: "В релиз",                    label: "В релиз" },
  { value: "Документация",               label: "Документация" },
  { value: "Контроль на прод",           label: "Контроль" },
  { value: "Выполненная",                label: "Выполнена" },
  { value: "Завершенная",                label: "Завершена" },
  { value: "Отложенная",                 label: "Отложена" },
  { value: "Отменено",                   label: "Отменено" },
];

function getTaskRiskColor(task: Task): { color: string; dimmed: boolean } {
  const { isAhead } = getBubbleColor(task);
  if (isAhead) return { color: "#a3e635", dimmed: false };
  const s = task.status as string;
  const isDone = s === "Выполненная" || s === "Завершенная" || s === "Контроль на прод";
  if (isDone) {
    const fact = evalExpr(task.factH);
    const plan = evalExpr(task.planH);
    if (fact > plan && plan > 0) return { color: "#ef4444", dimmed: false };
    return { color: "#15803d", dimmed: false };
  }
  const inWork = ["В очереди на разработку", "Разработка", "Тестирование", "В релиз", "Документация"];
  if (inWork.includes(s)) return { color: "#f59e0b", dimmed: false };
  return { color: "#94a3b8", dimmed: true };
}

interface RiskMatrixProps { tasks: Task[]; onTaskClick: (t: Task) => void; }

function RiskMatrix({ tasks, onTaskClick }: RiskMatrixProps) {
  const [tooltip, setTooltip] = useState<{ tasks: Task[]; x: number; y: number } | null>(null);

  // ключ = `${priority}_${statusValue}`
  const cells = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks.filter(t => !t._deleted && !t._hidden)) {
      const pNum = PRIORITY_NUM[t.priority] ?? 3;
      const key = `${pNum}_${t.status as string}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  // Показываем только статусы, в которых есть хоть одна задача
  const activeStatuses = useMemo(() =>
    RISK_STATUSES.filter(s => [1,2,3,4,5].some(p => (cells.get(`${p}_${s.value}`) ?? []).length > 0)),
  [cells]);

  // Если задач нет вообще — показываем все статусы
  const columns = activeStatuses.length > 0 ? activeStatuses : RISK_STATUSES;

  return (
    <div className="delta-risk-map overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <div style={{ minWidth: Math.max(480, columns.length * 72 + 36) }}>
        {/* Заголовки колонок — статусы */}
        <div style={{ display: "grid", gridTemplateColumns: `36px repeat(${columns.length}, minmax(64px, 1fr))`, gap: 3, marginBottom: 4 }}>
          <div />
          {columns.map(s => (
            <div key={s.value} className="text-center px-0.5" style={{ minWidth: 0 }}>
              <span className="text-[9px] font-semibold leading-tight block truncate"
                style={{ color: "var(--tracker-text-muted)" }} title={s.value}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Строки: приоритеты 1–5 */}
        {[1, 2, 3, 4, 5].map(pNum => (
          <div key={pNum} style={{ display: "grid", gridTemplateColumns: `36px repeat(${columns.length}, minmax(64px, 1fr))`, gap: 3, marginBottom: 3 }}>
            {/* Метка приоритета */}
            <div className="flex items-center justify-center">
              <span className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
                {pNum}
              </span>
            </div>

            {/* Ячейки */}
            {columns.map(s => {
              const ct = cells.get(`${pNum}_${s.value}`) ?? [];
              const total = R2(ct.reduce((sum, t) => sum + evalExpr(t.planH), 0));
              const isEmpty = ct.length === 0;
              return (
                <div key={s.value}
                  className="rounded-lg relative transition-all"
                  style={{
                    minHeight: 52,
                    background: isEmpty ? "transparent" : "var(--tracker-bg, var(--background))",
                    border: isEmpty
                      ? "1px dashed var(--tracker-border)"
                      : "1px solid var(--tracker-border)",
                    opacity: isEmpty ? 0.25 : 1,
                    cursor: ct.length === 1 ? "pointer" : "default",
                  }}
                  onMouseEnter={e => {
                    if (!ct.length) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setTooltip({ tasks: ct, x: rect.right, y: rect.top + rect.height / 2 });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => ct.length === 1 && onTaskClick(ct[0])}
                >
                  {ct.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-0.5 items-center justify-center p-1" style={{ minHeight: 36 }}>
                        {ct.slice(0, 9).map(t => {
                          const { color, dimmed } = getTaskRiskColor(t);
                          const r = Math.min(13, Math.max(5, Math.sqrt(evalExpr(t.planH)) * 1.4));
                          return (
                            <div key={t.id}
                              className="rounded-full transition-transform hover:scale-110 shrink-0"
                              style={{
                                width: r * 2, height: r * 2,
                                background: color,
                                opacity: dimmed ? 0.4 : t.approvalStatus === "pending" ? 0.5 : 0.88,
                                border: t.approvalStatus === "pending" ? `1.5px dashed ${color}` : undefined,
                                boxShadow: color === "#a3e635" ? "0 0 5px rgba(163,230,53,0.7)" : undefined,
                                cursor: "pointer",
                              }}
                              onClick={e => { e.stopPropagation(); onTaskClick(t); }}
                            />
                          );
                        })}
                        {ct.length > 9 && (
                          <span className="text-[8px] font-bold" style={{ color: "var(--tracker-text-muted)" }}>+{ct.length - 9}</span>
                        )}
                      </div>
                      {/* Итог в ячейке */}
                      <div className="absolute bottom-0.5 right-1 text-[8px] tabular-nums font-medium leading-none"
                        style={{ color: "var(--tracker-text-muted)" }}>
                        {ct.length > 1 ? `${ct.length}·` : ""}{total}ч
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <div className="fixed z-[200] rounded-xl shadow-xl px-3 py-2.5 text-xs pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 8, window.innerWidth - 240),
              top: tooltip.y,
              background: "var(--tracker-bg-card, var(--card))",
              border: "1px solid var(--tracker-border)",
              maxWidth: 230,
              transform: "translateY(-50%)",
            }}>
            {tooltip.tasks.slice(0, 8).map(t => {
              const { color } = getTaskRiskColor(t);
              return (
                <div key={t.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="truncate flex-1" style={{ color: "var(--tracker-text-main)" }}>
                    {t.name || t.num || "—"}
                  </span>
                  <span className="tabular-nums shrink-0 font-medium" style={{ color: "var(--tracker-text-muted)" }}>
                    {evalExpr(t.planH)}ч
                  </span>
                </div>
              );
            })}
            {tooltip.tasks.length > 8 && (
              <div className="text-[10px] pt-0.5" style={{ color: "var(--tracker-text-muted)" }}>
                + ещё {tooltip.tasks.length - 8}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export function DashboardDelta({
  tasks, backlogTasks, monthCapacity = MONTH_CAPACITY, onSetMonthCapacity,
  monthlyFact, monthlyAllocated, currentMonth, currentYear,
  onUpdateTask, isDark = false,
}: DashboardDeltaProps) {

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [capacityInput, setCapacityInput] = useState(String(monthCapacity));
  const [capacityPopup, setCapacityPopup] = useState(false);
  const [calcChecked, setCalcChecked] = useState<Set<string>>(new Set());

  React.useEffect(() => { setCapacityInput(String(monthCapacity)); }, [monthCapacity]);

  const commitCapacity = useCallback(() => {
    const n = parseInt(capacityInput, 10);
    if (!isNaN(n) && n > 0 && n !== monthCapacity) onSetMonthCapacity?.(n);
    else setCapacityInput(String(monthCapacity));
    setCapacityPopup(false);
  }, [capacityInput, monthCapacity, onSetMonthCapacity]);

  // ── Вычисления ────────────────────────────────────────────────────────────

  const alive = useMemo(() => tasks.filter(t => !t._deleted && !t._hidden), [tasks]);

  const budgetUsed = useMemo(() => calcMonthBudgetUsed(alive), [alive]);
  const budgetPct = monthCapacity > 0 ? R2((budgetUsed / monthCapacity) * 100) : 0;
  // Перерасход = нетто: перерасход минус экономия (не могут быть одновременно)
  const overbooked = R2(Math.max(0, budgetUsed - monthCapacity));

  const gaugeColor = budgetPct > 100 ? "#ef4444" : budgetPct >= 80 ? "#f59e0b" : "#22c55e";
  const gaugeLabel = budgetPct > 100 ? "🔴 Перерасход" : budgetPct >= 80 ? "🟡 Желтая зона" : "🟢 Есть ресурс";
  const gaugeLabelColor = budgetPct > 100 ? "#ef4444" : budgetPct >= 80 ? "#d97706" : "#16a34a";

  const totalFact = useMemo(() => R2(alive.reduce((s, t) => s + evalExpr(t.factH), 0)), [alive]);

  const pendingTasks = useMemo(() => alive.filter(t => t.approvalStatus === "pending"), [alive]);
  const pendingHours = useMemo(() => R2(pendingTasks.reduce((s, t) => s + (t.budgetAllocated ?? evalExpr(t.planH)), 0)), [pendingTasks]);

  const isFirstToCutIds = useMemo(() => computeFirstToCut(alive, monthCapacity), [alive, monthCapacity]);
  const firstToCutTasks = useMemo(() => alive.filter(t => isFirstToCutIds.has(t.id)), [alive, isFirstToCutIds]);
  const firstToCutHours = useMemo(() => R2(firstToCutTasks.reduce((s, t) => s + (t.budgetAllocated ?? evalExpr(t.planH)), 0)), [firstToCutTasks]);

  const rolloverHours = useMemo(() => R2(alive.reduce((s, t) => s + (t.budgetRollover ?? 0), 0)), [alive]);

  // Досрочно освобождённые (факт < бюджет у завершённых)
  const freedHours = useMemo(() => R2(
    alive.filter(t =>
      (t.status === STATUSES.DONE || t.status === STATUSES.COMPLETED) &&
      evalExpr(t.factH) < (t.budgetAllocated ?? evalExpr(t.planH)) &&
      evalExpr(t.factH) > 0
    ).reduce((s, t) => s + R2((t.budgetAllocated ?? evalExpr(t.planH)) - evalExpr(t.factH)), 0)
  ), [alive]);

  // Нетто: перерасход и освобождение взаимно исключаются
  const netDelta = R2(budgetUsed - monthCapacity);
  const netOverbooked = R2(Math.max(0, netDelta + freedHours > 0 ? netDelta : netDelta));
  const netFreed = R2(Math.max(0, freedHours - Math.max(0, netDelta)));

  // Здоровье = 100 когда успеваем. Снижается пропорционально перерасходу часов.
  const healthScore = useMemo(() => {
    if (monthCapacity <= 0) return 100;
    const factOver = Math.max(0, totalFact - monthCapacity);
    const planOver = Math.max(0, budgetUsed - monthCapacity);
    const penalty = R2(((factOver + planOver * 0.5) / monthCapacity) * 100);
    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }, [totalFact, budgetUsed, monthCapacity]);

  // Свободные часы
  const freeHours = R2(Math.max(0, monthCapacity - budgetUsed) + netFreed);

  // Скорость отработки (нужно ч/день для выполнения плана)
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const daysLeft = today.getMonth() === currentMonth && today.getFullYear() === currentYear
    ? Math.max(1, daysInMonth - today.getDate() + 1) : 1;
  const remainingToClose = R2(Math.max(0, budgetUsed - totalFact));
  const neededPerDay = R2(remainingToClose / daysLeft);
  const PLANNED_PER_DAY = 12;

  // Данные дневного графика
  const dailyData = useMemo(() => {
    const todayDay = today.getMonth() === currentMonth && today.getFullYear() === currentYear
      ? today.getDate() : daysInMonth;
    const factPerDay = todayDay > 0 ? R2(totalFact / todayDay) : 0;

    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return {
        day,
        allocated: budgetUsed, // горизонтальная линия — сколько заложено
        fact: day <= todayDay ? R2(factPerDay * day) : undefined,
        forecast: day >= todayDay
          ? R2(totalFact + (day - todayDay) * PLANNED_PER_DAY)
          : undefined,
        limit: monthCapacity,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive, currentMonth, currentYear, monthCapacity, budgetUsed, totalFact, daysInMonth]);

  // Дата отработки бюджета по прогнозу
  const exhaustDate = useMemo(() => {
    if (remainingToClose <= 0) return null;
    const days = Math.ceil(remainingToClose / PLANNED_PER_DAY);
    const d = new Date();
    d.setDate(d.getDate() + days);
    const MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }, [remainingToClose]);

  // Scatter data
  const scatterPoints = useMemo<ScatterPoint[]>(() =>
    alive.filter(t => t.name || t.num).map(t => {
      const { color, isAhead } = getBubbleColor(t);
      const planH = evalExpr(t.planH);
      const budgetH = t.budgetAllocated ?? planH; // реальное значение или план
      const daysInStatus = t.daysInStatus ?? calcDaysInStatus(t); // из store или вычисленное
      return {
        x: PRIORITY_NUM[t.priority] ?? 3,
        y: daysInStatus,
        z: Math.max(200, Math.min(planH * planH * 0.08, 2500)),
        name: t.name, num: t.num, status: t.status,
        priorityLabel: PRIORITY_LABEL[t.priority] ?? t.priority,
        planH, budgetH, factH: evalExpr(t.factH),
        daysInStatus,
        isPending: t.approvalStatus === "pending",
        isFirstToCut: isFirstToCutIds.has(t.id),
        color: isAhead ? "#a3e635" : color,
        task: t,
      };
    }), [alive, isFirstToCutIds]);

  // Калькулятор: кандидаты на дозаливку (budgetAllocated < totalBudgetRequested или < planH)
  const topupCandidates = useMemo(() =>
    alive.filter(t => {
      const total = t.totalBudgetRequested ?? evalExpr(t.planH);
      const allocated = t.budgetAllocated ?? evalExpr(t.planH);
      return total > 0 && allocated < total && t.approvalStatus !== "rejected";
    }), [alive]);

  // Калькулятор: беклог
  const allBacklog = useMemo(() => (backlogTasks || []).filter(t => !t._deleted), [backlogTasks]);
  const backlogFits = useMemo(() => allBacklog.filter(t => evalExpr(t.planH) <= freeHours), [allBacklog, freeHours]);
  const backlogNoFit = useMemo(() => allBacklog.filter(t => evalExpr(t.planH) > freeHours), [allBacklog, freeHours]);

  const handleCalcApply = useCallback(() => {
    calcChecked.forEach(id => {
      const t = [...topupCandidates, ...backlogFits].find(x => x.id === id);
      if (!t) return;
      const planH = evalExpr(t.planH);
      const gap = R2((t.totalBudgetRequested ?? 0) - (t.budgetAllocated ?? 0));
      const canAdd = topupCandidates.find(x => x.id === id) ? Math.min(gap, freeHours) : planH;
      onUpdateTask(id, {
        approvalStatus: "pending",
        budgetAllocated: R2((t.budgetAllocated ?? 0) + canAdd),
        budgetRollover: R2(Math.max(0, gap - canAdd)),
        ...(backlogFits.find(x => x.id === id) ? { totalBudgetRequested: planH } : {}),
      });
    });
    setCalcChecked(new Set());
    setCalcOpen(false);
  }, [calcChecked, topupCandidates, backlogFits, freeHours, onUpdateTask]);

  // ── Вспомогательные ───────────────────────────────────────────────────────

  const healthBg = healthScore >= 70 ? "var(--tracker-bg-card)" :
    healthScore >= 45 ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)";
  const healthBorder = healthScore >= 70 ? "var(--tracker-border)" :
    healthScore >= 45 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";
  const healthColor = healthScore >= 70 ? "#22c55e" : healthScore >= 45 ? "#f59e0b" : "#ef4444";
  const healthLabel = healthScore >= 70 ? "Норма" : healthScore >= 45 ? "Риск срыва" : "Критично";

  const monthName = `${MONTHS[currentMonth]} ${currentYear}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Toast: досрочно освобождённые часы */}
      {freedHours > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", color: "#16a34a" }}
          onClick={() => setCalcOpen(true)}
        >
          <span className="text-base">🟢</span>
          <span className="flex-1 text-sm font-medium">
            Освобождено досрочно: <b>{freedHours}ч</b>
          </span>
          <span className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: "#22c55e", color: "#fff" }}>
            🧮 Открыть калькулятор
          </span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          СТРОКА 1: ЗДОРОВЬЕ + GAUGE + ГРАФИК
      ════════════════════════════════════════════════════ */}
      <div className="delta-row1 grid grid-cols-12 gap-4">

        {/* — Здоровье домена — */}
        <div className="delta-health-card col-span-12 md:col-span-2 rounded-2xl p-5 flex flex-col justify-center"
          style={{ background: healthBg, border: `1px solid ${healthBorder}` }}>
          <div className="delta-health-score text-5xl font-bold tabular-nums mb-1" style={{ color: healthColor }}>
            {healthScore}
          </div>
          <div className="text-sm font-semibold mb-3" style={{ color: healthColor }}>{healthLabel}</div>
          {neededPerDay > PLANNED_PER_DAY && (
            <div className="text-xs font-semibold px-2 py-1 rounded"
              style={{ background: healthScore < 45 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                color: healthColor }}>
              Нужно {neededPerDay}ч/день вместо {PLANNED_PER_DAY}ч
            </div>
          )}
          {neededPerDay <= PLANNED_PER_DAY && (
            <div className="text-xs px-2 py-1 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>
              ✓ Успеваем в срок
            </div>
          )}
        </div>

        {/* — Capacity Gauge — */}
        <div className="delta-gauge-card col-span-12 md:col-span-3 rounded-2xl p-5" style={CARD}>
          {/* Заголовок + шестерёнка */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm" style={TEXT_MAIN}>Бюджет {monthName}</h3>
            <div className="relative">
              <button
                className="text-sm hover:opacity-70 transition-opacity"
                onClick={() => setCapacityPopup(v => !v)}
                title="Настроить лимит месяца"
              >
                ⚙️ <span className="text-xs" style={TEXT_MUTED}>{monthCapacity}ч</span>
              </button>
              {capacityPopup && (
                <div className="absolute right-0 top-7 z-50 rounded-xl shadow-xl p-3 w-48"
                  style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))" }}>
                  <p className="text-xs font-semibold mb-2" style={TEXT_MUTED}>Лимит часов в месяце</p>
                  <div className="flex gap-2">
                    <input
                      type="number" min={1}
                      className="flex-1 h-8 rounded-lg border px-2 text-sm tabular-nums outline-none"
                      style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))", color: "var(--tracker-text-main)" }}
                      value={capacityInput}
                      onChange={e => setCapacityInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && commitCapacity()}
                      autoFocus
                    />
                    <button
                      className="px-2 rounded-lg text-xs font-bold text-white"
                      style={{ background: "var(--tracker-accent)" }}
                      onClick={commitCapacity}
                    >Ок</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Крупная цифра */}
          <div className="text-4xl font-bold tabular-nums mb-1" style={{ color: gaugeColor }}>
            {fmt2(budgetUsed)}
            <span className="text-lg font-normal ml-1" style={TEXT_MUTED}>/ {monthCapacity}ч</span>
          </div>

          {/* Прогресс-бар */}
          <div className="w-full rounded-full h-3 mb-1.5 overflow-hidden relative"
            style={{ background: "var(--tracker-border, var(--border))" }}>
            <div className="h-3 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(budgetPct, 100)}%`, background: gaugeColor }} />
            {/* 80% метка */}
            <div className="absolute top-0 bottom-0 w-px"
              style={{ left: "80%", background: "#f59e0b", opacity: 0.6 }} />
          </div>
          <div className="text-xs font-semibold mb-3" style={{ color: gaugeLabelColor }}>
            {gaugeLabel} ({budgetPct}%)
          </div>

          {/* Мета-статистики */}
          <div className="pt-2 border-t space-y-1.5"
            style={{ borderColor: "var(--tracker-border, var(--border))" }}>
            <div className="flex justify-between text-xs" style={TEXT_MUTED}>
              <span>⏳ Ожидает БА:</span>
              <span className="font-bold" style={{ color: pendingTasks.length > 0 ? "#f59e0b" : "var(--tracker-text-muted)" }}>
                {pendingTasks.length} зад. ({pendingHours}ч)
              </span>
            </div>
            <div className="flex justify-between text-xs" style={TEXT_MUTED}>
              <span>📅 В след. месяце:</span>
              <span className="font-bold" style={{ color: rolloverHours > 0 ? "#60a5fa" : "var(--tracker-text-muted)" }}>
                {rolloverHours}ч
              </span>
            </div>
          </div>
        </div>

        {/* — График движения бюджета — */}
        <div className="delta-chart-card col-span-12 md:col-span-7 rounded-2xl p-5" style={CARD}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-bold text-sm" style={TEXT_MAIN}>Движение бюджета ({monthName})</h3>
            <div className="flex gap-4 text-xs flex-wrap">
              {netOverbooked > 0 && (
                <span style={{ color: "#ef4444" }}>🔴 Перерасход: +{netOverbooked}ч</span>
              )}
              {netFreed > 0 && (
                <span style={{ color: "#22c55e" }}>🟢 Освобождено: -{netFreed}ч</span>
              )}
              {exhaustDate && (
                <span style={{ color: "#f59e0b" }}>📅 Закроем ~{exhaustDate}</span>
              )}
            </div>
          </div>

          <div className="delta-chart-height" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="gFact" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--tracker-border)" opacity={0.35} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--tracker-text-muted)" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => (v % 5 === 0 || v === 1) ? String(v) : ""} />
                <YAxis tick={{ fontSize: 9, fill: "var(--tracker-text-muted)" }}
                  axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--tracker-bg-card)", border: "1px solid var(--tracker-border)", borderRadius: 10, fontSize: 11 }}
                  formatter={(v: number, name: string) => [`${v}ч`, name === "fact" ? "Выполнено" : name === "forecast" ? "Прогноз" : name === "allocated" ? "Заложено" : "Лимит"]}
                  labelFormatter={v => `День ${v}`}
                />
                {/* Лимит */}
                <ReferenceLine y={monthCapacity} stroke="#ef4444" strokeDasharray="5 3" strokeOpacity={0.7}
                  label={{ value: `Лимит ${monthCapacity}ч`, position: "right", fontSize: 8, fill: "#ef4444" }} />
                {/* Заложено */}
                <ReferenceLine y={budgetUsed} stroke="#3b82f6" strokeDasharray="4 3" strokeOpacity={0.5} />
                {/* Вертикальная линия прогнозируемого завершения */}
                {(() => {
                  const today = new Date();
                  if (today.getMonth() !== currentMonth || today.getFullYear() !== currentYear) return null;
                  const todayDay = today.getDate();
                  const dLeft = Math.max(1, daysInMonth - todayDay + 1);
                  const daysToClose = remainingToClose > 0 ? Math.ceil(remainingToClose / PLANNED_PER_DAY) : 0;
                  const closingDay = Math.min(daysInMonth, todayDay + daysToClose);
                  return (
                    <ReferenceLine x={closingDay} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.8}
                      label={{ value: `~${closingDay} дн.`, position: "top", fontSize: 8, fill: "#d97706" }} />
                  );
                })()}
                {/* Факт */}
                <Area type="monotone" dataKey="fact" name="fact" stroke="#22c55e" strokeWidth={2}
                  fill="url(#gFact)" dot={false} connectNulls={false} />
                {/* Прогноз */}
                <Area type="monotone" dataKey="forecast" name="forecast" stroke="#3b82f6"
                  strokeWidth={1.5} strokeDasharray="5 3" fill="url(#gForecast)"
                  dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Легенда */}
          <div className="flex gap-4 mt-1 text-[10px] flex-wrap" style={TEXT_MUTED}>
            {[
              { color: "#ef4444", dash: true, label: `Лимит ${monthCapacity}ч` },
              { color: "#3b82f6", dash: false, label: `Заложено ${budgetUsed}ч` },
              { color: "#22c55e", dash: false, label: `Выполнено ${totalFact}ч` },
              { color: "#3b82f6", dash: true, label: "Прогноз" },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1">
                <span className="inline-block w-5 h-0" style={{
                  borderTop: `2px ${l.dash ? "dashed" : "solid"} ${l.color}`,
                  display: "inline-block", width: 16, verticalAlign: "middle",
                }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          СТРОКА 2: КАРТА РИСКОВ
      ════════════════════════════════════════════════════ */}
      <div className="rounded-2xl p-5" style={CARD}>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-bold" style={TEXT_MAIN}>Карта рисков</h3>
            <p className="text-xs mt-0.5" style={TEXT_MUTED}>
              Y: Приоритет (1–5) · X: Статус задачи · Размер: Оценка часов
            </p>
          </div>
          <div className="flex gap-3 flex-wrap text-xs">
            {[
              { color: "#f59e0b", label: "В работе" },
              { color: "#15803d", label: "Завершена в срок" },
              { color: "#ef4444", label: "Превышение" },
              { color: "#a3e635", glow: true, label: "Опережение" },
              { color: "#94a3b8", label: "Прочие" },
              { pending: true, label: "Ожидает БА" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                {item.pending ? (
                  <span className="w-3 h-3 rounded-full border-2 border-dashed inline-block"
                    style={{ borderColor: "#f59e0b", background: "rgba(96,165,250,0.4)" }} />
                ) : (
                  <span className="w-3 h-3 rounded-full inline-block"
                    style={{ background: item.color,
                      boxShadow: item.glow ? "0 0 8px rgba(163,230,53,0.8)" : undefined }} />
                )}
                <span style={TEXT_MUTED}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Swipe hint только на мобиле */}
        <div className="delta-risk-scroll-hint">
          <span>👆</span><span>Прокрутите горизонтально</span>
        </div>

        <RiskMatrix tasks={alive} onTaskClick={setSelectedTask} />
      </div>

      {/* ── Кнопка калькулятора в шапке ── */}
      <div className="flex justify-end">
        <Button
          onClick={() => setCalcOpen(true)}
          className="gap-2 text-sm"
          style={{ background: "var(--tracker-accent)", color: "#fff" }}
        >
          🧮 Калькулятор бюджета
          {freeHours > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.25)" }}>
              +{fmt2(freeHours)}ч свободно
            </span>
          )}
        </Button>
      </div>

      {/* ════════════════════════════════════════════════════
          ПОП-АП ЗАДАЧИ (Рычаги)
      ════════════════════════════════════════════════════ */}
      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={o => !o && setSelectedTask(null)}>
          <DialogContent style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))", maxWidth: 480 }}>
            <DialogHeader>
              {/* Статус-бейдж */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {(() => {
                  const { color, isAhead } = getBubbleColor(selectedTask);
                  const label = isAhead ? "🌟 Опережение"
                    : (selectedTask.status as string) === "Блокер" ? "🔴 Блокер"
                    : selectedTask.status as string;
                  return (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: color + "22", color }}>
                      {label}
                    </span>
                  );
                })()}
                {selectedTask.approvalStatus === "pending" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full border border-dashed"
                    style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,0.08)", color: "#d97706" }}>
                    ⏳ Ожидает подтверждения БА
                  </span>
                )}
              </div>
              <DialogTitle className="text-xl" style={TEXT_MAIN}>
                {selectedTask.name || selectedTask.num || "Без названия"}
              </DialogTitle>
            </DialogHeader>

            {/* Метрики задачи */}
            <div className="grid grid-cols-2 gap-3 my-4 text-sm">
              {[
                { label: "Общая оценка", value: `${evalExpr(selectedTask.planH)}ч`, bg: "var(--tracker-accent-bg)", highlight: false },
                { label: `Бюджет в мес.${evalExpr(selectedTask.planH) > 100 ? " (Ролловер)" : ""}`, value: `${selectedTask.budgetAllocated ?? evalExpr(selectedTask.planH)}ч`, bg: "rgba(96,165,250,0.1)", highlight: true },
                { label: "Факт потрачено", value: `${evalExpr(selectedTask.factH)}ч`, bg: "var(--tracker-accent-bg)", highlight: false },
                { label: "Приоритет", value: PRIORITY_LABEL[selectedTask.priority] ?? selectedTask.priority, bg: "var(--tracker-accent-bg)", highlight: false },
                { label: "Дней в статусе", value: String(selectedTask.daysInStatus ?? 0), bg: "var(--tracker-accent-bg)", highlight: false },
                { label: "Ролловер", value: `${selectedTask.budgetRollover ?? 0}ч`, bg: "var(--tracker-accent-bg)", highlight: false },
              ].map(({ label, value, bg, highlight }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: bg, border: highlight ? "1px solid rgba(96,165,250,0.25)" : undefined }}>
                  <p className="text-xs mb-0.5" style={{ color: highlight ? "#60a5fa" : "var(--tracker-text-muted)" }}>{label}</p>
                  <p className="font-bold" style={{ color: highlight ? "#3b82f6" : "var(--tracker-text-main)" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Рычаги */}
            <div className="border-t pt-4 space-y-2"
              style={{ borderColor: "var(--tracker-border, var(--border))" }}>
              <h3 className="font-bold text-sm mb-2" style={TEXT_MUTED}>Рычаги влияния:</h3>
              {[
                { flag: "escalate" as const, label: "🔥 Ускорить / Эскалировать", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.25)", color: "#dc2626" },
                { flag: "pause" as const, label: "⏸ Поставить на паузу", bg: "rgba(107,114,128,0.06)", border: "rgba(107,114,128,0.2)", color: "var(--tracker-text-muted)" },
                { flag: "request_status" as const, label: "❓ Запросить статус", bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.2)", color: "#6366f1" },
                { flag: "cancel" as const, label: "❌ Отменить задачу", bg: "rgba(239,68,68,0.04)", border: "rgba(239,68,68,0.15)", color: "#dc2626" },
              ].map(({ flag, label, bg, border, color }) => {
                const isActive = selectedTask.executiveFlag === flag;
                return (
                  <button key={flag}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: isActive ? bg.replace("0.06", "0.15").replace("0.04", "0.12") : bg,
                      border: `1px solid ${border}`,
                      color,
                      boxShadow: isActive ? `0 0 0 2px ${border}` : undefined,
                    }}
                    onClick={() => {
                      const newFlag = isActive ? undefined : flag;
                      onUpdateTask(selectedTask.id, { executiveFlag: newFlag });
                      setSelectedTask({ ...selectedTask, executiveFlag: newFlag });
                    }}
                  >
                    {isActive ? "✓ " : ""}{label}
                  </button>
                );
              })}

              {/* Чекбокс "Зафиксировать — не отсекать" */}
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.25)" }}>
                <input type="checkbox"
                  className="w-4 h-4 rounded accent-blue-500"
                  checked={!!selectedTask.excludeFromCut}
                  onChange={() => {
                    const v = !selectedTask.excludeFromCut;
                    onUpdateTask(selectedTask.id, { excludeFromCut: v });
                    setSelectedTask({ ...selectedTask, excludeFromCut: v });
                  }}
                />
                <span className="text-sm font-medium" style={{ color: "#3b82f6" }}>🔒 Зафиксировать (не отсекать)</span>
              </label>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ════════════════════════════════════════════════════
          КАЛЬКУЛЯТОР БЮДЖЕТА (Sheet)
      ════════════════════════════════════════════════════ */}
      <Sheet open={calcOpen} onOpenChange={setCalcOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[440px] overflow-y-auto"
          style={{ background: "var(--tracker-bg-card, var(--card))", borderLeft: "1px solid var(--tracker-border, var(--border))" }}>
          <SheetHeader className="pb-4">
            <SheetTitle className="text-xl" style={TEXT_ACCENT}>Калькулятор бюджета</SheetTitle>
            <SheetDescription asChild>
              <div>
                <div className="rounded-xl p-4 mt-2 text-center"
                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <div className="text-xs font-medium mb-1" style={{ color: "#16a34a" }}>Свободно бюджета</div>
                  <div className="text-4xl font-bold tabular-nums" style={{ color: "#22c55e" }}>+{fmt2(freeHours)} ч</div>
                  {freedHours > 0 && (
                    <div className="text-xs mt-1" style={{ color: "#16a34a" }}>
                      в т.ч. {freedHours}ч освобождено досрочно
                    </div>
                  )}
                </div>
              </div>
            </SheetDescription>
          </SheetHeader>

          {/* Секция 1: Дозалить в текущие */}
          {topupCandidates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={TEXT_MAIN}>
                <span className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: "rgba(245,158,11,0.15)", color: "#d97706" }}>1</span>
                Дозалить в текущие задачи
              </h3>
              <div className="space-y-2">
                {topupCandidates.map(t => {
                  const gap = R2((t.totalBudgetRequested ?? 0) - (t.budgetAllocated ?? 0));
                  const canAdd = Math.min(gap, freeHours);
                  const checked = calcChecked.has(t.id);
                  return (
                    <label key={t.id}
                      className="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors"
                      style={{
                        background: checked ? "rgba(245,158,11,0.08)" : "var(--tracker-bg, var(--background))",
                        borderColor: checked ? "rgba(245,158,11,0.4)" : "var(--tracker-border, var(--border))",
                      }}>
                      <div>
                        <div className="text-sm font-medium truncate max-w-[220px]" style={TEXT_MAIN}>
                          {t.name || t.num || "—"}
                        </div>
                        <div className="text-xs mt-0.5" style={TEXT_MUTED}>
                          Бюджет: {t.budgetAllocated ?? 0}ч из {t.totalBudgetRequested ?? 0}ч (Ролловер)
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold" style={{ color: "#d97706" }}>+{canAdd}ч</span>
                        <input type="checkbox" className="w-4 h-4 accent-amber-500 rounded"
                          checked={checked}
                          onChange={() => {
                            const s = new Set(calcChecked);
                            checked ? s.delete(t.id) : s.add(t.id);
                            setCalcChecked(s);
                          }} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Секция 2: Из беклога */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={TEXT_MAIN}>
              <span className="px-2 py-0.5 rounded text-xs font-bold"
                style={{ background: "rgba(99,102,241,0.15)", color: "#6366f1" }}>2</span>
              Взять из беклога (до {fmt2(freeHours)}ч)
            </h3>
            <div className="space-y-2">
              {backlogFits.map(t => {
                const planH = evalExpr(t.planH);
                const checked = calcChecked.has(t.id);
                return (
                  <label key={t.id}
                    className="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors"
                    style={{
                      background: checked ? "rgba(99,102,241,0.06)" : "var(--tracker-bg, var(--background))",
                      borderColor: checked ? "rgba(99,102,241,0.35)" : "var(--tracker-border, var(--border))",
                    }}>
                    <div>
                      <div className="text-sm font-medium truncate max-w-[220px]" style={TEXT_MAIN}>
                        {t.name || t.num || "—"}
                      </div>
                      <div className="text-xs mt-0.5" style={TEXT_MUTED}>
                        Оценка: {planH}ч · {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </div>
                    </div>
                    <input type="checkbox" className="w-4 h-4 accent-indigo-500 rounded"
                      checked={checked}
                      onChange={() => {
                        const s = new Set(calcChecked);
                        checked ? s.delete(t.id) : s.add(t.id);
                        setCalcChecked(s);
                      }} />
                  </label>
                );
              })}

              {/* Не влезающие — серые */}
              {backlogNoFit.map(t => (
                <label key={t.id}
                  className="flex items-center justify-between p-3 rounded-xl border cursor-not-allowed opacity-50"
                  style={{ background: "var(--tracker-bg, var(--background))", borderColor: "var(--tracker-border, var(--border))" }}>
                  <div>
                    <div className="text-sm font-medium truncate max-w-[220px]" style={TEXT_MAIN}>
                      {t.name || t.num || "—"}
                    </div>
                    <div className="text-xs mt-0.5 font-semibold" style={{ color: "#ef4444" }}>
                      Оценка: {evalExpr(t.planH)}ч · Не влезет в бюджет!
                    </div>
                  </div>
                  <input type="checkbox" disabled className="w-4 h-4 rounded" />
                </label>
              ))}

              {backlogFits.length === 0 && backlogNoFit.length === 0 && (
                <p className="text-xs py-6 text-center" style={TEXT_MUTED}>
                  Беклог пуст
                </p>
              )}
            </div>
          </div>

          {/* Кнопка */}
          <button
            className="w-full font-bold py-3 rounded-xl text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: calcChecked.size > 0 ? "var(--tracker-accent)" : "#6b7280" }}
            disabled={calcChecked.size === 0}
            onClick={handleCalcApply}
          >
            Принять в план ({calcChecked.size} зад.) — Ожидает БА ⏳
          </button>
          <p className="text-xs text-center mt-2" style={TEXT_MUTED}>
            Задачи появятся на дашборде с пунктирным контуром — до подтверждения БА
          </p>
        </SheetContent>
      </Sheet>
    </div>
  );
}
