import { NextRequest } from "next/server";
import { resolveSession } from "@/lib/auth";

/**
 * Проверяет, что запрос пришёл от админа.
 *
 * Токен берётся из:
 *   1. Аргумента `explicitToken` (передавай его, если тело уже прочитано)
 *   2. Query-string ?token=...
 *
 * ⚠️  Никогда не вызывай req.json() здесь — тело потока читается один раз.
 */
export async function validateAdminRequest(
  req: NextRequest,
  explicitToken?: string
): Promise<{
  user: {
    id: string; username: string; displayName: string;
    role: string; status: string;
  }
} | null> {
  const token = explicitToken ?? req.nextUrl.searchParams.get("token");
  if (!token) return null;

  const auth = await resolveSession(token);
  if (!auth) return null;
  if (auth.user.role !== "admin") return null;

  return { user: auth.user };
}
