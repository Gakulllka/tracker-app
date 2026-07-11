import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSession, roleCanEverEdit } from "@/lib/auth";

/* ================================================================ *
 *  AI-Insights API                                                 *
 * ================================================================ *
 *
 *  Инсайты общие для всех: один инсайт на пару (домен, месяц).
 *  Никакой привязки к пользователю или воркспейсу.
 *  Параметр workspaceId принимается и игнорируется (совместимость
 *  со старым клиентом).
 *
 *  Endpoints:
 *    GET    /api/insights?domainId=...&monthKey=YYYY-MM[&token=...]
 *           → { insight: {...} | null }
 *    PUT    /api/insights
 *           body: { token?, domainId, monthKey, achievements, risks,
 *                   inProgress, nextSteps, dataHash, source }
 *           → upsert по (domainId, monthKey)
 *    DELETE /api/insights?domainId=...&monthKey=...[&token=...]
 */

interface InsightShape {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  nextSteps: string[];
  dataHash: string;
  source: string;
  updatedBy: string;
  updatedAt: string;
}

function parseArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function serialize(row: {
  achievements: string; risks: string; inProgress: string; nextSteps: string;
  dataHash: string; source: string; updatedBy: string; updatedAt: Date;
}): InsightShape {
  return {
    achievements: parseArr(row.achievements),
    risks: parseArr(row.risks),
    inProgress: parseArr(row.inProgress),
    nextSteps: parseArr(row.nextSteps),
    dataHash: row.dataHash,
    source: row.source,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Резолвим домен: клиент может прислать как id, так и имя домена
async function resolveDomainId(idOrName: string): Promise<string | null> {
  const byId = await prisma.domain.findUnique({ where: { id: idOrName } });
  if (byId) return byId.id;
  const byName = await prisma.domain.findUnique({ where: { name: idOrName } });
  return byName?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const domainParam = req.nextUrl.searchParams.get("domainId");
    const monthKey = req.nextUrl.searchParams.get("monthKey");
    if (!domainParam || !monthKey) {
      return NextResponse.json({ error: "Missing domainId or monthKey" }, { status: 400 });
    }

    const domainId = await resolveDomainId(domainParam);
    if (!domainId) return NextResponse.json({ insight: null });

    const row = await prisma.aiInsight.findUnique({
      where: { domainId_monthKey: { domainId, monthKey } },
    });

    return NextResponse.json({ insight: row ? serialize(row) : null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      token, domainId: domainParam, monthKey,
      achievements, risks, inProgress, nextSteps, dataHash, source,
    } = body as {
      token?: string; domainId?: string; monthKey?: string;
      achievements?: string[]; risks?: string[]; inProgress?: string[];
      nextSteps?: string[]; dataHash?: string; source?: string;
    };

    if (!domainParam || !monthKey) {
      return NextResponse.json({ error: "Missing domainId or monthKey" }, { status: 400 });
    }

    const auth = token ? await resolveSession(token) : null;
    if (auth && !roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет изменять инсайты" }, { status: 403 });
    }

    const domainId = await resolveDomainId(domainParam);
    if (!domainId) {
      return NextResponse.json({ error: "Домен не найден" }, { status: 404 });
    }

    const data = {
      achievements: JSON.stringify(achievements || []),
      risks: JSON.stringify(risks || []),
      inProgress: JSON.stringify(inProgress || []),
      nextSteps: JSON.stringify(nextSteps || []),
      dataHash: dataHash || "",
      source: source || "manual",
      updatedBy: auth?.user.username || "",
    };

    const row = await prisma.aiInsight.upsert({
      where: { domainId_monthKey: { domainId, monthKey } },
      create: { domainId, monthKey, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, insight: serialize(row) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const domainParam = req.nextUrl.searchParams.get("domainId");
    const monthKey = req.nextUrl.searchParams.get("monthKey");
    const token = req.nextUrl.searchParams.get("token") || undefined;
    if (!domainParam || !monthKey) {
      return NextResponse.json({ error: "Missing domainId or monthKey" }, { status: 400 });
    }

    const auth = token ? await resolveSession(token) : null;
    if (auth && !roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет удалять инсайты" }, { status: 403 });
    }

    const domainId = await resolveDomainId(domainParam);
    if (!domainId) return NextResponse.json({ success: true });

    await prisma.aiInsight
      .deleteMany({ where: { domainId, monthKey } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
