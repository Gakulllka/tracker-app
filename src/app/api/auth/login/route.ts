import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateSessionToken } from "@/lib/password";

// POST /api/auth/login
// Body: { username: string, password: string }
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username) {
      return NextResponse.json(
        { error: "Укажите имя пользователя" },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json(
        { error: "Неверное имя пользователя или пароль" },
        { status: 401 }
      );
    }

    // Check if user is blocked
    if (user.status === "BLOCKED") {
      return NextResponse.json(
        { error: "Аккаунт заблокирован. Обратитесь к администратору." },
        { status: 403 }
      );
    }

    // Verify password — если пароль пустой, проверяем что и в базе пустой
    if (password) {
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Неверное имя пользователя или пароль" },
          { status: 401 }
        );
      }
    } else {
      // Если пользователь ввёл пустой пароль — проверяем что в базе тоже пустой
      const validEmpty = await verifyPassword("", user.passwordHash);
      if (!validEmpty) {
        return NextResponse.json(
          { error: "Неверное имя пользователя или пароль" },
          { status: 401 }
        );
      }
    }

    // Find or create default workspace
    let workspace = await prisma.workspace.findFirst({
      where: { userId: user.id },
    });
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: "Моё пространство",
          userId: user.id,
        },
      });
    }

    // Clean up old sessions for this user
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() },
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

    // Log the login event
    try {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          username: user.username,
          action: "login",
          entityType: "user",
          entityId: user.id,
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
