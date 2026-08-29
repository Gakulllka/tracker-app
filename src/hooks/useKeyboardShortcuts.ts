import { useEffect } from "react";

/** Вкладки, доступные по Ctrl+1…Ctrl+5 — в порядке нумерации. */
const VIEW_HOTKEYS = ["table", "backlog", "questions", "slides", "protocols"] as const;

export interface KeyboardShortcutsOptions {
  /** Открыть/закрыть палитру команд (Ctrl+K). */
  togglePalette: () => void;
  undo: () => void;
  redo: () => void;
  /** Создать задачу (Ctrl+N). Не сработает в режиме только чтения. */
  createTask: () => void;
  /** Выгрузить данные (Ctrl+S). */
  exportJson: () => void;
  /** Переключить вкладку (Ctrl+1…5). */
  setView: (view: string) => void;
  /** Какие вкладки разрешены текущему пользователю. */
  allowedTabs?: Set<string>;
  /** Только просмотр — создание задач заблокировано. */
  readOnly: boolean;
  /** Закрыть верхний открытый диалог (Escape). Возвращает true, если было что закрывать. */
  closeTopDialog: () => boolean;
  /** Удалить выделенную задачу (Delete). */
  deleteSelected: () => void;
  /** Идёт ли сейчас инлайн-редактирование ячейки. */
  isEditing: boolean;
}

/**
 * Вешает глобальные горячие клавиши на window.
 *
 * Раскладка учитывается: Ctrl+K ловится и на латинской «k», и на русской «л» —
 * иначе палитра не открывалась бы при включённой кириллице.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  // Опции меняются на каждом рендере, поэтому эффект читает их из ref-подобной
  // замкнутой переменной, а подписка на window ставится один раз.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === "k" || e.key === "л")) {
        e.preventDefault();
        options.togglePalette();
        return;
      }

      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        options.undo();
        return;
      }

      if (mod && ((e.shiftKey && e.key === "Z") || e.key === "y")) {
        e.preventDefault();
        options.redo();
        return;
      }

      if (mod && e.key === "n") {
        e.preventDefault();
        if (!options.readOnly) options.createTask();
        return;
      }

      if (mod && e.key === "s") {
        e.preventDefault();
        options.exportJson();
        return;
      }

      if (mod && e.key === "f") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Поиск задач"]',
        );
        search?.focus();
        return;
      }

      if (mod && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const view = VIEW_HOTKEYS[Number(e.key) - 1];
        if (view && (!options.allowedTabs || options.allowedTabs.has(view))) {
          options.setView(view);
        }
        return;
      }

      if (e.key === "Escape") {
        options.closeTopDialog();
        return;
      }

      if (e.key === "Delete" && !options.isEditing) {
        e.preventDefault();
        options.deleteSelected();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
}
