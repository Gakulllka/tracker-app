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
import { describeTaskHistory, describeMonth } from "@/lib/task-history";

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

/* --------------------- итог месяца для слайда --------------------- */

test("месяц в пределах бюджета", () => {
  const text = describeMonth(196.75, 240, 7, 11, 0);

  assert.match(text, /196\.75 ч из 240 ч/);
  assert.match(text, /Завершено 7 задач из 11/);
  assert.doesNotMatch(text, /[Пп]ерерасход/);
});

test("перерасход бюджета назван размером", () => {
  const text = describeMonth(260, 240, 5, 5, 0);

  assert.match(text, /перерасход 20 ч/);
});

test("сравнение с прошлым месяцем в обе стороны", () => {
  assert.match(describeMonth(200, 240, 1, 2, 18), /На 18 ч больше прошлого месяца/);
  assert.match(describeMonth(200, 240, 1, 2, -17), /На 17 ч меньше прошлого месяца/);
  assert.doesNotMatch(describeMonth(200, 240, 1, 2, 0), /прошлого месяца/);
});

test("все задачи закрыты — говорится прямо", () => {
  assert.match(describeMonth(100, 240, 4, 4, 0), /Закрыты все 4 задач/);
});

test("без бюджета перерасхода не бывает", () => {
  const text = describeMonth(50, 0, 1, 1, 0);

  assert.match(text, /Отработали 50 ч/);
  assert.doesNotMatch(text, /бюджет/);
});
