/**
 * Тесты фильтров и сортировки таблицы задач.
 *
 * Две ловушки, на которых такой код обычно и ломается. Первая — пустой
 * фильтр: пустое множество статусов означает «показывать все», а не
 * «не показывать ничего», и перепутать это легко. Вторая — сортировка
 * статусов и приоритетов: они обязаны идти в смысловом порядке, а не по
 * алфавиту, иначе «Наивысший» окажется после «Низкого».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasks, sortTasks, buildMonthBreakdown } from "@/lib/task-filters";
import { evalExpr } from "@/lib/metrics";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task, Status, Priority } from "@/lib/types";

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
    commentLog: [],
    ...over,
  };
}

/* -------------------------------- фильтры -------------------------------- */

test("пустой фильтр не отсекает ничего", () => {
  const tasks = [task({ id: "a" }), task({ id: "b" })];

  assert.equal(filterTasks(tasks, {}).length, 2);
  assert.equal(filterTasks(tasks, { statuses: new Set<Status>() }).length, 2);
  assert.equal(filterTasks(tasks, { priorities: new Set<Priority>() }).length, 2);
  assert.equal(filterTasks(tasks, { search: "   " }).length, 2);
});

test("фильтр по статусу оставляет только выбранные", () => {
  const tasks = [
    task({ id: "a", status: STATUSES.DEV }),
    task({ id: "b", status: STATUSES.TEST }),
    task({ id: "c", status: STATUSES.DONE }),
  ];

  const result = filterTasks(tasks, { statuses: new Set([STATUSES.DEV, STATUSES.DONE]) });

  assert.deepEqual(result.map((t) => t.id), ["a", "c"]);
});

test("фильтр по приоритету работает так же", () => {
  const tasks = [
    task({ id: "a", priority: PRIORITIES.HIGHEST }),
    task({ id: "b", priority: PRIORITIES.LOW }),
  ];

  const result = filterTasks(tasks, { priorities: new Set([PRIORITIES.HIGHEST]) });

  assert.deepEqual(result.map((t) => t.id), ["a"]);
});

test("поиск смотрит во все текстовые поля задачи", () => {
  const tasks = [
    task({ id: "по имени", name: "Найди меня" }),
    task({ id: "по номеру", num: "ABC-42", name: "Другая" }),
    task({ id: "по комментарию", name: "Третья", comment: "важная пометка" }),
    task({ id: "мимо", name: "Ничего", num: "1", comment: "" }),
  ];

  assert.equal(filterTasks(tasks, { search: "найди" })[0].id, "по имени");
  assert.equal(filterTasks(tasks, { search: "abc-42" })[0].id, "по номеру");
  assert.equal(filterTasks(tasks, { search: "пометка" })[0].id, "по комментарию");
});

test("поиск не зависит от регистра и краевых пробелов", () => {
  const tasks = [task({ name: "Рефакторинг" })];

  assert.equal(filterTasks(tasks, { search: "  РЕФАКТОР  " }).length, 1);
});

test("фильтр сигналов ловит и флаг руководителя, и статус согласования", () => {
  const tasks = [
    task({ id: "флаг", executiveFlag: "escalate" }),
    task({ id: "ожидает", approvalStatus: "pending" }),
    task({ id: "отклонена", approvalStatus: "rejected" }),
    task({ id: "обычная" }),
  ];

  const result = filterTasks(tasks, { signalsOnly: true });

  assert.deepEqual(result.map((t) => t.id).sort(), ["отклонена", "ожидает", "флаг"].sort());
});

test("несколько фильтров сужают результат вместе", () => {
  const tasks = [
    task({ id: "нужная", status: STATUSES.DEV, name: "Импорт Excel" }),
    task({ id: "не тот статус", status: STATUSES.DONE, name: "Импорт Excel" }),
    task({ id: "не то имя", status: STATUSES.DEV, name: "Другое" }),
  ];

  const result = filterTasks(tasks, {
    statuses: new Set([STATUSES.DEV]),
    search: "импорт",
  });

  assert.deepEqual(result.map((t) => t.id), ["нужная"]);
});

