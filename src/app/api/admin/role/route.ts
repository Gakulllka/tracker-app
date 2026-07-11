import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

const VALID_ROLES = ["admin", "editor", "viewer", "member"];

// PUT /api/admin/role — сменить роль пользователя
// Body: { token, userId, roleId }  (roleId = "admin" | "editor" | "viewer" | "member")
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, userId, roleId } = body;

    const admin = await validateAdminRequest(req, token);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    if (!userId || !roleId) return NextResponse.json({ error: "Укажите userId и roleId" }, { status: 400 });
    if (!VALID_ROLES.includes(roleId)) {
      return NextResponse.json({ error: "Неизвестная роль" }, { status: 404 });
    }
    if (userId === admin.user.id) return NextResponse.json({ error: "Нельзя изменить свою роль" }, { status: 400 });

    const oldUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, role: true },
    });
    if (!oldUser) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    if (oldUser.role === "guest") {
      return NextResponse.json({ error: "Роль гостя изменить нельзя" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: roleId },
      select: { id: true, username: true, displayName: true, status: true, role: true },
    });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "role_change", entityType: "user", entityId: userId,
          oldValue: JSON.stringify({ role: oldUser.role }),
          newValue: JSON.stringify({ role: roleId }),
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      user: { ...user, role: { id: user.role, name: user.role, description: "" } },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/admin/role — удалить аккаунт пользователя
// Body: { token, userId }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, userId } = body;

    const admin = await validateAdminRequest(req, token);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    if (!userId) return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    if (userId === admin.user.id) return NextResponse.json({ error: "Нельзя удалить свой аккаунт" }, { status: 400 });

    const deletedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, role: true },
    });
    if (!deletedUser) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    // Каскад удалит сессии, права DomainEditor и запросы EditRequest
    await prisma.user.delete({ where: { id: userId } });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "user_delete", entityType: "user", entityId: userId,
          oldValue: JSON.stringify({ username: deletedUser.username, role: deletedUser.role }),
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
