import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

// POST /api/domains/select — выбрать активный домен
export async function POST(req: NextRequest) {
  try {
    const { token, domainId, domainIds } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ids = domainIds || (domainId ? [domainId] : []);

    // Сохраняем выбранные домены в пользователе
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { selectedDomains: JSON.stringify(ids) },
    });

    return NextResponse.json({ success: true, domainIds: ids });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
