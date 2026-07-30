import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEditDomain, logActivity, resolveSession } from "@/lib/auth";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isClosedMonth(monthKey: string): boolean {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return monthKey < current;
}

async function resolveDomainId(idOrName: string): Promise<string | null> {
  const row = await prisma.domain.findFirst({
    where: { OR: [{ id: idOrName }, { name: idOrName }] },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function calculateCounts(domainId: string, monthKey: string) {
  const [monthlyTasksCount, ideasCount, backlogCount] = await Promise.all([
    prisma.task.count({ where: { domainId, monthKey, deleted: false, status: { not: "Идея" } } }),
    prisma.task.count({ where: { domainId, deleted: false, status: "Идея" } }),
    prisma.backlogItem.count({ where: { domainId, deleted: false } }),
  ]);
  return { monthlyTasksCount, backlogCount, ideasCount };
}

async function ensureSystemSnapshot(domainId: string, monthKey: string) {
  let snapshot = await prisma.domainMonthlySnapshot.findUnique({
    where: { domainId_monthKey: { domainId, monthKey } },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (snapshot || !isClosedMonth(monthKey)) return snapshot;

  const counts = await calculateCounts(domainId, monthKey);
  snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.domainMonthlySnapshot.create({ data: { domainId, monthKey } });
    const version = await tx.domainMonthlySnapshotVersion.create({
      data: { snapshotId: created.id, versionNumber: 1, ...counts, versionType: "system", createdByUsername: "Система" },
    });
    return tx.domainMonthlySnapshot.update({
      where: { id: created.id },
      data: { activeVersionId: version.id },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
  });
  return snapshot;
}

function serialize(snapshot: Awaited<ReturnType<typeof ensureSystemSnapshot>>, live?: { monthlyTasksCount: number; backlogCount: number; ideasCount: number }) {
  if (!snapshot) return { closed: false, active: live ? { ...live, total: live.monthlyTasksCount + live.backlogCount + live.ideasCount } : null, versions: [] };
  const active = snapshot.versions.find((v) => v.id === snapshot.activeVersionId) ?? snapshot.versions[0] ?? null;
  return {
    closed: true,
    active: active ? { ...active, total: active.monthlyTasksCount + active.backlogCount + active.ideasCount } : null,
    versions: snapshot.versions.map((v) => ({ ...v, total: v.monthlyTasksCount + v.backlogCount + v.ideasCount, active: v.id === snapshot.activeVersionId })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const domainParam = req.nextUrl.searchParams.get("domainId") || "";
    const monthKey = req.nextUrl.searchParams.get("monthKey") || "";
    if (!domainParam || !MONTH_RE.test(monthKey)) return NextResponse.json({ error: "Некорректный домен или месяц" }, { status: 400 });
    const domainId = await resolveDomainId(domainParam);
    if (!domainId) return NextResponse.json({ error: "Домен не найден" }, { status: 404 });
    if (!isClosedMonth(monthKey)) return NextResponse.json(serialize(null, await calculateCounts(domainId, monthKey)));
    return NextResponse.json(serialize(await ensureSystemSnapshot(domainId, monthKey)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка снимка" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { token?: string; domainId?: string; monthKey?: string; monthlyTasksCount?: number; backlogCount?: number; ideasCount?: number };
    if (!body.domainId || !body.monthKey || !MONTH_RE.test(body.monthKey) || !isClosedMonth(body.monthKey)) return NextResponse.json({ error: "Редактировать можно только закрытый месяц" }, { status: 400 });
    const auth = body.token ? await resolveSession(body.token) : null;
    if (!auth) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    const domainId = await resolveDomainId(body.domainId);
    if (!domainId) return NextResponse.json({ error: "Домен не найден" }, { status: 404 });
    if (!(await canEditDomain(auth.user.id, auth.user.role, domainId))) return NextResponse.json({ error: "Нет доступа к домену" }, { status: 403 });
    const counts = [body.monthlyTasksCount, body.backlogCount, body.ideasCount];
    if (counts.some((n) => !Number.isInteger(n) || (n as number) < 0)) return NextResponse.json({ error: "Значения должны быть целыми и неотрицательными" }, { status: 400 });
    const existing = await ensureSystemSnapshot(domainId, body.monthKey);
    if (!existing) return NextResponse.json({ error: "Снимок не создан" }, { status: 409 });
    const previous = existing.versions.find((v) => v.id === existing.activeVersionId) ?? existing.versions[0];
    const version = await prisma.$transaction(async (tx) => {
      const next = await tx.domainMonthlySnapshotVersion.create({ data: {
        snapshotId: existing.id, versionNumber: (existing.versions[0]?.versionNumber ?? 0) + 1,
        monthlyTasksCount: body.monthlyTasksCount!, backlogCount: body.backlogCount!, ideasCount: body.ideasCount!,
        versionType: "manual", createdByUserId: auth.user.id, createdByUsername: auth.user.username,
      }});
      await tx.domainMonthlySnapshot.update({ where: { id: existing.id }, data: { activeVersionId: next.id } });
      return next;
    });
    await logActivity({ userId: auth.user.id, username: auth.user.username, action: "snapshot_manual_update", entityType: "DomainMonthlySnapshot", entityId: existing.id, oldValue: JSON.stringify(previous), newValue: JSON.stringify(version), details: `${domainId}:${body.monthKey}` });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка сохранения" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { token?: string; domainId?: string; monthKey?: string; versionId?: string };
    if (!body.domainId || !body.monthKey || !body.versionId || !isClosedMonth(body.monthKey)) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    const auth = body.token ? await resolveSession(body.token) : null;
    if (!auth) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    const domainId = await resolveDomainId(body.domainId);
    if (!domainId || !(await canEditDomain(auth.user.id, auth.user.role, domainId))) return NextResponse.json({ error: "Нет доступа к домену" }, { status: 403 });
    const snapshot = await ensureSystemSnapshot(domainId, body.monthKey);
    if (!snapshot) return NextResponse.json({ error: "Снимок не найден" }, { status: 404 });
    const source = snapshot.versions.find((v) => v.id === body.versionId);
    if (!source) return NextResponse.json({ error: "Версия не найдена" }, { status: 404 });
    const version = await prisma.$transaction(async (tx) => {
      const next = await tx.domainMonthlySnapshotVersion.create({ data: {
        snapshotId: snapshot.id, versionNumber: (snapshot.versions[0]?.versionNumber ?? 0) + 1,
        monthlyTasksCount: source.monthlyTasksCount, backlogCount: source.backlogCount, ideasCount: source.ideasCount,
        versionType: "rollback", createdByUserId: auth.user.id, createdByUsername: auth.user.username, sourceVersionId: source.id,
      }});
      await tx.domainMonthlySnapshot.update({ where: { id: snapshot.id }, data: { activeVersionId: next.id } });
      return next;
    });
    await logActivity({ userId: auth.user.id, username: auth.user.username, action: "snapshot_rollback", entityType: "DomainMonthlySnapshot", entityId: snapshot.id, newValue: JSON.stringify(version), details: `${domainId}:${body.monthKey}` });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка отката" }, { status: 500 });
  }
}
