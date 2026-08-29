/**
 * Тесты очереди беклога.
 *
 * Порог «дальше бюджет исчерпан» легко ошибается на границе: строка
 * должна оказаться выше или ниже черты в зависимости от того, ровно
 * ли она укладывается в остаток. Ошибка тихая — список выглядит
 * правдоподобно, а решение о том, что брать в месяц, принимается неверно.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBacklogQueue } from "@/lib/backlog-queue";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task } from "@/lib/types";

function task(planH: string, factH = "0", over: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    num: "",
    name: "Задача",
    planH,
    factH,
    priority: PRIORITIES.QUEUE,
    status: STATUSES.IDEA,
    comment: "",
    commentLog: [],
    ...over,
  };
}

test("пустой беклог не даёт ни строк, ни порога", () => {
  const q = buildBacklogQueue([], 100);

  assert.deepEqual(q.rows, []);
  assert.equal(q.thresholdAfter, null);
  assert.equal(q.totalLeft, 0);
});

test("остаток считается как план минус отработанное", () => {
  const q = buildBacklogQueue([task("20", "8")], 100);

  assert.equal(q.rows[0].plan, 20);
  assert.equal(q.rows[0].fact, 8);
  assert.equal(q.rows[0].left, 12, "взять задачу стоит только остатка");
});

test("отработано больше плана — остаток ноль, а не отрицательный", () => {
  const q = buildBacklogQueue([task("10", "25")], 100);

  assert.equal(q.rows[0].left, 0);
  assert.equal(q.totalLeft, 0);
});

test("накопление идёт по остаткам сверху вниз", () => {
  const q = buildBacklogQueue([task("20"), task("20", "5"), task("12")], 100);

  assert.deepEqual(q.rows.map((r) => r.running), [20, 35, 47]);
  assert.equal(q.totalLeft, 47);
});

test("черта встаёт после последней уместившейся задачи", () => {
  // Свободно 43.25: 20 влезает, 40 влезает, 52 уже нет.
  const q = buildBacklogQueue([task("20"), task("20"), task("12")], 43.25);

  assert.equal(q.thresholdAfter, 1, "черта после второй строки");
  assert.deepEqual(q.rows.map((r) => r.fitsInMonth), [true, true, false]);
});

test("влезает вся очередь — черты нет", () => {
  const q = buildBacklogQueue([task("10"), task("10")], 100);

  assert.equal(q.thresholdAfter, null);
  assert.ok(q.rows.every((r) => r.fitsInMonth));
});

test("не влезает даже первая — черта не рисуется над всем списком", () => {
  const q = buildBacklogQueue([task("50"), task("10")], 5);

  assert.equal(q.thresholdAfter, null, "черта над первой строкой бессмысленна");
  assert.equal(q.rows[0].fitsInMonth, false);
});

test("ровно по границе задача считается уместившейся", () => {
  const q = buildBacklogQueue([task("20"), task("20")], 40);

  assert.deepEqual(q.rows.map((r) => r.fitsInMonth), [true, true]);
  assert.equal(q.thresholdAfter, null);
});

test("нулевой свободный остаток отсекает всё", () => {
  const q = buildBacklogQueue([task("1"), task("1")], 0);

  assert.deepEqual(q.rows.map((r) => r.fitsInMonth), [false, false]);
});

test("задача без часов не сдвигает накопление", () => {
  const q = buildBacklogQueue([task("0"), task("10")], 100);

  assert.deepEqual(q.rows.map((r) => r.running), [0, 10]);
});

test("часы формулой разбираются как в остальном приложении", () => {
  const q = buildBacklogQueue([task("8*3", "2+1")], 100);

  assert.equal(q.rows[0].plan, 24);
  assert.equal(q.rows[0].fact, 3);
  assert.equal(q.rows[0].left, 21);
});