/* ------------------------------ сортировка ------------------------------- */

const noNumbers = () => 0;

test("без ключа сортировки порядок не меняется", () => {
  const tasks = [task({ id: "b" }), task({ id: "a" })];

  assert.deepEqual(sortTasks(tasks, null, 1, noNumbers).map((t) => t.id), ["b", "a"]);
});

test("приоритеты идут по важности, а не по алфавиту", () => {
  const tasks = [
    task({ id: "низкий", priority: PRIORITIES.LOW }),
    task({ id: "наивысший", priority: PRIORITIES.HIGHEST }),
    task({ id: "средний", priority: PRIORITIES.MEDIUM }),
  ];

  const sorted = sortTasks(tasks, "priority", 1, noNumbers);

  assert.equal(sorted[0].id, "наивысший", "важное — первым");
});

test("статусы идут по этапам работы", () => {
  const tasks = [
    task({ id: "готово", status: STATUSES.DONE }),
    task({ id: "новая", status: STATUSES.NEW }),
  ];

  const sorted = sortTasks(tasks, "status", 1, noNumbers);

  assert.equal(sorted[0].id, "новая");
});

test("обратное направление разворачивает порядок", () => {
  const tasks = [
    task({ id: "низкий", priority: PRIORITIES.LOW }),
    task({ id: "наивысший", priority: PRIORITIES.HIGHEST }),
  ];

  assert.equal(sortTasks(tasks, "priority", -1, noNumbers)[0].id, "низкий");
});

test("сортировка по названию учитывает кириллицу", () => {
  const tasks = [
    task({ id: "я", name: "Яблоко" }),
    task({ id: "а", name: "Апельсин" }),
    task({ id: "б", name: "Банан" }),
  ];

  const sorted = sortTasks(tasks, "name", 1, noNumbers);

  assert.deepEqual(sorted.map((t) => t.id), ["а", "б", "я"]);
});

test("числовые колонки считает переданная функция", () => {
  const tasks = [task({ id: "много", planH: "40" }), task({ id: "мало", planH: "2" })];

  const sorted = sortTasks(tasks, "planH", 1, (t) => Number(t.planH));

  assert.deepEqual(sorted.map((t) => t.id), ["мало", "много"]);
});

test("сортировка не меняет исходный массив", () => {
  const tasks = [task({ id: "b", name: "Б" }), task({ id: "a", name: "А" })];

  sortTasks(tasks, "name", 1, noNumbers);

  assert.equal(tasks[0].id, "b", "исходный порядок сохранён");
});

/* --------------------------- разбивка по месяцам ------------------------- */

test("разбивка собирает историю задачи по месяцам с накоплением", () => {
  const allData: Record<number, Task[]> = {
    0: [task({ num: "100", name: "Работа", planH: "8", factH: "3" })],
    1: [task({ num: "100", name: "Работа", planH: "8", factH: "5" })],
    2: [task({ num: "999", name: "Чужая", planH: "4", factH: "4" })],
  };

  const { rows, taskName } = buildMonthBreakdown("100", allData, evalExpr);

  assert.equal(taskName, "Работа");
  assert.equal(rows.length, 2, "чужая задача не попала");
  assert.equal(rows[0].cumulative, 3);
  assert.equal(rows[1].cumulative, 8, "итог накапливается через месяцы");
});

test("без номера задачи разбивка пустая", () => {
  assert.deepEqual(buildMonthBreakdown("", {}, evalExpr), { rows: [], taskName: "" });
});

test("разбивка понимает часы, записанные формулой", () => {
  const allData: Record<number, Task[]> = {
    0: [task({ num: "100", planH: "2+3", factH: "1,5" })],
  };

  const { rows } = buildMonthBreakdown("100", allData, evalExpr);

  assert.equal(rows[0].planH, 5);
  assert.equal(rows[0].factH, 1.5);
});
