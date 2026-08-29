/**
 * Тесты синхронизации и переноса задач.
 *
 * mergeRows решает, чья версия строки победит при расхождении клиента и
 * сервера. Ошибка здесь не видна сразу: правка просто исчезает после
 * очередной загрузки, а удалённая задача может воскреснуть. Именно поэтому
 * случай «метки равны, содержимое разное» проверяется отдельно — это
 * неотправленная локальная правка, терять которую нельзя.
 *
 * prepareTransfer готовит копии задач для следующего месяца. Тесты
 * фиксируют текущее поведение, а не желаемое — расхождение с документацией
 * описано в карточке продукта.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRows, type SyncRow } from "@/lib/sync-merge";
import { prepareTransfer, NOT_TRANSFERRED_STATUSES } from "@/lib/transfer";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task } from "@/lib/types";

function row(over: Partial<SyncRow> = {}): SyncRow {
  return { id: "a", num: "100", name: "Задача", _ts: 100, ...over };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "id-1",
    num: "100",
    name: "Задача",
    planH: "8",
    factH: "4",
    priority: PRIORITIES.MEDIUM,
    status: STATUSES.DEV,
    comment: "",
    commentLog: [{ text: "было" } as never],
    ...over,
  };
}

/* ------------------------------ mergeRows ------------------------------- */

test("пустой локальный список: берём всё с сервера", () => {
  const incoming = [row({ id: "a" }), row({ id: "b" })];

  assert.deepEqual(mergeRows([], incoming), incoming);
  assert.deepEqual(mergeRows(undefined, incoming), incoming);
});

test("более свежая локальная правка не откатывается сервером", () => {
  const mine = row({ id: "a", name: "Моё", _ts: 200 });
  const theirs = row({ id: "a", name: "Серверное", _ts: 100 });

  const merged = mergeRows([mine], [theirs]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "Моё", "устаревший снимок не должен побеждать");
});

test("более свежая серверная версия побеждает локальную", () => {
  const mine = row({ id: "a", name: "Моё", _ts: 100 });
  const theirs = row({ id: "a", name: "Серверное", _ts: 200 });

  assert.equal(mergeRows([mine], [theirs])[0].name, "Серверное");
});

test("при равных метках и разном содержимом выигрывает локальная правка", () => {
  const mine = row({ id: "a", name: "Не отправлено", _ts: 100 });
  const theirs = row({ id: "a", name: "Старое", _ts: 100 });

  const merged = mergeRows([mine], [theirs]);

  assert.equal(merged[0].name, "Не отправлено", "неподтверждённая правка не теряется");
});

test("локальная строка, неизвестная серверу, сохраняется", () => {
  const merged = mergeRows([row({ id: "new-local" })], [row({ id: "server" })]);

  const ids = merged.map((r) => r.id).sort();
  assert.deepEqual(ids, ["new-local", "server"]);
});

test("серверное удаление доезжает до клиента", () => {
  const mine = row({ id: "a", _ts: 100, _deleted: false });
  const theirs = row({ id: "a", _ts: 200, _deleted: true });

  assert.equal(mergeRows([mine], [theirs])[0]._deleted, true);
});

test("устаревший снимок не воскрешает удалённую задачу", () => {
  const mine = row({ id: "a", _ts: 200, _deleted: true });
  const theirs = row({ id: "a", _ts: 100, _deleted: false });

  assert.equal(mergeRows([mine], [theirs])[0]._deleted, true, "задача остаётся удалённой");
});

test("строка без метки времени считается самой старой", () => {
  const mine = row({ id: "a", name: "Без метки", _ts: undefined });
  const theirs = row({ id: "a", name: "С меткой", _ts: 1 });

  assert.equal(mergeRows([mine], [theirs])[0].name, "С меткой");
});

test("дубликатов не возникает при полном совпадении списков", () => {
  const same = [row({ id: "a" }), row({ id: "b" })];

  assert.equal(mergeRows(same, same).length, 2);
});

/* ---------------------------- prepareTransfer --------------------------- */

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

test("незавершённые задачи попадают в перенос", () => {
  const rows = [task({ id: "a", status: STATUSES.DEV }), task({ id: "b", status: STATUSES.NEW })];

  const { transferred, skippedClosed } = prepareTransfer(rows, { now: 1, newId: ids() });

  assert.equal(transferred.length, 2);
  assert.equal(skippedClosed, 0);
});

test("закрытые и отменённые задачи не переносятся", () => {
  const rows = [
    task({ id: "a", status: STATUSES.DONE }),
    task({ id: "b", status: STATUSES.COMPLETED }),
    task({ id: "c", status: STATUSES.CANCEL }),
    task({ id: "d", status: STATUSES.DEV }),
  ];

  const { transferred, skippedClosed } = prepareTransfer(rows, { now: 1, newId: ids() });

  assert.equal(transferred.length, 1);
  assert.equal(transferred[0].status, STATUSES.DEV);
  assert.equal(skippedClosed, 3);
});

test("перенос создаёт копию с новым id, сохраняя номер задачи", () => {
  const { transferred } = prepareTransfer([task({ id: "old", num: "100" })], {
    now: 42,
    newId: ids(),
  });

  assert.equal(transferred[0].id, "new-1", "новая строка, а не та же самая");
  assert.equal(transferred[0].num, "100", "номер повторяется — это одна работа");
  assert.equal(transferred[0]._ts, 42);
});

test("в новом месяце факт обнуляется, история остаётся у оригинала", () => {
  const { transferred } = prepareTransfer([task({ factH: "16" })], { now: 1, newId: ids() });

  assert.equal(transferred[0].factH, "0");
  assert.deepEqual(transferred[0].commentLog, []);
});

test("план переносится без изменений", () => {
  const { transferred } = prepareTransfer([task({ planH: "8", factH: "6" })], {
    now: 1,
    newId: ids(),
  });

  // Документация описывает перенос плана остатком (план − факт).
  // Код так не делает — тест фиксирует фактическое поведение.
  assert.equal(transferred[0].planH, "8");
});

test("«Контроль на прод» переносится, хотя считается закрытым статусом", () => {
  const { transferred } = prepareTransfer([task({ status: STATUSES.PROD_CHECK })], {
    now: 1,
    newId: ids(),
  });

  // Расхождение с CLOSED_STATUSES из metrics.ts — зафиксировано намеренно.
  assert.equal(transferred.length, 1);
  assert.equal(NOT_TRANSFERRED_STATUSES.has(STATUSES.PROD_CHECK), false);
});

test("повторный перенос создаёт вторую копию", () => {
  const source = [task({ num: "100", status: STATUSES.DEV })];

  const first = prepareTransfer(source, { now: 1, newId: ids() });
  const second = prepareTransfer(source, { now: 2, newId: ids() });

  // Проверки на дубли по номеру нет — документация обещает пропуск.
  assert.equal(first.transferred.length, 1);
  assert.equal(second.transferred.length, 1);
  assert.equal(first.transferred[0].num, second.transferred[0].num);
});

test("пустой месяц переносить нечего", () => {
  const { transferred, skippedClosed } = prepareTransfer([], { now: 1, newId: ids() });

  assert.equal(transferred.length, 0);
  assert.equal(skippedClosed, 0);
});
