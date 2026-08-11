import { prisma } from "@/lib/prisma";

/**
 * Единая библиотека авторизации и прав доступа.
 *
 * ДВУХУРОВНЕВАЯ МОДЕЛЬ ПРАВ:
 *
 * 1. Глобальная роль (User.role):
 *      admin  — полный доступ + админ-панель (первый зарегистрированный).
 *               admin = creator-equivalent ВСЕХ доменов: может редактировать
 *               любой домен и управлять его правами без записи в DomainEditor.
 *      guest  — общий гостевой аккаунт, только просмотр, права не выдаются.
 *
 *    (editor/viewer/member как ГЛОБАЛЬНЫЕ права к доменам больше не действуют —
 *     только пер-доменно через DomainEditor.role ниже. User.role хранится для
 *     обратной совместимости и /admin-панели.)
 *
 * 2. Пер-доменная роль (DomainEditor.role):
 *      creator — полный доступ к домену + управление правами + уведомления.
 *                Может быть несколько создателей (право передаётся).
 *      editor  — редактирование домена.
 *      viewer  — только просмотр (запись фиксирует явный доступ).
 *
 * Уведомления владельца (/api/owner-notifications) получают creator'ы домена
 * (+ admin как creator-equivalent).
 */

export type UserRole = "admin" | "editor" | "viewer" | "member" | "guest";
/** Пер-доменная роль (DomainEditor.role). */
export type DomainRole = "creator" | "editor" | "viewer";

export const READONLY_ROLES: UserRole[] = ["viewer", "guest"];
/** Глобальные роли, которые дают creator-equivalent доступ ко всем доменам. */
export const GLOBAL_OWNER_ROLES: UserRole[] = ["admin"];

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

/** Глобальная роль даёт creator-equivalent доступ ко всем доменам? (admin) */
export function isGlobalOwner(role: string): boolean {
  return GLOBAL_OWNER_ROLES.includes(role as UserRole);
}

/** Глобальная роль — только просмотр без пер-доменных прав? (viewer/guest) */
export function isReadonlyRole(role: string): boolean {
  return READONLY_ROLES.includes(role as UserRole);
}

/**
 * Роль потенциально позволяет редактировать (грубый фильтр).
 * Точную пер-доменную проверку делает canEditDomain/canManageDomainAccess.
 * admin/editor/member — могут (по DomainEditor); viewer/guest — нет.
 * Сохранено для обратной совместимости с API-routes.
 */
export function roleCanEverEdit(role: string): boolean {
  return !isReadonlyRole(role);
}

/**
 * @deprecated Используйте isGlobalOwner. Старое имя для обратной совместимости.
 * Теперь True только для admin (раньше admin+editor, но editor больше
 * не глобальный редактор — его права определяются пер-доменно).
 */
export function isGlobalEditor(role: string): boolean {
  return isGlobalOwner(role);
}

/**
 * Пер-доменная роль пользователя для конкретного домена.
 * admin → 'creator' (без записи в DomainEditor).
 * Иначе — DomainEditor.role или null (нет записи = нет доступа на редактирование,
 * только просмотр как у любого зарегистрированного).
 */
export async function getDomainRole(userId: string, role: string, domainId: string): Promise<DomainRole | null> {
  if (isGlobalOwner(role)) return "creator";
  const right = await prisma.domainEditor.findUnique({
    where: { domainId_userId: { domainId, userId } },
    select: { role: true },
  });
  if (!right) return null;
  return (right.role as DomainRole) || "editor"; // на случай legacy-записей без role
}

/** Может ли пользователь редактировать конкретный домен (creator/editor). */
export async function canEditDomain(userId: string, role: string, domainId: string): Promise<boolean> {
  const dr = await getDomainRole(userId, role, domainId);
  return dr === "creator" || dr === "editor";
}

/** ID доменов, которые пользователь может редактировать. "all" для admin. */
export async function getEditableDomainIds(userId: string, role: string): Promise<string[] | "all"> {
  if (isGlobalOwner(role)) return "all";
  const rights = await prisma.domainEditor.findMany({
    where: {
      userId,
      role: { in: ["creator", "editor"] },
    },
    select: { domainId: true },
  });
  return rights.map((r) => r.domainId);
}

/**
 * Может ли пользователь управлять доступом к домену (выдавать права,
 * одобрять запросы, передавать создательство). Только creator (+ admin).
 */
export async function canManageDomainAccess(userId: string, role: string, domainId: string): Promise<boolean> {
  const dr = await getDomainRole(userId, role, domainId);
  return dr === "creator";
}

/**
 * Является ли пользователь создателем домена (для уведомлений).
 * admin → true для всех доменов. Иначе — DomainEditor.role === 'creator'
 * или Domain.createdById === userId (legacy-совместимость).
 */
export async function isDomainOwner(userId: string, role: string, domainId: string): Promise<boolean> {
  if (isGlobalOwner(role)) return true;
  const dr = await getDomainRole(userId, role, domainId);
  if (dr === "creator") return true;
  // Legacy: домены, где createdById заполнен, но creator-запись ещё не создана.
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { createdById: true },
  });
  return !!domain && domain.createdById === userId;
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
 * canEditTasks=true если роль потенциально позволяет редактировать (точная
 * пер-доменная проверка делает сервер, клиент дополнительно получает
 * editableDomainIds). admin — полный доступ.
 */
export function buildRolePermissions(role: string) {
  const isOwner = isGlobalOwner(role);
  const isReadonly = isReadonlyRole(role);
  const canEdit = isOwner || !isReadonly; // member/editor потенциально редактируют по DomainEditor
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
