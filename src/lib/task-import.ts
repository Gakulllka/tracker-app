import type { Task, Priority, Status } from "@/lib/types";

/** Строка задачи, пришедшая из импортируемого файла. */
export interface ImportedTask {
  num: string;
  name: string;
  planH: string;
  factH: string;
  priority: Priority;
  status: Status;
  comment: string;
}

export interface ImportPayload {
  /** Задачи, которые пользователь подтвердил к обновлению. */
  updatedTasks: Task[];
  /** Задачи, которых в месяце ещё нет. */
  newTasks: ImportedTask[];
}

export interface MergeResult {
  /** Итоговый список задач месяца. */
  rows: Task[];
  /** Сколько задач добавлено с нуля. */
  added: number;
  /** Сколько удалённых задач вернулось из корзины. */
  revived: number;
  /** Сколько существующих задач обновлено. */
  updated: number;
}

/**
 * Сливает импортируемые задачи со строками месяца.
 *
 * Ключевая тонкость — «оживление» удалённых задач. Удаление в трекере мягкое:
 * задача остаётся в месяце с флагом `_deleted`. Если из файла приходит задача
 * с таким же номером, её нужно не создавать заново, а вернуть существующую
 * запись. Иначе в месяце окажутся две строки с одним `num`, и серверная
 * синхронизация начнёт схлопывать их случайным образом.
 *
 * Функция чистая: не трогает состояние и не обращается к сети — её можно
 * вызвать в тестах и проверить результат.
 */
export function mergeImportedTasks(
  monthRows: Task[],
  payload: ImportPayload,
  now: number = Date.now(),
): MergeResult {
  const { updatedTasks, newTasks } = payload;
  const updatedIds = new Set(updatedTasks.map((t) => t.id));

  // Удалённые задачи месяца, разложенные по номеру.
  const tombstonesByNum = new Map<string, Task>();
  for (const row of monthRows) {
    if (row._deleted && row.num) tombstonesByNum.set(row.num.trim(), row);
  }

  // Разделяем импортируемые задачи на «вернуть из корзины» и «создать заново».
  const reviveIds = new Set<string>();
  const createdRows: Task[] = [];

  for (const imported of newTasks) {
    const num = (imported.num || "").trim();
    const tombstone = num ? tombstonesByNum.get(num) : undefined;

    if (tombstone) {
      // id и история комментариев сохраняются, содержимое перезаписывается.
      reviveIds.add(tombstone.id);
      continue;
    }

    createdRows.push({
      id: crypto.randomUUID(),
      num: imported.num || "",
      name: imported.name || "",
      planH: imported.planH || "",
      factH: imported.factH || "",
      priority: imported.priority,
      status: imported.status,
      comment: imported.comment || "",
      commentLog: [],
      _ts: now,
    });
  }

  // Один проход по месяцу: обновляем, оживляем, остальное оставляем как есть.
  const mergedRows = monthRows.map((row) => {
    if (updatedIds.has(row.id)) {
      const updated = updatedTasks.find((t) => t.id === row.id);
      return updated ? { ...row, ...updated, _ts: now } : row;
    }

    if (reviveIds.has(row.id)) {
      const num = (row.num || "").trim();
      const imported = newTasks.find((n) => (n.num || "").trim() === num);
      if (imported) {
        return { ...row, ...imported, _deleted: false, _ts: now };
      }
    }

    return row;
  });

  return {
    rows: [...mergedRows, ...createdRows],
    added: createdRows.length,
    revived: reviveIds.size,
    updated: updatedTasks.length,
  };
}
