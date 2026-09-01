import { evalExpr, R2, CLOSED_STATUSES } from "./metrics";
import type { Task, Status } from "./types";

/** Задача крупнее половины полного месяца обсуждается отдельно. */
export const LARGE_TASK_HOURS = 120;

/** Полный рабочий месяц одного человека. */
export const FULL_MONTH_HOURS = 240;

export interface CarryTask {
  num: string;
  name: string;
  /** Сколько ещё предстоит: план минус накопленный итог. */
  left: number;
  plan: number;
  done: number;
  /** Больше LARGE_TASK_HOURS — обсуждается отдельно от остального. */
  large: boolean;
}

export interface Scenario {
  label: string;
  /** Из чего складывается вариант — по строке на пункт. */
  lines: string[];
  hours: number;
}

export interface NextMonthPlan {
  /** Незакрытые задачи месяца с остатком работы. */
  carry: CarryTask[];
  /** Сумма остатков — обязательства, которые перейдут дальше. */
  committed: number;
  /** Бюджет, из которого считаем. */
  budget: number;
  /**
   * Бюджет минус обязательства. Отрицательное значит, что переходящие
   * задачи в бюджет не влезают, и это ответ, а не ошибка расчёта.
   */
  free: number;
  /** Задачи беклога с остатком работы. */
  backlogTasks: CarryTask[];
  /** Сумма остатков по беклогу. */
  backlogTotal: number;
  /** Крупные задачи — и переходящие, и из беклога. */
  large: CarryTask[];
  /**
   * Варианты, как потратить свободные часы. Пусто, если свободных нет
   * или если выбирать не из чего.
   */
  scenarios: Scenario[];
}

function toCarry(task: Task, totalFactMap?: Record<string, number>): CarryTask {
  const plan = evalExpr(task.planH);
  const fact = evalExpr(task.factH);
  const done = task.num ? (totalFactMap?.[task.num] ?? fact) : fact;
  const left = Math.max(0, R2(plan - done));

  return {
    num: task.num || "",
    name: task.name || "Без названия",
    left,
    plan,
    done,
    large: left > LARGE_TASK_HOURS,
  };
}

/**
 * Что предстоит в следующем месяце.
 *
 * Порядок счёта важен и обратен интуитивному. Сначала обязательства по
 * незакрытым задачам месяца — они уже начаты, и часы по ним обещаны.
 * Только то, что осталось от бюджета после них, можно предложить под
 * беклог. Если считать наоборот, слайд покажет, что беклог влезает,
 * хотя часы уже заняты, — и это будет ложью руководителю.
 *
 * Остаток работы по задаче считается как план минус НАКОПЛЕННЫЙ итог,
 * а не минус факт месяца: задача могла идти несколько месяцев.
 */
export function buildNextMonthPlan(
  monthRows: Task[],
  backlog: Task[],
  budget: number,
  totalFactMap?: Record<string, number>,
): NextMonthPlan {
  const carry = monthRows
    .filter((t) => !t._deleted && (t.name || t.num))
    .filter((t) => !CLOSED_STATUSES.has(t.status as Status))
    .map((t) => toCarry(t, totalFactMap))
    .filter((c) => c.left > 0)
    .sort((a, b) => b.left - a.left);

  const committed = R2(carry.reduce((sum, c) => sum + c.left, 0));
  const free = R2(budget - committed);

  const backlogTasks = backlog
    .filter((t) => !t._deleted)
    .map((t) => toCarry(t, totalFactMap))
    .sort((a, b) => b.left - a.left);

  const backlogTotal = R2(backlogTasks.reduce((sum, c) => sum + c.left, 0));

  const large = [...carry, ...backlogTasks].filter((c) => c.large);

  return {
    carry,
    committed,
    budget,
    free,
    backlogTasks,
    backlogTotal,
    large,
    scenarios: buildScenarios(free, backlogTasks),
  };
}

/**
 * Варианты, как потратить свободные часы.
 *
 * Сценарии осмысленны только когда крупная задача одна: тогда выбор
 * простой — мелочь или крупное. При двух и более крупных перебор
 * комбинаций превращается в таблицу перестановок, которую на встрече
 * не обсудить, поэтому вариантов не предлагаем вовсе — пусть решают
 * по суммам.
 */
export function buildScenarios(free: number, backlogTasks: CarryTask[]): Scenario[] {
  if (free <= 0) return [];

  const small = backlogTasks.filter((t) => !t.large && t.left > 0);
  const largeOnes = backlogTasks.filter((t) => t.large);
  const smallTotal = R2(small.reduce((sum, t) => sum + t.left, 0));

  // Не из чего выбирать: беклог пуст.
  if (small.length === 0 && largeOnes.length === 0) return [];

  // Крупных нет — выбора нет, есть просто беклог.
  if (largeOnes.length === 0) {
    if (smallTotal <= free) return [];
    return [{
      label: "Часть беклога",
      lines: [`Беклога на ${smallTotal} ч, свободно ${free} ч — влезает не всё`],
      hours: free,
    }];
  }

  // Две и более крупных: перебор вариантов на встрече не обсудить.
  if (largeOnes.length > 1) return [];

  const big = largeOnes[0];
  const scenarios: Scenario[] = [];

  if (smallTotal > 0 && smallTotal <= free) {
    const rest = R2(free - smallTotal);
    const lines = [`Беклог целиком — ${small.length} задач, ${smallTotal} ч`];
    if (rest > 0) lines.push(`Остаток ${rest} ч на «${big.name}»`);
    scenarios.push({ label: "Беклог и задел по крупной", lines, hours: free });
  }

  scenarios.push({
    label: `Только «${big.name}»`,
    lines: [
      `Все ${free} ч на крупную задачу`,
      big.left > free
        ? `Останется ${R2(big.left - free)} ч до конца`
        : "Задача закрывается полностью",
    ],
    hours: free,
  });

  return scenarios;
}
