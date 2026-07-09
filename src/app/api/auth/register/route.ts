import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateSessionToken } from "@/lib/password";

// POST /api/auth/register
// Body: { username: string, password: string, displayName?: string }
export async function POST(req: NextRequest) {
  try {
    const { username, password, displayName } = await req.json();

    if (!username) {
      return NextResponse.json(
        { error: "Укажите имя пользователя" },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Имя пользователя должно быть не менее 3 символов" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким именем уже существует" },
        { status: 409 }
      );
    }

    // Check if this is the first user (they become admin automatically)
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    // Create user — пароль может быть пустым
    const passwordHash = password ? await hashPassword(password) : await hashPassword("");
    const defaultRole = await prisma.role.findFirst({
      where: { name: isFirstUser ? "admin" : "editor" },
    });
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: displayName || username,
        roleId: defaultRole!.id,
      },
    });

    // Create default workspace for the user
    const workspace = await prisma.workspace.create({
      data: {
        name: "Моё пространство",
        userId: user.id,
      },
    });

    // Create session
    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Log registration event
    try {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          username: user.username,
          action: "register",
          entityType: "user",
          entityId: user.id,
          newValue: JSON.stringify({ username: user.username, displayName: user.displayName }),
        },
      });
    } catch { /* ignore log errors */ }

    const userRole = await prisma.role.findUnique({ where: { id: user.roleId } });
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: userRole?.name?.toLowerCase() || "viewer",
      },
      token,
      workspaceId: workspace.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
