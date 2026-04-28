import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

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
          select: { id: true, username: true, displayName: true, status: true,
            role: { select: { name: true } } },
        },
      },
      orderBy: { lastActivity: "desc" },
    });

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const enriched = sessions.map((s) => ({
      ...s,
      isOnline: s.lastActivity > fiveMinAgo,
    }));

    return NextResponse.json({ success: true, sessions: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

    const { sessionId } = await req.json();
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
        },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}