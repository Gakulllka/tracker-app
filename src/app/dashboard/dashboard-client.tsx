"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ReferenceLine,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Settings,
  ExternalLink,
  Zap,
  TrendingDown,
  TrendingUp,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  PauseCircle,
  XCircle,
  ChevronUp,
} from "lucide-react";
import {
  updateTaskStatus,
  updateBudgetAllocated,
  updatePriority,
  toggleFirstToCut,
  takeTasksFromBacklog,
  returnToBacklog,
  type SerializedPlanfactTask,
} from "@/app/actions/planfact";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type Task = SerializedPlanfactTask;

const ACTIVE_STATUSES = ["В работе", "Блокер", "Отложена", "В релизе"];
const BACKLOG_STATUS = "Новая";
const DONE_STATUS = "Завершена";
const DAILY_RATE = 12; // часов в день

const STATUS_COLORS: Record<string, string> = {
  "Новая": "#60a5fa",        // blue-400
  "В работе": "#fbbf24",     // amber-400
  "Блокер": "#ef4444",       // red-500
  "Отложена": "#ef4444",     // red-500
  "В релизе": "#a78bfa",     // violet-400
  "Завершена": "#16a34a",    // green-600
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 · Наивысший",
  2: "P2 · Высокий",
  3: "P3 · Средний",
  4: "P4 · Низкий",
  5: "P5 · Очередь",
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isEarlyDone(task: Task): boolean {
  return task.status === DONE_STATUS && task.factHours < task.budgetAllocated;
}

function getBubbleColor(task: Task): string {
  if (isEarlyDone(task)) return "#a3e635"; // lime-400
  return STATUS_COLORS[task.status] ?? "#94a3b8";
}

function getCapacityData(tasks: Task[], monthLimit: number) {
  const activeTasks = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status));
  const completedTasks = tasks.filter((t) => t.status === DONE_STATUS);

  const totalAllocated = activeTasks.reduce((s, t) => s + t.budgetAllocated, 0);
  const completedAllocated = completedTasks.reduce((s, t) => s + t.budgetAllocated, 0);
  const totalBudgeted = totalAllocated + completedAllocated;

  const percent = monthLimit > 0 ? (totalBudgeted / monthLimit) * 100 : 0;

  // Авто-помечаем P5 задачи при перебукинге
  const autoFirstToCut = activeTasks.filter(
    (t) => t.priority === 5 && totalBudgeted > monthLimit
  );
  const manualFirstToCut = activeTasks.filter((t) => t.isFirstToCut);
  const firstToCut = [...new Map([...autoFirstToCut, ...manualFirstToCut].map((t) => [t.id, t])).values()];
  const firstToCutHours = firstToCut.reduce((s, t) => s + t.budgetAllocated, 0);

  // Освобождено досрочно: задачи где factHours < budgetAllocated
  const earlyFreed = completedTasks
    .filter((t) => t.factHours < t.budgetAllocated)
    .reduce((s, t) => s + (t.budgetAllocated - t.factHours), 0);

  return {
    totalBudgeted,
    totalAllocated,
    completedAllocated,
    percent,
    firstToCut,
    firstToCutHours,
    earlyFreed,
  };
}

function generateChartData(tasks: Task[], monthLimit: number) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  const relevantTasks = tasks.filter(
    (t) => ACTIVE_STATUSES.includes(t.status) || t.status === DONE_STATUS
  );
  const completedTasks = tasks.filter((t) => t.status === DONE_STATUS);

  // Текущий completed на сегодня
  const completedToday = completedTasks.reduce((s, t) => s + t.budgetAllocated, 0);

  const data = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayDate = new Date(year, month, day, 23, 59, 59);

    const allocated = relevantTasks
      .filter((t) => new Date(t.createdAt) <= dayDate)
      .reduce((s, t) => s + t.budgetAllocated, 0);

    const completed =
      day <= today
        ? completedTasks
            .filter((t) => new Date(t.updatedAt) <= dayDate)
            .reduce((s, t) => s + t.budgetAllocated, 0)
        : Math.min(
            monthLimit,
            completedToday + (day - today) * DAILY_RATE
          );

    return {
      day,
      allocated: day <= today ? allocated : null,
      allocatedForecast: day >= today ? allocated : null,
      completed,
      limit: monthLimit,
      isToday: day === today,
    };
  });

  return data;
}

