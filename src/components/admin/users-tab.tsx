"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Lock, Unlock, Search, Loader2 } from "lucide-react";
import { getToken, apiHeaders, formatDate, timeAgo, type User, type Role } from "@/components/admin/shared";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

/** Вкладка «Пользователи»: список, создание, блокировка, смена роли. */

export function UsersTab() {
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
        <Button onClick={() => setShowCreate(true)} className="gap-2 bg-[var(--tracker-danger)] hover:bg-[var(--tracker-danger)] text-white">
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
              <Button onClick={handleCreate} disabled={creating} className="bg-[var(--tracker-danger)] hover:bg-[var(--tracker-danger)] text-white gap-2">
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
