/**
 * Тесты расчёта следующего месяца.
 *
 * Порядок счёта здесь обратен интуитивному: сначала обязательства по
 * незакрытым задачам, и только остаток — под беклог. Если перепутать,
 * слайд покажет руководителю, что беклог влезает, хотя часы уже обещаны.
 *
 * На реальных данных заказчика остаток выходит отрицательным. Это
 * не поломка, а ответ, и он обязан отображаться внятно.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNextMonthPlan, buildScenarios, LARGE_TASK_HOURS } from "@/lib/next-month";
import type { CarryTask } from "@/lib/next-month";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task } from "@/lib/types";

function task(planH: string, factH: string, over: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    num: "",
    name: "Задача",
    planH,
    factH,
    priority: PRIORITIES.MEDIUM,
    status: STATUSES.DEV,
    comment: "",
    commentLog: [],
    ...over,
  };
}

function carry(left: number, large = false, name = "Задача"): CarryTask {
  return { num: "", name, left, plan: left, done: 0, large };
}

/* ------------------------- обязательства ------------------------- */

test("закрытые задачи не создают обязательств", () => {
  const plan = buildNextMonthPlan(
    [task("40", "40", { status: STATUSES.DONE }), task("40", "10")],
    [], 240,
  );

  assert.equal(plan.carry.length, 1);
  assert.equal(plan.committed, 30);
});

test("остаток считается по накопленному итогу, а не по факту месяца", () => {
  const t = task("50", "5.25", { num: "40209" });

  const withMap = buildNextMonthPlan([t], [], 240, { "40209": 61.58 });
  const without = buildNextMonthPlan([t], [], 240);

  assert.equal(withMap.carry.length, 0, "план уже перевыполнен — предстоит 0");
  assert.equal(without.committed, 44.75, "по факту месяца остаток кажется большим");
});

test("свободные часы — это бюджет минус обязательства", () => {
  const plan = buildNextMonthPlan([task("40", "10")], [], 120);

  assert.equal(plan.committed, 30);
  assert.equal(plan.free, 90);
});

test("на реальных данных остаток отрицательный, и это ответ", () => {
  // Четыре незакрытые задачи заказчика при полном месяце 240 ч.
  const plan = buildNextMonthPlan([
    task("250", "62.8"),
    task("40", "11.5"),
    task("40", "5.25"),
    task("24", "7.5"),
  ], [], 240);

  assert.equal(plan.committed, 266.95);
  assert.equal(plan.free, -26.95);
  assert.deepEqual(plan.scenarios, [], "выбирать не из чего, свободных часов нет");
});

test("удалённые задачи не учитываются нигде", () => {
  const plan = buildNextMonthPlan(
    [task("40", "0", { _deleted: true })],
    [task("20", "0", { _deleted: true })],
    240,
  );

  assert.equal(plan.committed, 0);
  assert.equal(plan.backlogTotal, 0);
});

test("обязательства идут от крупных к мелким", () => {
  const plan = buildNextMonthPlan(
    [task("20", "0"), task("200", "0"), task("60", "0")],
    [], 240,
  );

  assert.deepEqual(plan.carry.map((c) => c.left), [200, 60, 20]);
});

/* --------------------------- крупные ---------------------------- */

test("крупная — та, у которой остаток больше 120 часов", () => {
  const plan = buildNextMonthPlan(
    [task("250", "62.8"), task("120", "0"), task("121", "0")],
    [], 240,
  );

  const large = plan.carry.filter((c) => c.large).map((c) => c.left);
  assert.deepEqual(large, [187.2, 121]);
  assert.equal(LARGE_TASK_HOURS, 120);
});

test("крупные ищутся и в работе, и в беклоге", () => {
  const plan = buildNextMonthPlan([task("300", "0")], [task("320", "0")], 240);

  assert.equal(plan.large.length, 2);
});

/* -------------------------- сценарии ---------------------------- */

test("без свободных часов сценариев нет", () => {
  assert.deepEqual(buildScenarios(0, [carry(20)]), []);
  assert.deepEqual(buildScenarios(-27, [carry(20)]), []);
});

test("пустой беклог — сценариев нет", () => {
  assert.deepEqual(buildScenarios(120, []), []);
});

test("беклог без крупных влезает целиком — выбирать не из чего", () => {
  assert.deepEqual(buildScenarios(120, [carry(20), carry(20)]), []);
});

test("беклог без крупных не влезает — один вариант с предупреждением", () => {
  const s = buildScenarios(30, [carry(20), carry(20)]);

  assert.equal(s.length, 1);
  assert.match(s[0].lines[0], /влезает не всё/);
});

test("одна крупная задача даёт два осмысленных варианта", () => {
  const s = buildScenarios(120, [
    carry(320, true, "Денежный поток"),
    carry(20), carry(20), carry(12), carry(20),
  ]);

  assert.equal(s.length, 2);
  assert.match(s[0].label, /Беклог/);
  assert.match(s[0].lines[0], /72 ч/, "мелочь суммирована");
  assert.match(s[0].lines[1], /48 ч/, "остаток отдан крупной");
  assert.match(s[1].label, /Денежный поток/);
});

test("крупная закрывается целиком — так и сказано", () => {
  const s = buildScenarios(150, [carry(100, true, "Крупная")]);

  assert.match(s[s.length - 1].lines[1], /закрывается полностью/);
});

test("две крупные — вариантов не предлагаем, это таблица перестановок", () => {
  const s = buildScenarios(120, [
    carry(300, true, "Первая"),
    carry(200, true, "Вторая"),
    carry(20),
  ]);

  assert.deepEqual(s, [], "на встрече такой перебор не обсудить");
});

test("мелочь не влезает при наличии крупной — остаётся только вариант с крупной", () => {
  const s = buildScenarios(30, [carry(300, true, "Крупная"), carry(50), carry(40)]);

  assert.equal(s.length, 1);
  assert.match(s[0].label, /Крупная/);
});
