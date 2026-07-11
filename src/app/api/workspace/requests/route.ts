import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth";

/**
 * СОВМЕСТИМОСТЬ. Запросы доступа к воркспейсам заменены запросами прав
 * редактирования доменов: см. /api/domains/access.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || undefined;
  const auth = await resolveSession(token);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, requests: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Запросы доступа к воркспейсам заменены: используйте /api/domains/access" },
    { status: 410 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Запросы доступа к воркспейсам заменены: используйте /api/domains/access" },
    { status: 410 }
  );
}
