/**
 * Тесты разбора Excel-файла с задачами.
 *
 * Проверяется то, что ломается тихо: распознавание колонок по названиям
 * (файлы приходят от разных людей с разными заголовками), отсев строки
 * «Итого» (иначе она заедет в трекер как обычная задача) и разметка строк
 * при сверке с месяцем.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHeaders, isTotalRow, buildDiff } from "@/lib/excel-import";
import type { ParsedRow } from "@/lib/excel-import";
import type { Task } from "@/lib/types";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "id-1",
    num: "100",
    name: "Задача",
    planH: "8",
    factH: "4",
    priority: "Средний" as Task["priority"],
    status: "Разработка" as Task["status"],
    comment: "",
    commentLog: [],
    ...over,
  };
}

function parsed(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    num: "100",
    name: "Задача",
    planH: "8",
    factH: "4",
    priority: "Средний" as ParsedRow["priority"],
    status: "Разработка" as ParsedRow["status"],
    comment: "",
    ...over,
  } as ParsedRow;
}

test("обязательные колонки распознаются", () => {
  const { missing, map } = detectHeaders(["Номер", "Задача"]);

  assert.deepEqual(missing, [], "обе обязательные колонки на месте");
  assert.equal(map.get("Номер"), "num");
  assert.equal(map.get("Задача"), "name");
});

test("отсутствие обязательной колонки сообщается явно", () => {
  const { missing } = detectHeaders(["Задача", "План"]);

  assert.deepEqual(missing, ["Номер"]);
});

test("регистр и лишние пробелы в заголовках не мешают", () => {
  const { missing } = detectHeaders(["  НОМЕР  ", "задача"]);

  assert.deepEqual(missing, [], "заголовки нормализуются перед сверкой");
});

test("неизвестные колонки просто игнорируются", () => {
  const { map, missing } = detectHeaders(["Номер", "Задача", "Ответственный", ""]);

  assert.deepEqual(missing, []);
  assert.equal(map.has("Ответственный"), false, "лишняя колонка не попала в карту");
  assert.equal(map.has(""), false, "пустой заголовок пропущен");
});

test("строка «Итого» распознаётся во всех написаниях", () => {
  assert.equal(isTotalRow("", "Итого"), true);
  assert.equal(isTotalRow("", "ИТОГО:"), true);
  assert.equal(isTotalRow("", " итого. "), true);
  assert.equal(isTotalRow("", "Total"), true);
  assert.equal(isTotalRow("Итого", ""), true);
});

test("обычная задача не принимается за строку «Итого»", () => {
  assert.equal(isTotalRow("100", "Итоговый отчёт по проекту"), false);
  assert.equal(isTotalRow("100", "Задача"), false);
});

test("сверка помечает задачу как новую, если номера нет в месяце", () => {
  const diff = buildDiff([task({ num: "100" })], [parsed({ num: "555" })]);

  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "new");
});

test("сверка помечает совпадающую задачу как «без изменений»", () => {
  const existing = task({ num: "100", name: "Задача", planH: "8", factH: "4" });
  const diff = buildDiff([existing], [parsed({ num: "100", name: "Задача", planH: "8", factH: "4" })]);

  assert.equal(diff[0].kind, "same");
  assert.equal(diff[0].changes.length, 0);
});

test("сверка перечисляет конкретные изменённые поля", () => {
  const existing = task({ num: "100", name: "Старое имя", planH: "8" });
  const diff = buildDiff([existing], [parsed({ num: "100", name: "Новое имя", planH: "16" })]);

  assert.equal(diff[0].kind, "changed");

  const fields = diff[0].changes.map((c) => c.key).sort();
  assert.deepEqual(fields, ["name", "planH"], "перечислены ровно изменившиеся поля");

  const name = diff[0].changes.find((c) => c.key === "name");
  assert.equal(name?.from, "Старое имя");
  assert.equal(name?.to, "Новое имя");
});

test("удалённые задачи не участвуют в сверке как существующие", () => {
  const deleted = task({ num: "100", _deleted: true });
  const diff = buildDiff([deleted], [parsed({ num: "100" })]);

  assert.equal(diff[0].kind, "new", "задача в корзине не считается существующей");
});
