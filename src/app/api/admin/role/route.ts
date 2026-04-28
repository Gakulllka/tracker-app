import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

export async function PUT(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { userId, roleId } = await req.json();
    if (!userId || !roleId) return NextResponse.json({ error: "Укажите userId и roleId" }, { status: 400 });

    const targetRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!targetRole) return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });

    if (userId === admin.user.id) return NextResponse.json({ error: "Нельзя изменить свою роль" }, { status: 400 });

    const oldUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true, role: { select: { name: true } } },
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { roleId },
      select: {
        id: true, username: true, displayName: true, status: true,
        role: { select: { id: true, name: true, description: true } },
      },
    });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "role_change", entityType: "user", entityId: userId,
          oldValue: JSON.stringify({ role: oldUser?.role?.name }),
          newValue: JSON.stringify({ role: targetRole.name }),
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    if (userId === admin.user.id) return NextResponse.json({ error: "Нельзя удалить свой аккаунт" }, { status: 400 });

    const deletedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true, role: { select: { name: true } } },
    });

    await prisma.userPermission.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.workspace.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    if (deletedUser) {
      try {
        await prisma.activityLog.create({
          data: {
            userId: admin.user.id, username: admin.user.username,
            action: "user_delete", entityType: "user", entityId: userId,
            oldValue: JSON.stringify({ username: deletedUser.username, role: deletedUser.role?.name }),
          },
        });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}