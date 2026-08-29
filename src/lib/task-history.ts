import { MONTHS } from "./types";

export interface MonthRow {
  month: number;
  planH: number;
  factH: number;
  cumulative: number;
}

/** Родительный падеж месяца: «прошла целиком в августе». */
const MONTH_IN = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];

/** «в июне», «в июле и августе», «в июне, июле и августе». */
function listMonths(rows: MonthRow[]): string {
  const names = rows.map((r) => MONTH_IN[r.month] ?? MONTHS[r.month]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
}

function hours(value: number): string {
  return `${Math.round(value * 100) / 100} ч`;
}

/**
 * Описание истории задачи словами.
 *
 * Те же числа, что в полосах выше, но собранные во фразу: сколько месяцев
 * шла работа, укладывались ли в план, откуда взялся перерасход. Таблицу
 * приходится читать, фразу — нет.
 *
 * Функция чистая, без обращения к состоянию, поэтому проверяется тестами.
 */
export function describeTaskHistory(rows: MonthRow[]): string {
  if (rows.length === 0) return "По этой задаче ещё нет отработанных часов.";

  const last = rows[rows.length - 1];
  const plan = last.planH;
  const total = last.cumulative;
  const over = plan > 0 && total > plan;
  const overBy = Math.round((total - plan) * 100) / 100;

  if (rows.length === 1) {
    const single = `Задача прошла целиком в ${MONTH_IN[last.month] ?? MONTHS[last.month]}: план ${hours(plan)}, отработано ${hours(last.factH)}.`;
    if (plan <= 0) return single;
    return over
      ? `${single} Перерасход ${hours(overBy)} сверх плана.`
      : `${single} Уложились в план.`;
  }

  const started = `Работа идёт ${rows.length}-й месяц — ${listMonths(rows)}.`;
  const carried = `В ${MONTH_IN[last.month] ?? MONTHS[last.month]} накопленный итог ${hours(total)} при плане ${hours(plan)}.`;

  if (plan <= 0) return `${started} Накоплено ${hours(total)}.`;

  return over
    ? `${started} ${carried} Перерасход ${hours(overBy)}.`
    : `${started} ${carried} Пока в пределах плана.`;
}

/**
 * Итог месяца одной фразой — для слайда показателей.
 *
 * Числа выше отвечают «сколько», фраза отвечает «и что это значит».
 * Строится из тех же величин, поэтому разойтись с полосами не может.
 */
export function describeMonth(
  factH: number,
  budget: number,
  completed: number,
  total: number,
  diffWithPrev: number,
): string {
  const parts: string[] = [];

  if (budget > 0) {
    const over = factH > budget;
    parts.push(
      over
        ? `Отработали ${hours(factH)} при бюджете ${hours(budget)} — перерасход ${hours(Math.round((factH - budget) * 100) / 100)}.`
        : `Отработали ${hours(factH)} из ${hours(budget)} бюджета.`,
    );
  } else {
    parts.push(`Отработали ${hours(factH)}.`);
  }

  if (diffWithPrev > 0) parts.push(`На ${hours(diffWithPrev)} больше прошлого месяца.`);
  else if (diffWithPrev < 0) parts.push(`На ${hours(-diffWithPrev)} меньше прошлого месяца.`);

  if (total > 0) {
    parts.push(
      completed === total
        ? `Закрыты все ${total} задач.`
        : `Завершено ${completed} задач из ${total}.`,
    );
  }

  return parts.join(" ");
}
