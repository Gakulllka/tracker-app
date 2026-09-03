/**
 * Тесты схлопывания уведомлений.
 *
 * Журнал пишется при каждой синхронизации, а она идёт сама. Правка часов
 * трижды за минуту давала три уведомления с промежуточными значениями.
 * Здесь проверяется, что группа правок превращается в одно событие
 * с переходом от ПЕРВОГО значения к ПОСЛЕДНЕМУ — иначе схлопывание
 * покажет последний микрошаг и соврёт сильнее, чем отсутствие схлопывания.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeEvents, NOTIFIED_FIELDS, IGNORED_FIELDS,
  feedSince, retentionBefore, MERGE_WINDOW_MS,
} from "@/lib/notifications";
import type { RawEvent } from "@/lib/notifications";

function event(
  minutesAgo: number,
  changes: { field: string; from: string; to: string }[],
  over: Partial<RawEvent> = {},
): RawEvent {
  return {
    id: `e${minutesAgo}`,
    action: "task_update",
    author: "Мария",
    taskId: "t1",
    createdAt: new Date(Date.UTC(2026, 8, 1, 12, 0) - minutesAgo * 60_000).toISOString(),
    changes: changes.map((c) => ({ ...c, label: c.field })),
    ...over,
  };
}

test("одна правка остаётся одной", () => {
  const out = mergeEvents([event(0, [{ field: "status", from: "Новая", to: "Разработка" }])]);

  assert.equal(out.length, 1);
  assert.equal(out[0].editCount, 1);
});

test("три правки часов сливаются в одно событие с полным переходом", () => {
  // События приходят от новых к старым, как из базы.
  const out = mergeEvents([
    event(0, [{ field: "planH", from: "5", to: "7" }]),
    event(5, [{ field: "planH", from: "4", to: "5" }]),
    event(10, [{ field: "planH", from: "3", to: "4" }]),
  ]);

  assert.equal(out.length, 1);
  assert.equal(out[0].editCount, 3);
  assert.equal(out[0].changes[0].from, "3", "начальное значение из самой старой правки");
  assert.equal(out[0].changes[0].to, "7", "конечное — из самой свежей");
});

test("правки за пределами окна не сливаются", () => {
  const out = mergeEvents([
    event(0, [{ field: "status", from: "Тест", to: "Готово" }]),
    event(MERGE_WINDOW_MS / 60_000 + 5, [{ field: "status", from: "Новая", to: "Тест" }]),
  ]);

  assert.equal(out.length, 2);
});

test("правки разных задач не сливаются", () => {
  const out = mergeEvents([
    event(0, [{ field: "status", from: "a", to: "b" }], { taskId: "t1" }),
    event(5, [{ field: "status", from: "c", to: "d" }], { taskId: "t2" }),
  ]);

  assert.equal(out.length, 2);
});

test("правки разных авторов не сливаются", () => {
  const out = mergeEvents([
    event(0, [{ field: "status", from: "a", to: "b" }], { author: "Мария" }),
    event(5, [{ field: "status", from: "c", to: "d" }], { author: "Иван" }),
  ]);

  assert.equal(out.length, 2);
});

test("создание и удаление не схлопываются с правками", () => {
  const out = mergeEvents([
    event(0, [], { action: "task_delete", id: "del" }),
    event(5, [{ field: "status", from: "a", to: "b" }]),
    event(10, [], { action: "task_create", id: "cre" }),
  ]);

  assert.equal(out.length, 3);
});

test("две правки, вернувшие значение назад, событием не считаются", () => {
  // Поставил «Тест», потом вернул «Новая» — по сути ничего не произошло.
  const out = mergeEvents([
    event(0, [{ field: "status", from: "Тест", to: "Новая" }]),
    event(5, [{ field: "status", from: "Новая", to: "Тест" }]),
  ]);

  assert.deepEqual(out, []);
});

test("разные поля в группе собираются вместе", () => {
  const out = mergeEvents([
    event(0, [{ field: "priority", from: "Средний", to: "Высокий" }]),
    event(5, [{ field: "status", from: "Новая", to: "Разработка" }]),
  ]);

  assert.equal(out.length, 1);
  assert.deepEqual(out[0].changes.map((c) => c.field).sort(), ["priority", "status"]);
});

test("создание не отбрасывается из-за пустого списка изменений", () => {
  const out = mergeEvents([event(0, [], { action: "task_create" })]);

  assert.equal(out.length, 1);
});

/* ------------------------- состав полей ------------------------- */

test("комментарий и факт в уведомления не идут", () => {
  for (const field of IGNORED_FIELDS) {
    assert.equal(NOTIFIED_FIELDS[field], undefined, `${field} должно быть исключено`);
  }
});

test("значимые поля на месте", () => {
  for (const field of ["num", "name", "status", "priority", "planH"]) {
    assert.ok(NOTIFIED_FIELDS[field], `${field} должно уведомлять`);
  }
});

/* --------------------------- окна ------------------------------- */

test("лента показывает две недели, журнал хранится три месяца", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const days = (d: Date) => Math.round((now.getTime() - d.getTime()) / 86_400_000);

  assert.equal(days(feedSince(now)), 14);
  assert.equal(days(retentionBefore(now)), 90);
  assert.ok(retentionBefore(now) < feedSince(now), "хранение дольше показа");
});
