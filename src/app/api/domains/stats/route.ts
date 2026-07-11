import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/auth";

/**
 * GET /api/domains/stats?domainId=...
 * Количество данных в домене — для осмысленного подтверждения
 * удаления/архивации ("будет удалено N задач...").
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const domainId = req.nextUrl.searchParams.get("domainId");
    if (!domainId) return NextResponse.json({ error: "Missing domainId" }, { status: 400 });

    const [tasks, backlog, questions] = await Promise.all([
      prisma.task.count({ where: { domainId, deleted: false } }),
      prisma.backlogItem.count({ where: { domainId, deleted: false } }),
      prisma.question.count({ where: { domainId } }),
    ]);

    return NextResponse.json({ success: true, stats: { tasks, backlog, questions } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
