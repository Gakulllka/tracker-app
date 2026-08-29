import { PRIO_START, STATUS_ORDER } from "./types";
import type { Task, Status, Priority } from "./types";

export interface TaskFilters {
  /** Только задачи с сигналом руководителя или ожидающие согласования. */
  signalsOnly?: boolean;
  statuses?: ReadonlySet<Status>;
  priorities?: ReadonlySet<Priority>;
  /** Свободный поиск: номер, название, комментарий, статус, приоритет. */
  search?: string;
}

/** Направление сортировки: 1 — по возрастанию, -1 — по убыванию. */
export type SortDirection = 1 | -1;

/**
 * Отбирает задачи по фильтрам панели.
 *
 * Фильтры складываются: каждый следующий сужает результат предыдущего.
 * Пустой фильтр ничего не отсекает — это важно, потому что пустое множество
 * статусов означает «показывать все», а не «не показывать ничего».
 */
export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  let result = tasks;

  if (filters.signalsOnly) {
    result = result.filter(
      (task) =>
        task.approvalStatus === "pending" ||
        task.approvalStatus === "rejected" ||
        Boolean(task.executiveFlag),
    );
  }

  if (filters.statuses && filters.statuses.size > 0) {
    const statuses = filters.statuses;
    result = result.filter((task) => statuses.has(task.status));
  }

  if (filters.priorities && filters.priorities.size > 0) {
    const priorities = filters.priorities;
    result = result.filter((task) => priorities.has(task.priority));
  }

  const query = filters.search?.trim().toLowerCase();
  if (query) {
    result = result.filter((task) =>
      [task.name, task.num, task.comment, task.status, task.priority].some(
        (field) => String(field ?? "").toLowerCase().includes(query),
      ),
    );
  }

  return result;
}

/**
 * Сортирует задачи по выбранной колонке.
 *
 * Текстовые колонки сравниваются с учётом языка (`localeCompare`), иначе
 * кириллица уезжает в конец списка. Статус и приоритет сортируются не по
 * алфавиту, а по смысловому порядку из `STATUS_ORDER` и `PRIO_START`:
 * «Наивысший» должен идти раньше «Высокого», а не после него.
 *
 * Числовые колонки (часы, очередь, итого) считает переданная `valueOf` —
 * ей нужны накопительный факт и карта очереди, которых здесь нет.
 */
export function sortTasks(
  tasks: Task[],
  sortKey: string | null,
  direction: SortDirection,
  valueOf: (task: Task, key: string) => number,
): Task[] {
  if (!sortKey) return tasks;

  return [...tasks].sort((a, b) => {
    if (sortKey === "name") return direction * a.name.localeCompare(b.name);
    if (sortKey === "comment") return direction * a.comment.localeCompare(b.comment);
    if (sortKey === "priority") {
      return direction * (PRIO_START[a.priority] - PRIO_START[b.priority]);
    }
    if (sortKey === "status") {
      return direction * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    }
    return direction * (valueOf(a, sortKey) - valueOf(b, sortKey));
  });
}

/**
 * Разбивка задачи по месяцам для окна «Итого».
 *
 * Задача с одним номером живёт много месяцев — это одна работа, растянутая
 * во времени. Функция собирает её историю за год и считает накопительный
 * итог по каждому месяцу.
 */
export function buildMonthBreakdown(
  taskNum: string,
  allData: Record<number, Task[]>,
  evalHours: (value: string) => number,
): {
  rows: Array<{ month: number; planH: number; factH: number; cumulative: number; status: string }>;
  taskName: string;
} {
  if (!taskNum) return { rows: [], taskName: "" };

  const rows: Array<{ month: number; planH: number; factH: number; cumulative: number; status: string }> = [];
  let taskName = "";
  let cumulative = 0;

  for (let month = 0; month <= 11; month++) {
    const task = (allData[month] || []).find((row) => row.num === taskNum);
    if (!task) continue;

    if (!taskName) taskName = task.name;

    const planH = evalHours(task.planH);
    const factH = evalHours(task.factH);
    cumulative += factH;

    rows.push({ month, planH, factH, cumulative, status: task.status });
  }

  return { rows, taskName };
}
