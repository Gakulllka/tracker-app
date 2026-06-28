import { Task, PRIO_START } from "./types";
import { evalExpr, R2 } from "./metrics";

/**
 * Автоматически определяет задачи для отсечения при перерасходе бюджета месяца.
 *
 * Алгоритм (жадный):
 * 1. Фильтрует живые задачи (не удалённые, не скрытые, не отклонённые, не зафиксированные)
 * 2. Сортирует по «степени отсекаемости»: низкий приоритет → не начата → крупный бюджет
 * 3. Жадно отмечает, пока не покроет дефицит
 *
 * @returns Set<string> ID задач, которые стоит отсечь
 */
export function computeFirstToCut(tasks: Task[], monthCapacity: number): Set<string> {
  const budgetH = (t: Task) => t.budgetAllocated ?? evalExpr(t.planH);

  const alive = tasks.filter(t =>
    !t._deleted && !t._hidden && t.approvalStatus !== "rejected" && !t.excludeFromCut
  );

  const totalUsed = R2(alive.reduce((s, t) => s + budgetH(t), 0));
  const overbooked = R2(Math.max(0, totalUsed - monthCapacity));

  if (overbooked <= 0) return new Set();

  const sorted = [...alive].sort((a, b) => {
    const pa = PRIO_START[a.priority] ?? 50;
    const pb = PRIO_START[b.priority] ?? 50;
    if (pa !== pb) return pb - pa;
    const aStarted = evalExpr(a.factH) > 0;
    const bStarted = evalExpr(b.factH) > 0;
    if (aStarted !== bStarted) return aStarted ? 1 : -1;
    return budgetH(a) - budgetH(b);
  });

  const result = new Set<string>();
  let covered = 0;
  for (const t of sorted) {
    if (covered >= overbooked) break;
    result.add(t.id);
    covered = R2(covered + budgetH(t));
  }
  return result;
}
