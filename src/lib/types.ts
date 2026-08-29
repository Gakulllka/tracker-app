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

// Палитра статусов и приоритетов живёт в lib/tokens.ts — там объяснено, почему
// она цветная и почему её нельзя схлопывать. Импортировать оттуда напрямую.

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
  taskComments?: TaskComment[];
  visibleTo?: string; // JSON array of user IDs — who can see this task

  // ── Delta fields (Монитор БА + Монитор Руководителя) ──────────────────────
  /** Общий запрошенный бюджет задачи в часах (может быть > лимита месяца). */
  totalBudgetRequested?: number;
  /** Часы, зарезервированные в ТЕКУЩЕМ месяце (считается через ролловер). */
  budgetAllocated?: number;
  /** Остаток бюджета для переноса в следующие месяцы. */
  budgetRollover?: number;
  /** Задача первая на отсечение при нехватке бюджета. */
  isFirstToCut?: boolean;
  /** Руководитель зафиксировал: задачу НЕ отсекать при нехватке бюджета. */
  excludeFromCut?: boolean;
  /** Флаг от руководителя: "escalate" | "pause" | "cancel" | "request_status". */
  executiveFlag?: "escalate" | "pause" | "cancel" | "request_status";
  /**
   * Статус подтверждения БА:
   * "approved"  — подтверждено (дефолт для существующих задач)
   * "pending"   — руководитель хочет взять задачу, БА ещё не подтвердил
   * "rejected"  — БА отклонил
   */
  approvalStatus?: "approved" | "pending" | "rejected";
  /** Количество дней в текущем статусе (обновляется клиентом). */
  daysInStatus?: number;
  /** Дата последней смены статуса (ISO-строка, для расчёта daysInStatus). */
  statusChangedAt?: string;
}

export interface CommentEntry {
  date: string;
  week: string;
  text: string;
  planH: string;
  factH: string;
  status: Status;
  /** Автор комментария (username/displayName). Опционально — старые записи без автора. */
  author?: string;
}

export interface TaskComment {
  id: string;
  author: string;
  date: string;
  text: string;
  attachments?: string[];
  replies?: TaskComment[];
}

// Domain (workspace)
export interface Domain {
  id: string;
  name: string;
}

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

const STATUS_PHASES = {
  NEW: "new",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  CANCEL: "cancel",
} as const;
type StatusPhase = typeof STATUS_PHASES[keyof typeof STATUS_PHASES];

const STATUS_TO_PHASE: Record<Status, StatusPhase> = {
  [STATUSES.IDEA]: "new",
  [STATUSES.NEW]: "new",
  [STATUSES.ANALYSIS]: "in_progress",
  [STATUSES.APPROVAL]: "in_progress",
  [STATUSES.QUEUE_DEV]: "in_progress",
  [STATUSES.DEV]: "in_progress",
  [STATUSES.TEST]: "in_progress",
  [STATUSES.RELEASE]: "in_progress",
  [STATUSES.DOCS]: "in_progress",
  [STATUSES.COMPLETED]: "done",
  [STATUSES.PROD_CHECK]: "done",
  [STATUSES.DONE]: "done",
  [STATUSES.POSTPONED]: "cancel",
  [STATUSES.CANCEL]: "cancel",
};

export const getPhaseForStatus = (status: Status): StatusPhase =>
  STATUS_TO_PHASE[status] ?? "in_progress";
