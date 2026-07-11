import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { validateAdminRequest } from "@/lib/admin-auth";

const VALID_ROLES = ["admin", "editor", "viewer", "member"];

// POST /api/admin/create-user
// Body: { token, username, password, displayName?, roleId? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, username, password, displayName, roleId } = body;

    const admin = await validateAdminRequest(req, token);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    if (!username || !password) return NextResponse.json({ error: "Укажите username и password" }, { status: 400 });
    if (username.length < 3) return NextResponse.json({ error: "Минимум 3 символа" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Пароль: минимум 8 символов" }, { status: 400 });

    const role = roleId && VALID_ROLES.includes(roleId) ? roleId : "member";

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return NextResponse.json({ error: "Пользователь уже существует" }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username, passwordHash,
        displayName: displayName || username,
        role,
      },
      select: { id: true, username: true, displayName: true, status: true, role: true },
    });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "register", entityType: "user", entityId: user.id,
          newValue: JSON.stringify({ username: user.username, role }),
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
