import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/auth";

// GET /api/users — список активных пользователей (для выдачи прав и т.п.)
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
      },
      orderBy: { displayName: "asc" },
    });

    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
