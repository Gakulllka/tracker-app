import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth";

/**
 * СОВМЕСТИМОСТЬ. Воркспейсов больше нет — есть единый общий мир.
 * Возвращаем пустой список доступных "чужих" пространств, чтобы старый
 * клиентский код (переключатель воркспейсов) ничего не показывал.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || undefined;
  const auth = await resolveSession(token);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, workspaces: [] });
}