function getDomainHealth(tasks: Task[], monthLimit: number) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const daysLeft = daysInMonth - today;

  const activeTasks = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status));
  const completedTasks = tasks.filter((t) => t.status === DONE_STATUS);

  const remainingAllocated = activeTasks.reduce((s, t) => s + t.budgetAllocated, 0);
  const totalFact = completedTasks.reduce((s, t) => s + t.factHours, 0);
  const canClose = daysLeft * DAILY_RATE;

  let health = 100;
  let hint = "Всё идёт по плану 🟢";
  let dailyNeeded = DAILY_RATE;

  // Риск не успеть
  if (remainingAllocated > 0 && canClose < remainingAllocated) {
    const deficit = remainingAllocated - canClose;
    const dropRisk = Math.min(50, Math.round((deficit / remainingAllocated) * 60));
    health -= dropRisk;
    dailyNeeded = daysLeft > 0 ? Math.ceil(remainingAllocated / daysLeft) : 999;
    hint = `⚠️ Риск не успеть: нужно закрывать по ${dailyNeeded}ч/день вместо ${DAILY_RATE}ч`;
  }

  // Риск выгорания
  if (totalFact > monthLimit) {
    const burnRatio = (totalFact - monthLimit) / monthLimit;
    health -= Math.min(50, Math.round(burnRatio * 60));
    hint += ` · 🔥 Выгорание: факт (${totalFact}ч) > лимит (${monthLimit}ч)`;
  }

  health = Math.max(0, Math.min(100, health));

  const healthColor =
    health >= 80 ? "text-emerald-500" : health >= 50 ? "text-amber-500" : "text-red-500";

  return { health, hint, healthColor, dailyNeeded };
}

// ============================================================================
// CAPACITY GAUGE
// ============================================================================

function CapacityGauge({
  tasks,
  monthLimit,
  onLimitChange,
  onOpenCalc,
}: {
  tasks: Task[];
  monthLimit: number;
  onLimitChange: (v: number) => void;
  onOpenCalc: () => void;
}) {
  const cap = useMemo(() => getCapacityData(tasks, monthLimit), [tasks, monthLimit]);
  const [limitInput, setLimitInput] = useState(String(monthLimit));
  const [popOpen, setPopOpen] = useState(false);

  const percent = Math.min(cap.percent, 100);
  const barColor =
    cap.percent > 100
      ? "bg-red-500"
      : cap.percent > 80
      ? "bg-amber-400"
      : "bg-emerald-500";

  const handleSaveLimit = () => {
    const v = parseInt(limitInput);
    if (!isNaN(v) && v > 0) {
      onLimitChange(v);
      setPopOpen(false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Загрузка бюджета
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Крупная цифра */}
        <div className="flex items-end gap-2">
          <span
            className={cn(
              "text-4xl font-bold tabular-nums",
              cap.percent > 100
                ? "text-red-500"
                : cap.percent > 80
                ? "text-amber-500"
                : "text-emerald-500"
            )}
          >
            {cap.totalBudgeted}
          </span>
          <span className="text-lg text-muted-foreground mb-1">
            /&nbsp;
            <span className="font-medium text-foreground">{monthLimit}</span>ч
          </span>
          <Popover open={popOpen} onOpenChange={setPopOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="mb-1 h-6 w-6">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 space-y-2">
              <p className="text-xs font-medium">Лимит месяца (часов)</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveLimit()}
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={handleSaveLimit} className="h-8">
                  Ок
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Прогресс-бар */}
        <div className="space-y-1">
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", barColor)}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </div>
          {cap.percent > 100 && (
            <div className="flex items-center gap-1 mt-1">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-red-400 opacity-60"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(cap.percent - 100, 100)}%` }}
                  transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs text-red-500 whitespace-nowrap">
                +{cap.totalBudgeted - monthLimit}ч
              </span>
            </div>
          )}
        </div>

        {/* Легенда */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="space-y-0.5">
            <p className="text-foreground font-medium">{cap.totalAllocated}ч</p>
            <p>Активных задач</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-foreground font-medium">{cap.completedAllocated}ч</p>
            <p>Закрыто</p>
          </div>
        </div>

        <Separator />

        {/* На отсечение */}
        {cap.firstToCut.length > 0 ? (
          <button
            onClick={onOpenCalc}
            className="w-full text-left group"
          >
            <div className="flex items-center gap-1.5 text-amber-500 group-hover:text-amber-400 transition-colors">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                На отсечение: {cap.firstToCut.length} задач ({cap.firstToCutHours}ч)
              </span>
            </div>
          </button>
        ) : (
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5" />
            Перебукинга нет
          </p>
        )}

        {/* Освобождено */}
        {cap.earlyFreed > 0 && (
          <button
            onClick={onOpenCalc}
            className="w-full text-left"
          >
            <Badge
              variant="outline"
              className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 cursor-pointer hover:bg-emerald-100 transition-colors w-full justify-start"
            >
              <TrendingDown className="h-3 w-3 mr-1" />
              Освободилось {cap.earlyFreed}ч — перераспределить
            </Badge>
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// BUDGET MOVEMENT WIDGET
// ============================================================================

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card text-card-foreground p-2.5 shadow-md text-xs space-y-1">
      <p className="font-semibold">День {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value !== null ? `${Math.round(p.value)}ч` : "—"}
        </p>
      ))}
    </div>
  );
};

