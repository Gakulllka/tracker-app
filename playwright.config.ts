/**
 * Конфиг смоук-тестов. Требует живую базу (DATABASE_URL) — в CI задаётся
 * через секрет TEST_DATABASE_URL, локально — через .env.
 * Локальный запуск: npm i -D @playwright/test && npx playwright test
 */
import { defineConfig } from "@playwright/test";

const PORT = process.env.PORT ?? "3003";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
