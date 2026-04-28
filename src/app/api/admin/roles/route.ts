import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const roles = await prisma.role.findMany({
      select: {
        id: true, name: true, description: true, permissions: true,
        isSystem: true, createdAt: true, updatedAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, roles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { name, description, permissions } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Укажите название роли" }, { status: 400 });

    const existing = await prisma.role.findUnique({ where: { name: name.trim() } });
    if (existing) return NextResponse.json({ error: "Роль уже существует" }, { status: 409 });

    const defaultPerms = {
      canViewTasks: true, canEditTasks: false, canDeleteTasks: false,
      canViewBacklog: true, canEditBacklog: false, canDeleteBacklog: false,
      canViewQuestions: true, canEditQuestions: false, canDeleteQuestions: false,
      canViewPresentations: true, canCreatePresentations: false,
      canUseAI: false, visibleDomains: "all",
    };

    const role = await prisma.role.create({
      data: {
        name: name.trim(),
        description: description || "",
        permissions: JSON.stringify(permissions || defaultPerms),
        isSystem: false,
      },
    });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "role_create", entityType: "role", entityId: role.id,
          newValue: JSON.stringify({ name: role.name }),
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true, role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { roleId, name, description, permissions } = await req.json();
    if (!roleId) return NextResponse.json({ error: "Укажите roleId" }, { status: 400 });

    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });

    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);

    const role = await prisma.role.update({ where: { id: roleId }, data: updateData });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "role_update", entityType: "role", entityId: roleId,
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true, role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { roleId } = await req.json();
    if (!roleId) return NextResponse.json({ error: "Укажите roleId" }, { status: 400 });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });
    if (role.isSystem) return NextResponse.json({ error: "Системную роль нельзя удалить" }, { status: 400 });

    const usersWithRole = await prisma.user.count({ where: { roleId } });
    if (usersWithRole > 0) {
      const editorRole = await prisma.role.findFirst({ where: { id: "role_editor" } });
      if (editorRole) {
        await prisma.user.updateMany({ where: { roleId }, data: { roleId: editorRole.id } });
      }
    }

    await prisma.role.delete({ where: { id: roleId } });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "role_delete", entityType: "role", entityId: roleId,
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}