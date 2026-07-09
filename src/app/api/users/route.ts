import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
//  Auth helpers
// ---------------------------------------------------------------------------

async function resolveUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

// ---------------------------------------------------------------------------
//  GET — return list of all active users
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
      orderBy: { displayName: "asc" },
    });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}