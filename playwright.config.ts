/**
 * Конфиг смоук-тестов. Требует живую базу (DATABASE_URL) — в CI задаётся
 * через секрет TEST_DATABASE_URL, локально — через .env.
 * Локальный запуск: npm i -D @playwright/test && npx playwright test
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
