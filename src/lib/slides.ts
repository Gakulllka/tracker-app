/**
 * slides.ts — генерация слайдов презентации из данных месяца.
 * Вынесено из page.tsx.
 */

import { STATUSES, MONTHS, STATUS_ORDER } from "./types";
import { INK } from "./tokens";
import type { Task } from "./types";
import { evalExpr, fmt2, buildTotalFactMap } from "./metrics";
import { SlideData } from "./presentation-renderer";

export function generateSlides(
  month: number,
  year: number,
  allData: Record<number, Task[]>,
  totalFactMap: Record<string, number>,
  monthCapacity: number,
  backlog: Task[] = [],
  currentSnapshot?: { monthlyTasksCount: number; backlogCount: number; ideasCount: number } | null,
  previousSnapshot?: { monthlyTasksCount: number; backlogCount: number; ideasCount: number } | null,
  /** Полная база по ключам "YYYY-MM" — для кумулятивного итога на конец прошлого месяца. */
  dataByYearMonth: Record<string, Task[]> = {},
): SlideData[] {
  const monthRows = (allData[month] || []).filter((r) => !r._deleted && (r.name || r.num));
  const rows = monthRows.filter((r) => r.status !== STATUSES.IDEA);
  const liveBacklogCount = (backlog || []).filter((r) => !r._deleted && (r.name || r.num)).length;
  const ideaIds = new Set<string>();
  Object.values(allData).forEach((monthTasks) => monthTasks.forEach((r) => { if (!r._deleted && r.status === STATUSES.IDEA && (r.name || r.num)) ideaIds.add(r.id); }));
  const liveIdeasCount = ideaIds.size;
  const backlogCount = currentSnapshot?.backlogCount ?? liveBacklogCount;
  const ideasCount = currentSnapshot?.ideasCount ?? liveIdeasCount;
  let total = currentSnapshot?.monthlyTasksCount ?? rows.length;
  let completed = 0;
  let factH = 0;
  const completedTasks: Task[] = [];
  const inProgressTasks: Task[] = [];

  for (const r of rows) {
    if (r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED) {
      completed++;
      completedTasks.push(r);
    } else if (
      r.status !== STATUSES.CANCEL &&
      r.status !== STATUSES.IDEA &&
      r.status !== STATUSES.POSTPONED
    ) {
      inProgressTasks.push(r);
    }
    factH += evalExpr(r.factH);
  }

  const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const monthLabel = `${MONTHS[month]} ${year}`;
  const slides: SlideData[] = [];

  // ── Previous month data for dynamics ──
  // Переход через год: у января (month=0) прошлый = декабрь прошлого года.
  const prevDate = new Date(year, month - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth(); // 0..11, корректно для января → 11
  const prevMonthKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  // Берём строки прошлого месяца из полной базы (для января — декабрь прошлого года).
  const prevRows = (dataByYearMonth[prevMonthKey] || []).filter(
    (r) => !r._deleted && (r.name || r.num) && r.status !== STATUSES.IDEA
  );
  // Кумулятивный итог по num на конец прошлого месяца (вечная задача).
  const prevTotalFactMap = buildTotalFactMap(dataByYearMonth, prevYear, prevMonth);
  let prevCompleted = 0;
  let prevFactH = 0;
  let prevUncompleted = 0;
  for (const r of prevRows) {
    if (r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED) {
      prevCompleted++;
    }
    prevFactH += evalExpr(r.factH);
  }
  prevUncompleted = prevRows.length - prevCompleted;
  const currentUncompleted = total - completed;

  const planH = monthCapacity;
  const overPct = planH > 0 ? Math.round(((factH - planH) / planH) * 100) : 0;
  const prevOverPct = planH > 0 ? Math.round(((prevFactH - planH) / planH) * 100) : 0;
  const prevCompPct = prevRows.length > 0 ? Math.round((prevCompleted / prevRows.length) * 100) : 0;

  // ── Completed tasks: cumulative hours & per-task delta from previous month ──
  const completedWithDelta = completedTasks.map((t) => {
    const currentTotal = t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH);
    const prevTask = t.num ? prevRows.find((p) => p.num === t.num) : undefined;
    const prevTotal = prevTask
      ? (prevTask.num ? (prevTotalFactMap[prevTask.num] || 0) : evalExpr(prevTask.factH))
      : 0;
    const delta = currentTotal - prevTotal;
    return { task: t, currentTotal, prevTotal, delta };
  });

  const completedTotalHours = R2(completedWithDelta.reduce((s, d) => s + d.currentTotal, 0));

  // ── In-progress tasks: cumulative hours & delta ──
  const inProgressWithDelta = inProgressTasks.map((t) => {
    const currentTotal = t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH);
    const prevTask = t.num ? prevRows.find((p) => p.num === t.num) : undefined;
    const prevTotal = prevTask
      ? (prevTask.num ? (prevTotalFactMap[prevTask.num] || 0) : evalExpr(prevTask.factH))
      : 0;
    const delta = currentTotal - prevTotal;
    return { task: t, currentTotal, prevTotal, delta };
  });

  const inProgressTotalHours = R2(inProgressWithDelta.reduce((s, d) => s + d.currentTotal, 0));

  // ── Slides ──

  // 1) Title
  slides.push({
    type: "title",
    content: { month: monthLabel, total, secondaryTotal: backlogCount + ideasCount, completed, pct: compPct, accent: INK },
  });

  // 2) KPI — Plan (Dashboard budget), Fact, dynamics
  slides.push({
    type: "kpi",
    content: {
      planH,
      factH: R2(factH),
      overPct,
      prevOverPct,
      completed,
      completedPrev: prevCompleted,
      total,
      totalPrev: previousSnapshot ? previousSnapshot.monthlyTasksCount + previousSnapshot.backlogCount + previousSnapshot.ideasCount : prevRows.length,
      backlogCount,
      ideasCount,
      totalAll: total + backlogCount + ideasCount,
      compPct,
      compPctPrev: prevCompPct,
      currentUncompleted,
      prevUncompleted,
      accent: INK,
    },
  });

  // 3) ~~Statuses~~ — removed per requirements

  // 4) Completed tasks — ALL tasks, hours, delta
  if (completedTasks.length > 0) {
    slides.push({
      type: "completed",
      content: {
        tasks: completedWithDelta,
        total: completedTasks.length,
        totalHours: completedTotalHours,
        accent: INK,
      },
    });
  }

  // 5) In-progress tasks — ALL tasks, hours, delta
  if (inProgressTasks.length > 0) {
    slides.push({
      type: "inprogress",
      content: {
        tasks: inProgressWithDelta,
        total: inProgressTasks.length,
        totalHours: inProgressTotalHours,
        accent: INK,
      },
    });
  }

  // 6) Full table — ALL tasks sorted by status
  slides.push({
    type: "table",
    content: {
      rows: sortRowsByStatus(rows),
      total: rows.length,
      completed,
      totalHours: R2(factH),
      accent: INK,
      totalFactMap,
    },
  });

  // 7) Summary — AI-driven conclusions
  slides.push({
    type: "summary",
    content: {
      month: monthLabel,
      accent: INK,
      total,
      completed,
      planH,
      factH: R2(factH),
      compPct,
      overPct,
      currentUncompleted,
      prevUncompleted,
    },
  });

  return slides;
}

function R2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Сортировка задач по порядку статусов (от Идеи до Завершённых). */
function sortRowsByStatus(rows: Task[]): Task[] {
  return [...rows].sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    return orderA - orderB;
  });
}
