import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth";

// POST /api/auth/logout
// Body: { token: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token: string | undefined = body?.token;
    if (!token) {
      return NextResponse.json({ success: true }); // нечего удалять
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { select: { id: true, username: true } } },
    });

    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      await logActivity({
        userId: session.user.id,
        username: session.user.username,
        action: "logout",
        entityType: "user",
        entityId: session.user.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
