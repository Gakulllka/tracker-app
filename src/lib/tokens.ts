import { PRIORITIES, STATUSES } from "./types";
import type { Priority, Status } from "./types";

/**
 * Единственный источник цвета в проекте.
 *
 * Две независимые части, и их нельзя смешивать.
 *
 * ХРОМ — монохром. Чернила на бумаге, по канону «Графит и бумага».
 * Никаких произвольных акцентов: выбор цвета темы был в продукте раньше
 * и удалён намеренно, возвращать его не нужно. Цвет в хроме допустим
 * ровно один — опасность.
 *
 * СТАТУСЫ И ПРИОРИТЕТЫ — цветные, и это осознанное исключение.
 * Палитра повторяет цвета Planfix и служит визуальным мостиком между
 * Delta и этой внешней системой: человек, работающий в обеих, узнаёт
 * статус по цвету не читая. Схлопывать её в четыре «фазы» ради
 * монохрома НЕЛЬЗЯ — это потеря связи, а не наведение порядка.
 * Именно потому, что вокруг всё чёрно-белое, эти цвета и читаются.
 */

/* ─────────────────────────── Хром ─────────────────────────── */

/** Чернила — акцент светлой темы, текст, контуры. */
export const INK = "#17181C";
/** Бумага — фон светлой темы, текст на графите. */
export const PAPER = "#FAFAF8";
/** Графит — фон тёмной темы и рельсы. */
export const GRAPHITE = "#131418";

export const LIGHT = {
  accent: INK,
  bg: PAPER,
  card: "#FFFFFF",
  text: INK,
  textMuted: "#5D5D57",
  border: "#DEDDD6",
  danger: "#C6453F",
} as const;

export const DARK = {
  accent: "#F5F5F2",
  bg: GRAPHITE,
  card: "#1A1B20",
  text: "#F5F5F2",
  textMuted: "#ABABA5",
  border: "#34353C",
  danger: "#E0706A",
} as const;

/**
 * Семантика состояния — единственный цвет, разрешённый в хроме.
 * Значения каноничные из ДНК, а не из палитры Tailwind: приглушённые,
 * не кричащие. Раньше в коде стояли #22c55e и #ef4444 — они ярче
 * и спорили с палитрой статусов.
 *
 * Переменные CSS, а не hex: в тёмной теме те же имена дают другие значения.
 */
export const STATE = {
  /** Перерасход, ошибка, удаление. */
  danger: "var(--tracker-danger)",
  /** План выполнен. */
  success: "var(--tracker-success)",
  /** Требует внимания, но не ошибка. */
  warning: "var(--tracker-warning)",
  /** Нейтральное состояние — чернила. */
  neutral: "var(--tracker-accent)",
} as const;

/** Рельса графитовая в обеих темах — это подпись бренда. */
export const RAIL = {
  bg: INK,
  text: PAPER,
  muted: "rgba(250, 250, 248, 0.74)",
  faint: "rgba(250, 250, 248, 0.50)",
  line: "rgba(250, 250, 248, 0.12)",
  hover: "rgba(250, 250, 248, 0.08)",
} as const;

/**
 * Парадная дверь — вход, выбор домена, заставка.
 *
 * Выглядит одинаково в любой теме, поэтому значения фиксированные,
 * а не переменные CSS: у переменных на то и разные значения в темах.
 */
export const DOOR = {
  ink: INK,
  inkSoft: "#26282E",
  paper: PAPER,
  card: "#FFFFFF",
  line: "#DEDDD6",
  text: "#1C1D21",
  muted: "#8B8A84",
  danger: "#C6453F",
} as const;

/* ─────────────── Статусы и приоритеты (палитра Planfix) ─────────────── */

// Priority colors
export const PCOL: Record<Priority, string> = {
  [PRIORITIES.HIGHEST]: "#d45454",
  [PRIORITIES.HIGH]: "#d48040",
  [PRIORITIES.MEDIUM]: "#b89830",
  [PRIORITIES.LOW]: "#4a9a5a",
  [PRIORITIES.QUEUE]: "#7a6ab0",
};

// Status colors (default / light)
export const SCOL: Partial<Record<Status, string>> = {
  [STATUSES.IDEA]: "#ffad00",
  [STATUSES.NEW]: "#4fc3f7",
  [STATUSES.ANALYSIS]: "#ce93d8",
  [STATUSES.QUEUE_DEV]: "#008796",
  [STATUSES.DEV]: "#7cc3fc",
  [STATUSES.TEST]: "#5719a3",
  [STATUSES.DOCS]: "#f48fb1",
  [STATUSES.APPROVAL]: "#ff9400",
  [STATUSES.RELEASE]: "#ea4e98",
  [STATUSES.PROD_CHECK]: "#d2ff7a",
  [STATUSES.DONE]: "#042a0f",
  [STATUSES.POSTPONED]: "#8b8b8b",
  [STATUSES.COMPLETED]: "#30ab50",
  [STATUSES.CANCEL]: "#d45454",
};

// Status colors override for dark theme (better readability on dark bg)
const SCOL_DARK_FIX: Partial<Record<Status, string>> = {
  [STATUSES.IDEA]: "#ffc740",
  [STATUSES.NEW]: "#29b6f6",
  [STATUSES.COMPLETED]: "#66d880",
  [STATUSES.QUEUE_DEV]: "#4dd0e1",
  [STATUSES.ANALYSIS]: "#e1bee7",
  [STATUSES.DOCS]: "#f8bbd0",
  [STATUSES.APPROVAL]: "#ffb74d",
  [STATUSES.RELEASE]: "#f48fb1",
  [STATUSES.DONE]: "#4caf50",
  [STATUSES.PROD_CHECK]: "#c8f560",
  [STATUSES.DEV]: "#90caf9",
  [STATUSES.TEST]: "#b388ff",
};

// Status colors override for light theme (better readability on light bg)
const SCOL_LIGHT_FIX: Partial<Record<Status, string>> = {
  [STATUSES.IDEA]: "#cc8a00",
  [STATUSES.NEW]: "#03a9f4",
  [STATUSES.ANALYSIS]: "#9c27b0",
  [STATUSES.DOCS]: "#c2185b",
  [STATUSES.APPROVAL]: "#e65100",
  [STATUSES.RELEASE]: "#c2185b",
  [STATUSES.PROD_CHECK]: "#558b2f",
  [STATUSES.DEV]: "#1976d2",
};

// Get status color adapted for current theme
export const scolText = (st: Status, isDark: boolean): string =>
  isDark
    ? (SCOL_DARK_FIX[st] || SCOL[st] || "")
    : (SCOL_LIGHT_FIX[st] || SCOL[st] || "");
