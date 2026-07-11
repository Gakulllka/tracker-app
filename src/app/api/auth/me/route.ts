import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getTokenFromRequest,
  resolveSession,
  touchSession,
  getClientIp,
  buildRolePermissions,
  getEditableDomainIds,
  publicUser,
} from "@/lib/auth";

/**
 * GET /api/auth/me?token=<sessionToken>
 *
 * Валидирует токен и возвращает:
 *   - user (id, username, displayName, role)
 *   - workspaceId: "global" (совместимость — воркспейсов больше нет)
 *   - rolePermissions — права роли в формате, который ждёт usePermissions
 *   - editableDomainIds — "all" | string[] — домены, доступные на редактирование
 */
export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, role: true, status: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }
    if (session.user.status === "BLOCKED") {
      return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
    }

    await touchSession(session.id, getClientIp(req));

    const editableDomainIds = await getEditableDomainIds(session.user.id, session.user.role);

    return NextResponse.json({
      success: true,
      user: {
        ...publicUser(session.user),
        roleName: session.user.role,
      },
      workspaceId: "global",
      accessibleWorkspaces: [],
      permissions: null,
      rolePermissions: buildRolePermissions(session.user.role),
      editableDomainIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Совместимость: некоторые клиенты могут дергать /me как резолвер сессии
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token: string | undefined = body?.token;
  const auth = await resolveSession(token);
  if (!auth) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  return NextResponse.json({ success: true, user: publicUser(auth.user) });
}
