"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Plus, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { getToken, apiHeaders, PERM_LABELS, type Role } from "@/components/admin/shared";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

/** Вкладка «Роли»: справочник глобальных ролей и их прав. */

export function RolesTab() {
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
        <h3 className="text-sm text-[var(--tracker-text-muted)]">Управление ролями и правами доступа</h3>
        <Button onClick={openCreate} className="gap-2 bg-[var(--tracker-danger)] hover:bg-[var(--tracker-danger)] text-white">
          <Plus className="w-4 h-4" /> Новая роль
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--tracker-text-muted)]" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => {
            let perms: Record<string, unknown> = {};
            try { perms = JSON.parse(role.permissions); } catch { /* ignore */ }
            const grantedCount = Object.entries(perms).filter(([k, v]) => k !== "visibleDomains" && v === true).length;

            return (
              <div key={role.id} className="border border-[var(--tracker-border)] rounded-xl p-4 bg-[var(--tracker-bg-card)] hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[var(--tracker-danger)]" />
                      <span className="font-semibold text-[var(--tracker-text-main)]">{role.name}</span>
                      {role.isSystem && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--tracker-accent-bg)] text-[var(--tracker-text-muted)]">Системная</span>}
                    </div>
                    <p className="text-sm text-[var(--tracker-text-muted)] mt-1">{role.description || "Без описания"}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(role)}><Pencil className="w-4 h-4" /></Button>
                    {!role.isSystem && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(role)}>
                        <Trash2 className="w-4 h-4 text-[var(--tracker-danger)]" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-[var(--tracker-text-muted)] mb-3">Прав: {grantedCount} из {permKeys.length} | Пользователей: {role._count.users}</div>

                <div className="flex flex-wrap gap-1.5">
                  {permKeys.map((k) => (
                    <span
                      key={k}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        perms[k] === true
                          ? "bg-[color-mix(in_srgb,var(--tracker-success)_16%,transparent)] text-[var(--tracker-success)]"
                          : "bg-[var(--tracker-accent-bg)] text-[var(--tracker-text-muted)] line-through"
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
          <div className="bg-[var(--tracker-bg-card)] rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingRole ? "Редактировать роль" : "Создать роль"}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--tracker-text-main)]">Название *</label>
                <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} disabled={editingRole?.isSystem} placeholder="Название роли" />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--tracker-text-main)]">Описание</label>
                <Input value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} placeholder="Краткое описание роли" />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--tracker-text-main)] mb-2 block">Права доступа</label>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[var(--tracker-text-muted)] uppercase tracking-wide">Задачи</div>
                  {["canViewTasks", "canEditTasks", "canDeleteTasks"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-[var(--tracker-text-main)]">{PERM_LABELS[k]}</span>
                    </label>
                  ))}

                  <div className="text-xs font-semibold text-[var(--tracker-text-muted)] uppercase tracking-wide pt-2">Бэклог</div>
                  {["canViewBacklog", "canEditBacklog", "canDeleteBacklog"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-[var(--tracker-text-main)]">{PERM_LABELS[k]}</span>
                    </label>
                  ))}

                  <div className="text-xs font-semibold text-[var(--tracker-text-muted)] uppercase tracking-wide pt-2">Вопросы</div>
                  {["canViewQuestions", "canEditQuestions", "canDeleteQuestions"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-[var(--tracker-text-main)]">{PERM_LABELS[k]}</span>
                    </label>
                  ))}

                  <div className="text-xs font-semibold text-[var(--tracker-text-muted)] uppercase tracking-wide pt-2">Прочее</div>
                  {["canViewPresentations", "canCreatePresentations", "canUseAI"].map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rolePerms[k] === true} onChange={() => togglePerm(k)} className="rounded" />
                      <span className="text-sm text-[var(--tracker-text-main)]">{PERM_LABELS[k]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-[var(--tracker-danger)]">{error}</p>}
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="outline" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[var(--tracker-danger)] hover:bg-[var(--tracker-danger)] text-white gap-2">
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
