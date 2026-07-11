"use client";
/**
 * usePermissions — вычисление прав доступа пользователя.
 * Вынесено из TaskTrackerInner.
 *
 * Поддерживает роль "executive" (руководитель) — видит только
 * назначенные домены, может комментировать и ставить флаги,
 * но не может менять статусы задач.
 */
import { useMemo, useEffect } from "react";
import type { AuthData, AccessibleWorkspace } from "./useAuth";
import type { Domain } from "@/lib/types";

interface UsePermissionsParams {
  authData: AuthData;
  domains: Domain[];
  activeDomainId: string;
  storeSetActiveDomain: (id: string) => void;
  /** Текущий workspace share (если пользователь — не владелец workspace). */
  currentShare?: AccessibleWorkspace;
}

/** Может ли пользователь редактировать конкретный домен. */
export function canEditDomainId(
  editableDomainIds: "all" | string[] | undefined,
  domainId: string,
): boolean {
  if (editableDomainIds === "all") return true;
  return Array.isArray(editableDomainIds) && editableDomainIds.includes(domainId);
}

export function usePermissions({
  authData, domains, activeDomainId, storeSetActiveDomain, currentShare,
}: UsePermissionsParams) {
  const isAdmin = authData.user.role === "admin";
  const isGuest = authData.user.role === "guest";
  const perms = authData.permissions;
  const rolePerms = authData.rolePermissions;
  const isExecutive = currentShare?.role === "executive";

  const canEdit = useMemo(() => {
    if (isGuest) return false; // гость — только просмотр
    if (isExecutive) return false; // руководитель не может менять статусы
    if (isAdmin) return true;
    if (perms) return perms.canEdit;
    if (rolePerms && typeof rolePerms.canEditTasks === "boolean") return rolePerms.canEditTasks;
    return true;
  }, [isAdmin, isGuest, perms, rolePerms, isExecutive]);

  /** Право редактирования АКТИВНОГО домена (пер-доменная модель).
   *  admin/editor — все домены; member — только из editableDomainIds;
   *  viewer/guest — ничего. */
  const canEditActiveDomain = useMemo(() => {
    if (!canEdit) return false;
    return canEditDomainId(authData.editableDomainIds, activeDomainId);
  }, [canEdit, authData.editableDomainIds, activeDomainId]);

  // Руководитель может комментировать и ставить флаги
  // Гость — ничего не может
  const canComment = isGuest ? false : (isExecutive ? true : undefined);
  const canSetFlags = isGuest ? false : (isExecutive ? true : undefined);

  const canDeleteTasks       = !isGuest && !isExecutive && (isAdmin || rolePerms?.canDeleteTasks !== false);
  const canEditBacklog       = !isGuest && !isExecutive && (isAdmin || (rolePerms?.canEditBacklog ?? canEdit));
  const canDeleteBacklog     = !isGuest && !isExecutive && (isAdmin || rolePerms?.canDeleteBacklog !== false);
  const canCreatePresentations = !isGuest && (isAdmin || rolePerms?.canCreatePresentations !== false);
  const canUseAI             = !isGuest && (isAdmin || rolePerms?.canUseAI !== false);

  const allowedTabs = useMemo(() => {
    if (isAdmin || !perms?.visibleTabs) return null;
    const list = perms.visibleTabs.split(",").filter(Boolean);
    return new Set(list);
  }, [isAdmin, perms]);

  const allowedDomainIds = useMemo(() => {
    // Executive: restrict to assigned domains
    if (isExecutive && currentShare?.domainIds && currentShare.domainIds.length > 0) {
      return new Set(currentShare.domainIds);
    }
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
  }, [isAdmin, perms, rolePerms, isExecutive, currentShare]);

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
    isAdmin, isGuest, canEdit, canEditActiveDomain, canComment, canSetFlags,
    canDeleteTasks, canEditBacklog, canDeleteBacklog,
    canCreatePresentations, canUseAI,
    allowedTabs, visibleDomains, canSeeQuestions,
    isExecutive,
  };
}
