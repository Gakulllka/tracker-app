import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateSessionToken } from "@/lib/password";
import { getClientIp, logActivity, publicUser } from "@/lib/auth";
import { loginBlockedFor, recordLoginFail, recordLoginSuccess } from "@/lib/rate-limit";

// POST /api/auth/login
// Body: { username: string, password: string }
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "Укажите имя пользователя" }, { status: 400 });
    }

    // Защита от перебора: 5 неудач за 10 минут → блок на 15 минут
    const rlKey = `${String(username).toLowerCase()}|${getClientIp(req)}`;
    const blockedSec = loginBlockedFor(rlKey);
    if (blockedSec > 0) {
      return NextResponse.json(
        { error: `Слишком много неудачных попыток. Попробуйте через ${Math.ceil(blockedSec / 60)} мин.` },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      recordLoginFail(rlKey);
      return NextResponse.json(
        { error: "Неверное имя пользователя или пароль" },
        { status: 401 }
      );
    }

    if (user.status === "BLOCKED") {
      return NextResponse.json(
        { error: "Аккаунт заблокирован. Обратитесь к администратору." },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password || "", user.passwordHash);
    if (!valid) {
      recordLoginFail(rlKey);
      return NextResponse.json(
        { error: "Неверное имя пользователя или пароль" },
        { status: 401 }
      );
    }
    recordLoginSuccess(rlKey);

    // Чистим просроченные сессии пользователя
    await prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
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
      action: "login",
      entityType: "user",
      entityId: user.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      user: publicUser(user),
      token,
      workspaceId: "global",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
