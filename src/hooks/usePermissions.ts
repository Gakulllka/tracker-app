"use client";
/**
 * usePermissions — вычисление прав доступа пользователя.
 * Вынесено из TaskTrackerInner.
 */
import { useMemo, useEffect } from "react";
import type { AuthData } from "./useAuth";
import type { Domain } from "@/lib/types";

interface UsePermissionsParams {
  authData: AuthData;
  domains: Domain[];
  activeDomainId: string;
  storeSetActiveDomain: (id: string) => void;
}

export function usePermissions({
  authData, domains, activeDomainId, storeSetActiveDomain,
}: UsePermissionsParams) {
  const isAdmin = authData.user.role === "admin";
  const perms = authData.permissions;
  const rolePerms = authData.rolePermissions;

  const canEdit = useMemo(() => {
    if (isAdmin) return true;
    if (perms) return perms.canEdit;
    if (rolePerms && typeof rolePerms.canEditTasks === "boolean") return rolePerms.canEditTasks;
    return true;
  }, [isAdmin, perms, rolePerms]);

  const canDeleteTasks       = isAdmin || rolePerms?.canDeleteTasks !== false;
  const canEditBacklog       = isAdmin || (rolePerms?.canEditBacklog ?? canEdit);
  const canDeleteBacklog     = isAdmin || rolePerms?.canDeleteBacklog !== false;
  const canCreatePresentations = isAdmin || rolePerms?.canCreatePresentations !== false;
  const canUseAI             = isAdmin || rolePerms?.canUseAI !== false;

  const allowedTabs = useMemo(() => {
    if (isAdmin || !perms?.visibleTabs) return null;
    const list = perms.visibleTabs.split(",").filter(Boolean);
    return new Set(list);
  }, [isAdmin, perms]);

  const allowedDomainIds = useMemo(() => {
    if (isAdmin) return null;
    if (perms?.visibleDomainIds && perms.visibleDomainIds !== "[]") {
      try {
        const list: string[] = JSON.parse(perms.visibleDomainIds);
        if (list.length > 0) return new Set(list);
      } catch { /* fall through */ }
    }
    if (rolePerms?.visibleDomains && rolePerms.visibleDomains !== "all") {
      try {
        const list: string[] = JSON.parse(rolePerms.visibleDomains);
        if (Array.isArray(list) && list.length > 0) return new Set(list);
      } catch { /* fall through */ }
    }
    return null;
  }, [isAdmin, perms, rolePerms]);

  const visibleDomains = useMemo(() => {
    if (!allowedDomainIds) return domains;
    return domains.filter(d => allowedDomainIds.has(d.id));
  }, [domains, allowedDomainIds]);

  // Switch to first visible domain if current one is hidden
  useEffect(() => {
    if (allowedDomainIds && activeDomainId && !allowedDomainIds.has(activeDomainId)) {
      const first = visibleDomains[0];
      if (first) storeSetActiveDomain(first.id);
    }
  }, [allowedDomainIds, activeDomainId, visibleDomains, storeSetActiveDomain]);

  const canSeeQuestions = useMemo(() => {
    if (isAdmin) return true;
    if (perms && typeof perms.canSeeQuestions === "boolean") return perms.canSeeQuestions;
    if (rolePerms && typeof rolePerms.canViewQuestions === "boolean") return rolePerms.canViewQuestions;
    return true;
  }, [isAdmin, perms, rolePerms]);

  return {
    isAdmin, canEdit,
    canDeleteTasks, canEditBacklog, canDeleteBacklog,
    canCreatePresentations, canUseAI,
    allowedTabs, visibleDomains, canSeeQuestions,
  };
}
