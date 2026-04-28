import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

// GET /api/admin/users?token=xxx
// Returns all users with their permissions. Admin only.
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
        createdAt: true,
        permissions: true,
        sessions: {
          select: { createdAt: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/admin/users — toggle ACTIVE/BLOCKED status
export async function PUT(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { userId, status } = await req.json();
    if (!userId) return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    if (!["ACTIVE", "BLOCKED"].includes(status))
      return NextResponse.json({ error: "Статус должен быть ACTIVE или BLOCKED" }, { status: 400 });
    if (userId === admin.user.id)
      return NextResponse.json({ error: "Нельзя изменить статус своего аккаунта" }, { status: 400 });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, username: true, displayName: true, status: true,
        role: { select: { id: true, name: true, description: true } } },
    });

    // Terminate all active sessions if blocking
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

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
