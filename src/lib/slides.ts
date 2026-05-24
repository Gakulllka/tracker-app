/**
 * slides.ts — генерация слайдов презентации из данных месяца.
 * Вынесено из page.tsx.
 */

import { Task, STATUSES, MONTHS } from "./types";
import { evalExpr, fmt2 } from "./metrics";
import { SlideData } from "./presentation-renderer";

export function generateSlides(
  month: number,
  year: number,
  allData: Record<number, Task[]>,
  accentHex: string,
  totalFactMap: Record<string, number>,
): SlideData[] {
  const rows = (allData[month] || []).filter((r) => r.name || r.num);
  let total = rows.length;
  let completed = 0;
  let planH = 0;
  let factH = 0;
  const statusCounts: Record<string, number> = {};
  const completedTasks: Task[] = [];
  const inProgressTasks: Task[] = [];

  for (const r of rows) {
    if (r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED) {
      completed++;
      completedTasks.push(r);
    } else if (r.status !== STATUSES.CANCEL && r.status !== STATUSES.IDEA) {
      inProgressTasks.push(r);
    }
    planH += evalExpr(r.planH);
    factH += evalExpr(r.factH);
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const monthLabel = `${MONTHS[month]} ${year}`;
  const slides: SlideData[] = [];

  slides.push({ type: "title", content: { month: monthLabel, total, completed, pct: compPct, accent: accentHex } });
  slides.push({ type: "kpi",   content: { total, completed, planH: fmt2(planH), factH: fmt2(factH), accent: accentHex } });
  slides.push({ type: "statuses", content: { statusCounts, accent: accentHex } });

  if (completedTasks.length > 0)
    slides.push({ type: "completed", content: { tasks: completedTasks.slice(0, 8), total: completedTasks.length, accent: accentHex } });

  if (inProgressTasks.length > 0)
    slides.push({ type: "inprogress", content: { tasks: inProgressTasks.slice(0, 8), total: inProgressTasks.length, accent: accentHex } });

  slides.push({ type: "table", content: { rows: rows.slice(0, 15), total: rows.length, accent: accentHex, totalFactMap } });

  const overTasks = rows.filter(r => evalExpr(r.factH) > evalExpr(r.planH) && evalExpr(r.planH) > 0).length;
  slides.push({
    type: "summary",
    content: {
      month: monthLabel, accent: accentHex,
      total, completed,
      planH: fmt2(planH), factH: fmt2(factH),
      overTasks, inProgressCount: inProgressTasks.length,
      pct: compPct, factOverPlan: factH > planH,
    },
  });

  return slides;
}
