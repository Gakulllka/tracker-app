import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSessionFromRequest,
  canEditDomain,
  logActivity,
  getClientIp,
} from "@/lib/auth";

/**
 * Корзина: мягко удалённые задачи и позиции бэклога (tombstone).
 *
 * GET  /api/trash?domainId=...  → { items: [{type, id, num, name, monthKey?, updatedBy, deletedAt}] }
 * POST /api/trash { type: "task"|"backlog", id }  → восстановить
 *      (нужно право редактирования домена; ts обновляется, чтобы LWW
 *       не дал старым клиентским tombstone'ам удалить задачу снова)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const domainId = req.nextUrl.searchParams.get("domainId");
    if (!domainId) return NextResponse.json({ error: "Missing domainId" }, { status: 400 });

    const [tasks, backlogItems] = await Promise.all([
      prisma.task.findMany({
        where: { domainId, deleted: true },
        select: { id: true, num: true, name: true, monthKey: true, updatedBy: true, ts: true },
        orderBy: { ts: "desc" },
        take: 200,
      }),
      prisma.backlogItem.findMany({
        where: { domainId, deleted: true },
        select: { id: true, num: true, name: true, updatedBy: true, ts: true },
        orderBy: { ts: "desc" },
        take: 200,
      }),
    ]);

    const items = [
      ...tasks.map((t) => ({
        type: "task" as const,
        id: t.id, num: t.num, name: t.name, monthKey: t.monthKey,
        updatedBy: t.updatedBy, deletedAt: t.ts.toISOString(),
      })),
      ...backlogItems.map((t) => ({
        type: "backlog" as const,
        id: t.id, num: t.num, name: t.name, monthKey: null,
        updatedBy: t.updatedBy, deletedAt: t.ts.toISOString(),
      })),
    ].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));

    return NextResponse.json({ success: true, items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { type, id } = await req.json();
    if (!id || (type !== "task" && type !== "backlog")) {
      return NextResponse.json({ error: "Нужны type (task|backlog) и id" }, { status: 400 });
    }

    const row = type === "task"
      ? await prisma.task.findUnique({ where: { id }, select: { id: true, domainId: true, name: true, num: true, deleted: true } })
      : await prisma.backlogItem.findUnique({ where: { id }, select: { id: true, domainId: true, name: true, num: true, deleted: true } });

    if (!row) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    if (!row.deleted) return NextResponse.json({ error: "Запись не удалена" }, { status: 409 });

    const allowed = await canEditDomain(auth.user.id, auth.user.role, row.domainId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Нет прав на редактирование этого домена" },
        { status: 403 }
      );
    }

    // ts=now: восстановление свежее любого старого клиентского tombstone —
    // LWW не даст «переудалить» задачу отставшим клиентом.
    const data = { deleted: false, ts: new Date(), updatedBy: auth.user.username };
    if (type === "task") await prisma.task.update({ where: { id }, data });
    else await prisma.backlogItem.update({ where: { id }, data });

    await logActivity({
      userId: auth.user.id,
      username: auth.user.username,
      action: "restore",
      entityType: type,
      entityId: id,
      details: JSON.stringify({ name: row.name, num: row.num }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
