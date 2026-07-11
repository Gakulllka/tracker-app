import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateSessionToken } from "@/lib/password";
import { getClientIp, logActivity, publicUser } from "@/lib/auth";

// POST /api/auth/guest
// Гость — один общий пользователь с ролью "guest": видит всё,
// не может редактировать ничего, права редактирования ему выдать нельзя.
export async function POST(req: NextRequest) {
  try {
    let guestUser = await prisma.user.findUnique({ where: { username: "guest" } });

    if (!guestUser) {
      const passwordHash = await hashPassword("guest");
      guestUser = await prisma.user.create({
        data: {
          username: "guest",
          passwordHash,
          displayName: "Гость",
          role: "guest",
          status: "ACTIVE",
        },
      });
    }

    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1); // сутки — для тестирования

    await prisma.session.create({
      data: { token, userId: guestUser.id, expiresAt, ipAddress: getClientIp(req) },
    });

    await logActivity({
      userId: guestUser.id,
      username: guestUser.username,
      action: "guest_login",
      entityType: "user",
      entityId: guestUser.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      user: publicUser(guestUser),
      token,
      workspaceId: "global",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
