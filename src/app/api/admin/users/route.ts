import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

const ROLE_META: Record<string, { name: string; description: string }> = {
  admin:  { name: "admin",  description: "Полный доступ и админ-панель" },
  editor: { name: "editor", description: "Редактирует все домены" },
  viewer: { name: "viewer", description: "Только просмотр" },
  member: { name: "member", description: "Редактирует свои домены" },
  guest:  { name: "guest",  description: "Гость — только просмотр" },
};

function roleObject(role: string) {
  const meta = ROLE_META[role] || { name: role, description: "" };
  return { id: role, name: meta.name, description: meta.description };
}

// GET /api/admin/users?token=xxx
export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        domainRights: {
          select: { domainId: true, domain: { select: { name: true } } },
        },
        sessions: {
          select: { createdAt: true, expiresAt: true, lastActivity: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: roleObject(u.role),
        roleId: u.role,
        status: u.status,
        createdAt: u.createdAt,
        sessions: u.sessions,
        editableDomains: u.domainRights.map((r) => ({ id: r.domainId, name: r.domain.name })),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/admin/users — блокировка/разблокировка
// Body: { token, userId, status }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, userId, status } = body;

    const admin = await validateAdminRequest(req, token);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    if (!userId) return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    if (!["ACTIVE", "BLOCKED"].includes(status))
      return NextResponse.json({ error: "Статус должен быть ACTIVE или BLOCKED" }, { status: 400 });
    if (userId === admin.user.id)
      return NextResponse.json({ error: "Нельзя изменить статус своего аккаунта" }, { status: 400 });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, username: true, displayName: true, status: true, role: true },
    });

    if (status === "BLOCKED") {
      await prisma.session.deleteMany({ where: { userId } });
    }

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: status === "BLOCKED" ? "user_block" : "user_unblock",
          entityType: "user", entityId: userId,
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      user: { ...user, role: roleObject(user.role) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
