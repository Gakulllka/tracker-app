/**
 * Схлопывание журнала активности в уведомления.
 *
 * Журнал пишется при каждой синхронизации, а она идёт сама по себе.
 * Поправил факт трижды за минуту — три записи «изменил задачу: факт 3 → 4»,
 * «4 → 5», «5 → 7». Это промежуточные состояния, а не события, и владельцу
 * домена они бесполезны.
 *
 * Здесь правки одной задачи одним автором за окно времени сливаются в одно
 * уведомление: показывается переход от ПЕРВОГО значения к ПОСЛЕДНЕМУ и
 * сколько было правок.
 */

/** Поля, о которых владельцу домена стоит знать. */
export const NOTIFIED_FIELDS: Record<string, string> = {
  num: "номер",
  name: "название",
  status: "статус",
  priority: "приоритет",
  planH: "план, ч",
};

/**
 * Поля, которые в уведомления НЕ идут.
 *
 * `comment` — текст набирают посимвольно, и синхронизация ловит его
 * промежуточные состояния: одна заметка даёт десяток уведомлений.
 * `factH` — часы правят по ходу работы, это рутина, а не событие.
 * Остальное относится к скрытому механизму монитора руководителя.
 */
export const IGNORED_FIELDS = [
  "comment", "factH", "executiveFlag", "approvalStatus",
  "excludeFromCut", "budgetAllocated",
] as const;

/** Правки одной задачи слипаются, если разошлись меньше чем на час. */
export const MERGE_WINDOW_MS = 60 * 60 * 1000;

/** Лента показывает две недели: старше — уже история, ей место в админке. */
export const FEED_WINDOW_DAYS = 14;

/** Записи журнала старше этого срока удаляются. */
export const LOG_RETENTION_DAYS = 90;

export interface FieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface RawEvent {
  id: string;
  action: string;
  author: string;
  taskId: string;
  createdAt: string;
  changes: FieldChange[];
  [key: string]: unknown;
}

export interface MergedEvent extends RawEvent {
  /** Сколько правок слилось в это уведомление. */
  editCount: number;
}

/**
 * Сливает подряд идущие правки одной задачи одним автором.
 *
 * События приходят от новых к старым. Для каждой группы берётся самое
 * свежее событие (его id и время попадают в результат), а значения `from`
 * подтягиваются из самого старого — чтобы показать переход целиком,
 * а не последний микрошаг.
 *
 * Создание и удаление не сливаются: это разные события, и схлопывать
 * «создал» с «изменил» нельзя.
 */
export function mergeEvents(events: RawEvent[]): MergedEvent[] {
  const out: MergedEvent[] = [];

  for (const event of events) {
    const isUpdate = event.action.endsWith("_update");

    const target = isUpdate
      ? out.find(
          (m) =>
            m.action === event.action &&
            m.taskId === event.taskId &&
            m.author === event.author &&
            new Date(m.createdAt).getTime() - new Date(event.createdAt).getTime()
              < MERGE_WINDOW_MS,
        )
      : undefined;

    if (!target) {
      out.push({ ...event, editCount: 1 });
      continue;
    }

    target.editCount += 1;

    // Событие старше: его «было» и есть настоящее начальное значение.
    for (const change of event.changes) {
      const existing = target.changes.find((c) => c.field === change.field);
      if (existing) existing.from = change.from;
      else target.changes.push(change);
    }
  }

  // Правка, вернувшая значение обратно, событием не является.
  return out
    .map((m) => ({ ...m, changes: m.changes.filter((c) => c.from !== c.to) }))
    .filter((m) => !m.action.endsWith("_update") || m.changes.length > 0);
}

/** Граница ленты: события старше двух недель не показываются. */
export function feedSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - FEED_WINDOW_DAYS * 86_400_000);
}

/** Граница хранения журнала. */
export function retentionBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - LOG_RETENTION_DAYS * 86_400_000);
}
