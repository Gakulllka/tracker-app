/**
 * Тесты слияния импортируемых задач с текущим месяцем.
 *
 * Главное, что проверяется, — «оживление» удалённых задач. Удаление в трекере
 * мягкое: строка остаётся в месяце с флагом _deleted. Если импорт создаст
 * новую строку с тем же номером вместо возврата старой, в месяце окажутся
 * два дубля с одним num, и серверная синхронизация начнёт схлопывать их
 * непредсказуемо. Ошибка тихая и всплывает далеко от места возникновения.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeImportedTasks } from "@/lib/task-import";
import type { Task } from "@/lib/types";
import type { ImportedTask } from "@/lib/task-import";

const NOW = 1_700_000_000_000;

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

function imported(over: Partial<ImportedTask> = {}): ImportedTask {
  return {
    num: "200",
    name: "Из файла",
    planH: "10",
    factH: "0",
    priority: "Высокий" as ImportedTask["priority"],
    status: "Новая" as ImportedTask["status"],
    comment: "",
    ...over,
  };
}

test("новая задача добавляется к месяцу", () => {
  const result = mergeImportedTasks([task()], { updatedTasks: [], newTasks: [imported()] }, NOW);

  assert.equal(result.added, 1);
  assert.equal(result.revived, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].num, "200");
  assert.equal(result.rows[1]._ts, NOW);
});

test("удалённая задача с тем же номером оживает, а не дублируется", () => {
  const tombstone = task({ id: "old-id", num: "200", _deleted: true, commentLog: [{ text: "история" } as never] });

  const result = mergeImportedTasks(
    [tombstone],
    { updatedTasks: [], newTasks: [imported({ num: "200" })] },
    NOW,
  );

  assert.equal(result.rows.length, 1, "дубль не создан");
  assert.equal(result.added, 0);
  assert.equal(result.revived, 1);

  const revived = result.rows[0];
  assert.equal(revived.id, "old-id", "id сохранён");
  assert.equal(revived._deleted, false, "флаг удаления снят");
  assert.equal(revived.name, "Из файла", "содержимое перезаписано");
  assert.equal(revived.commentLog.length, 1, "история комментариев не потеряна");
});

test("номер сверяется без учёта пробелов по краям", () => {
  const tombstone = task({ id: "old-id", num: " 200 ", _deleted: true });

  const result = mergeImportedTasks(
    [tombstone],
    { updatedTasks: [], newTasks: [imported({ num: "200  " })] },
    NOW,
  );

  assert.equal(result.revived, 1);
  assert.equal(result.rows.length, 1);
});

test("удалённая задача с другим номером не мешает создать новую", () => {
  const tombstone = task({ id: "old-id", num: "999", _deleted: true });

  const result = mergeImportedTasks(
    [tombstone],
    { updatedTasks: [], newTasks: [imported({ num: "200" })] },
    NOW,
  );

  assert.equal(result.added, 1);
  assert.equal(result.revived, 0);
  assert.equal(result.rows.length, 2);
});

test("существующая задача обновляется на месте", () => {
  const existing = task({ id: "id-1", name: "Старое имя" });
  const update = task({ id: "id-1", name: "Новое имя" });

  const result = mergeImportedTasks([existing], { updatedTasks: [update], newTasks: [] }, NOW);

  assert.equal(result.updated, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].name, "Новое имя");
  assert.equal(result.rows[0]._ts, NOW, "метка времени поднята для LWW");
});

test("задачи вне импорта остаются нетронутыми", () => {
  const untouched = task({ id: "keep", num: "777", _ts: 1 });

  const result = mergeImportedTasks(
    [untouched],
    { updatedTasks: [], newTasks: [imported({ num: "200" })] },
    NOW,
  );

  const kept = result.rows.find((r) => r.id === "keep");
  assert.equal(kept?._ts, 1, "чужая метка времени не тронута");
  assert.equal(kept?.num, "777");
});

test("пустой импорт ничего не меняет", () => {
  const rows = [task()];
  const result = mergeImportedTasks(rows, { updatedTasks: [], newTasks: [] }, NOW);

  assert.deepEqual(result.rows, rows);
  assert.equal(result.added + result.revived + result.updated, 0);
});
