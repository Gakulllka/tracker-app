import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ================================================================ *
 *  Phase 4: AI-Insights API                                        *
 * ================================================================ *
 *
 *  Все запросы аутентифицируются через workspaceId (тот же паттерн
 *  что и в /api/sync). По workspaceId находим userId и привязываем
 *  инсайты к нему.
 *
 *  Endpoints:
 *    GET    /api/insights?workspaceId=...&domainId=...&monthKey=YYYY-MM
 *           → возвращает существующий инсайт или null
 *    PUT    /api/insights
 *           body: { workspaceId, domainId, monthKey, achievements, risks,
 *                   inProgress, nextSteps, dataHash, source }
 *           → upsert (создаёт или перезаписывает)
 *    DELETE /api/insights?workspaceId=...&domainId=...&monthKey=...
 *           → удаляет
 */

interface InsightShape {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  summary: string[];
  dataHash: string;
  source: "ai" | "manual" | "edited";
  updatedAt: string;
}

async function resolveUserId(workspaceId: string): Promise<string | null> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { userId: true },
  });
  return ws?.userId ?? null;
}

function deserializeInsight(row: {
  achievements: string;
  risks: string;
  inProgress: string;
  nextSteps: string;
  dataHash: string;
  source: string;
  updatedAt: Date;
}): InsightShape {
  const parseArr = (s: string): string[] => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  return {
    achievements: parseArr(row.achievements),
    risks: parseArr(row.risks),
    inProgress: parseArr(row.inProgress),
    summary: parseArr(row.nextSteps),
    dataHash: row.dataHash || "",
    source: (row.source as "ai" | "manual" | "edited") || "manual",
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ────────────────────────────── GET ──────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const domainId = req.nextUrl.searchParams.get("domainId");
    const monthKey = req.nextUrl.searchParams.get("monthKey");

    if (!workspaceId || !domainId || !monthKey) {
      return NextResponse.json({ error: "Missing required params: workspaceId, domainId, monthKey" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json({ error: "Invalid monthKey format (expected YYYY-MM)" }, { status: 400 });
    }

    const userId = await resolveUserId(workspaceId);
    if (!userId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const row = await prisma.aiInsight.findUnique({
      where: {
        userId_domainId_monthKey: { userId, domainId, monthKey },
      },
    });

    if (!row) {
      return NextResponse.json({ insight: null });
    }

    return NextResponse.json({ insight: deserializeInsight(row) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────── PUT (upsert) ──────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, domainId, monthKey } = body;

    if (!workspaceId || !domainId || !monthKey) {
      return NextResponse.json({ error: "Missing required fields: workspaceId, domainId, monthKey" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json({ error: "Invalid monthKey format (expected YYYY-MM)" }, { status: 400 });
    }

    const userId = await resolveUserId(workspaceId);
    if (!userId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const sanitizeArr = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v.filter((x): x is string => typeof x === "string").slice(0, 20);
    };

    const achievements = sanitizeArr(body.achievements);
    const risks = sanitizeArr(body.risks);
    const inProgress = sanitizeArr(body.inProgress);
    const summary = sanitizeArr(body.summary);
    const dataHash = typeof body.dataHash === "string" ? body.dataHash.slice(0, 200) : "";
    const source =
      body.source === "ai" || body.source === "manual" || body.source === "edited" ? body.source : "manual";

    const row = await prisma.aiInsight.upsert({
      where: {
        userId_domainId_monthKey: { userId, domainId, monthKey },
      },
      create: {
        userId,
        domainId,
        monthKey,
        achievements: JSON.stringify(achievements),
        risks: JSON.stringify(risks),
        inProgress: JSON.stringify(inProgress),
        nextSteps: JSON.stringify(summary),
        dataHash,
        source,
      },
      update: {
        achievements: JSON.stringify(achievements),
        risks: JSON.stringify(risks),
        inProgress: JSON.stringify(inProgress),
        nextSteps: JSON.stringify(summary),
        dataHash,
        source,
      },
    });

    return NextResponse.json({ insight: deserializeInsight(row) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────── DELETE ──────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const domainId = req.nextUrl.searchParams.get("domainId");
    const monthKey = req.nextUrl.searchParams.get("monthKey");

    if (!workspaceId || !domainId || !monthKey) {
      return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }

    const userId = await resolveUserId(workspaceId);
    if (!userId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    await prisma.aiInsight.deleteMany({
      where: { userId, domainId, monthKey },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
