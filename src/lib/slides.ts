/**
 * slides.ts — генерация слайдов презентации из данных месяца.
 * Вынесено из page.tsx.
 */

import { Task, STATUSES, MONTHS, STATUS_ORDER } from "./types";
import { evalExpr, fmt2 } from "./metrics";
import { SlideData } from "./presentation-renderer";

export function generateSlides(
  month: number,
  year: number,
  allData: Record<number, Task[]>,
  accentHex: string,
  totalFactMap: Record<string, number>,
  monthCapacity: number,
): SlideData[] {
  const rows = (allData[month] || []).filter((r) => r.name || r.num);
  let total = rows.length;
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
  const prevMonth = month > 0 ? month - 1 : -1;
  const prevRows = prevMonth >= 0
    ? (allData[prevMonth] || []).filter((r) => r.name || r.num)
    : [];
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
    let prevTotal = 0;
    if (t.num && prevMonth >= 0) {
      const prevTask = prevRows.find((p) => p.num === t.num);
      if (prevTask) {
        prevTotal = prevTask.num
          ? (buildPrevTotalFactMap(allData, prevMonth)[prevTask.num] || 0)
          : evalExpr(prevTask.factH);
      }
    }
    const delta = currentTotal - prevTotal;
    return { task: t, currentTotal, prevTotal, delta };
  });

  const completedTotalHours = R2(completedWithDelta.reduce((s, d) => s + d.currentTotal, 0));

  // ── In-progress tasks: cumulative hours & delta ──
  const inProgressWithDelta = inProgressTasks.map((t) => {
    const currentTotal = t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH);
    let prevTotal = 0;
    if (t.num && prevMonth >= 0) {
      const prevTask = prevRows.find((p) => p.num === t.num);
      if (prevTask) {
        prevTotal = prevTask.num
          ? (buildPrevTotalFactMap(allData, prevMonth)[prevTask.num] || 0)
          : evalExpr(prevTask.factH);
      }
    }
    const delta = currentTotal - prevTotal;
    return { task: t, currentTotal, prevTotal, delta };
  });

  const inProgressTotalHours = R2(inProgressWithDelta.reduce((s, d) => s + d.currentTotal, 0));

  // ── Slides ──

  // 1) Title
  slides.push({
    type: "title",
    content: { month: monthLabel, total, completed, pct: compPct, accent: accentHex },
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
      totalPrev: prevRows.length,
      compPct,
      compPctPrev: prevCompPct,
      currentUncompleted,
      prevUncompleted,
      accent: accentHex,
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
        accent: accentHex,
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
        accent: accentHex,
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
      accent: accentHex,
      totalFactMap,
    },
  });

  // 7) Summary — AI-driven conclusions
  slides.push({
    type: "summary",
    content: {
      month: monthLabel,
      accent: accentHex,
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

/** Строит totalFactMap для предыдущего месяца (кумулятивный по номеру задачи). */
function buildPrevTotalFactMap(
  allData: Record<number, Task[]>,
  upToMonth: number,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (let mi = 0; mi <= upToMonth; mi++) {
    (allData[mi] || []).forEach((row) => {
      if (row.num) {
        map[row.num] = (map[row.num] || 0) + evalExpr(row.factH);
      }
    });
  }
  Object.keys(map).forEach((k) => {
    map[k] = R2(map[k]);
  });
  return map;
}
