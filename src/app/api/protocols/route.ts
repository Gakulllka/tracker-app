import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSession, resolveSessionFromRequest, roleCanEverEdit, canEditDomain } from "@/lib/auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

// GET /api/protocols?domainId=...
// Возвращает список протоколов (без fileData для экономии трафика)
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const domainId = req.nextUrl.searchParams.get("domainId");
    if (!domainId) {
      return NextResponse.json({ error: "Missing domainId" }, { status: 400 });
    }

    const protocols = await prisma.meetingProtocol.findMany({
      where: { domainId },
      orderBy: { meetingDate: "desc" },
      select: {
        id: true,
        domainId: true,
        title: true,
        meetingDate: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        author: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ protocols });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/protocols
// Body: { token, domainId, title, meetingDate, fileName, fileType, fileSize, fileData, notes? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, domainId, title, meetingDate, fileName, fileType, fileSize, fileData, notes } = body;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const auth = await resolveSession(token);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет загружать протоколы" }, { status: 403 });
    }

    if (!domainId || !title || !meetingDate || !fileName || !fileType || !fileSize || !fileData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Файл слишком большой (максимум 10 МБ)" }, { status: 400 });
    }

    // Проверяем что домен существует
    const domain = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!domain) {
      return NextResponse.json({ error: "Домен не найден" }, { status: 404 });
    }

    // Проверяем права на домен (creator/editor через пер-доменную роль)
    if (!(await canEditDomain(auth.user.id, auth.user.role, domainId))) {
      return NextResponse.json({ error: "Нет прав на редактирование этого домена" }, { status: 403 });
    }

    const protocol = await prisma.meetingProtocol.create({
      data: {
        domainId,
        title,
        meetingDate: new Date(meetingDate),
        fileName,
        fileType,
        fileSize: Number(fileSize),
        fileData,
        author: auth.user.displayName || auth.user.username,
        notes: notes || "",
      },
      select: {
        id: true,
        domainId: true,
        title: true,
        meetingDate: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        author: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, protocol });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/protocols?id=...
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const auth = await resolveSessionFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет удалять протоколы" }, { status: 403 });
    }

    // Находим протокол и проверяем права
    const existing = await prisma.meetingProtocol.findUnique({
      where: { id },
      select: { domainId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Протокол не найден" }, { status: 404 });
    }

    // Проверяем права на домен (creator/editor)
    if (!(await canEditDomain(auth.user.id, auth.user.role, existing.domainId))) {
      return NextResponse.json({ error: "Нет прав на удаление в этом домене" }, { status: 403 });
    }

    await prisma.meetingProtocol.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
