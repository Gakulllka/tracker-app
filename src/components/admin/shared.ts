/**
 * Общие типы и помощники админ-панели.
 *
 * Панель разбита на четыре независимые вкладки (пользователи, логи, роли,
 * онлайн). Всё, чем они пользуются сообща, собрано здесь, чтобы вкладки
 * не тянули друг друга.
 */

// ===================== TYPES =====================

export interface User {
  id: string;
  username: string;
  displayName: string;
  status: string;
  roleId: string;
  role: { id: string; name: string; description: string };
  createdAt: string;
  updatedAt: string;
  sessions: { id: string; createdAt: string; expiresAt: string; lastActivity: string }[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string; // JSON
  isSystem: boolean;
  createdAt: string;
  _count: { users: number };
}

export interface Session {
  id: string;
  token: string;
  ipAddress: string;
  lastActivity: string;
  currentPage: string;
  createdAt: string;
  expiresAt: string;
  isOnline: boolean;
  user: { id: string; username: string; displayName: string; status: string; role: { name: string } };
}

export interface LogEntry {
  id: string;
  userId: string;
  username: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: string;
  newValue: string;
  ipAddress: string;
  createdAt: string;
}

export type TabKey = "users" | "logs" | "roles" | "online";

// ===================== HELPERS =====================

export function getToken(): string {
  return localStorage.getItem("auth_token") || "";
}

export function apiHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export function formatDate(d: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return d; }
}

export function timeAgo(d: string): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин. назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн. назад`;
}

export const ACTION_LABELS: Record<string, string> = {
  login: "Вход", logout: "Выход", register: "Регистрация",
  role_change: "Смена роли", permission_change: "Смена прав",
  user_delete: "Удаление пользователя", user_block: "Блокировка",
  user_unblock: "Разблокировка", user_update: "Обновление",
  session_end: "Завершение сессии", role_create: "Создание роли",
  role_update: "Обновление роли", role_delete: "Удаление роли",
  task_create: "Создание задачи", task_update: "Обновление задачи",
  task_delete: "Удаление задачи", export: "Экспорт",
};

/** Цветовые группы для бейджей действий. Не меняем разметку — только цвета. */
export function actionBadgeClass(action: string): string {
  if (action.startsWith("task_")) {
    if (action === "task_create") return "bg-green-100 text-green-700";
    if (action === "task_delete") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700"; // task_update
  }
  if (action.startsWith("role_") || action.startsWith("permission_")) {
    return "bg-purple-100 text-purple-700";
  }
  if (action === "login" || action === "register") return "bg-blue-100 text-blue-700";
  if (action === "logout" || action === "session_end") return "bg-gray-100 text-gray-600";
  if (action.startsWith("user_")) return "bg-pink-100 text-pink-700";
  return "bg-blue-100 text-blue-700";
}

export const PERM_LABELS: Record<string, string> = {
  canViewTasks: "Просмотр задач", canEditTasks: "Редактирование задач", canDeleteTasks: "Удаление задач",
  canViewBacklog: "Просмотр бэклога", canEditBacklog: "Редактирование бэклога", canDeleteBacklog: "Удаление бэклога",
  canViewQuestions: "Просмотр вопросов", canEditQuestions: "Редактирование вопросов", canDeleteQuestions: "Удаление вопросов",
  canViewPresentations: "Просмотр презентаций", canCreatePresentations: "Создание презентаций",
  canUseAI: "Доступ к AI чату", visibleDomains: "Видимость доменов",
};

// ===================== CONFIRM DIALOG =====================
