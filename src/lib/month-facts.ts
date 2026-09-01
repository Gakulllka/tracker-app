import { evalExpr, fmt2, R2, CLOSED_STATUSES } from "./metrics";
import { PRIORITIES } from "./types";
import type { Task, Status } from "./types";

export interface MonthFactsInput {
  /** Задачи месяца, включая закрытые. */
  rows: Task[];
  /** Бюджет часов месяца. */
  budget: number;
  /** Накопленный итог по номеру задачи за все месяцы. */
  totalFactMap?: Record<string, number>;
  /** Сколько месяцев задача с этим номером уже шла до текущего. */
  monthsByNum?: Record<string, number>;
  /** Незакрытых задач в прошлом месяце — чтобы увидеть сокращение долга. */
  prevUncompleted?: number;
  /** Закрытых задач в прошлом месяце. */
  prevCompleted?: number;
}

/**
 * Положительные факты о месяце.
 *
 * Это не похвала. Презентация не должна оценивать работу аналитика —
 * оценку даёт руководитель, а отчёт приносит основания. Поэтому каждый
 * пункт обязан называть конкретную задачу или число: как только формула
 * становится общей («хорошая динамика», «эффективная работа»), она
 * превращается в ритуал, который через два месяца перестают читать.
 *
 * Факты ищутся по убыванию силы: закрытая долгая задача весомее, чем
 * «закрыли на одну больше, чем в прошлом месяце». Возвращается не больше
 * трёх — и хотя бы один почти всегда: даже в провальный месяц есть
 * движение по часам, и это правда, а не утешение.
 */
export function collectPositiveFacts(input: MonthFactsInput): string[] {
  const { rows, budget, totalFactMap, monthsByNum, prevUncompleted, prevCompleted } = input;

  const live = rows.filter((t) => !t._deleted && (t.name || t.num));
  const closed = live.filter((t) => CLOSED_STATUSES.has(t.status as Status));
  const facts: string[] = [];

  const totalOf = (t: Task) =>
    t.num ? (totalFactMap?.[t.num] ?? evalExpr(t.factH)) : evalExpr(t.factH);

  /* 1. Закрыта задача, тянувшаяся несколько месяцев. Самый сильный факт:
        доведено до конца то, что долго не закрывалось. */
  const longRunning = closed
    .filter((t) => t.num && (monthsByNum?.[t.num] ?? 1) > 1)
    .sort((a, b) => (monthsByNum?.[b.num] ?? 0) - (monthsByNum?.[a.num] ?? 0))[0];

  if (longRunning) {
    const months = monthsByNum?.[longRunning.num] ?? 2;
    facts.push(`Закрыта «${longRunning.name}» — задача шла ${months} ${months < 5 ? "месяца" : "месяцев"}.`);
  }

  /* 2. Задача доведена до конца, хотя вышла за план: не бросили. */
  const finishedOverPlan = closed.find((t) => {
    const plan = evalExpr(t.planH);
    return plan > 0 && totalOf(t) > plan;
  });

  if (finishedOverPlan && facts.length < 3) {
    const plan = evalExpr(finishedOverPlan.planH);
    facts.push(
      `«${finishedOverPlan.name}» доведена до конца, хотя вышла за план на ${fmt2(totalOf(finishedOverPlan) - plan)} ч.`,
    );
  }

  /* 3. Закрыты задачи наивысшего приоритета — сделано главное. */
  const topClosed = closed.filter((t) => t.priority === PRIORITIES.HIGHEST).length;
  if (topClosed > 0 && facts.length < 3) {
    facts.push(`Закрыто ${topClosed} задач наивысшего приоритета.`);
  }

  /* 4. Уложились в бюджет — но только если работа вообще шла.
        «Уложились: 0 ч из 240 ч» — не плюс, а насмешка. */
  const factH = R2(live.reduce((sum, t) => sum + evalExpr(t.factH), 0));
  if (budget > 0 && factH > 0 && factH <= budget && facts.length < 3) {
    facts.push(`Уложились в бюджет месяца: ${fmt2(factH)} ч из ${fmt2(budget)} ч.`);
  }

  /* 5. Долг незакрытых сократился. */
  const uncompleted = live.length - closed.length;
  if (
    typeof prevUncompleted === "number" &&
    prevUncompleted > uncompleted &&
    facts.length < 3
  ) {
    facts.push(`Незакрытых стало меньше: ${uncompleted} против ${prevUncompleted} в прошлом месяце.`);
  }

  /* 6. Закрыто больше, чем месяцем ранее. */
  if (
    typeof prevCompleted === "number" &&
    closed.length > prevCompleted &&
    facts.length < 3
  ) {
    facts.push(`Закрыто ${closed.length} задач против ${prevCompleted} в прошлом месяце.`);
  }

  /* 7. Запасной факт: работа шла. Сухо, но правда — и лучше, чем
        выдуманная бодрость в плохой месяц.

        Если же не отработано ни часа и не закрыто ни одной задачи,
        возвращается пустой список. Положительного факта в таком месяце
        не существует, и подставлять на его место общую фразу — значит
        сделать ровно тот ритуал, ради избавления от которого всё это
        и написано. Пустой раздел на слайде честнее пустых слов. */
  if (facts.length === 0) {
    const moved = live.filter((t) => evalExpr(t.factH) > 0).length;
    if (moved > 0) {
      facts.push(`Продвинулись по ${moved} задачам, отработано ${fmt2(factH)} ч.`);
    }
  }

  return facts.slice(0, 3);
}
