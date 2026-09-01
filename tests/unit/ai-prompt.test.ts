/**
 * Тесты данных и промпта для выводов ИИ.
 *
 * Проверяется в первую очередь то, ЧТО уходит модели. Раньше в промпт
 * попадали только номер, название, статус, план и факт — из такого
 * огрызка нельзя понять ни почему задача затянулась, ни был ли
 * перерасход по накоплению, и выводы получались общими словами
 * о процентах.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthData, buildInsightPrompt } from "@/lib/ai-prompt";
import { STATUSES, PRIORITIES } from "@/lib/types";
import type { Task } from "@/lib/types";

function task(over: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    num: "40209",
    name: "Таможенный калькулятор",
    planH: "50",
    factH: "5.25",
    priority: PRIORITIES.HIGHEST,
    status: STATUSES.DEV,
    comment: "",
    commentLog: [],
    ...over,
  };
}

const ctx = { month: 7, year: 2026, budget: 240 };

test("в данные попадает бюджет месяца и сводка по задачам", () => {
  const text = buildMonthData([task()], ctx);

  assert.match(text, /Август 2026/);
  assert.match(text, /Бюджет часов на месяц: 240/);
  assert.match(text, /Задач всего: 1/);
});

test("комментарий задачи уходит модели — там объяснение происходящего", () => {
  const text = buildMonthData(
    [task({ comment: "Заказчик добавил пошлины по трём странам" })],
    ctx,
  );

  assert.match(text, /Заказчик добавил пошлины/);
});

test("многострочный комментарий сжимается в одну строку", () => {
  const text = buildMonthData([task({ comment: "первая\n\nвторая   третья" })], ctx);

  assert.match(text, /комментарий: первая вторая третья/);
});

test("накопленный итог передаётся, когда он больше факта месяца", () => {
  const text = buildMonthData([task()], { ...ctx, totalFactMap: { "40209": 61.58 } });

  assert.match(text, /всего по задаче за все месяцы: 61\.58 ч/);
});

test("перерасход считается по накоплению, а не по факту месяца", () => {
  const withMap = buildMonthData([task()], { ...ctx, totalFactMap: { "40209": 61.58 } });
  const without = buildMonthData([task()], ctx);

  assert.match(withMap, /ПЕРЕРАСХОД: 11\.58 ч/);
  assert.doesNotMatch(without, /ПЕРЕРАСХОД/, "факт месяца 5.25 план не превысил");
});

test("задача без номера не берёт чужое накопление", () => {
  const text = buildMonthData([task({ num: "" })], { ...ctx, totalFactMap: { "": 999 } });

  assert.match(text, /без номера/);
  assert.doesNotMatch(text, /999/);
});

test("промпт требует обязательный положительный пункт", () => {
  const prompt = buildInsightPrompt([task()], ctx);

  assert.match(prompt, /ОБЯЗАТЕЛЬНО/);
  assert.match(prompt, /даже если месяц вышел тяжёлым/);
});

test("промпт запрещает канцелярит и просит живой язык", () => {
  const prompt = buildInsightPrompt([task()], ctx);

  assert.match(prompt, /канцелярита/);
  assert.match(prompt, /эффективность/, "слово названо как запрещённое");
  assert.match(prompt, /Полными фразами/);
  assert.doesNotMatch(prompt, /аналитик проекта/, "старая роль убрана");
  assert.doesNotMatch(prompt, /до 10 слов/, "лимит, из-за которого выходил телеграф");
});

test("промпт разрешает пустые риски, чтобы модель не выдумывала проблему", () => {
  const prompt = buildInsightPrompt([task()], ctx);

  assert.match(prompt, /не выдумывай проблему/);
});

test("промпт требует чистый JSON без разметки", () => {
  const prompt = buildInsightPrompt([task()], ctx);

  assert.match(prompt, /строго одним JSON-объектом/);
  assert.match(prompt, /achievements/);
  assert.match(prompt, /summary/);
});
