"use client";

/**
 * DashboardDelta — Монитор Руководителя.
 * Полный редизайн вкладки «Дашборд» согласно ТЗ «Экосистема Delta».
 *
 * Блок 1: Capacity Gauge (индикатор загрузки)
 * Блок 2: Area Chart (движение бюджета) + здоровье
 * Блок 3: Карта рисков (ScatterChart)
 * Блок 4: Калькулятор бюджета (Sheet)
 */

import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Task, STATUSES, MONTHS, SCOL } from "@/lib/types";
import {
  R2,
  evalExpr,
  calcMonthBudgetUsed,
  calcHealthScore,
  calcBudgetExhaustDate,
  MONTH_CAPACITY,
  fmt2,
} from "@/lib/metrics";

// ─── Константы ───────────────────────────────────────────────────────────────

const STATUS_SCATTER_COLORS: Record<string, string> = {
  [STATUSES.NEW]: "#4fc3f7",
  [STATUSES.IDEA]: "#4fc3f7",
  [STATUSES.ANALYSIS]: "#7c9fff",
  [STATUSES.APPROVAL]: "#7c9fff",
  [STATUSES.QUEUE_DEV]: "#7c9fff",
  [STATUSES.DEV]: "#fbbb2d",
  [STATUSES.TEST]: "#fbbb2d",
  [STATUSES.RELEASE]: "#fbbb2d",
  [STATUSES.DOCS]: "#fbbb2d",
  "Блокер": "#E24B4A",
  [STATUSES.COMPLETED]: "#1D9E75",
  [STATUSES.PROD_CHECK]: "#1D9E75",
  [STATUSES.DONE]: "#0d6e4a",
  [STATUSES.POSTPONED]: "#9ca3af",
  [STATUSES.CANCEL]: "#9ca3af",
};

const PRIORITY_NUM: Record<string, number> = {
  "Наивысший": 1,
  "Высокий": 2,
  "Средний": 3,
  "Низкий": 4,
  "Очередь": 5,
};

const FLAG_LABELS: Record<string, string> = {
  escalate: "⚡ Эскалировать",
  pause: "⏸ Пауза",
  cancel: "✖ Отменить",
  request_status: "❓ Запросить статус",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 75 ? "#1D9E75" : score >= 50 ? "#BA7517" : "#E24B4A";
  const label =
    score >= 75 ? "Хорошее" : score >= 50 ? "Под риском" : "Критично";
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: "var(--tracker-border, var(--border))" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span
        className="text-xs font-semibold tabular-nums w-20 text-right shrink-0"
        style={{ color }}
      >
        {score}/100 · {label}
      </span>
    </div>
  );
}

// Custom tooltip для scatter chart
function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl px-3 py-2.5 shadow-lg text-xs"
      style={{
        background: "var(--tracker-bg, var(--background))",
        border: "1px solid var(--tracker-border, var(--border))",
        maxWidth: 220,
      }}
    >
      <p className="font-semibold mb-1 truncate" style={{ color: "var(--tracker-text-main)" }}>
        {d.name || d.num || "—"}
      </p>
      <div className="space-y-0.5" style={{ color: "var(--tracker-text-muted)" }}>
        <p>Приоритет: <span className="font-medium">{d.priorityLabel}</span></p>
        <p>Статус: <span className="font-medium">{d.status}</span></p>
        <p>Дней в статусе: <span className="font-medium">{d.daysInStatus ?? 0}</span></p>
        <p>Оценка: <span className="font-medium">{d.planH}ч</span></p>
        {d.isPending && (
          <p className="mt-1 font-semibold" style={{ color: "#BA7517" }}>
            ⏳ Ожидает подтверждения БА
          </p>
        )}
      </div>
    </div>
  );
}

interface ScatterPoint {
  x: number;       // priority 1–5
  y: number;       // days in status
  z: number;       // plan hours (size)
  name: string;
  num: string;
  status: string;
  priorityLabel: string;
  planH: number;
  daysInStatus: number;
  isPending: boolean;
  color: string;
  task: Task;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardDeltaProps {
  /** Задачи текущего месяца */
  tasks: Task[];
  /** Все задачи из беклога */
  backlogTasks: Task[];
  /** Лимит месяца (дефолт 240) */
  monthCapacity?: number;
  /** Данные годовой динамики (0-11 месяцев, факт) */
  monthlyFact: number[];
  /** Данные годовой динамики (0-11 месяцев, план budgetAllocated) */
  monthlyAllocated: number[];
  currentMonth: number;
  currentYear: number;
  /** Колбэк обновления задачи (executiveFlag, approvalStatus) */
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  isDark?: boolean;
}

export function DashboardDelta({
  tasks,
  backlogTasks,
  monthCapacity = MONTH_CAPACITY,
  monthlyFact,
  monthlyAllocated,
  currentMonth,
  currentYear,
  onUpdateTask,
  isDark = false,
}: DashboardDeltaProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);

