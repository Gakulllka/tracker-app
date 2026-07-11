"use client";
/**
 * useAuth — проверка сессии, логин, логаут.
 * Вынесено из AppWithAuth в page.tsx.
 */
import { useState, useEffect, useCallback } from "react";

export interface UserPermissions {
  visibleTabs: string;
  visibleDomainIds: string;
  canEdit: boolean;
  canSeeQuestions: boolean;
}

export interface RolePermissions {
  canViewTasks?: boolean;
  canEditTasks?: boolean;
  canDeleteTasks?: boolean;
  canViewBacklog?: boolean;
  canEditBacklog?: boolean;
  canDeleteBacklog?: boolean;
  canViewQuestions?: boolean;
  canEditQuestions?: boolean;
  canDeleteQuestions?: boolean;
  canViewPresentations?: boolean;
  canCreatePresentations?: boolean;
  canUseAI?: boolean;
  visibleDomains?: string;
}

export interface AccessibleWorkspace {
  workspaceId: string;
  name: string;
  role: "editor" | "viewer" | "executive";
  ownerName: string;
  domainIds: string[];
}

export interface AuthData {
  token: string;
  workspaceId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    roleName?: string;
  };
  permissions: UserPermissions | null;
  rolePermissions: RolePermissions | null;
  accessibleWorkspaces: AccessibleWorkspace[];
  /** Домены, доступные на редактирование: "all" (admin/editor) или список id (member). */
  editableDomainIds: "all" | string[];
}

export function useAuth() {
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  /** Тянет /api/auth/me и обновляет состояние. Возвращает успех. */
  const fetchMe = useCallback(async (token: string): Promise<boolean> => {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.success) return false;
    localStorage.setItem("auth_user", JSON.stringify(data.user));
    localStorage.setItem("auth_permissions", JSON.stringify(data.permissions || null));
    localStorage.setItem("auth_role_permissions", JSON.stringify(data.rolePermissions || null));
    localStorage.setItem("auth_editable_domains", JSON.stringify(data.editableDomainIds ?? []));
    setAuthData({
      token,
      workspaceId: data.workspaceId,
      user: data.user,
      permissions: data.permissions,
      rolePermissions: data.rolePermissions ?? null,
      accessibleWorkspaces: data.accessibleWorkspaces ?? [],
      editableDomainIds: data.editableDomainIds ?? [],
    });
    return true;
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) { setAuthChecking(false); return; }

        const ok = await fetchMe(token);
        if (!ok) {
          ["auth_token","auth_user","auth_workspace","auth_permissions","auth_role_permissions","auth_editable_domains"].forEach(k => localStorage.removeItem(k));
        }
      } catch {
        // Offline fallback
        const t = localStorage.getItem("auth_token");
        const u = localStorage.getItem("auth_user");
        const w = localStorage.getItem("auth_workspace");
        if (t && u && w) {
          const p = localStorage.getItem("auth_permissions");
          const rp = localStorage.getItem("auth_role_permissions");
          const ed = localStorage.getItem("auth_editable_domains");
          setAuthData({ token: t, workspaceId: w, user: JSON.parse(u), permissions: p ? JSON.parse(p) : null, rolePermissions: rp ? JSON.parse(rp) : null, accessibleWorkspaces: [], editableDomainIds: ed ? JSON.parse(ed) : [] });
        }
      } finally {
        setAuthChecking(false);
      }
    };
    checkSession();
  }, [fetchMe]);

  /** Перечитать права с сервера (после выдачи доступа и т.п.). */
  const refreshAuth = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    try { await fetchMe(token); } catch { /* silent */ }
  }, [fetchMe]);

  const handleAuth = useCallback((data: {
    token: string; workspaceId: string; user: AuthData["user"];
    permissions?: unknown; rolePermissions?: unknown;
    accessibleWorkspaces?: AccessibleWorkspace[];
    editableDomainIds?: "all" | string[];
  }) => {
    setAuthData({ token: data.token, workspaceId: data.workspaceId, user: data.user, permissions: (data.permissions as UserPermissions | null) ?? null, rolePermissions: (data.rolePermissions as RolePermissions | null) ?? null, accessibleWorkspaces: data.accessibleWorkspaces ?? [], editableDomainIds: data.editableDomainIds ?? [] });
  }, []);

  const handleLogout = useCallback(async () => {
    if (authData) {
      try {
        await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: authData.token }) });
      } catch { /* silent */ }
    }
    ["auth_token","auth_user","auth_workspace","auth_permissions","auth_role_permissions","auth_editable_domains"].forEach(k => localStorage.removeItem(k));
    document.cookie = "auth_token=; path=/; max-age=0; SameSite=Lax";
    setAuthData(null);
  }, [authData]);

  const switchWorkspace = useCallback((newWorkspaceId: string) => {
    if (!authData) return;
    localStorage.setItem("auth_workspace", newWorkspaceId);
    setAuthData({ ...authData, workspaceId: newWorkspaceId });
  }, [authData]);

  return { authData, authChecking, handleAuth, handleLogout, switchWorkspace, refreshAuth };
}
