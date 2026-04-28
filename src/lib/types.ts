// Status enum
export const STATUSES = {
  IDEA: "Идея",
  NEW: "Новая",
  ANALYSIS: "Анализ",
  APPROVAL: "Согласование",
  QUEUE_DEV: "В очереди на разработку",
  DEV: "Разработка",
  TEST: "Тестирование",
  RELEASE: "В релиз",
  DOCS: "Документация",
  COMPLETED: "Выполненная",
  PROD_CHECK: "Контроль на прод",
  DONE: "Завершенная",
  POSTPONED: "Отложенная",
  CANCEL: "Отменено",
} as const;
export type Status = (typeof STATUSES)[keyof typeof STATUSES];

// Priority enum
export const PRIORITIES = {
  HIGHEST: "Наивысший",
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
  QUEUE: "Очередь",
} as const;
export type Priority = (typeof PRIORITIES)[keyof typeof PRIORITIES];

// Task
export interface Task {
  id: string;
  num: string;
  name: string;
  planH: string;
  factH: string;
  // Sync metadata
  _ts?: number;       // Last-modified timestamp (ms). Used for concurrent conflict resolution.
  _deleted?: boolean; // Soft-delete tombstone. Filtered from UI; persists on server for sync.
  priority: Priority;
  status: Status;
  comment: string;
  commentLog: CommentEntry[];
  _hidden?: boolean;
}

export interface CommentEntry {
  date: string;
  week: string;
  text: string;
  planH: string;
  factH: string;
  status: Status;
}

// Domain (workspace)
export interface Domain {
  id: string;
  name: string;
}

// Month data = array of tasks, indexed 0-11
export type MonthData = Task[][];
export type AllData = Record<number, Task[]>;

// Task metrics
export interface TaskMetrics {
  plan: number;
  fact: number;
  totalH: number;
  prog: number;
  over: boolean;
  variance: number;
}

// Table column config
export interface Column {
  key: string;
  label: string;
  type: string;
  minW: number;
  sortable: boolean;
}

// Column definitions (export as const)
export const COLS: Column[] = [
  { key: "name", label: "Наименование", type: "text", minW: 260, sortable: true },
  { key: "planH", label: "План, ч", type: "expr", minW: 90, sortable: true },
  { key: "factH", label: "Факт, ч", type: "expr", minW: 90, sortable: true },
  { key: "totalH", label: "Итого, ч", type: "totalH", minW: 85, sortable: true },
  { key: "priority", label: "Приоритет", type: "priority", minW: 141, sortable: true },
  { key: "queue", label: "Очередь", type: "queue", minW: 76, sortable: true },
  { key: "status", label: "Статус", type: "status", minW: 220, sortable: true },
  { key: "progress", label: "Прогресс", type: "progress", minW: 170, sortable: true },
  { key: "comment", label: "Комментарий", type: "text", minW: 260, sortable: false },
];

export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

export const NAV_CELLS = ["num", "name", "planH", "factH", "priority", "status", "comment"];

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

export const STATUS_ORDER: Record<Status, number> = {
  [STATUSES.IDEA]: 0,
  [STATUSES.NEW]: 1,
  [STATUSES.ANALYSIS]: 2,
  [STATUSES.APPROVAL]: 3,
  [STATUSES.QUEUE_DEV]: 4,
  [STATUSES.DEV]: 5,
  [STATUSES.TEST]: 6,
  [STATUSES.RELEASE]: 7,
  [STATUSES.DOCS]: 8,
  [STATUSES.COMPLETED]: 9,
  [STATUSES.PROD_CHECK]: 10,
  [STATUSES.DONE]: 11,
  [STATUSES.POSTPONED]: 12,
  [STATUSES.CANCEL]: 13,
};

export const PRIO_START: Record<Priority, number> = {
  [PRIORITIES.HIGHEST]: 10,
  [PRIORITIES.HIGH]: 20,
  [PRIORITIES.MEDIUM]: 30,
  [PRIORITIES.LOW]: 40,
  [PRIORITIES.QUEUE]: 50,
};
