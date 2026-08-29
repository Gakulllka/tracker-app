/**
 * Тесты корзин вопросов и срока ожидания.
 *
 * Склонение «день / дня / дней» в русском счёте ошибается чаще всего
 * на числах 11–14: «11 дней», но «21 день». Проверяется отдельно,
 * потому что при двадцати пользователях эта надпись будет на экране
 * постоянно, и кривая форма бросается в глаза.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupQuestions, bucketOf, waitingSince } from "@/lib/question-buckets";
import type { Question } from "@/lib/questions";

function question(status: Question["status"], over: Partial<Question> = {}): Question {
  return {
    id: crypto.randomUUID(),
    text: "Вопрос",
    author: "Фёдор",
    answers: [],
    status,
    ...over,
  };
}

test("вопросы раскладываются по корзинам", () => {
  const { byBucket, counts } = groupQuestions([
    question("open"),
    question("open"),
    question("answered"),
    question("archived"),
    question("archived"),
    question("archived"),
  ]);

  assert.deepEqual(counts, { waiting: 2, reopened: 0, answered: 1, archived: 3 });
  assert.equal(byBucket.waiting.length, 2);
});

test("пустой список даёт нули, а не пропуски", () => {
  const { counts } = groupQuestions([]);

  assert.deepEqual(counts, { waiting: 0, reopened: 0, answered: 0, archived: 0 });
});

test("возобновлённый вопрос попадает в свою корзину, а не к открытым", () => {
  assert.equal(bucketOf(question("reopened")), "reopened");
  assert.equal(bucketOf(question("open")), "waiting");
});

/* ------------------------- срок ожидания ------------------------- */

const NOW = new Date("2026-08-29T12:00:00");

test("вопрос того же дня — «Сегодня»", () => {
  const info = waitingSince("2026-08-29T09:41:00", NOW);

  assert.equal(info.days, 0);
  assert.equal(info.label, "Сегодня");
  assert.equal(info.overdue, false);
});

test("склонение дней", () => {
  const label = (iso: string) => waitingSince(iso, NOW).label;

  assert.equal(label("2026-08-28T09:00:00"), "Ждёт 1 день");
  assert.equal(label("2026-08-27T09:00:00"), "Ждёт 2 дня");
  assert.equal(label("2026-08-24T09:00:00"), "Ждёт 5 дней");
  assert.equal(label("2026-08-18T09:00:00"), "Ждёт 11 дней", "11–14 всегда «дней»");
  assert.equal(label("2026-08-08T09:00:00"), "Ждёт 21 день", "21 — снова «день»");
  assert.equal(label("2026-08-07T09:00:00"), "Ждёт 22 дня");
});

test("дольше трёх дней — повод обратить внимание", () => {
  assert.equal(waitingSince("2026-08-26T09:00:00", NOW).overdue, false, "ровно 3 дня");
  assert.equal(waitingSince("2026-08-25T09:00:00", NOW).overdue, true, "4 дня");
});

test("без даты и с мусором вместо даты срок не считается", () => {
  assert.equal(waitingSince(undefined, NOW).label, "");
  assert.equal(waitingSince("не дата", NOW).label, "");
});

test("дата из будущего не даёт отрицательных дней", () => {
  assert.equal(waitingSince("2026-09-10T09:00:00", NOW).days, 0);
});