  // ── Вычисления ────────────────────────────────────────────────────────────

  const aliveTasks = useMemo(
    () => tasks.filter((t) => !t._deleted && !t._hidden),
    [tasks],
  );

  const budgetUsed = useMemo(() => calcMonthBudgetUsed(aliveTasks), [aliveTasks]);
  const budgetPct = monthCapacity > 0 ? R2((budgetUsed / monthCapacity) * 100) : 0;
  const gaugeColor =
    budgetPct > 100 ? "#E24B4A" : budgetPct > 80 ? "#BA7517" : "#1D9E75";

  const healthScore = useMemo(() => calcHealthScore(aliveTasks, monthCapacity), [aliveTasks, monthCapacity]);

  const totalFact = useMemo(
    () => R2(aliveTasks.reduce((s, t) => s + evalExpr(t.factH), 0)),
    [aliveTasks],
  );

  const remainingBudget = R2(budgetUsed - totalFact);
  const exhaustDate = calcBudgetExhaustDate(remainingBudget);

  const firstToCut = useMemo(
    () => aliveTasks.filter((t) => t.isFirstToCut && t.approvalStatus !== "rejected"),
    [aliveTasks],
  );

  const pendingTasks = useMemo(
    () => aliveTasks.filter((t) => t.approvalStatus === "pending"),
    [aliveTasks],
  );

  // Освобождённые часы (задачи раньше завершились: factH < budgetAllocated)
  const freedHours = useMemo(() => {
    return R2(
      aliveTasks
        .filter(
          (t) =>
            (t.status === STATUSES.DONE || t.status === STATUSES.COMPLETED) &&
            evalExpr(t.factH) < (t.budgetAllocated ?? 0),
        )
        .reduce(
          (sum, t) =>
            sum + R2((t.budgetAllocated ?? 0) - evalExpr(t.factH)),
          0,
        ),
    );
  }, [aliveTasks]);

  // Беклог задачи, которые влезают в свободные часы
  const freeHoursNow = Math.max(0, monthCapacity - budgetUsed) + freedHours;
  const backlogCandidates = useMemo(
    () =>
      (backlogTasks || []).filter(
        (t) => !t._deleted && evalExpr(t.planH) <= freeHoursNow,
      ),
    [backlogTasks, freeHoursNow],
  );

  // Дополнительная дозаливка (есть задачи, где budgetAllocated < totalBudgetRequested)
  const topupCandidates = useMemo(
    () =>
      aliveTasks.filter(
        (t) =>
          (t.totalBudgetRequested ?? 0) > 0 &&
          (t.budgetAllocated ?? 0) < (t.totalBudgetRequested ?? 0) &&
          t.approvalStatus !== "rejected",
      ),
    [aliveTasks],
  );

  // Данные для Area Chart
  const MONTHS_SHORT = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  const areaData = MONTHS_SHORT.map((m, i) => ({
    month: m,
    allocated: monthlyAllocated[i] ?? 0,
    fact: monthlyFact[i] ?? 0,
    limit: monthCapacity,
    active: i === currentMonth,
  }));

