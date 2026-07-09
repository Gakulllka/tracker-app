"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Share2, UserPlus, Trash2, Loader2, Shield, Eye, Building2, Search,
} from "lucide-react";
import type { Domain } from "@/lib/types";

interface SharedUser {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: "editor" | "viewer" | "executive";
  domainIds: string[];
}

interface User {
  id: string;
  username: string;
  displayName: string;
}

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  token: string;
  domains: Domain[];
  toast: (opts: { title: string; description?: string }) => void;
}

const ROLE_LABELS: Record<string, string> = {
  editor: "Редактор",
  viewer: "Наблюдатель",
  executive: "Руководитель",
};

export function ShareDialog({ open, onClose, workspaceId, workspaceName, token, domains, toast }: ShareDialogProps) {
  const [shares, setShares] = useState<SharedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [newRole, setNewRole] = useState<"editor" | "viewer" | "executive">("editor");
  const [newDomainIds, setNewDomainIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SharedUser | null>(null);
  const [editingDomains, setEditingDomains] = useState<string | null>(null);
  const [editDomainIds, setEditDomainIds] = useState<string[]>([]);

  const fetchShares = useCallback(async () => {
    if (!open || !workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/shares?token=${encodeURIComponent(token)}&workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = await res.json();
      if (data.success) setShares(data.shares);
    } catch { /* ignore */ }
    setLoading(false);
  }, [open, workspaceId, token]);

  const fetchUsers = useCallback(async () => {
    if (!open) return;
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/users?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch { /* ignore */ }
    setUsersLoading(false);
  }, [open, token]);

  useEffect(() => { fetchShares(); fetchUsers(); }, [fetchShares, fetchUsers]);

  const filteredUsers = users.filter(user => {
    // Filter out users who already have access
    const hasAccess = shares.some(s => s.userId === user.id);
    if (hasAccess) return false;
    // Filter by search query
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(query) ||
      user.displayName.toLowerCase().includes(query)
    );
  });

  const handleAdd = async () => {
    if (!selectedUser) return;
    if (newRole === "executive" && newDomainIds.length === 0) {
      toast({ title: "Ошибка", description: "Выберите хотя бы один домен для руководителя" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/workspace/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, workspaceId, username: selectedUser.username,
          role: newRole,
          domainIds: newRole === "executive" ? newDomainIds : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Ошибка", description: data.error || "Не удалось добавить" });
        setAdding(false);
        return;
      }
      setShares([...shares, data.share]);
      setSelectedUser(null);
      setSearchQuery("");
      setNewRole("editor");
      setNewDomainIds([]);
      setShowUserDropdown(false);
      toast({ title: "Доступ предоставлен", description: `${data.share.displayName || data.share.username} добавлен как ${ROLE_LABELS[data.share.role]}` });
    } catch {
      toast({ title: "Ошибка", description: "Ошибка подключения" });
    }
    setAdding(false);
  };

  const handleChangeRole = async (share: SharedUser, newRole: string) => {
    const validRole = ["editor", "viewer", "executive"].includes(newRole) ? newRole : share.role;
    const updateData: Record<string, unknown> = { token, shareId: share.id, role: validRole };
    if (validRole === "executive") {
      updateData.domainIds = share.domainIds.length > 0 ? share.domainIds : [];
    }
    try {
      const res = await fetch("/api/workspace/shares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (res.ok) {
        setShares(shares.map(s => s.id === share.id ? { ...s, role: validRole as SharedUser["role"], domainIds: validRole === "executive" ? (share.domainIds.length > 0 ? share.domainIds : []) : [] } : s));
        toast({ title: "Роль обновлена", description: `${share.displayName || share.username} теперь ${ROLE_LABELS[validRole]}` });
      }
    } catch { /* ignore */ }
  };

  const handleSaveDomains = async (share: SharedUser) => {
    try {
      const res = await fetch("/api/workspace/shares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, shareId: share.id, domainIds: editDomainIds }),
      });
      if (res.ok) {
        setShares(shares.map(s => s.id === share.id ? { ...s, domainIds: editDomainIds } : s));
        setEditingDomains(null);
        toast({ title: "Домены обновлены", description: `Назначено ${editDomainIds.length} домен(ов) для ${share.displayName || share.username}` });
      }
    } catch { /* ignore */ }
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch("/api/workspace/shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, shareId: deleteTarget.id }),
      });
      if (res.ok) {
        setShares(shares.filter(s => s.id !== deleteTarget.id));
        toast({ title: "Доступ отозван", description: `${deleteTarget.displayName || deleteTarget.username} больше не имеет доступа` });
      }
    } catch { /* ignore */ }
    setDeleteTarget(null);
  };

  const getDomainName = (id: string) => domains.find(d => d.id === id)?.name || id;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" style={{ background: "var(--tracker-bg-card)", borderColor: "var(--tracker-border)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "var(--tracker-text-main)" }}>
            <Share2 className="size-4" style={{ color: "var(--tracker-accent)" }} />
            Управление доступом
          </DialogTitle>
          <DialogDescription style={{ color: "var(--tracker-text-muted)" }}>
            {workspaceName} — приглашите пользователей и назначьте роли
          </DialogDescription>
        </DialogHeader>

        {/* Add user form */}
        <div className="space-y-2 mt-2">
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder={selectedUser ? `${selectedUser.displayName || selectedUser.username}` : "Поиск пользователя..."}
                  value={selectedUser ? `${selectedUser.displayName || selectedUser.username}` : searchQuery}
                  onChange={e => {
                    setSelectedUser(null);
                    setSearchQuery(e.target.value);
                    setShowUserDropdown(true);
                  }}
                  onFocus={() => setShowUserDropdown(true)}
                  className="flex-1"
                  style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                />
                {selectedUser && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)]"
                    onClick={() => { setSelectedUser(null); setSearchQuery(""); }}
                  >
                    ×
                  </button>
                )}
              </div>
              <select
                value={newRole}
                onChange={e => { setNewRole(e.target.value as typeof newRole); setNewDomainIds([]); }}
                className="px-2 py-1 rounded-lg text-xs border"
                style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)", background: "transparent" }}
              >
                <option value="editor">Редактор</option>
                <option value="viewer">Наблюдатель</option>
                <option value="executive">Руководитель</option>
              </select>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding || !selectedUser || (newRole === "executive" && newDomainIds.length === 0)}
                style={{ background: "var(--tracker-accent)", color: "#fff" }}
              >
                {adding ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              </Button>
            </div>

            {/* User dropdown */}
            {showUserDropdown && !selectedUser && (
              <div
                className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg border shadow-lg max-h-48 overflow-y-auto"
                style={{ background: "var(--tracker-bg-card)", borderColor: "var(--tracker-border)" }}
              >
                {usersLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-4 animate-spin" style={{ color: "var(--tracker-text-muted)" }} />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-4 text-center text-sm" style={{ color: "var(--tracker-text-muted)" }}>
                    {searchQuery ? "Пользователи не найдены" : "Нет доступных пользователей"}
                  </div>
                ) : (
                  filteredUsers.map(user => (
                    <button
                      key={user.id}
                      className="w-full px-3 py-2 text-left hover:bg-[var(--tracker-accent-bg)] transition-colors flex items-center gap-2"
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchQuery("");
                        setShowUserDropdown(false);
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: "var(--tracker-accent-bg, rgba(155,114,207,0.15))", color: "var(--tracker-accent)" }}
                      >
                        {(user.displayName || user.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "var(--tracker-text-main)" }}>
                          {user.displayName || user.username}
                        </div>
                        <div className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                          @{user.username}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Domain selection for executive */}
          {newRole === "executive" && (
            <div className="p-2 rounded-lg border" style={{ borderColor: "var(--tracker-border)" }}>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--tracker-text-muted)" }}>Назначенные домены:</p>
              <div className="flex flex-wrap gap-1">
                {domains.map(d => (
                  <label
                    key={d.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                      newDomainIds.includes(d.id)
                        ? "bg-[var(--tracker-accent)] text-white"
                        : "border hover:bg-[var(--tracker-accent-bg)]"
                    }`}
                    style={!newDomainIds.includes(d.id) ? { borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" } : {}}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={newDomainIds.includes(d.id)}
                      onChange={() => setNewDomainIds(prev => prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id])}
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Shared users list */}
        <div className="mt-4 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin" style={{ color: "var(--tracker-text-muted)" }} />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-center py-6 text-sm" style={{ color: "var(--tracker-text-muted)" }}>
              Никому ещё не предоставлен доступ
            </p>
          ) : (
            shares.map(share => (
              <div
                key={share.id}
                className="px-3 py-2 rounded-lg transition-colors"
                style={{ background: "var(--tracker-accent-bg, rgba(155,114,207,0.05))" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: "var(--tracker-accent-bg, rgba(155,114,207,0.15))", color: "var(--tracker-accent)" }}
                  >
                    {(share.displayName || share.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--tracker-text-main)" }}>
                      {share.displayName || share.username}
                    </div>
                    <div className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                      @{share.username}
                    </div>
                  </div>
                  <select
                    value={share.role}
                    onChange={e => handleChangeRole(share, e.target.value)}
                    className="px-2 py-1 rounded text-xs border"
                    style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)", background: "transparent" }}
                  >
                    <option value="editor">Редактор</option>
                    <option value="viewer">Наблюдатель</option>
                    <option value="executive">Руководитель</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => setDeleteTarget(share)}
                    title="Отозвать доступ"
                  >
                    <Trash2 className="size-3.5" style={{ color: "#ef4444" }} />
                  </Button>
                </div>

                {/* Executive domain badges */}
                {share.role === "executive" && (
                  <div className="mt-1.5 ml-11">
                    {editingDomains === share.id ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {domains.map(d => (
                            <label
                              key={d.id}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                                editDomainIds.includes(d.id)
                                  ? "bg-[var(--tracker-accent)] text-white"
                                  : "border hover:bg-[var(--tracker-accent-bg)]"
                              }`}
                              style={!editDomainIds.includes(d.id) ? { borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" } : {}}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={editDomainIds.includes(d.id)}
                                onChange={() => setEditDomainIds(prev => prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id])}
                              />
                              {d.name}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditingDomains(null)}>Отмена</Button>
                          <Button size="sm" className="h-6 text-[10px]" onClick={() => handleSaveDomains(share)} style={{ background: "var(--tracker-accent)", color: "#fff" }}>Сохранить</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Building2 className="size-3 shrink-0" style={{ color: "var(--tracker-text-muted)" }} />
                        {share.domainIds.length > 0 ? share.domainIds.map(dId => (
                          <span key={dId} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "var(--tracker-accent-bg, rgba(155,114,207,0.1))", color: "var(--tracker-accent)" }}>
                            {getDomainName(dId)}
                          </span>
                        )) : (
                          <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>Без доменов</span>
                        )}
                        <button
                          className="text-[10px] underline ml-1"
                          style={{ color: "var(--tracker-accent)" }}
                          onClick={() => { setEditingDomains(share.id); setEditDomainIds([...share.domainIds]); }}
                        >
                          изм.
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Role legend */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: "var(--tracker-text-muted)" }}>
          <span className="flex items-center gap-1"><Shield className="size-3" /> Редактор — чтение и запись</span>
          <span className="flex items-center gap-1"><Eye className="size-3" /> Наблюдатель — только чтение</span>
          <span className="flex items-center gap-1"><Building2 className="size-3" /> Руководитель — назначенные домены</span>
        </div>

        {/* Delete confirm */}
        {deleteTarget && (
          <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
            <p className="text-sm" style={{ color: "var(--tracker-text-main)" }}>
              Отозвать доступ у <strong>{deleteTarget.displayName || deleteTarget.username}</strong>?
            </p>
            <div className="flex gap-2 mt-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Отмена</Button>
              <Button size="sm" onClick={handleRemove} style={{ background: "#ef4444", color: "#fff" }}>
                Отозвать
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}