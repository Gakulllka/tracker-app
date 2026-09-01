/**
 * Тесты положительных фактов о месяце.
 *
 * Главное правило: каждый пункт называет конкретную задачу или число.
 * Общая формула вроде «хорошая динамика» превращает обязательный позитив
 * в ритуал, который через два месяца перестают читать. Это и проверяется.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectPositiveFacts } from "@/lib/month-facts";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task } from "@/lib/types";

function task(over: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    num: "100",
    name: "Задача",
    planH: "40",
    factH: "20",
    priority: PRIORITIES.MEDIUM,
    status: STATUSES.DEV,
    comment: "",
    commentLog: [],
    ...over,
  };
}

/** В каждом факте должно быть либо число, либо название задачи в кавычках. */
function isConcrete(fact: string): boolean {
  return /\d/.test(fact) || /«[^»]+»/.test(fact);
}

test("факт находится и без закрытых задач, если работа шла", () => {
  const facts = collectPositiveFacts({
    rows: [task({ status: STATUSES.DEV, factH: "12" })],
    budget: 0,
  });

  assert.equal(facts.length, 1);
  assert.match(facts[0], /Продвинулись по 1 задачам/);
});

test("месяц без единого отработанного часа не выдумывает плюс", () => {
  // Ни часов, ни закрытых задач — положительного факта не существует.
  // Общая фраза на его месте была бы тем самым ритуалом.
  const facts = collectPositiveFacts({
    rows: [task({ factH: "0" })],
    budget: 240,
  });

  assert.deepEqual(facts, []);
});

test("закрытая долгая задача — самый сильный факт, идёт первым", () => {
  const facts = collectPositiveFacts({
    rows: [
      task({ num: "40209", name: "Таможенный калькулятор", status: STATUSES.DONE, factH: "5" }),
      task({ num: "999", status: STATUSES.DONE, priority: PRIORITIES.HIGHEST }),
    ],
    budget: 240,
    monthsByNum: { "40209": 3 },
  });

  assert.match(facts[0], /Таможенный калькулятор/);
  assert.match(facts[0], /3 месяца/);
});

test("доведённая до конца задача с перерасходом отмечается как плюс", () => {
  const facts = collectPositiveFacts({
    rows: [task({ num: "40209", name: "Калькулятор", status: STATUSES.DONE, planH: "50", factH: "5.25" })],
    budget: 240,
    totalFactMap: { "40209": 61.58 },
  });

  assert.ok(facts.some((f) => /доведена до конца/.test(f)));
  assert.ok(facts.some((f) => /11\.58 ч/.test(f)));
});

test("закрытые задачи наивысшего приоритета считаются", () => {
  const facts = collectPositiveFacts({
    rows: [
      task({ num: "1", status: STATUSES.DONE, priority: PRIORITIES.HIGHEST }),
      task({ num: "2", status: STATUSES.DONE, priority: PRIORITIES.HIGHEST }),
      task({ num: "3", status: STATUSES.DONE, priority: PRIORITIES.LOW }),
    ],
    budget: 240,
  });

  assert.ok(facts.some((f) => /2 задач наивысшего приоритета/.test(f)));
});

test("уложились в бюджет — факт с числами", () => {
  const facts = collectPositiveFacts({
    rows: [task({ status: STATUSES.DONE, factH: "100" })],
    budget: 240,
  });

  assert.ok(facts.some((f) => /100 ч из 240 ч/.test(f)));
});

test("перерасход бюджета не выдаётся за плюс", () => {
  const facts = collectPositiveFacts({
    rows: [task({ status: STATUSES.DONE, factH: "300" })],
    budget: 240,
  });

  assert.ok(!facts.some((f) => /Уложились/.test(f)));
});

test("сокращение долга по незакрытым — факт", () => {
  const facts = collectPositiveFacts({
    rows: [task({ status: STATUSES.DEV })],
    budget: 0,
    prevUncompleted: 5,
  });

  assert.ok(facts.some((f) => /1 против 5/.test(f)));
});

test("рост незакрытых плюсом не считается", () => {
  const facts = collectPositiveFacts({
    rows: [task({ num: "1", status: STATUSES.DEV }), task({ num: "2", status: STATUSES.DEV })],
    budget: 0,
    prevUncompleted: 1,
  });

  assert.ok(!facts.some((f) => /Незакрытых стало меньше/.test(f)));
});

test("не больше трёх фактов — слайд не должен распухать", () => {
  const facts = collectPositiveFacts({
    rows: [
      task({ num: "40209", name: "Долгая", status: STATUSES.DONE, planH: "10", factH: "50" }),
      task({ num: "2", status: STATUSES.DONE, priority: PRIORITIES.HIGHEST }),
      task({ num: "3", status: STATUSES.DONE, priority: PRIORITIES.HIGHEST }),
    ],
    budget: 240,
    monthsByNum: { "40209": 2 },
    prevUncompleted: 9,
    prevCompleted: 0,
  });

  assert.ok(facts.length <= 3);
});

test("каждый факт называет задачу или число, без общих формул", () => {
  const cases = [
    { rows: [task({ status: STATUSES.DONE, factH: "100" })], budget: 240 },
    { rows: [task({ factH: "0" })], budget: 240 },
    { rows: [task({ status: STATUSES.DEV, factH: "7" })], budget: 0, prevUncompleted: 4 },
  ];

  for (const input of cases) {
    for (const fact of collectPositiveFacts(input)) {
      assert.ok(isConcrete(fact), `общая формула без опоры: «${fact}»`);
    }
  }
});

test("удалённые задачи в фактах не участвуют", () => {
  const facts = collectPositiveFacts({
    rows: [task({ status: STATUSES.DONE, _deleted: true }), task({ num: "2", factH: "5" })],
    budget: 240,
  });

  assert.ok(!facts.some((f) => /наивысшего/.test(f)));
});
