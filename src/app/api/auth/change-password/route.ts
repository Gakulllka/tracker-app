import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { resolveSessionFromRequest, logActivity, getClientIp } from "@/lib/auth";

/**
 * POST /api/auth/change-password
 * Body: { currentPassword?: string, newPassword: string }
 * Меняет пароль текущего пользователя. Если пароль уже установлен —
 * требуется верный текущий. Гостевой аккаунт менять пароль не может.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.user.role === "guest") {
      return NextResponse.json({ error: "Гостевой аккаунт не имеет пароля" }, { status: 403 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!newPassword || String(newPassword).length < 4) {
      return NextResponse.json(
        { error: "Новый пароль: минимум 4 символа" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    // Пользователи, зарегистрированные до обязательных паролей, могли
    // иметь пустой пароль — для них текущий проверяем против пустой строки.
    const valid = await verifyPassword(String(currentPassword ?? ""), user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Текущий пароль неверен" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(String(newPassword)) },
    });

    await logActivity({
      userId: user.id,
      username: user.username,
      action: "password_change",
      entityType: "user",
      entityId: user.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
