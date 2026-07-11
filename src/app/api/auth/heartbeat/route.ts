import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/auth";

/**
 * POST /api/auth/heartbeat
 * Body: { token: string, currentPage?: string }
 *
 * Лёгкий пинг от клиента, что вкладка открыта. Обновляет Session.lastActivity
 * (и currentPage/ipAddress). Используется админкой для списка "кто онлайн".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token: string | undefined = body?.token;
    const currentPage: string | undefined = body?.currentPage;

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const session = await prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastActivity: new Date(),
        ipAddress: getClientIp(req) || undefined,
        ...(currentPage !== undefined ? { currentPage } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
