import { MONTHS, STATUSES } from "./types";
import type { Task, Status } from "./types";
import { evalExpr, fmt2, CLOSED_STATUSES } from "./metrics";

export interface MonthContext {
  month: number;
  year: number;
  /** Бюджет часов на месяц. */
  budget: number;
  /** Накопленный итог по номеру задачи за всё время. */
  totalFactMap?: Record<string, number>;
}

/**
 * Данные месяца для ИИ.
 *
 * Раньше уходили только номер, название, статус, план и факт. Из такого
 * огрызка нельзя понять ни почему задача затянулась, ни был ли перерасход
 * по накоплению — и выводы получались общими словами о процентах.
 *
 * Теперь добавлены: накопленный итог (перерасход виден по нему, а не по
 * факту месяца), приоритет и комментарий — там лежит объяснение, что
 * на самом деле произошло.
 */
export function buildMonthData(rows: Task[], ctx: MonthContext): string {
  const lines: string[] = [];

  let plan = 0;
  let fact = 0;
  let closed = 0;

  for (const task of rows) {
    const taskPlan = evalExpr(task.planH);
    const taskFact = evalExpr(task.factH);
    const total = task.num ? (ctx.totalFactMap?.[task.num] ?? taskFact) : taskFact;
    const isClosed = CLOSED_STATUSES.has(task.status as Status);

    plan += taskPlan;
    fact += taskFact;
    if (isClosed) closed++;

    const parts = [
      task.num ? `#${task.num}` : "без номера",
      `«${task.name || "без названия"}»`,
      `статус: ${task.status}`,
      `приоритет: ${task.priority}`,
      `план: ${fmt2(taskPlan)} ч`,
      `факт за месяц: ${fmt2(taskFact)} ч`,
    ];

    if (total > taskFact) parts.push(`всего по задаче за все месяцы: ${fmt2(total)} ч`);
    if (taskPlan > 0 && total > taskPlan) {
      parts.push(`ПЕРЕРАСХОД: ${fmt2(total - taskPlan)} ч сверх плана`);
    }

    const note = (task.comment || "").trim();
    if (note) parts.push(`комментарий: ${note.replace(/\s+/g, " ").slice(0, 300)}`);

    lines.push(parts.join(", "));
  }

  const header = [
    `Месяц: ${MONTHS[ctx.month]} ${ctx.year}`,
    `Бюджет часов на месяц: ${fmt2(ctx.budget)}`,
    `Отработано за месяц: ${fmt2(fact)}`,
    `Сумма планов задач: ${fmt2(plan)}`,
    `Задач всего: ${rows.length}, из них закрыто: ${closed}`,
  ].join("\n");

  return `${header}\n\nЗадачи:\n${lines.join("\n")}`;
}

/**
 * Промпт для выводов по месяцу.
 *
 * Прежний начинался с «Ты аналитик проекта» и требовал «лаконично, до
 * 10 слов» — отсюда телеграфный деловой стиль: «Высокая эффективность
 * выполнения», «Рост невыполненных задач». Читать это невозможно,
 * и никакой информации там нет.
 *
 * Здесь три установки. Писать как человек, а не как отчёт. Опираться
 * на конкретные задачи, а не на проценты. И обязательно находить, что
 * получилось хорошо, — даже в плохой месяц: если этого не требовать,
 * модель скатывается в перечисление проблем, а команде нужно видеть
 * и сделанное.
 */
export function buildInsightPrompt(rows: Task[], ctx: MonthContext): string {
  return `Ты помогаешь команде подвести итоги рабочего месяца. Ниже данные по задачам.

Как писать:
— Простым живым языком, как рассказал бы коллега коллеге.
— Полными фразами по 1–2 предложения, а не обрубками.
— Опирайся на конкретные задачи: называй номер или название, если это уместно.
— Никакого делового канцелярита. Не пиши «эффективность», «оптимизация»,
  «динамика показателей», «требует вмешательства», «в рамках KPI».
— Не хвали и не ругай людей, описывай работу.
— Не придумывай того, чего нет в данных.

Что нужно вернуть:
1. achievements — что получилось. Здесь ОБЯЗАТЕЛЬНО должен быть хотя бы один
   пункт, даже если месяц вышел тяжёлым. Всегда есть что-то доведённое до
   конца, закрытое в срок или сдвинувшееся с места — найди это и назови.
2. risks — что пошло не так или требует внимания. Если всё спокойно, верни
   пустой массив, не выдумывай проблему.
3. inProgress — что осталось в работе и перейдёт дальше.
4. summary — короткий вывод по месяцу в 1–2 предложения. Самое главное:
   каким месяц получился и почему.

Ответь строго одним JSON-объектом, без пояснений и без разметки:
{"achievements":["..."],"risks":["..."],"inProgress":["..."],"summary":["..."]}

В каждом массиве не больше трёх пунктов.

Данные:
${buildMonthData(rows, ctx)}`;
}

/** Статусы, по которым видно, что задача не двигалась. */
export const STALLED_STATUSES: ReadonlySet<Status> = new Set<Status>([
  STATUSES.NEW,
  STATUSES.IDEA,
  STATUSES.POSTPONED,
]);
