import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateSessionToken } from "@/lib/password";

// POST /api/auth/guest
// Гость — один общий пользователь, который видит все задачи без исключения,
// но не может их редактировать (read-only).
export async function POST(req: NextRequest) {
  try {
    // Ищем или создаём роль "guest"
    let guestRole = await prisma.role.findFirst({
      where: { name: { in: ["guest", "Guest", "GUEST"] } },
    });

    if (!guestRole) {
      // Создаём роль guest с read-only правами
      guestRole = await prisma.role.create({
        data: {
          name: "guest",
          description: "Гость — просмотр всех задач без возможности редактирования",
          permissions: JSON.stringify({
            canViewTasks: true,
            canEditTasks: false,
            canDeleteTasks: false,
            canViewBacklog: true,
            canEditBacklog: false,
            canDeleteBacklog: false,
            canViewQuestions: true,
            canEditQuestions: false,
            canDeleteQuestions: false,
            canViewPresentations: true,
            canCreatePresentations: false,
            canUseAI: false,
          }),
          isSystem: true,
        },
      });
    }

    // Ищем или создаём пользователя "guest" (один на всех)
    let guestUser = await prisma.user.findUnique({
      where: { username: "guest" },
    });

    if (!guestUser) {
      const passwordHash = await hashPassword("guest");
      guestUser = await prisma.user.create({
        data: {
          username: "guest",
          passwordHash,
          displayName: "Гость",
          roleId: guestRole.id,
          status: "ACTIVE",
        },
      });
    }

    // Ищем workspace гостя
    let workspace = await prisma.workspace.findFirst({
      where: { userId: guestUser.id },
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: "Моё пространство",
          userId: guestUser.id,
        },
      });
    }

    // Создаём сессию
    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1); // 1 день для тестирования

    await prisma.session.create({
      data: {
        token,
        userId: guestUser.id,
        expiresAt,
      },
    });

    // Логируем вход
    try {
      await prisma.activityLog.create({
        data: {
          userId: guestUser.id,
          username: guestUser.username,
          action: "guest_login",
          entityType: "user",
          entityId: guestUser.id,
        },
      });
    } catch { /* ignore log errors */ }

    return NextResponse.json({
      success: true,
      user: {
        id: guestUser.id,
        username: guestUser.username,
        displayName: guestUser.displayName,
        role: "guest",
      },
      token,
      workspaceId: workspace.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
