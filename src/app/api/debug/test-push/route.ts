import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/debug/test-push
 * Тестирует что sync push работает.
 * Body: { token }
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "No token" }, { status: 400 });

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.userId },
    });
    if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 404 });

    // Пробуем записать тестовые данные
    const testData = {
      default: {
        allData: {
          "2026-01": [{
            id: "test-1",
            num: "T-001",
            name: "Тестовая задача",
            planH: "8",
            factH: "4",
            priority: "Средний",
            status: "В работе",
            comment: "",
            commentLog: [],
          }],
        },
        backlog: [],
      },
    };

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { allData: JSON.stringify(testData), updatedAt: new Date() },
    });

    // Проверяем что записалось
    const check = await prisma.workspace.findUnique({ where: { id: workspace.id } });

    return NextResponse.json({
      success: true,
      workspaceId: workspace.id,
      allDataLength: check?.allData?.length || 0,
      allDataPreview: check?.allData?.substring(0, 200),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
