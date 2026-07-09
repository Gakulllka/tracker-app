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

// GET /api/domains — список всех доменов
export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json({ domains });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/domains — создать новый домен
export async function POST(req: NextRequest) {
  try {
    const { token, name } = await req.json();
    if (!token || !name?.trim()) {
      return NextResponse.json({ error: "Missing token or name" }, { status: 400 });
    }

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Проверяем уникальность
    const existing = await prisma.domain.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Домен с таким названием уже существует" }, { status: 409 });
    }

    const domain = await prisma.domain.create({
      data: { name: name.trim() },
    });

    return NextResponse.json({ success: true, domain: { id: domain.id, name: domain.name } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/domains — удалить домен
export async function DELETE(req: NextRequest) {
  try {
    const { token, domainId } = await req.json();
    if (!token || !domainId) {
      return NextResponse.json({ error: "Missing token or domainId" }, { status: 400 });
    }

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.domain.delete({ where: { id: domainId } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
