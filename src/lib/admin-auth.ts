import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function validateAdminRequest(
  req: NextRequest
): Promise<{
  user: {
    id: string; username: string; displayName: string;
    role: string; roleId: string; status: string;
  }
} | null> {
  let token = req.nextUrl.searchParams.get("token");
  if (!token) {
    try {
      const body = await req.json();
      token = body.token;
    } catch { /* нет тела */ }
  }
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