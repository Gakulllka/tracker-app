import { evalExpr, R2 } from "./metrics";
import type { Task } from "./types";

export interface BacklogRow {
  task: Task;
  /** Позиция в очереди, с нуля. */
  idx: number;
  plan: number;
  /** Часы, отработанные до попадания в беклог. */
  fact: number;
  /** Во что обойдётся взять задачу в месяц: план минус уже отработанное. */
  left: number;
  /** Накопленный остаток по очереди сверху вниз. */
  running: number;
  /** Умещается ли в свободный остаток бюджета месяца. */
  fitsInMonth: boolean;
}

export interface BacklogQueue {
  rows: BacklogRow[];
  /**
   * После какой позиции рисовать черту «дальше бюджет исчерпан».
   * null — влезает вся очередь либо не влезает даже первая задача.
   */
  thresholdAfter: number | null;
  /** Сумма остатков по всей очереди. */
  totalLeft: number;
}

/**
 * Раскладывает беклог в очередь с накопительным остатком.
 *
 * Порог считается по ОСТАТКУ работы, а не по полному плану. Задача могла
 * прийти из месяца, где на неё уже потратили часы: при уходе в беклог факт
 * сохраняется, при возврате переносится обратно. Значит, взять такую задачу
 * стоит только того, что осталось доделать.
 *
 * Свободный остаток месяца считается как бюджет минус отработанное —
 * не минус запланированное: планы задач копятся за всё время их жизни
 * и легко перекрывают бюджет в разы.
 */
export function buildBacklogQueue(backlog: Task[], freeHours: number): BacklogQueue {
  let running = 0;

  const rows: BacklogRow[] = backlog.map((task, idx) => {
    const plan = evalExpr(task.planH);
    const fact = evalExpr(task.factH);
    const left = Math.max(0, R2(plan - fact));

    running = R2(running + left);

    return { task, idx, plan, fact, left, running, fitsInMonth: running <= freeHours };
  });

  // Черта ставится после ПОСЛЕДНЕЙ уместившейся задачи.
  // Если не влезла даже первая — черты нет: рисовать её над всем списком
  // бессмысленно. Если влезло всё — тоже нет, отсекать нечего.
  const lastFitting = rows.reduce((acc, row, i) => (row.fitsInMonth ? i : acc), -1);
  const thresholdAfter =
    lastFitting >= 0 && lastFitting < rows.length - 1 ? lastFitting : null;

  return { rows, thresholdAfter, totalLeft: running };
}