  // Данные для ScatterChart
  const scatterData: ScatterPoint[] = useMemo(() => {
    return aliveTasks
      .filter((t) => t.name || t.num)
      .map((t) => {
        const pNum = PRIORITY_NUM[t.priority] ?? 3;
        const isPending = t.approvalStatus === "pending";
        const isAhead =
          (t.status === STATUSES.DONE || t.status === STATUSES.COMPLETED) &&
          evalExpr(t.factH) < evalExpr(t.planH);
        const color = isAhead
          ? "#a3e635" // лаймовый для "завершена с опережением"
          : STATUS_SCATTER_COLORS[t.status] ?? "#9ca3af";
        return {
          x: pNum,
          y: t.daysInStatus ?? 0,
          z: Math.max(10, Math.min(evalExpr(t.planH) * 3, 800)),
          name: t.name,
          num: t.num,
          status: t.status,
          priorityLabel: t.priority,
          planH: evalExpr(t.planH),
          daysInStatus: t.daysInStatus ?? 0,
          isPending,
          color,
          task: t,
        };
      });
  }, [aliveTasks]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Pending notice */}
      {pendingTasks.length > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
          style={{
            background: "rgba(251,191,36,0.07)",
            border: "1px solid rgba(251,191,36,0.3)",
            color: "#854F0B",
          }}
        >
          <span className="text-base shrink-0">⏳</span>
          <span className="flex-1 text-xs">
            {pendingTasks.length}{" "}
            {pendingTasks.length === 1 ? "задача ожидает" : "задач ожидают"}{" "}
            подтверждения БА — показаны полупрозрачно
          </span>
        </div>
      )}

      {/* Freed hours toast-like */}
      {freedHours > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
          style={{
            background: "rgba(29,158,117,0.08)",
            border: "1px solid rgba(29,158,117,0.3)",
            color: "#1D9E75",
          }}
          onClick={() => setCalcOpen(true)}
        >
          <span className="text-base shrink-0">🎉</span>
          <span className="flex-1 text-xs font-medium">
            Освободилось {freedHours}ч досрочно — открыть калькулятор бюджета
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "#1D9E75", color: "#fff" }}>
            Открыть →
          </span>
        </div>
      )}

      {/* ─── БЛОК 1: Capacity Gauge ─── */}
      <div className="dash-section">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="dash-section-title">⚡ Загрузка месяца</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>
              {MONTHS[currentMonth]} {currentYear} · лимит {monthCapacity}ч
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: gaugeColor }}
            >
              {budgetUsed}ч
            </p>
            <p className="text-[11px]" style={{ color: "var(--tracker-text-muted)" }}>
              {budgetPct}% использовано
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="h-3 rounded-full overflow-hidden mb-3 relative"
          style={{ background: "var(--tracker-border, var(--border))" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 relative"
            style={{
              width: `${Math.min(budgetPct, 100)}%`,
              background: gaugeColor,
            }}
          />
          {/* 80% mark */}
          <div
            className="absolute top-0 bottom-0 w-px opacity-50"
            style={{ left: "80%", background: "#BA7517" }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] mb-4"
          style={{ color: "var(--tracker-text-muted)" }}>
          <span>0ч</span>
          <span style={{ color: "#BA7517" }}>
            80% = {R2(monthCapacity * 0.8)}ч
          </span>
          <span>{monthCapacity}ч</span>
        </div>

        {/* На отсечение */}
        {firstToCut.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "#E24B4A" }}>
              ⚡ На отсечение ({firstToCut.length})
            </p>
            <div className="space-y-1">
              {firstToCut.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg"
                  style={{ background: "rgba(226,75,74,0.06)" }}>
                  <span style={{ color: "var(--tracker-text-muted)" }}>{t.num}</span>
                  <span className="flex-1 truncate" style={{ color: "var(--tracker-text-main)" }}>
                    {t.name || "—"}
                  </span>
                  <span className="tabular-nums" style={{ color: "#E24B4A" }}>
                    {t.budgetAllocated ?? 0}ч
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── БЛОК 2: Area Chart + Здоровье ─── */}
      <div className="dash-section">
        <div className="flex items-center justify-between mb-1">
          <p className="dash-section-title">📈 Движение бюджета</p>
          {exhaustDate && (
            <span className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(186,117,23,0.12)", color: "#854F0B" }}>
              ~исчерпан {exhaustDate}
            </span>
          )}
        </div>

        <div className="mb-3">
          <p className="text-[11px] mb-1" style={{ color: "var(--tracker-text-muted)" }}>
            Здоровье команды
          </p>
          <HealthBar score={healthScore} />
        </div>

        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradAllocated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4fc3f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4fc3f7" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradFact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1D9E75" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--tracker-border)" opacity={0.4} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "var(--tracker-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--tracker-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--tracker-bg, var(--background))",
                  border: "1px solid var(--tracker-border, var(--border))",
                  borderRadius: 10,
                  fontSize: 11,
                }}
              />
              {/* Пунктирная линия лимита */}
              <ReferenceLine
                y={monthCapacity}
                stroke="#E24B4A"
                strokeDasharray="5 3"
                strokeOpacity={0.6}
                label={{ value: `${monthCapacity}ч`, position: "right", fontSize: 9, fill: "#E24B4A" }}
              />
              <Area
                type="monotone"
                dataKey="allocated"
                name="Заложено"
                stroke="#4fc3f7"
                strokeWidth={2}
                fill="url(#gradAllocated)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="fact"
                name="Выполнено"
                stroke="#1D9E75"
                strokeWidth={2}
                fill="url(#gradFact)"
                dot={false}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                iconType="circle"
                iconSize={7}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── БЛОК 3: Карта рисков ─── */}
      <div className="dash-section">
        <p className="dash-section-title mb-1">🫧 Карта рисков</p>
        <p className="text-[11px] mb-3" style={{ color: "var(--tracker-text-muted)" }}>
          X — приоритет · Y — дней в статусе · Размер — оценка часов · Кликни на задачу
        </p>

        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--tracker-border)" opacity={0.4} />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, 5.5]}
                tickCount={5}
                tickFormatter={(v) => ["","Н-ший","Высок","Средн","Низк","Очер"][Math.round(v)] ?? ""}
                tick={{ fontSize: 9, fill: "var(--tracker-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fontSize: 9, fill: "var(--tracker-text-muted)" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "дней", angle: -90, position: "insideLeft", fontSize: 9, fill: "var(--tracker-text-muted)" }}
              />
              <ZAxis type="number" dataKey="z" range={[30, 600]} />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter
                data={scatterData}
                shape={(props: { cx?: number; cy?: number; payload?: ScatterPoint }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  if (!payload) return <circle cx={cx} cy={cy} r={6} />;
                  const r = Math.sqrt((payload.z ?? 100) / Math.PI);
                  const isPending = payload.isPending;
                  const isAhead = payload.color === "#a3e635";
                  return (
                    <g
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedTask(payload.task)}
                    >
                      {isAhead && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 4}
                          fill="none"
                          stroke="#a3e635"
                          strokeWidth={1.5}
                          opacity={0.5}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={payload.color}
                        fillOpacity={isPending ? 0.35 : 0.75}
                        stroke={payload.color}
                        strokeWidth={isPending ? 0 : 1}
                        strokeDasharray={isPending ? "4 2" : undefined}
                      />
                      {isPending && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 1}
                          fill="none"
                          stroke={payload.color}
                          strokeWidth={1.5}
                          strokeDasharray="3 2"
                          opacity={0.8}
                        />
                      )}
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Легенда */}
        <div className="flex flex-wrap gap-3 mt-2">
          {[
            { color: "#4fc3f7", label: "Новая / Анализ" },
            { color: "#fbbb2d", label: "В работе" },
            { color: "#E24B4A", label: "Блокер" },
            { color: "#1D9E75", label: "Завершена" },
            { color: "#a3e635", label: "С опережением ✨" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                {item.label}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-dashed"
              style={{
                background: "transparent",
                borderColor: "#BA7517",
              }}
            />
            <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
              ⏳ Pending
            </span>
          </div>
        </div>
      </div>

      {/* ─── БЛОК 4: Калькулятор (кнопка) ─── */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8"
          onClick={() => setCalcOpen(true)}
        >
          🧮 Калькулятор бюджета · свободно {fmt2(freeHoursNow)}ч
        </Button>
      </div>

      {/* ─── Поп-ап задачи (Рычаги руководителя) ─── */}
      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)}>
          <DialogContent
            style={{
              background: "var(--tracker-bg, var(--background))",
              border: "1px solid var(--tracker-border, var(--border))",
            }}
          >
            <DialogHeader>
              <DialogTitle
                className="text-base truncate"
                style={{ color: "var(--tracker-accent-fg-dark)" }}
              >
                {selectedTask.num ? `#${selectedTask.num} · ` : ""}{selectedTask.name || "Без названия"}
              </DialogTitle>
            </DialogHeader>

            {/* Данные задачи */}
            <div className="space-y-2 text-xs mb-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Статус", selectedTask.status],
                  ["Приоритет", selectedTask.priority],
                  ["План", `${evalExpr(selectedTask.planH)}ч`],
                  ["Факт", `${evalExpr(selectedTask.factH)}ч`],
                  ["Бюджет выделен", `${selectedTask.budgetAllocated ?? 0}ч`],
                  ["Дней в статусе", String(selectedTask.daysInStatus ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg px-3 py-2"
                    style={{ background: "var(--tracker-accent-bg, rgba(29,158,117,0.06))" }}>
                    <p style={{ color: "var(--tracker-text-muted)" }}>{label}</p>
                    <p className="font-semibold mt-0.5" style={{ color: "var(--tracker-text-main)" }}>{value}</p>
                  </div>
                ))}
              </div>

              {selectedTask.approvalStatus === "pending" && (
                <div className="rounded-lg px-3 py-2 text-center"
                  style={{ background: "rgba(251,191,36,0.08)", color: "#854F0B" }}>
                  ⏳ Ожидает подтверждения БА
                </div>
              )}
            </div>

            {/* Рычаги */}
            <div>
              <p className="text-xs font-semibold mb-2"
                style={{ color: "var(--tracker-text-muted)" }}>
                Рычаги руководителя
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FLAG_LABELS).map(([flag, label]) => {
                  const isActive = selectedTask.executiveFlag === flag;
                  return (
                    <Button
                      key={flag}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      style={
                        isActive
                          ? { background: "var(--tracker-accent)", color: "#fff" }
                          : {}
                      }
                      onClick={() => {
                        const newFlag = isActive ? undefined : (flag as Task["executiveFlag"]);
                        onUpdateTask(selectedTask.id, { executiveFlag: newFlag });
                        setSelectedTask({ ...selectedTask, executiveFlag: newFlag });
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Калькулятор бюджета (Sheet) ─── */}
      <Sheet open={calcOpen} onOpenChange={setCalcOpen}>
        <SheetContent
          side="right"
          className="w-[460px] sm:w-[520px] overflow-y-auto"
          style={{
            background: "var(--tracker-bg, var(--background))",
            borderLeft: "1px solid var(--tracker-border, var(--border))",
          }}
        >
          <SheetHeader className="pb-4">
            <SheetTitle style={{ color: "var(--tracker-accent-fg-dark)" }}>
              🧮 Калькулятор бюджета
            </SheetTitle>
            <SheetDescription style={{ color: "var(--tracker-text-muted)" }}>
              Свободно: <strong>{fmt2(freeHoursNow)}ч</strong>
              {freedHours > 0 && ` (включая ${freedHours}ч досрочно освобождённых)`}
            </SheetDescription>
          </SheetHeader>

          {/* Секция 1: Дозалить в текущие */}
          {topupCandidates.length > 0 && (
            <section className="mb-6">
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--tracker-text-muted)" }}
              >
                1 / Дозалить в текущие задачи
              </h3>
              <div className="space-y-2">
                {topupCandidates.map((t) => {
                  const gap = R2((t.totalBudgetRequested ?? 0) - (t.budgetAllocated ?? 0));
                  const canAdd = Math.min(gap, freeHoursNow);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{
                        background: "var(--tracker-accent-bg, rgba(29,158,117,0.06))",
                        border: "1px solid var(--tracker-border, var(--border))",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate"
                          style={{ color: "var(--tracker-text-main)" }}>
                          {t.name || t.num || "—"}
                        </p>
                        <p className="text-[11px] mt-0.5"
                          style={{ color: "var(--tracker-text-muted)" }}>
                          выделено {t.budgetAllocated ?? 0}ч / нужно {t.totalBudgetRequested ?? 0}ч
                          · перенос {gap}ч
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        disabled={canAdd <= 0}
                        style={{ background: "var(--tracker-accent)", color: "#fff" }}
                        onClick={() => {
                          onUpdateTask(t.id, {
                            approvalStatus: "pending",
                            budgetAllocated: R2((t.budgetAllocated ?? 0) + canAdd),
                            budgetRollover: R2(gap - canAdd),
                          });
                        }}
                      >
                        +{canAdd}ч
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Секция 2: Взять из беклога */}
          <section>
            <h3
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--tracker-text-muted)" }}
            >
              2 / Взять из беклога
            </h3>

            {backlogCandidates.length === 0 && (
              <p className="text-xs py-4 text-center"
                style={{ color: "var(--tracker-text-muted)" }}>
                {freeHoursNow > 0
                  ? "Нет задач в беклоге, умещающихся в свободные часы"
                  : "Нет свободных часов для новых задач"}
              </p>
            )}

            <div className="space-y-2">
              {backlogCandidates.map((t) => {
                const planH = evalExpr(t.planH);
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{
                      background: "var(--tracker-bg, var(--background))",
                      border: "1px solid var(--tracker-border, var(--border))",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium truncate"
                        style={{ color: "var(--tracker-text-main)" }}
                      >
                        {t.name || t.num || "—"}
                      </p>
                      <p className="text-[11px] mt-0.5"
                        style={{ color: "var(--tracker-text-muted)" }}>
                        оценка {planH}ч · {t.priority}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => {
                        // Двухфазный коммит: pending, ждёт подтверждения БА
                        onUpdateTask(t.id, {
                          approvalStatus: "pending",
                          budgetAllocated: planH,
                          totalBudgetRequested: planH,
                        });
                      }}
                    >
                      ⏳ В план
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        </SheetContent>
      </Sheet>
    </div>
  );
}
