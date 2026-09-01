/**
 * Тесты описания истории задачи словами.
 *
 * Фраза строится из тех же чисел, что и полосы по месяцам, и должна
 * совпадать с ними по смыслу: если есть перерасход — он назван, если
 * уложились — сказано об этом. Расхождение между полосой и подписью
 * под ней хуже, чем отсутствие подписи.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeTaskHistory } from "@/lib/task-history";

test("без отработанных часов — честная заглушка", () => {
  assert.match(describeTaskHistory([]), /ещё нет/);
});

test("один месяц в пределах плана", () => {
  const text = describeTaskHistory([{ month: 7, planH: 24, factH: 17.5, cumulative: 17.5 }]);

  assert.match(text, /августе/);
  assert.match(text, /24 ч/);
  assert.match(text, /17\.5 ч/);
  assert.match(text, /Уложились/);
  assert.doesNotMatch(text, /[Пп]ерерасход/);
});

test("один месяц с перерасходом называет размер превышения", () => {
  const text = describeTaskHistory([{ month: 7, planH: 16, factH: 35.5, cumulative: 35.5 }]);

  assert.match(text, /Перерасход 19\.5 ч/);
});

test("несколько месяцев перечисляются через «и»", () => {
  const text = describeTaskHistory([
    { month: 5, planH: 30, factH: 30, cumulative: 30 },
    { month: 6, planH: 50, factH: 26.33, cumulative: 56.33 },
    { month: 7, planH: 50, factH: 5.25, cumulative: 61.58 },
  ]);

  assert.match(text, /3-й месяц/);
  assert.match(text, /июне, июле и августе/);
  assert.match(text, /61\.58 ч/);
  assert.match(text, /Перерасход 11\.58 ч/);
});

test("два месяца без перерасхода", () => {
  const text = describeTaskHistory([
    { month: 6, planH: 40, factH: 10, cumulative: 10 },
    { month: 7, planH: 40, factH: 12, cumulative: 22 },
  ]);

  assert.match(text, /июле и августе/);
  assert.match(text, /в пределах плана/);
  assert.doesNotMatch(text, /[Пп]ерерасход/);
});

test("нулевой план не даёт ложного перерасхода", () => {
  const one = describeTaskHistory([{ month: 7, planH: 0, factH: 5, cumulative: 5 }]);
  const many = describeTaskHistory([
    { month: 6, planH: 0, factH: 3, cumulative: 3 },
    { month: 7, planH: 0, factH: 5, cumulative: 8 },
  ]);

  assert.doesNotMatch(one, /[Пп]ерерасход/);
  assert.doesNotMatch(many, /[Пп]ерерасход/);
  assert.match(many, /Накоплено 8 ч/);
});