function BudgetMovementWidget({
  tasks,
  monthLimit,
}: {
  tasks: Task[];
  monthLimit: number;
}) {
  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const chartData = useMemo(
    () => generateChartData(tasks, monthLimit),
    [tasks, monthLimit]
  );

  const health = useMemo(() => getDomainHealth(tasks, monthLimit), [tasks, monthLimit]);
  const cap = useMemo(() => getCapacityData(tasks, monthLimit), [tasks, monthLimit]);

  // Прогноз: на какой день исчерпается бюджет
  const completedNow = tasks
    .filter((t) => t.status === DONE_STATUS)
    .reduce((s, t) => s + t.budgetAllocated, 0);
  const remainingBudget = monthLimit - completedNow;
  const forecastDay = remainingBudget > 0
    ? Math.min(today + Math.ceil(remainingBudget / DAILY_RATE), daysInMonth)
    : today;

  const overSpend = cap.totalBudgeted > monthLimit ? cap.totalBudgeted - monthLimit : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Движение бюджета · Домен Finance
          </CardTitle>
          {/* Индикатор здоровья */}
          <div className="text-right">
            <div className={cn("text-3xl font-bold tabular-nums", health.healthColor)}>
              {health.health}
            </div>
            <div className="text-[10px] text-muted-foreground">здоровье</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Метрики дельты */}
        <div className="flex flex-wrap gap-3 text-xs">
          {overSpend > 0 ? (
            <span className="flex items-center gap-1 text-red-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Перерасход бюджета: +{overSpend}ч
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600">
              <TrendingDown className="h-3.5 w-3.5" />
              В рамках бюджета: −{monthLimit - cap.totalBudgeted}ч
            </span>
          )}
          {cap.earlyFreed > 0 && (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle className="h-3.5 w-3.5" />
              Освобождено досрочно: −{cap.earlyFreed}ч
            </span>
          )}
        </div>

        {/* График */}
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradAllocated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradAllocForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <RechartTooltip content={<CustomChartTooltip />} />

              {/* Лимит — красная пунктирная */}
              <ReferenceLine
                y={monthLimit}
                stroke="#ef4444"
                strokeDasharray="5 3"
                label={{ value: `${monthLimit}ч лимит`, fontSize: 9, fill: "#ef4444", position: "right" }}
              />

              {/* Прогноз — вертикальная пунктирная */}
              {forecastDay <= daysInMonth && (
                <ReferenceLine
                  x={forecastDay}
                  stroke="#f59e0b"
                  strokeDasharray="4 3"
                  label={{ value: `~${forecastDay} мая`, fontSize: 9, fill: "#f59e0b", position: "insideTopRight" }}
                />
              )}

              {/* Сегодня */}
              <ReferenceLine
                x={today}
                stroke="#94a3b8"
                strokeWidth={1}
              />

              {/* Заложено (факт) */}
              <Area
                type="monotone"
                dataKey="allocated"
                name="Заложено"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#gradAllocated)"
                connectNulls={false}
                dot={false}
              />

              {/* Заложено (прогноз) */}
              <Area
                type="monotone"
                dataKey="allocatedForecast"
                name="Прогноз плана"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="url(#gradAllocForecast)"
                connectNulls={false}
                dot={false}
              />

              {/* Выполнено */}
              <Area
                type="monotone"
                dataKey="completed"
                name="Выполнено"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#gradCompleted)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Подсказка здоровья */}
        <p className="text-xs text-muted-foreground">{health.hint}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// RISK MAP — BUBBLE SCATTER CHART
