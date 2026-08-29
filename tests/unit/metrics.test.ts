/**
 * Тесты вычислений, на которых стоит продукт.
 *
 * evalExpr — часы можно вводить формулой («2+3*4»), и считается это без
 * Function() и eval, собственным парсером. Ошибка здесь искажает бюджет месяца
 * молча, поэтому арифметика и защита от мусора на входе проверяются отдельно.
 *
 * computeFirstToCut — кого отсекать при перерасходе месяца. Решение влияет
 * на реальную работу людей, а флаг excludeFromCut — это прямая защита
 * руководителя, которую алгоритм обязан уважать.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evalExpr, fixStatus, fixPriority, R2 } from "@/lib/metrics";
import { computeFirstToCut } from "@/lib/cut-algorithm";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task } from "@/lib/types";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "id-1",
    num: "100",
    name: "Задача",
    planH: "8",
    factH: "0",
    priority: PRIORITIES.MEDIUM,
    status: STATUSES.IDEA,
    comment: "",
    commentLog: [],
    ...over,
  };
}

/* ------------------------------- evalExpr ------------------------------- */

test("считает обычные числа", () => {
  assert.equal(evalExpr("8"), 8);
  assert.equal(evalExpr("8.5"), 8.5);
});

test("запятая работает как десятичный разделитель", () => {
  assert.equal(evalExpr("8,5"), 8.5, "русская раскладка не должна ломать ввод");
});

test("считает формулы с приоритетом операций", () => {
  assert.equal(evalExpr("2+3*4"), 14, "умножение раньше сложения");
  assert.equal(evalExpr("(2+3)*4"), 20, "скобки меняют порядок");
  assert.equal(evalExpr("10/4"), 2.5);
});

test("пустая строка это ноль, а не ошибка", () => {
  assert.equal(evalExpr(""), 0);
  assert.equal(evalExpr("   "), 0);
});

test("отрицательный результат подтягивается к нулю", () => {
  assert.equal(evalExpr("2-10"), 0, "отрицательных часов не бывает");
});

test("деление на ноль не роняет расчёт", () => {
  assert.equal(evalExpr("8/0"), 0);
});

test("посторонние символы отбрасываются, а не ломают ввод", () => {
  assert.equal(evalExpr("8ч"), 8);
  assert.equal(evalExpr("abc"), 0);
});

test("результат округляется до двух знаков", () => {
  assert.equal(evalExpr("10/3"), 3.33);
  assert.equal(R2(3.33333), 3.33);
});

/* ---------------------------- нормализация ------------------------------ */

test("устаревшее написание статуса приводится к текущему", () => {
  assert.equal(fixStatus("Выполнена"), STATUSES.COMPLETED);
});

test("неизвестный статус не роняет импорт", () => {
  assert.equal(fixStatus("что-то своё"), STATUSES.IDEA);
  assert.equal(fixStatus(""), STATUSES.IDEA);
  assert.equal(fixStatus(null), STATUSES.IDEA);
});

test("приоритет принимается и числом", () => {
  assert.equal(fixPriority("1"), PRIORITIES.HIGHEST);
  assert.equal(fixPriority("2"), PRIORITIES.HIGH);
});

test("пустой приоритет становится средним", () => {
  assert.equal(fixPriority(""), PRIORITIES.MEDIUM);
  assert.equal(fixPriority(undefined), PRIORITIES.MEDIUM);
});

/* --------------------------- отсечение задач ---------------------------- */

test("без перерасхода никого не отсекает", () => {
  const tasks = [task({ id: "a", planH: "10" }), task({ id: "b", planH: "10" })];

  const cut = computeFirstToCut(tasks, 100);

  assert.equal(cut.size, 0, "бюджет месяца не превышен");
});

test("при перерасходе отсекает задачи с низким приоритетом", () => {
  const tasks = [
    task({ id: "важная", planH: "50", priority: PRIORITIES.HIGHEST }),
    task({ id: "мелкая", planH: "50", priority: PRIORITIES.LOW }),
  ];

  const cut = computeFirstToCut(tasks, 60);

  assert.equal(cut.has("мелкая"), true, "низкий приоритет отсекается первым");
  assert.equal(cut.has("важная"), false, "наивысший приоритет защищён");
});

test("флаг excludeFromCut защищает задачу от отсечения", () => {
  const tasks = [
    task({ id: "защищённая", planH: "50", priority: PRIORITIES.LOW, excludeFromCut: true }),
    task({ id: "обычная", planH: "50", priority: PRIORITIES.HIGH }),
  ];

  const cut = computeFirstToCut(tasks, 60);

  assert.equal(cut.has("защищённая"), false, "решение руководителя перевешивает приоритет");
});

test("удалённые задачи не занимают бюджет месяца", () => {
  const tasks = [
    task({ id: "живая", planH: "50" }),
    task({ id: "в корзине", planH: "500", _deleted: true }),
  ];

  const cut = computeFirstToCut(tasks, 60);

  assert.equal(cut.size, 0, "задача в корзине не должна вызывать перерасход");
});

test("отклонённые задачи не занимают бюджет месяца", () => {
  const tasks = [
    task({ id: "живая", planH: "50" }),
    task({ id: "отклонённая", planH: "500", approvalStatus: "rejected" }),
  ];

  const cut = computeFirstToCut(tasks, 60);

  assert.equal(cut.size, 0);
});

test("budgetAllocated имеет приоритет над планом", () => {
  const tasks = [
    task({ id: "a", planH: "500", budgetAllocated: 10 }),
    task({ id: "b", planH: "500", budgetAllocated: 10 }),
  ];

  const cut = computeFirstToCut(tasks, 60);

  assert.equal(cut.size, 0, "считается выделенный бюджет, а не исходный план");
});
