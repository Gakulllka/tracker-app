import { STATUSES } from "./types";
import type { Task, Status } from "./types";

/**
 * Статусы, при которых задача НЕ переносится в следующий месяц.
 *
 * ВНИМАНИЕ: этот набор намеренно отличается от `CLOSED_STATUSES` в metrics.ts.
 * Здесь — «Завершенная», «Выполненная» и «Отменено»; там — «Завершенная»,
 * «Выполненная» и «Контроль на прод». Расхождение перенесено из исходного
 * кода как есть и НЕ является осознанным решением — см. README и карточку
 * продукта, раздел «Известные расхождения».
 */
export const NOT_TRANSFERRED_STATUSES: ReadonlySet<Status> = new Set<Status>([
  STATUSES.DONE,
  STATUSES.COMPLETED,
  STATUSES.CANCEL,
]);

export interface TransferResult {
  /** Копии задач для целевого месяца. */
  transferred: Task[];
  /** Сколько задач осталось в исходном месяце как закрытые. */
  skippedClosed: number;
}

/**
 * Готовит копии незавершённых задач для переноса в другой месяц.
 *
 * Перенос — это копирование: оригинал остаётся на месте, в целевом месяце
 * появляется новая задача с тем же номером. Номер повторяется намеренно —
 * это одна работа, растянутая во времени, и «Итого» суммирует факт по всем
 * месяцам именно по `num`.
 *
 * Функция чистая: id генерируются переданной фабрикой, время — параметром.
 * Это позволяет проверить результат в тестах.
 */
export function prepareTransfer(
  sourceRows: Task[],
  options: {
    now?: number;
    newId?: () => string;
  } = {},
): TransferResult {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => crypto.randomUUID());

  const open = sourceRows.filter(
    (row) => !NOT_TRANSFERRED_STATUSES.has(row.status as Status),
  );

  const transferred = open.map((row) => ({
    ...row,
    id: newId(),
    // Факт обнуляется: в новом месяце работа начинается с нуля часов.
    factH: "0",
    // История комментариев остаётся у оригинала.
    commentLog: [],
    _ts: now,
  }));

  return {
    transferred,
    skippedClosed: sourceRows.length - open.length,
  };
}
