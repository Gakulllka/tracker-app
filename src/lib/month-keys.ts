import type { Task, AllData } from "./types";

/**
 * Хранение задач по годам.
 *
 * Задачи лежат в двух представлениях одновременно:
 *   dataByYearMonth — полная база под ключами "YYYY-MM", именно она уходит в БД;
 *   allData         — срез выбранного года (месяц 0…11), с ним работает весь UI.
 *
 * Такое раздвоение позволило добавить многолетнее хранение, не переписывая
 * сотню мест в интерфейсе: компоненты по-прежнему читают allData[месяц].
 * Здесь собраны чистые функции перевода между этими двумя формами.
 */

/** Год + месяц как строка "YYYY-MM". */
export type MonthKey = string;

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Парсит "2025-10" → { year: 2025, month: 9 }. Возвращает null если невалидно. */
export function parseMonthKey(key: MonthKey): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (Number.isNaN(year) || Number.isNaN(month) || month < 0 || month > 11) return null;
  return { year, month };
}

/** Из полного dataByYearMonth собирает срез для одного года. */
export function buildAllDataForYear(
  dataByYearMonth: Record<MonthKey, Task[]>,
  year: number,
): AllData {
  const out: AllData = {};
  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m);
    out[m] = dataByYearMonth[key] || [];
  }
  // Если ровно ничего не было за этот год — оставляем пустым
  return out;
}

/** Список годов, в которых есть хоть одна задача. Текущий год всегда включён. */
export function listYearsWithData(dataByYearMonth: Record<MonthKey, Task[]>): number[] {
  const years = new Set<number>();
  years.add(new Date().getFullYear());
  for (const [k, tasks] of Object.entries(dataByYearMonth)) {
    if (!tasks || tasks.length === 0) continue;
    const parsed = parseMonthKey(k);
    if (parsed) years.add(parsed.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

/** Per-domain isolated data */
