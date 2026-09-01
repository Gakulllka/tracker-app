/**
 * Слайды отчёта за месяц.
 *
 * Презентацию делает бизнес-аналитик как отчёт своей работы для
 * руководителя отдела и показывает вживую, рассказывая. Из этого следует
 * почти всё устройство.
 *
 * Пять слайдов, каждый отвечает на свой вопрос. Прежние шесть отвечали
 * на меньшее: слайд «Полный список задач» дублировал «Завершённые» и
 * «В работе», а слайд показателей дублировал титул. При этом не было
 * ответа на главный вопрос встречи — что делаем дальше и какой бюджет
 * берём, — хотя именно ради него руководитель и собирается.
 *
 * Слайды разреженные: когда рассказываешь сам, плотный текст на экране
 * конкурирует с говорящим, и человек начинает читать вместо того, чтобы
 * слушать.
 */

import { STATUSES, MONTHS } from "./types";
import type { Task, Status } from "./types";
import { evalExpr, R2, CLOSED_STATUSES } from "./metrics";
import { buildNextMonthPlan, FULL_MONTH_HOURS } from "./next-month";
import { collectPositiveFacts } from "./month-facts";
import type { SlideData } from "./presentation-renderer";

export interface SlidesInput {
  month: number;
  year: number;
  /** Задачи по месяцам текущего года. */
  allData: Record<number, Task[]>;
  /** Полная база по ключам "YYYY-MM" — для истории и накоплений. */
  dataByYearMonth: Record<string, Task[]>;
  /** Накопленный итог по номеру задачи. */
  totalFactMap: Record<string, number>;
  backlog: Task[];
  /** Бюджет часов текущего месяца. */
  budget: number;
  /** Бюджеты по месяцам, ключ "YYYY-MM". */
  monthlyPlans: Record<string, number>;
  domainName: string;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Сколько месяцев задача с этим номером встречается в базе. */
function countMonthsByNum(dataByYearMonth: Record<string, Task[]>): Record<string, number> {
  const seen: Record<string, Set<string>> = {};

  for (const [key, rows] of Object.entries(dataByYearMonth)) {
    for (const task of rows) {
      if (!task.num || task._deleted) continue;
      (seen[task.num] ??= new Set()).add(key);
    }
  }

  const counts: Record<string, number> = {};
  for (const [num, keys] of Object.entries(seen)) counts[num] = keys.size;
  return counts;
}

export function generateSlides(input: SlidesInput): SlideData[] {
  const {
    month, year, allData, dataByYearMonth, totalFactMap,
    backlog, budget, monthlyPlans, domainName,
  } = input;

  const rows = (allData[month] || []).filter((r) => !r._deleted && (r.name || r.num));
  if (rows.length === 0) return [];

  const closedTasks = rows.filter((r) => CLOSED_STATUSES.has(r.status as Status));
  const openTasks = rows.filter(
    (r) => !CLOSED_STATUSES.has(r.status as Status) && r.status !== STATUSES.CANCEL,
  );

  const factH = R2(rows.reduce((sum, r) => sum + evalExpr(r.factH), 0));
  const planH = R2(rows.reduce((sum, r) => sum + evalExpr(r.planH), 0));

  /* ── История за три месяца: по ней видно, был ли перерасход как
        явление, а не как одна цифра текущего месяца. ── */
  const history: { month: number; factH: number; budget: number; over: boolean }[] = [];
  for (let back = 2; back >= 0; back--) {
    const m = month - back;
    const y = m < 0 ? year - 1 : year;
    const mm = ((m % 12) + 12) % 12;
    const key = monthKey(y, mm);

    const monthRows = (dataByYearMonth[key] || []).filter(
      (r) => !r._deleted && (r.name || r.num),
    );
    if (monthRows.length === 0 && back > 0) continue;

    const mFact = R2(monthRows.reduce((sum, r) => sum + evalExpr(r.factH), 0));
    const mBudget = monthlyPlans[key] ?? budget;

    history.push({
      month: mm,
      factH: mFact,
      budget: mBudget,
      /* Нулевой бюджет означает «не должны были брать задачи в работу».
         Любой отработанный час при нём — законный перерасход, который
         вычитается из бюджета следующего месяца. */
      over: mFact > mBudget,
    });
  }

  /* ── Прошлый месяц: для сравнения в фактах ── */
  const prevM = month === 0 ? 11 : month - 1;
  const prevY = month === 0 ? year - 1 : year;
  const prevRows = (dataByYearMonth[monthKey(prevY, prevM)] || []).filter(
    (r) => !r._deleted && (r.name || r.num),
  );
  const prevClosed = prevRows.filter((r) => CLOSED_STATUSES.has(r.status as Status)).length;

  const next = buildNextMonthPlan(rows, backlog, budget, totalFactMap);

  const facts = collectPositiveFacts({
    rows,
    budget,
    totalFactMap,
    monthsByNum: countMonthsByNum(dataByYearMonth),
    prevUncompleted: prevRows.length - prevClosed,
    prevCompleted: prevClosed,
  });

  const withTotals = (list: Task[]) =>
    list.map((t) => ({
      num: t.num || "",
      name: t.name || "Без названия",
      plan: evalExpr(t.planH),
      done: t.num ? (totalFactMap[t.num] ?? evalExpr(t.factH)) : evalExpr(t.factH),
      status: t.status,
    }));

  return [
    {
      id: "title",
      type: "title",
      content: { month: MONTHS[month], year, domain: domainName },
    },
    {
      id: "month",
      type: "month",
      content: {
        total: rows.length,
        closed: closedTasks.length,
        open: openTasks.length,
        factH,
        planH,
        budget,
        history,
        /* Перерасход при нулевом бюджете переносится в следующий месяц. */
        carriedOverrun: budget > 0 ? 0 : factH,
      },
    },
    {
      id: "work",
      type: "work",
      content: {
        closed: withTotals(closedTasks),
        open: withTotals(openTasks),
      },
    },
    {
      id: "next",
      type: "next",
      content: {
        committed: next.committed,
        budget: next.budget,
        free: next.free,
        fullMonth: FULL_MONTH_HOURS,
        carry: next.carry,
        backlogTotal: next.backlogTotal,
        backlogCount: next.backlogTasks.length,
        large: next.large,
        scenarios: next.scenarios,
      },
    },
    {
      id: "verdict",
      type: "verdict",
      content: { facts },
    },
  ];
}
