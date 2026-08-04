import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/auth";

// GET /api/protocols/[id]?token=...
// Возвращает файл для скачивания или предпросмотра
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await resolveSessionFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const protocol = await prisma.meetingProtocol.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileData: true,
        author: true,
        meetingDate: true,
      },
    });

    if (!protocol) {
      return NextResponse.json({ error: "Протокол не найден" }, { status: 404 });
    }

    // Возвращаем base64 данные для скачивания/предпросмотра на клиенте
    return NextResponse.json({
      id: protocol.id,
      title: protocol.title,
      fileName: protocol.fileName,
      fileType: protocol.fileType,
      fileSize: protocol.fileSize,
      fileData: protocol.fileData,
      author: protocol.author,
      meetingDate: protocol.meetingDate,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
