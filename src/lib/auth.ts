import { prisma } from "@/lib/prisma";

/**
 * Единая библиотека авторизации и прав доступа.
 *
 * Роли (User.role):
 *   admin  — полный доступ + админ-панель (первый зарегистрированный)
 *   editor — редактирует ВСЕ домены, без админ-панели
 *   viewer — видит все домены, ничего не редактирует
 *   member — редактирует только домены, где есть запись DomainEditor
 *   guest  — общий гостевой аккаунт, только просмотр
 */

export type UserRole = "admin" | "editor" | "viewer" | "member" | "guest";

export const READONLY_ROLES: UserRole[] = ["viewer", "guest"];
export const GLOBAL_EDIT_ROLES: UserRole[] = ["admin", "editor"];

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
}

export interface AuthContext {
  sessionId: string;
  user: AuthUser;
}

/** Резолвит сессию по токену. Возвращает null если токен невалиден/просрочен. */
export async function resolveSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, role: true, status: true },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status === "BLOCKED") return null;
  return { sessionId: session.id, user: session.user };
}

/** Обновляет lastActivity сессии (heartbeat). Ошибки глотает. */
export async function touchSession(sessionId: string, ipAddress?: string, currentPage?: string) {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivity: new Date(),
        ...(ipAddress ? { ipAddress } : {}),
        ...(currentPage !== undefined ? { currentPage } : {}),
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Достаёт токен из запроса: сначала заголовок Authorization: Bearer <token>
 * (не попадает в логи), затем query-параметр ?token= (обратная совместимость).
 */
export function getTokenFromRequest(req: {
  headers: { get(name: string): string | null };
  nextUrl?: { searchParams: URLSearchParams };
}): string | null {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  return req.nextUrl?.searchParams.get("token") || null;
}

/** resolveSession с автоматическим извлечением токена из запроса. */
export async function resolveSessionFromRequest(req: {
  headers: { get(name: string): string | null };
  nextUrl?: { searchParams: URLSearchParams };
}): Promise<AuthContext | null> {
  return resolveSession(getTokenFromRequest(req));
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "";
}

/** Роль умеет редактировать хоть что-то? (админ/редактор — всё, member — по доменам) */
export function roleCanEverEdit(role: string): boolean {
  return !READONLY_ROLES.includes(role as UserRole);
}

/** Роль редактирует все домены без проверок DomainEditor? */
export function isGlobalEditor(role: string): boolean {
  return GLOBAL_EDIT_ROLES.includes(role as UserRole);
}

/** ID доменов, которые пользователь может редактировать (для member). */
export async function getEditableDomainIds(userId: string, role: string): Promise<string[] | "all"> {
  if (isGlobalEditor(role)) return "all";
  if (!roleCanEverEdit(role)) return [];
  const rights = await prisma.domainEditor.findMany({
    where: { userId },
    select: { domainId: true },
  });
  return rights.map((r) => r.domainId);
}

/** Может ли пользователь редактировать конкретный домен. */
export async function canEditDomain(userId: string, role: string, domainId: string): Promise<boolean> {
  if (isGlobalEditor(role)) return true;
  if (!roleCanEverEdit(role)) return false;
  const right = await prisma.domainEditor.findUnique({
    where: { domainId_userId: { domainId, userId } },
  });
  return !!right;
}

/** Может ли пользователь управлять доступом к домену (выдавать права, одобрять запросы). */
export async function canManageDomainAccess(userId: string, role: string, domainId: string): Promise<boolean> {
  if (role === "admin" || role === "editor") return true;
  if (!roleCanEverEdit(role)) return false;
  // Редактор конкретного домена тоже может выдавать доступ к нему
  const right = await prisma.domainEditor.findUnique({
    where: { domainId_userId: { domainId, userId } },
  });
  return !!right;
}

/** Запись в лог активности. Ошибки глотает — лог не должен ломать основную операцию. */
export async function logActivity(data: {
  userId?: string;
  username?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
  ipAddress?: string;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: data.userId || "",
        username: data.username || "",
        action: data.action,
        entityType: data.entityType || "",
        entityId: data.entityId || "",
        oldValue: data.oldValue || "",
        newValue: data.newValue || "",
        details: data.details || "",
        ipAddress: data.ipAddress || "",
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * rolePermissions в формате, который ожидает фронтенд (usePermissions).
 * Для member canEditTasks=true — точную пер-доменную проверку делает сервер,
 * а клиент дополнительно получает editableDomainIds.
 */
export function buildRolePermissions(role: string) {
  const canEdit = roleCanEverEdit(role);
  return {
    canViewTasks: true,
    canEditTasks: canEdit,
    canDeleteTasks: canEdit,
    canViewBacklog: true,
    canEditBacklog: canEdit,
    canDeleteBacklog: canEdit,
    canViewQuestions: true,
    canEditQuestions: canEdit,
    canDeleteQuestions: canEdit,
    canViewPresentations: true,
    canCreatePresentations: role !== "guest",
    canUseAI: role !== "guest" && role !== "viewer",
    visibleDomains: "all" as const,
  };
}

/** Формат пользователя для ответов auth-эндпоинтов. */
export function publicUser(u: AuthUser) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
  };
}
