/**
 * Тесты формул в комментариях.
 *
 * В комментарий к задаче можно написать «@факт+10» — при выходе из
 * редактирования часы пересчитываются, а сама формула заменяется записью
 * вида «факт 4 → 14 ч». Механика заметная для пользователя и при этом
 * молчаливая: если разбор сломается, часы просто перестанут меняться,
 * а комментарий останется как есть.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommentFormulas, parseFormulas, applyFormula } from "@/lib/comment-formulas";

test("комментарий без формул ничего не меняет", () => {
  const result = applyCommentFormulas("обычный текст", 4, 8);

  assert.equal(result.applied, false);
  assert.equal(result.factH, 4);
  assert.equal(result.planH, 8);
  assert.equal(result.comment, "обычный текст");
});

test("прибавление к факту", () => {
  const result = applyCommentFormulas("@факт+10", 4, 8);

  assert.equal(result.applied, true);
  assert.equal(result.factH, 14);
  assert.equal(result.planH, 8, "план не тронут");
});

test("умножение плана", () => {
  const result = applyCommentFormulas("@план*2", 4, 8);

  assert.equal(result.planH, 16);
  assert.equal(result.factH, 4);
});

test("знак равенства заменяет значение целиком", () => {
  const result = applyCommentFormulas("@факт=40", 4, 8);

  assert.equal(result.factH, 40);
});

test("деление на ноль оставляет значение прежним", () => {
  assert.equal(applyFormula(8, "/", 0), 8, "часы не должны обратиться в бесконечность");
});

test("дробный операнд принимается и с запятой", () => {
  assert.equal(applyCommentFormulas("@факт+1,5", 4, 8).factH, 5.5);
  assert.equal(applyCommentFormulas("@факт+1.5", 4, 8).factH, 5.5);
});

test("формула заменяется человекочитаемой записью", () => {
  const result = applyCommentFormulas("@факт+10", 4, 8);

  assert.match(result.comment, /факт/);
  assert.match(result.comment, /4/);
  assert.match(result.comment, /14/);
  assert.doesNotMatch(result.comment, /@факт/, "исходная формула убрана");
});

test("обычный текст рядом с формулой сохраняется", () => {
  const result = applyCommentFormulas("@факт+10 доделал импорт", 4, 8);

  assert.match(result.comment, /доделал импорт/);
});

test("несколько формул применяются по очереди", () => {
  const result = applyCommentFormulas("@факт+10 @план*2", 4, 8);

  assert.equal(result.factH, 14);
  assert.equal(result.planH, 16);
});

test("две формулы на одно поле считаются накопительно", () => {
  const result = applyCommentFormulas("@факт+10 @факт+5", 0, 8);

  assert.equal(result.factH, 15, "вторая формула считает от результата первой");
});

test("регистр в названии поля не важен", () => {
  assert.equal(applyCommentFormulas("@ФАКТ+10", 4, 8).factH, 14);
});

test("пробелы вокруг знака допускаются", () => {
  assert.equal(applyCommentFormulas("@факт + 10", 4, 8).factH, 14);
});

test("результат округляется до двух знаков", () => {
  const result = applyCommentFormulas("@факт/3", 10, 8);

  assert.equal(result.factH, 3.33);
});

test("похожий на формулу текст без @ не срабатывает", () => {
  const result = applyCommentFormulas("факт+10 часов", 4, 8);

  assert.equal(result.applied, false);
});

test("разбор возвращает и формулы, и остаток текста", () => {
  const { formulas, remainingText } = parseFormulas("@факт+10 закрыл задачу");

  assert.equal(formulas.length, 1);
  assert.equal(formulas[0].target, "fact");
  assert.equal(formulas[0].op, "+");
  assert.equal(formulas[0].operand, 10);
  assert.equal(remainingText, "закрыл задачу");
});
