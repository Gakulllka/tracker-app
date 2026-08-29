/**
 * Проверка синтаксиса таблиц стилей.
 *
 * Слепое пятно проекта: `tsc` в CSS не заглядывает, тесты компонентов
 * тоже, а `next build` в этой среде не запускается. Поэтому лишняя
 * скобка в globals.css доезжала до пользователя и роняла сборку.
 *
 * Файл большой (полторы тысячи строк) и правится часто, так что разбор
 * настоящим парсером стоит секунды и окупается сразу.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const CSS_DIR = "src/app";

function cssFiles(): string[] {
  return readdirSync(CSS_DIR)
    .filter((name) => name.endsWith(".css"))
    .map((name) => join(CSS_DIR, name));
}

test("все таблицы стилей разбираются без синтаксических ошибок", () => {
  const files = cssFiles();
  assert.ok(files.length > 0, "не найдено ни одного css-файла");

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotThrow(
      () => postcss.parse(source, { from: file }),
      `${file} не разбирается`,
    );
  }
});

test("в globals.css нет пустых правил", () => {
  // Пустое правило почти всегда след неудачного удаления блока.
  const root = postcss.parse(readFileSync(join(CSS_DIR, "globals.css"), "utf8"));
  const empty: string[] = [];

  root.walkRules((rule) => {
    if (rule.nodes.length === 0) empty.push(rule.selector);
  });

  assert.deepEqual(empty, [], `пустые правила: ${empty.join(", ")}`);
});

test("каждый --tracker-* объявлен и в светлой теме, и в тёмной", () => {
  const root = postcss.parse(readFileSync(join(CSS_DIR, "globals.css"), "utf8"));

  const light = new Set<string>();
  const dark = new Set<string>();
  const used = new Set<string>();

  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--tracker-")) {
      const parent = decl.parent as { selector?: string } | undefined;
      if (parent?.selector === ":root") light.add(decl.prop);
      if (parent?.selector === ".dark") dark.add(decl.prop);
    }
    for (const match of decl.value.matchAll(/var\((--tracker-[a-z-]+)/g)) {
      used.add(match[1]);
    }
  });

  const missingInDark = [...light].filter((name) => !dark.has(name));
  assert.deepEqual(missingInDark, [], `нет в .dark: ${missingInDark.join(", ")}`);

  const undeclared = [...used].filter((name) => !light.has(name));
  assert.deepEqual(
    undeclared,
    [],
    `используются, но не объявлены в :root: ${undeclared.join(", ")}`,
  );
});
