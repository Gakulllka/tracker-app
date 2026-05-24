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
}

export function useAuth() {
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) { setAuthChecking(false); return; }

        const res = await fetch(`/api/auth/me?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            localStorage.setItem("auth_permissions", JSON.stringify(data.permissions || null));
            localStorage.setItem("auth_role_permissions", JSON.stringify(data.rolePermissions || null));
            setAuthData({ token, workspaceId: data.workspaceId, user: data.user, permissions: data.permissions, rolePermissions: data.rolePermissions ?? null });
          } else {
            ["auth_token","auth_user","auth_workspace","auth_permissions","auth_role_permissions"].forEach(k => localStorage.removeItem(k));
          }
        } else {
          ["auth_token","auth_user","auth_workspace","auth_permissions","auth_role_permissions"].forEach(k => localStorage.removeItem(k));
        }
      } catch {
        // Offline fallback
        const t = localStorage.getItem("auth_token");
        const u = localStorage.getItem("auth_user");
        const w = localStorage.getItem("auth_workspace");
        if (t && u && w) {
          const p = localStorage.getItem("auth_permissions");
          const rp = localStorage.getItem("auth_role_permissions");
          setAuthData({ token: t, workspaceId: w, user: JSON.parse(u), permissions: p ? JSON.parse(p) : null, rolePermissions: rp ? JSON.parse(rp) : null });
        }
      } finally {
        setAuthChecking(false);
      }
    };
    checkSession();
  }, []);

  const handleAuth = useCallback((data: {
    token: string; workspaceId: string; user: AuthData["user"];
    permissions?: unknown; rolePermissions?: unknown;
  }) => {
    setAuthData({ token: data.token, workspaceId: data.workspaceId, user: data.user, permissions: (data.permissions as UserPermissions | null) ?? null, rolePermissions: (data.rolePermissions as RolePermissions | null) ?? null });
  }, []);

  const handleLogout = useCallback(async () => {
    if (authData) {
      try {
        await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: authData.token }) });
      } catch { /* silent */ }
    }
    ["auth_token","auth_user","auth_workspace","auth_permissions","auth_role_permissions"].forEach(k => localStorage.removeItem(k));
    document.cookie = "auth_token=; path=/; max-age=0; SameSite=Lax";
    setAuthData(null);
  }, [authData]);

  return { authData, authChecking, handleAuth, handleLogout };
}
