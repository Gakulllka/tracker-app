import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/heartbeat
 * Body: { token: string, currentPage?: string }
 *
 * Лёгкий пинг от клиента, что вкладка открыта и пользователь "присутствует".
 * Обновляет Session.lastActivity (и currentPage, если передан).
 *
 * Клиент шлёт раз в ~60 секунд при условиях:
 *   - вкладка не скрыта (document.visibilityState === "visible") ИЛИ
 *   - пользователь активен (был mousemove/keydown за последние N минут)
 *
 * Сервер не возвращает данные — только статус. Поэтому ответ маленький
 * (≈30 байт) и не нагружает соединение.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token: string | undefined = body?.token;
    const currentPage: string | undefined = body?.currentPage;

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      select: { id: true, expiresAt: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (session.expiresAt < new Date()) {
      // Не удаляем — пусть /api/auth/me разлогинит при следующем заходе
      // и зафиксирует это (наш job — просто проверка).
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastActivity: new Date(),
        // currentPage — опциональный, не перезаписываем пустой строкой
        ...(currentPage !== undefined ? { currentPage: String(currentPage).slice(0, 200) } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
