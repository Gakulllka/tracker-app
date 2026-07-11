import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/auth";

/** Окно "онлайн": heartbeat приходит раз в минуту, 2 минуты — с запасом. */
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/**
 * GET /api/presence
 * Список пользователей онлайн (по активным сессиям). Доступен любому
 * авторизованному пользователю — в общем мире полезно видеть, кто рядом.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threshold = new Date(Date.now() - ONLINE_WINDOW_MS);
    const sessions = await prisma.session.findMany({
      where: { lastActivity: { gt: threshold }, expiresAt: { gt: new Date() } },
      select: {
        lastActivity: true,
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
      orderBy: { lastActivity: "desc" },
    });

    // Дедуп по пользователю (несколько вкладок/устройств = одна запись)
    const seen = new Set<string>();
    const users: Array<{
      id: string; username: string; displayName: string; role: string; lastActivity: string;
    }> = [];
    for (const s of sessions) {
      if (seen.has(s.user.id)) continue;
      seen.add(s.user.id);
      users.push({
        id: s.user.id,
        username: s.user.username,
        displayName: s.user.displayName,
        role: s.user.role,
        lastActivity: s.lastActivity.toISOString(),
      });
    }

    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
