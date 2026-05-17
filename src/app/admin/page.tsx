"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, ScrollText, Shield, Wifi,
  Plus, Trash2, Lock, Unlock, LogOut, Search,
  ChevronDown, ChevronUp, Loader2, AlertTriangle, Eye, Pencil,
  Check, X, RefreshCw, Filter, Download
} from "lucide-react";

// ===================== TYPES =====================

interface User {
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

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string; // JSON
  isSystem: boolean;
  createdAt: string;
  _count: { users: number };
}

interface Session {
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

interface LogEntry {
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

type TabKey = "users" | "logs" | "roles" | "online";

// ===================== HELPERS =====================

function getToken(): string {
  return localStorage.getItem("auth_token") || "";
}

function apiHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

function formatDate(d: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return d; }
}

function timeAgo(d: string): string {
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

const ACTION_LABELS: Record<string, string> = {
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
function actionBadgeClass(action: string): string {
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

const PERM_LABELS: Record<string, string> = {
  canViewTasks: "Просмотр задач", canEditTasks: "Редактирование задач", canDeleteTasks: "Удаление задач",
  canViewBacklog: "Просмотр бэклога", canEditBacklog: "Редактирование бэклога", canDeleteBacklog: "Удаление бэклога",
  canViewQuestions: "Просмотр вопросов", canEditQuestions: "Редактирование вопросов", canDeleteQuestions: "Удаление вопросов",
  canViewPresentations: "Просмотр презентаций", canCreatePresentations: "Создание презентаций",
  canUseAI: "Доступ к AI чату", visibleDomains: "Видимость доменов",
};

// ===================== CONFIRM DIALOG =====================

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel} className="gap-2"><X className="w-4 h-4" /> Отмена</Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white gap-2" onClick={onConfirm}>
            <Trash2 className="w-4 h-4" /> Подтвердить
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===================== TAB: USERS =====================

function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({ token });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, statusFilter]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/roles?token=${getToken()}`);
      const data = await res.json();
      if (data.success) setRoles(data.roles);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUsers(); fetchRoles(); }, [fetchUsers, fetchRoles]);

  const handleCreate = async () => {
    setCreateError("");
    if (!newUsername.trim() || !newPassword.trim()) { setCreateError("Заполните обязательные поля"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), username: newUsername.trim(), password: newPassword, displayName: newDisplayName.trim(), roleId: newRoleId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "Ошибка"); setCreating(false); return; }
      setShowCreate(false);
      setNewUsername(""); setNewPassword(""); setNewDisplayName(""); setNewRoleId("");
      fetchUsers();
    } catch { setCreateError("Ошибка подключения"); }
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch("/api/admin/role", {
        method: "DELETE", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), userId: deleteTarget.id }),
      });
      setDeleteTarget(null);
      fetchUsers();
    } catch { /* ignore */ }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await fetch("/api/admin/users", {
        method: "PUT", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), userId: user.id, status: newStatus }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  };

  const handleChangeRole = async (userId: string, roleId: string) => {
    try {
      await fetch("/api/admin/role", {
        method: "PUT", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), userId, roleId }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Поиск по имени..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="">Все статусы</option>
            <option value="ACTIVE">Активные</option>
            <option value="BLOCKED">Заблокированные</option>
          </select>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 bg-[#E31937] hover:bg-[#c91530] text-white">
          <Plus className="w-4 h-4" /> Новый пользователь
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Роль</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Последний вход</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Создан</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Нет пользователей</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.displayName || u.username}</div>
                    <div className="text-xs text-gray-400">@{u.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.roleId}
                      onChange={(e) => handleChangeRole(u.id, e.target.value)}
                      className="px-2 py-1 rounded border border-gray-200 text-sm bg-white"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {u.status === "ACTIVE" ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {u.status === "ACTIVE" ? "Активен" : "Заблокирован"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.sessions[0] ? timeAgo(u.sessions[0].lastActivity) : "Никогда"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(u)} title={u.status === "ACTIVE" ? "Заблокировать" : "Разблокировать"}>
                        {u.status === "ACTIVE" ? <Lock className="w-4 h-4 text-gray-400" /> : <Unlock className="w-4 h-4 text-green-500" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Создать пользователя</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Имя пользователя *</label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Пароль *</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Минимум 4 символа" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Отображаемое имя</label>
                <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Роль</label>
                <select value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mt-1">
                  <option value="">По умолчанию (editor)</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}
                </select>
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Отмена</Button>
              <Button onClick={handleCreate} disabled={creating} className="bg-[#E31937] hover:bg-[#c91530] text-white gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Создать
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Удалить пользователя?"
        message={`Вы уверены, что хотите удалить пользователя "${deleteTarget?.displayName || deleteTarget?.username}"? Все его данные будут удалены безвозвратно.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ===================== TAB: LOGS =====================

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const [filterAction, setFilterAction] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ token: getToken(), limit: String(limit), offset: String(offset) });
      if (filterAction) params.set("action", filterAction);
      if (filterSearch) params.set("search", filterSearch);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      const res = await fetch(`/api/admin/logs?${params}`);
      const data = await res.json();
      if (data.success) { setLogs(data.logs); setTotal(data.total); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [offset, filterAction, filterSearch, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const hasDetails = (log: LogEntry) => log.oldValue || log.newValue;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Поиск в логах..." value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setOffset(0); }} className="pl-9 w-64" />
        </div>
        <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
          <option value="">Все действия</option>
          <optgroup label="Задачи">
            <option value="task_create">Создание задачи</option>
            <option value="task_update">Обновление задачи</option>
            <option value="task_delete">Удаление задачи</option>
          </optgroup>
          <optgroup label="Пользователи">
            <option value="login">Вход</option>
            <option value="logout">Выход</option>
            <option value="register">Регистрация</option>
            <option value="user_update">Обновление пользователя</option>
            <option value="user_block">Блокировка</option>
            <option value="user_unblock">Разблокировка</option>
            <option value="user_delete">Удаление пользователя</option>
            <option value="session_end">Завершение сессии</option>
          </optgroup>
          <optgroup label="Роли и права">
            <option value="role_create">Создание роли</option>
            <option value="role_update">Обновление роли</option>
            <option value="role_delete">Удаление роли</option>
            <option value="role_change">Смена роли пользователя</option>
            <option value="permission_change">Смена прав</option>
          </optgroup>
        </select>
        <input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        <span className="text-gray-400 text-sm">—</span>
        <input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        <Button variant="outline" size="sm" onClick={() => { setFilterAction(""); setFilterSearch(""); setFilterDateFrom(""); setFilterDateTo(""); setOffset(0); }} className="gap-2">
          <RefreshCw className="w-3 h-3" /> Сбросить
        </Button>
      </div>

      <div className="text-xs text-gray-400">Всего записей: {total}</div>

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-1">
          {logs.length === 0 && <div className="text-center py-12 text-gray-400">Нет записей</div>}
          {logs.map((log) => (
            <div key={log.id} className="border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <span className="text-xs text-gray-400 whitespace-nowrap w-40">{formatDate(log.createdAt)}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${actionBadgeClass(log.action)}`}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
                <span className="text-sm font-medium text-gray-700">{log.username || "Система"}</span>
                <span className="text-sm text-gray-500 flex-1 truncate">
                  {log.entityType ? `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}` : ""}
                </span>
                {hasDetails(log) && (expandedId === log.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
              </div>
              {expandedId === log.id && hasDetails(log) && (
                <div className="px-4 pb-3 pt-0 border-t border-gray-100 bg-gray-50/50">
                  <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
                    {log.oldValue && (
                      <div>
                        <div className="font-medium text-gray-500 mb-1">Было:</div>
                        <pre className="bg-white rounded p-2 text-gray-600 overflow-x-auto max-h-32">{JSON.stringify(JSON.parse(log.oldValue), null, 2)}</pre>
                      </div>
                    )}
                    {log.newValue && (
                      <div>
                        <div className="font-medium text-gray-500 mb-1">Стало:</div>
                        <pre className="bg-white rounded p-2 text-gray-600 overflow-x-auto max-h-32">{JSON.stringify(JSON.parse(log.newValue), null, 2)}</pre>
                      </div>
                    )}
                    {log.ipAddress && (
                      <div className="col-span-2 text-gray-400">IP: {log.ipAddress}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-gray-400">Показано {offset + 1}–{Math.min(offset + limit, total)} из {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>Назад</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}>Далее</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== TAB: ROLES =====================

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<Record<string, boolean | string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/roles?token=${getToken()}`);
      const data = await res.json();
      if (data.success) setRoles(data.roles);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const openCreate = () => {
    setEditingRole(null);
    setRoleName(""); setRoleDesc("");
    setRolePerms({
      canViewTasks: true, canEditTasks: false, canDeleteTasks: false,
      canViewBacklog: true, canEditBacklog: false, canDeleteBacklog: false,
      canViewQuestions: true, canEditQuestions: false, canDeleteQuestions: false,
      canViewPresentations: true, canCreatePresentations: false, canUseAI: false,
      visibleDomains: "all",
    });
    setError(""); setShowModal(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name); setRoleDesc(role.description);
    try { setRolePerms({ ...JSON.parse(role.permissions) }); } catch { setRolePerms({}); }
    setError(""); setShowModal(true);
  };

  const handleSave = async () => {
    setError("");
    if (!roleName.trim()) { setError("Укажите название роли"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { token: getToken(), name: roleName.trim(), description: roleDesc, permissions: rolePerms };
      const method = editingRole ? "PUT" : "POST";
      if (editingRole) (body as Record<string, string>).roleId = editingRole.id;
      const res = await fetch("/api/admin/roles", { method, headers: apiHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); setSaving(false); return; }
      setShowModal(false);
      fetchRoles();
    } catch { setError("Ошибка подключения"); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch("/api/admin/roles", {
        method: "DELETE", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), roleId: deleteTarget.id }),
      });
      setDeleteTarget(null);
      fetchRoles();
    } catch { /* ignore */ }
  };

  const togglePerm = (key: string) => {
    setRolePerms((p) => ({ ...p, [key]: p[key] === true ? false : true }));
  };

  const permKeys = Object.keys(PERM_LABELS).filter((k) => k !== "visibleDomains");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-gray-500">Управление ролями и правами доступа</h3>
        <Button onClick={openCreate} className="gap-2 bg-[#E31937] hover:bg-[#c91530] text-white">
          <Plus className="w-4 h-4" /> Новая роль
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => {
            let perms: Record<string, unknown> = {};
            try { perms = JSON.parse(role.permissions); } catch { /* ignore */ }
            const grantedCount = Object.entries(perms).filter(([k, v]) => k !== "visibleDomains" && v === true).length;

            return (
              <div key={role.id} className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#E31937]" />
                      <span className="font-semibold text-gray-900">{role.name}</span>
                      {role.isSystem && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Системная</span>}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{role.description || "Без описания"}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(role)}><Pencil className="w-4 h-4" /></Button>
                    {!role.isSystem && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(role)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-400 mb-3">Прав: {grantedCount} из {permKeys.length} | Пользователей: {role._count.users}</div>

                <div className="flex flex-wrap gap-1.5">
                  {permKeys.map((k) => (
                    <span
                      key={k}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        perms[k] === true
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-400 line-through"
                      }`}
                    >
                      {perms[k] === true ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                      {PERM_LABELS[k]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingRole ? "Редактировать роль" : "Создать роль"}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Название *</label>
                <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} disabled={editingRole?.isSystem} placeholder="Название роли" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Input value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} placeholder="Краткое описание роли" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Права доступа</label>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Задачи</div>
                  {["canViewTasks", "canEditTasks", "canDeleteTasks"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-gray-700">{PERM_LABELS[k]}</span>
                    </label>
                  ))}

                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Бэклог</div>
                  {["canViewBacklog", "canEditBacklog", "canDeleteBacklog"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-gray-700">{PERM_LABELS[k]}</span>
                    </label>
                  ))}

                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Вопросы</div>
                  {["canViewQuestions", "canEditQuestions", "canDeleteQuestions"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-gray-700">{PERM_LABELS[k]}</span>
                    </label>
                  ))}

                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Прочее</div>
                  {["canViewPresentations", "canCreatePresentations", "canUseAI"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-gray-700">{PERM_LABELS[k]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="outline" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[#E31937] hover:bg-[#c91530] text-white gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Удалить роль?"
        message={`Роль "${deleteTarget?.name}" будет удалена. Пользователи с этой ролью будут переназначены на роль "editor".`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ===================== TAB: ONLINE =====================

function OnlineTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [kickTarget, setKickTarget] = useState<Session | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Подсветить «только что обновили» — тонкий feedback на авторефрешe.
  const [refreshedAt, setRefreshedAt] = useState<number>(0);

  /** silent=true → не показывать спиннер (используется в авто-pull). */
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions?token=${getToken()}`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
        setRefreshedAt(Date.now());
      }
    } catch { /* ignore */ }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Автообновление каждые 30 секунд, пока вкладка видна.
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetchSessions(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSessions]);

  const handleKick = async () => {
    if (!kickTarget) return;
    try {
      await fetch("/api/admin/sessions", {
        method: "DELETE", headers: apiHeaders(),
        body: JSON.stringify({ token: getToken(), sessionId: kickTarget.id }),
      });
      setKickTarget(null);
      fetchSessions();
    } catch { /* ignore */ }
  };

  const onlineCount = sessions.filter((s) => s.isOnline).length;
  const inactiveCount = sessions.length - onlineCount;

  // Время последнего обновления для подсказки в шапке
  const refreshedAgo = refreshedAt
    ? Math.max(0, Math.floor((Date.now() - refreshedAt) / 1000))
    : 0;
  void refreshedAgo; // зарезервировано: пока показываем «Обновлено сейчас» по факту наличия данных

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-gray-700">Онлайн: {onlineCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            <span className="text-sm font-medium text-gray-500">Неактивны: {inactiveCount}</span>
          </div>
          <span className="text-xs text-gray-400">Считается онлайн ≤ 2 мин с последнего пинга</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Авто-обновление 30 сек
          </label>
          <Button variant="outline" size="sm" onClick={() => fetchSessions()} className="gap-2">
            <RefreshCw className="w-3 h-3" /> Обновить
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Где</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IP-адрес</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Последняя активность</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Длительность</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Нет активных сессий</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className={`border-b border-gray-100 ${s.isOnline ? "bg-green-50/30" : "bg-gray-50/30"}`}>
                  <td className="px-4 py-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full inline-block ${s.isOnline ? "bg-green-500" : "bg-gray-300"}`}
                      title={s.isOnline ? "Онлайн" : "Неактивен"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{s.user.displayName || s.user.username}</div>
                    <div className="text-xs text-gray-400">@{s.user.username} ({s.user.role.name})</div>
                  </td>
                  <td className="px-4 py-3">
                    {s.currentPage ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-xs">
                        {s.currentPage.length > 36 ? s.currentPage.slice(0, 34) + "…" : s.currentPage}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.ipAddress || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500" title={formatDate(s.lastActivity)}>
                    {timeAgo(s.lastActivity)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {(() => {
                      const ms = Date.now() - new Date(s.createdAt).getTime();
                      const h = Math.floor(ms / 3600000);
                      const m = Math.floor((ms % 3600000) / 60000);
                      return h > 0 ? `${h} ч. ${m} мин.` : `${m} мин.`;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setKickTarget(s)} className="gap-1 text-orange-500 hover:text-orange-600 hover:bg-orange-50">
                      <LogOut className="w-4 h-4" /> Завершить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kick Confirm */}
      <ConfirmDialog
        open={!!kickTarget}
        title="Завершить сессию?"
        message={`Пользователь "${kickTarget?.user.displayName || kickTarget?.user.username}" будет разлогинен и перенаправлен на страницу входа.`}
        onConfirm={handleKick}
        onCancel={() => setKickTarget(null)}
      />
    </div>
  );
}

// ===================== MAIN ADMIN PAGE =====================

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "users", label: "Пользователи", icon: <Users className="w-4 h-4" /> },
  { key: "logs", label: "Логи", icon: <ScrollText className="w-4 h-4" /> },
  { key: "roles", label: "Роли", icon: <Shield className="w-4 h-4" /> },
  { key: "online", label: "Онлайн", icon: <Wifi className="w-4 h-4" /> },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [checking, setChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    fetch(`/api/auth/me?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        // /api/auth/me возвращает role как lowercase-строку ("admin" | "viewer" | …),
        // не объект. Сравниваем напрямую со строкой "admin".
        if (data.success && (data.user.role === "admin" || data.user.role?.name === "Admin")) {
          setIsAllowed(true);
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Доступ запрещён</h2>
          <p className="text-sm text-gray-500">Эта страница доступна только администраторам.</p>
          <Button variant="outline" className="mt-4" onClick={() => (window.location.href = "/")}>На главную</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-[#E31937]" />
              <h1 className="text-lg font-bold text-gray-900">Панель администратора</h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/")}>
              ← Назад к приложению
            </Button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-[#E31937] text-[#E31937]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "roles" && <RolesTab />}
        {activeTab === "online" && <OnlineTab />}
      </div>
    </div>
  );
}