// ============================================================================

function BubbleShape(props: any) {
  const { cx, cy, payload, onSelect } = props;
  if (cx == null || cy == null) return null;

  const radius = Math.min(Math.max(Math.sqrt(payload.totalEstimate) * 2.2, 12), 52);
  const color = getBubbleColor(payload as Task);
  const early = isEarlyDone(payload as Task);

  return (
    <g
      onClick={() => onSelect(payload)}
      style={{ cursor: "pointer" }}
    >
      {/* Свечение для lime (досрочно завершено) */}
      {early && (
        <>
          <circle cx={cx} cy={cy} r={radius + 10} fill="#a3e635" fillOpacity={0.12} />
          <circle cx={cx} cy={cy} r={radius + 5} fill="#a3e635" fillOpacity={0.22} />
        </>
      )}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={color}
        fillOpacity={0.85}
        stroke={early ? "#a3e635" : "rgba(255,255,255,0.4)"}
        strokeWidth={early ? 2 : 1}
        style={early ? { filter: "drop-shadow(0 0 10px #a3e635)" } : {}}
      />
      {/* Метка приоритета */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fill="white"
        fontSize={10}
        fontWeight="700"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        P{payload.priority}
      </text>
    </g>
  );
}

function RiskMapWidget({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
}) {
  const scatterData = useMemo(
    () =>
      tasks.map((t) => ({
        ...t,
        x: t.priority,
        y: t.daysInStatus,
      })),
    [tasks]
  );

  const handleSelect = useCallback(
    (payload: Task) => {
      const task = tasks.find((t) => t.id === payload.id);
      if (task) onSelect(task);
    },
    [tasks, onSelect]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Карта рисков
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Размер пузыря = трудоёмкость · Ось X = приоритет · Ось Y = дней в статусе · Кликните на пузырь
        </p>
      </CardHeader>
      <CardContent>
        {/* Легенда */}
        <div className="flex flex-wrap gap-3 mb-3 text-xs text-muted-foreground">
          {[
            { color: "#60a5fa", label: "Новая" },
            { color: "#fbbf24", label: "В работе" },
            { color: "#ef4444", label: "Блокер / Отложена" },
            { color: "#a78bfa", label: "В релизе" },
            { color: "#16a34a", label: "Завершена" },
            { color: "#a3e635", label: "Завершена досрочно ✨" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                dataKey="x"
                name="Приоритет"
                domain={[0.5, 5.5]}
                ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(v) => `P${v}`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: "Приоритет →",
                  position: "insideBottom",
                  offset: -12,
                  fontSize: 11,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Дней в статусе"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: "Дней в статусе",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 11,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <ZAxis type="number" dataKey="totalEstimate" range={[100, 3000]} />
              <RechartTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as Task;
                  return (
                    <div className="rounded-lg border bg-card p-2.5 shadow-md text-xs space-y-1 max-w-[200px]">
                      <p className="font-semibold truncate">{d.title}</p>
                      <p className="text-muted-foreground">{d.status} · P{d.priority}</p>
                      <p>Трудоёмкость: {d.totalEstimate}ч</p>
                      <p>Бюджет: {d.budgetAllocated}ч</p>
                      <p className="text-[10px] text-muted-foreground">Кликните для деталей</p>
                    </div>
                  );
                }}
              />
              <Scatter
                data={scatterData}
                shape={(props: any) => (
                  <BubbleShape {...props} onSelect={handleSelect} />
                )}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TASK DETAIL SHEET
// ============================================================================

function TaskDetailSheet({
  task,
  onClose,
  onStatusChange,
  onPriorityChange,
  onToggleCut,
  onReturnToBacklog,
  isPending,
}: {
  task: Task | null;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onPriorityChange: (id: string, priority: number) => void;
  onToggleCut: (id: string, value: boolean) => void;
  onReturnToBacklog: (id: string) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();

  if (!task) return null;

  const levers = [
    {
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      label: "Запросить статус",
      action: () =>
        toast({ title: "Запрос отправлен", description: `По задаче «${task.title}»` }),
      variant: "outline" as const,
    },
    {
      icon: <PauseCircle className="h-3.5 w-3.5" />,
      label: "Поставить на паузу",
      action: () => onStatusChange(task.id, "Отложена"),
      variant: "outline" as const,
      disabled: task.status === "Отложена",
    },
    {
      icon: <ChevronUp className="h-3.5 w-3.5" />,
      label: "Ускорить",
      action: () => onPriorityChange(task.id, task.priority - 1),
      variant: "outline" as const,
      disabled: task.priority <= 1,
    },
    {
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: "Отменить (→ беклог)",
      action: () => onReturnToBacklog(task.id),
      variant: "destructive" as const,
    },
  ];

  const progressPct =
    task.budgetAllocated > 0
      ? Math.min(100, Math.round((task.factHours / task.budgetAllocated) * 100))
      : 0;

  return (
    <Sheet open={!!task} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-base pr-8">{task.title}</SheetTitle>
          <SheetDescription>
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
              style={{ backgroundColor: getBubbleColor(task) }}
            >
              {task.status}
            </span>
            &nbsp;·&nbsp;{PRIORITY_LABELS[task.priority]}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Часы */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Трудоёмкость", value: task.totalEstimate, unit: "ч" },
              { label: "Бюджет месяца", value: task.budgetAllocated, unit: "ч" },
              { label: "Факт", value: task.factHours, unit: "ч" },
            ].map(({ label, value, unit }) => (
              <div key={label} className="rounded-lg bg-muted p-3 text-center">
                <p className="text-xl font-bold">{value}{unit}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Прогресс факт/бюджет */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Факт / Бюджет</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progressPct > 100 ? "bg-red-500" : "bg-blue-500"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Дней в статусе */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">В статусе:</span>
            <span className="font-medium">{task.daysInStatus} дней</span>
          </div>

          {/* Ссылка на Планфикс */}
          {task.planfixLink && (
            <a
              href={task.planfixLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-blue-500 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Открыть в Планфикс
            </a>
          )}

          {/* Флаг "на отсечение" */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="firstToCut"
              checked={task.isFirstToCut}
              onCheckedChange={(v) => onToggleCut(task.id, !!v)}
              disabled={isPending}
            />
            <label htmlFor="firstToCut" className="text-sm cursor-pointer flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Первая на отсечение
            </label>
          </div>

          <Separator />

          {/* Рычаги управления */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Рычаги управления
            </p>
            <div className="grid grid-cols-2 gap-2">
              {levers.map((lever) => (
                <Button
                  key={lever.label}
                  variant={lever.variant}
                  size="sm"
                  className="text-xs gap-1.5 h-8"
                  onClick={lever.action}
                  disabled={isPending || lever.disabled}
                >
                  {lever.icon}
                  {lever.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// BUDGET CALCULATOR SHEET
// ============================================================================

function BudgetCalculatorSheet({
  open,
  onClose,
  tasks,
  freeHours,
  onTakeFromBacklog,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  freeHours: number;
  onTakeFromBacklog: (assignments: Array<{ id: string; budgetAllocated: number }>) => void;
  isPending: boolean;
}) {
  const backlog = tasks.filter((t) => t.status === BACKLOG_STATUS);
  const underfunded = tasks.filter(
    (t) => ACTIVE_STATUSES.includes(t.status) && t.budgetAllocated < t.totalEstimate
  );

  const [selected, setSelected] = useState<Record<string, number>>({});

  const totalSelected = Object.values(selected).reduce((s, v) => s + v, 0);
  const remainingFree = freeHours - totalSelected;

  const toggleTask = (id: string, defaultBudget: number) => {
    setSelected((prev) => {
      if (id in prev) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: defaultBudget };
    });
  };

  const handleSubmit = () => {
    const assignments = Object.entries(selected).map(([id, budgetAllocated]) => ({
      id,
      budgetAllocated,
    }));
    onTakeFromBacklog(assignments);
    setSelected({});
  };

  const TaskRow = ({
    task,
    requestedBudget,
    isTopUp = false,
  }: {
    task: Task;
    requestedBudget: number;
    isTopUp?: boolean;
  }) => {
    const fits = requestedBudget <= remainingFree + (selected[task.id] ?? 0);
    const isSelected = task.id in selected;

    return (
      <div
        className={cn(
          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
          isSelected ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "border-border",
          !fits && !isSelected && "opacity-50"
        )}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => fits || isSelected ? toggleTask(task.id, requestedBudget) : null}
          disabled={(!fits && !isSelected) || isPending}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {isTopUp
              ? `+${task.totalEstimate - task.budgetAllocated}ч (осталось до полного)`
              : `${requestedBudget}ч из ${task.totalEstimate}ч`}
            &nbsp;·&nbsp;P{task.priority}
          </p>
          {!fits && !isSelected && (
            <p className="text-[10px] text-red-500 mt-0.5">Не влезет в бюджет</p>
          )}
        </div>
        {isSelected && (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={selected[task.id]}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v >= 0) {
                  setSelected((prev) => ({ ...prev, [task.id]: v }));
                }
              }}
              className="w-16 h-7 text-xs text-center"
              min={0}
            />
            <span className="text-xs text-muted-foreground">ч</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            Калькулятор бюджета
          </SheetTitle>
          <SheetDescription>
            <span className="text-emerald-600 font-semibold">Свободно: {freeHours}ч</span>
            {totalSelected > 0 && (
              <span className="ml-2 text-muted-foreground">
                · Выбрано: {totalSelected}ч · Останется: {remainingFree}ч
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Секция 1: Дозалить в текущие */}
          {underfunded.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                1. Дозалить в текущие задачи
              </p>
              <div className="space-y-2">
                {underfunded.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    requestedBudget={task.totalEstimate - task.budgetAllocated}
                    isTopUp
                  />
                ))}
              </div>
            </div>
          )}

          {/* Секция 2: Взять из беклога */}
          {backlog.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                2. Взять из беклога
              </p>
              <div className="space-y-2">
                {backlog.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    requestedBudget={Math.min(task.totalEstimate, freeHours)}
                  />
                ))}
              </div>
            </div>
          )}

          {backlog.length === 0 && underfunded.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Нет задач для перераспределения
            </p>
          )}
        </div>

        {/* Кнопка принять */}
        {Object.keys(selected).length > 0 && (
          <div className="sticky bottom-0 pt-4 pb-2 bg-background border-t mt-4">
            <Button
              onClick={handleSubmit}
              disabled={isPending || totalSelected > freeHours}
              className="w-full"
            >
              {isPending ? "Обновляем..." : `Принять в работу (${Object.keys(selected).length} задач, ${totalSelected}ч)`}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// MAIN DASHBOARD CLIENT
// ============================================================================

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" },
  }),
};

export function DashboardClient({
  initialTasks,
}: {
  initialTasks: SerializedPlanfactTask[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const toastShownRef = useRef(false);

  // Месячный лимит — из localStorage
  const [monthLimit, setMonthLimit] = useState(240);
  useEffect(() => {
    const saved = localStorage.getItem("planfact-month-limit");
    if (saved) setMonthLimit(parseInt(saved));
  }, []);

  const handleLimitChange = (value: number) => {
    setMonthLimit(value);
    localStorage.setItem("planfact-month-limit", String(value));
  };

  // UI state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);

  // Задачи — прямо из пропов (обновляются после router.refresh())
  const tasks = initialTasks;

  // Derived
  const cap = useMemo(() => getCapacityData(tasks, monthLimit), [tasks, monthLimit]);

  // Toast при освобождении бюджета
  useEffect(() => {
    if (cap.earlyFreed > 0 && !toastShownRef.current) {
      toastShownRef.current = true;
      toast({
        title: `Освободилось ${cap.earlyFreed} часов!`,
        description: "Рекомендуем перераспределить бюджет.",
        action: (
          <ToastAction altText="Открыть калькулятор" onClick={() => setCalcOpen(true)}>
            Открыть калькулятор
          </ToastAction>
        ),
      });
    }
  }, [cap.earlyFreed, toast]);

  // Mutation handlers
  const mutate = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  const handleStatusChange = (id: string, status: string) => {
    // Обновляем selectedTask локально для немедленного отклика
    setSelectedTask((prev) => (prev?.id === id ? { ...prev, status } : prev));
    mutate(() => updateTaskStatus(id, status));
  };

  const handlePriorityChange = (id: string, priority: number) => {
    setSelectedTask((prev) => (prev?.id === id ? { ...prev, priority } : prev));
    mutate(() => updatePriority(id, priority));
  };

  const handleToggleCut = (id: string, value: boolean) => {
    setSelectedTask((prev) => (prev?.id === id ? { ...prev, isFirstToCut: value } : prev));
    mutate(() => toggleFirstToCut(id, value));
  };

  const handleReturnToBacklog = (id: string) => {
    setSelectedTask(null);
    mutate(() => returnToBacklog(id));
  };

  const handleTakeFromBacklog = (
    assignments: Array<{ id: string; budgetAllocated: number }>
  ) => {
    setCalcOpen(false);
    mutate(() => takeTasksFromBacklog(assignments));
  };

  // После router.refresh актуализируем selectedTask из свежих данных
  const displayedTask = selectedTask
    ? tasks.find((t) => t.id === selectedTask.id) ?? selectedTask
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          custom={0}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delta · План-факт</h1>
            <p className="text-sm text-muted-foreground">
              Домен: Finance &nbsp;·&nbsp;{new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              {isPending && (
                <span className="ml-2 text-blue-500 text-xs animate-pulse">
                  Обновление...
                </span>
              )}
            </p>
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Finance · {new Date().toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}
          </Badge>
        </motion.div>

        {/* Row 1: Gauge + Movement */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div variants={fadeIn} initial="hidden" animate="visible" custom={1}>
            <CapacityGauge
              tasks={tasks}
              monthLimit={monthLimit}
              onLimitChange={handleLimitChange}
              onOpenCalc={() => setCalcOpen(true)}
            />
          </motion.div>
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            custom={2}
            className="md:col-span-2"
          >
            <BudgetMovementWidget tasks={tasks} monthLimit={monthLimit} />
          </motion.div>
        </div>

        {/* Row 2: Risk Map */}
        <motion.div variants={fadeIn} initial="hidden" animate="visible" custom={3}>
          <RiskMapWidget tasks={tasks} onSelect={setSelectedTask} />
        </motion.div>

        {/* Row 3: Task list summary */}
        <motion.div variants={fadeIn} initial="hidden" animate="visible" custom={4}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Все задачи · {tasks.length} шт
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 transition-colors text-left group"
                  >
                    <span
                      className="flex-shrink-0 h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getBubbleColor(task) }}
                    />
                    <span className="flex-1 text-sm truncate">{task.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {task.budgetAllocated}ч / {task.totalEstimate}ч
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${getBubbleColor(task)}22`,
                        color: getBubbleColor(task),
                      }}
                    >
                      {task.status}
                    </span>
                    {task.isFirstToCut && (
                      <Zap className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={displayedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
        onToggleCut={handleToggleCut}
        onReturnToBacklog={handleReturnToBacklog}
        isPending={isPending}
      />

      {/* Budget Calculator Sheet */}
      <BudgetCalculatorSheet
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        tasks={tasks}
        freeHours={cap.earlyFreed + Math.max(0, monthLimit - cap.totalBudgeted)}
        onTakeFromBacklog={handleTakeFromBacklog}
        isPending={isPending}
      />
    </div>
  );
}
