/**
 * Запускатель Next.js с портом из .env.
 *
 * Зачем он нужен: Next.js читает порт из переменной окружения PORT, но сам
 * файл .env для этого не открывает. Без этой обёртки порт пришлось бы
 * дублировать в package.json, playwright.config.ts и скриптах запуска —
 * именно так он в проекте и разъехался на три разных значения.
 *
 * Теперь порт задан ровно в одном месте — в .env. Работает одинаково
 * на Windows, macOS и Linux, без дополнительных зависимостей.
 *
 * Использование:  node scripts/run.mjs dev
 *                 node scripts/run.mjs start
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const DEFAULT_PORT = "3003";

/** Читает пары КЛЮЧ=ЗНАЧЕНИЕ из .env-файла, не перетирая уже заданные извне. */
function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// .env.local приоритетнее .env — так же, как это делает сам Next.js.
loadEnvFile(".env.local");
loadEnvFile(".env");

process.env.PORT ||= DEFAULT_PORT;

const command = process.argv[2];
if (command !== "dev" && command !== "start") {
  console.error("Использование: node scripts/run.mjs dev|start");
  process.exit(1);
}

const args = command === "dev" ? ["dev", "--webpack"] : ["start"];

console.log(`Delta-tasker → http://localhost:${process.env.PORT}`);

const child = spawn("next", args, { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
