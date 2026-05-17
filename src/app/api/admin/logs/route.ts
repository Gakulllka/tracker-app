import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

// Тип where собираем как обычный объект — Prisma примет его на рантайме.
// Не импортируем Prisma namespace, чтобы не привязываться к именам внутри
// сгенерированного клиента (они меняются между мажорными версиями).
interface DateFilter { gte?: Date; lte?: Date }
interface LogWhere {
  action?: string;
  createdAt?: DateFilter;
  OR?: Array<Record<string, { contains: string; mode?: "insensitive" }>>;
}

/**
 * GET /api/admin/logs?token=xxx&limit=100&offset=0
 *                    &action=task_update&search=37185
 *                    &dateFrom=2025-05-01&dateTo=2025-05-31
 *
 * Returns paginated activity logs with filtering. Admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(searchParams.get("limit") || "100", 10) || 100));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const action = searchParams.get("action");
    const search = searchParams.get("search")?.trim();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: LogWhere = {};
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        // dateTo считается включительно: до конца указанного дня
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { entityType: { contains: search, mode: "insensitive" } },
        { oldValue: { contains: search, mode: "insensitive" } },
        { newValue: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({ success: true, logs, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/logs
 * Body: { token, action, entityType?, entityId?, oldValue?, newValue? }
 *
 * Manually create an activity log entry. Admin only.
 * (Used for diagnostic / system events not covered by automatic logging.)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, action, entityType, entityId, oldValue, newValue } = body;

    const admin = await validateAdminRequest(req, token);
    if (!admin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    if (!action) {
      return NextResponse.json({ error: "Укажите action" }, { status: 400 });
    }

    const log = await prisma.activityLog.create({
      data: {
        userId: admin.user.id,
        username: admin.user.username,
        action: String(action),
        entityType: entityType ? String(entityType) : "",
        entityId: entityId ? String(entityId) : "",
        oldValue: oldValue ? String(oldValue) : "",
        newValue: newValue ? String(newValue) : "",
      },
    });

    return NextResponse.json({ success: true, log });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
