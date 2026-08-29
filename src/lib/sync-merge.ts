/**
 * Слияние данных клиента и сервера.
 *
 * Трекер работает офлайн-первым: правки применяются локально сразу, а на
 * сервер уходят с задержкой. Значит, в момент получения данных с сервера
 * почти всегда есть две версии одной строки, и нужно решить, какая победит.
 *
 * Правило — last-write-wins по клиентской метке `_ts`. Именно эта функция
 * делает загрузку с сервера безопасной: пришедший устаревший снимок не может
 * ни откатить локальную правку, ни воскресить удалённую задачу.
 */

export interface SyncRow {
  id: string;
  num?: string;
  name?: string;
  _ts?: number;
  _updatedBy?: string;
  _deleted?: boolean;
  [key: string]: unknown;
}

/** Отпечаток содержимого строки — для разрешения ничьей при равных метках. */
function contentKey(row: SyncRow): string {
  return JSON.stringify([
    row.num, row.name, row.planH, row.factH, row.priority, row.status,
    row.comment, row._deleted ?? false, row.commentLog ?? [],
  ]);
}

/**
 * Сливает строки месяца или беклога.
 *
 * - строка есть только на сервере → берём серверную, включая удалённую;
 * - строка есть только локально → сохраняем, она ещё не отправлена;
 * - есть обе → побеждает та, у которой `_ts` больше;
 * - метки равны, содержимое разное → оставляем локальную: это наша правка,
 *   которую сервер ещё не подтвердил, и терять её нельзя.
 */
export function mergeRows(
  localRows: SyncRow[] | undefined,
  incomingRows: SyncRow[] | undefined,
): SyncRow[] {
  const local = localRows || [];
  const incoming = incomingRows || [];

  if (local.length === 0) return incoming;

  const localById = new Map(local.map((row) => [row.id, row]));
  const result: SyncRow[] = [];
  const seen = new Set<string>();

  for (const remote of incoming) {
    seen.add(remote.id);
    const mine = localById.get(remote.id);

    if (!mine) {
      result.push(remote);
      continue;
    }

    const myTs = mine._ts || 0;
    const theirTs = remote._ts || 0;

    if (myTs > theirTs) {
      result.push(mine);
    } else if (myTs === theirTs && contentKey(mine) !== contentKey(remote)) {
      result.push(mine);
    } else {
      result.push(remote);
    }
  }

  // Строки, которых сервер ещё не видел.
  for (const mine of local) {
    if (!seen.has(mine.id)) result.push(mine);
  }

  return result;
}
