import type { StateStorage } from "zustand/middleware";

/**
 * Хранилище состояния в localStorage, разделённое по рабочим пространствам.
 *
 * У каждого пользователя своя запись — `task-tracker-store-ws-<workspaceId>`.
 * Без разделения вход под другим аккаунтом на том же компьютере затирал бы
 * локальные данные предыдущего.
 *
 * Есть переходный слой: если запись для пространства пуста, а старый общий
 * ключ `task-tracker-store` ещё содержит данные, они копируются в новый ключ.
 * Так пользователи, заставшие прежний формат, не теряют несинхронизированные
 * правки при первом входе после обновления.
 */

const LEGACY_KEY = "task-tracker-store";

/** Дописывает к ключу идентификатор текущего пространства. */
function workspaceKey(name: string): string {
  if (typeof window === "undefined") return name;

  const workspaceId = localStorage.getItem("auth_workspace");
  return workspaceId ? `${name}-ws-${workspaceId}` : name;
}

export const workspaceStorage: StateStorage = {
  getItem: (name) => {
    const key = workspaceKey(name);
    const value = localStorage.getItem(key);

    if (value || key === name) return value;

    // Переезд со старого общего ключа — выполняется один раз.
    const legacy = localStorage.getItem(name);
    if (!legacy) return null;

    try {
      localStorage.setItem(key, legacy);
      return legacy;
    } catch {
      // Переполнено хранилище: отдаём данные, но не копируем.
      return legacy;
    }
  },

  setItem: (name, value) => {
    localStorage.setItem(workspaceKey(name), value);
  },

  removeItem: (name) => {
    localStorage.removeItem(workspaceKey(name));
  },
};

export { LEGACY_KEY };
