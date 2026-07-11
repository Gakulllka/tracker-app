import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateSessionToken } from "@/lib/password";
import { getClientIp, logActivity, publicUser } from "@/lib/auth";

// POST /api/auth/register
// Body: { username: string, password: string, displayName?: string }
// Первый зарегистрированный пользователь автоматически становится админом.
// Остальные получают роль "member" (редактируют домены, которые создали
// или куда им выдали права; остальное — только просмотр).
export async function POST(req: NextRequest) {
  try {
    const { username, password, displayName } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "Укажите имя пользователя" }, { status: 400 });
    }
    if (username.length < 3) {
      return NextResponse.json(
        { error: "Имя пользователя должно быть не менее 3 символов" },
        { status: 400 }
      );
    }
    if (username.toLowerCase() === "guest") {
      return NextResponse.json({ error: "Это имя зарезервировано" }, { status: 409 });
    }
    if (!password || String(password).length < 4) {
      return NextResponse.json(
        { error: "Пароль обязателен: минимум 4 символа" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким именем уже существует" },
        { status: 409 }
      );
    }

    // Первый пользователь (не считая гостя) — всегда админ
    const userCount = await prisma.user.count({ where: { role: { not: "guest" } } });
    const role = userCount === 0 ? "admin" : "member";

    const passwordHash = await hashPassword(String(password));
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: displayName || username,
        role,
      },
    });

    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.session.create({
      data: { token, userId: user.id, expiresAt, ipAddress: getClientIp(req) },
    });

    await logActivity({
      userId: user.id,
      username: user.username,
      action: "register",
      entityType: "user",
      entityId: user.id,
      newValue: JSON.stringify({ username: user.username, role }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      user: publicUser(user),
      token,
      // Совместимость со старым фронтендом: единое общее пространство
      workspaceId: "global",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
