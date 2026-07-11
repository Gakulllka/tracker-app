/**
 * Смоук-тесты: минимальная проверка, что приложение живо.
 *  1. Экран входа рендерится.
 *  2. Регистрация отклоняет короткий пароль (<4 символов).
 *  3. Полный проход: регистрация → вход в приложение → шапка на месте.
 *
 * Требуют запущенного приложения с живой базой (см. playwright.config.ts).
 * Тест регистрации создаёт пользователя smoke_<timestamp> — чистить не
 * обязательно, но можно удалять через админку.
 */
import { test, expect } from "@playwright/test";

test("экран входа рендерится", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Вход в систему")).toBeVisible();
  await expect(page.getByPlaceholder("Введите логин")).toBeVisible();
});

test("регистрация отклоняет короткий пароль", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Нет аккаунта? Зарегистрироваться").click();
  await page.getByPlaceholder("Введите логин").fill(`smoke_${Date.now()}`);
  await page.getByPlaceholder("Можно оставить пустым").fill("123"); // 3 символа
  await page.getByRole("button", { name: /Создать аккаунт/ }).click();
  await expect(page.getByText(/минимум 4 символа/i)).toBeVisible();
});

test("регистрация и вход в приложение", async ({ page }) => {
  const username = `smoke_${Date.now()}`;
  await page.goto("/");
  await page.getByText("Нет аккаунта? Зарегистрироваться").click();
  await page.getByPlaceholder("Введите логин").fill(username);
  await page.getByPlaceholder("Можно оставить пустым").fill("test1234");
  await page.getByRole("button", { name: /Создать аккаунт/ }).click();

  // Попадаем в приложение: видна шапка с индикатором синхронизации
  await expect(
    page.getByText(/Синхронизировано|Загрузка|Ожидает/).first()
  ).toBeVisible({ timeout: 20_000 });
});
