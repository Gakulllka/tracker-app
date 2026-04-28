import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

// GET /api/admin/logs?token=xxx&limit=100
// Returns activity logs. Admin only.
export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get("limit") || "100";
    const limit = Math.max(1, Math.min(500, parseInt(limitRaw, 10) || 100));
    const action = searchParams.get("action");

    const where = action ? { action } : {};

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
    });

    return NextResponse.json({ success: true, logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/admin/logs
// Body: { action: string, details?: string }
// Creates an activity log entry. Admin only.
export async function POST(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const body = await req.json();
    const { action, details } = body;

    if (!action) {
      return NextResponse.json({ error: "Укажите action" }, { status: 400 });
    }

    const log = await prisma.activityLog.create({
      data: {
        action,
        details: details || "",
        userId: body.userId || "",
        username: body.username || "",
      },
    });

    return NextResponse.json({ success: true, log });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
