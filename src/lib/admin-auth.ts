import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

/**
 * Validates that the request comes from an admin.
 *
 * Token resolution order:
 *   1. `explicitToken` argument (pass it when you already parsed the body)
 *   2. Query-string  ?token=...
 *
 * ⚠️  Never call req.json() here — the route handler may have already read
 *     the body stream, and Node.js HTTP streams can only be consumed once.
 *     Pass `token` explicitly from the route after parsing the body.
 */
export async function validateAdminRequest(
  req: NextRequest,
  explicitToken?: string
): Promise<{
  user: {
    id: string; username: string; displayName: string;
    role: string; roleId: string; status: string;
  }
} | null> {
  // Prefer explicit token, then query string
  const token = explicitToken ?? req.nextUrl.searchParams.get("token");
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { role: true } } },
  });

  if (!session || session.expiresAt < new Date()) return null;

  if (session.user.role.name.toLowerCase() !== "admin") return null;

  if (session.user.status === "BLOCKED") return null;

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      role: session.user.role.name,
      roleId: session.user.roleId,
      status: session.user.status,
    },
  };
}