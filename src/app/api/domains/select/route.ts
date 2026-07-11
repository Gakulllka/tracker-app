import { NextResponse } from "next/server";

/**
 * УСТАРЕЛО. Персонального выбора видимых доменов больше нет:
 * все домены глобальны и видны всем. Эндпоинт оставлен как no-op,
 * чтобы старый клиентский код не получал 404.
 */
export async function POST() {
  return NextResponse.json({ success: true, deprecated: true });
}
