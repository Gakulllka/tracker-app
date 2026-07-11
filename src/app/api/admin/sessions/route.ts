import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

/** Окно "пользователь онлайн" в минутах. Клиент шлёт heartbeat раз в минуту. */
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

// GET /api/admin/sessions?token=xxx
export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const sessions = await prisma.session.findMany({
      where: { expiresAt: { gt: new Date() } },
      select: {
        id: true, token: true, ipAddress: true, lastActivity: true,
        currentPage: true, createdAt: true, expiresAt: true,
        user: {
          select: { id: true, username: true, displayName: true, status: true, role: true },
        },
      },
      orderBy: { lastActivity: "desc" },
    });

    const threshold = new Date(Date.now() - ONLINE_WINDOW_MS);
    const enriched = sessions.map((s) => ({
      ...s,
      user: { ...s.user, role: { name: s.user.role } },
      isOnline: s.lastActivity > threshold,
    }));

    return NextResponse.json({ success: true, sessions: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/admin/sessions
// Body: { token, sessionId }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, sessionId } = body;

    const admin = await validateAdminRequest(req, token);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    if (!sessionId) return NextResponse.json({ error: "Укажите sessionId" }, { status: 400 });

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { username: true, displayName: true } } },
    });
    if (!session) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });

    if (session.userId === admin.user.id) {
      return NextResponse.json({ error: "Нельзя завершить свою сессию" }, { status: 400 });
    }

    await prisma.session.delete({ where: { id: sessionId } });

    try {
      await prisma.activityLog.create({
        data: {
          userId: admin.user.id, username: admin.user.username,
          action: "session_end", entityType: "session", entityId: sessionId,
          newValue: JSON.stringify({ targetUser: session.user.username }),
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
