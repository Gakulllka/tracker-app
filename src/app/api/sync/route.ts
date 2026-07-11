import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSession,
  resolveSessionFromRequest,
  touchSession,
  getClientIp,
  isGlobalEditor,
  roleCanEverEdit,
} from "@/lib/auth";

/* ============================================================================
 *  /api/sync — синхронизация задач и бэклога.
 *
 *  ЕДИНЫЙ ОБЩИЙ МИР: воркспейсов нет. Хранилище — нормализованные таблицы
 *  Task и BacklogItem, по одной строке на задачу, с привязкой к Domain.id.
 *
 *  GET  ?token=...
 *    → { id: "global", domains: [{id,name,archived}], domainData, updatedAt }
 *      domainData: { [domainId]: { allData: { "YYYY-MM": Task[] }, backlog: Task[] } }
 *      Tombstones (deleted) клиенту не отдаются.
 *
 *  POST { token, domainData, domainNames? }
 *    → { success, updatedAt, skippedDomains? }
 *      Для каждой задачи применяется last-write-wins по полю _ts:
 *      строка обновляется только если входящий _ts >= сохранённого.
 *      Удаление — только через tombstone (_deleted: true). Ничего не
 *      стирается массово: чужие задачи в безопасности.
 *      Пер-доменные права: admin/editor пишут везде; member — только в
 *      домены, где у него есть DomainEditor; viewer/guest — 403.
 * ==========================================================================*/

interface ClientTask {
  id: string;
  _ts?: number;
  _deleted?: boolean;
  num?: string;
  name?: string;
  status?: string;
  priority?: string;
  planH?: string;
  factH?: string;
  comment?: string;
  commentLog?: unknown[];
  [key: string]: unknown;
}

interface ClientDomainData {
  allData?: Record<string, ClientTask[]>;
  backlog?: ClientTask[];
  monthlyPlanByYearMonth?: Record<string, number>;
}

// Поля, которые хранятся в отдельных колонках. Всё прочее уходит в extra.
/** Tombstone'ы старше этого срока физически удаляются из базы. */
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 дней
let lastCleanupAt = 0;

function maybeCleanupTombstones(): void {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return; // не чаще раза в час
  lastCleanupAt = now;
  const cutoff = new Date(now - TOMBSTONE_TTL_MS);
  // fire-and-forget: ошибки чистки не должны ломать pull
  Promise.all([
    prisma.task.deleteMany({ where: { deleted: true, ts: { lt: cutoff } } }),
    prisma.backlogItem.deleteMany({ where: { deleted: true, ts: { lt: cutoff } } }),
  ]).catch((e) => console.error("[sync] tombstone cleanup failed:", e));
}

const COLUMN_FIELDS = new Set([
  "id", "num", "name", "planH", "factH", "priority", "status", "comment",
  "commentLog", "_ts", "_deleted", "_hidden", "_updatedBy", "visibleTo",
]);

const LOG_FIELDS = ["num", "name", "status", "priority", "planH", "factH", "comment"] as const;

/** Поля, определяющие «версию» строки для сравнения контента. */
const CONTENT_FIELDS = [
  "num", "name", "planH", "factH", "priority", "status",
  "comment", "commentLog", "extra", "sortOrder", "deleted",
] as const;

/**
 * Контент строки не изменился? Нужен для случая равных ts: клиент повторно
 * шлёт неизменённые строки (пропускаем — дёшево), но правка с тем же ts
 * (например, если клиент не успел бампнуть метку) обязана записаться —
 * иначе она превращается в вечный no-op и pull бесконечно её откатывает.
 */
function sameContent(
  existing: Record<string, unknown>,
  data: Record<string, unknown>,
  withMonthKey: boolean
): boolean {
  if (withMonthKey && existing.monthKey !== data.monthKey) return false;
  return CONTENT_FIELDS.every((f) => existing[f] === data[f]);
}

function extractExtra(t: ClientTask): string {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (!COLUMN_FIELDS.has(k) && v !== undefined) extra[k] = v;
  }
  return JSON.stringify(extra);
}

function isEmptyTask(t: ClientTask): boolean {
  return (!t.name || t.name === "EMPTY") && (!t.num || t.num === "EMPTY");
}

function rowToClientTask(row: {
  id: string; num: string; name: string; planH: string; factH: string;
  priority: string; status: string; comment: string; commentLog: string;
  extra: string; ts: Date; updatedBy: string; deleted?: boolean;
}): ClientTask {
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(row.extra || "{}"); } catch { /* ignore */ }
  let commentLog: unknown[] = [];
  try { commentLog = JSON.parse(row.commentLog || "[]"); } catch { /* ignore */ }
  return {
    ...extra,
    id: row.id,
    num: row.num,
    name: row.name,
    planH: row.planH,
    factH: row.factH,
    priority: row.priority,
    status: row.status,
    comment: row.comment,
    commentLog,
    _ts: row.ts.getTime(),
    _updatedBy: row.updatedBy,
    ...(row.deleted ? { _deleted: true } : {}),
  };
}

// ---------------------------------------------------------------------------
//  GET — весь общий мир
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await touchSession(auth.sessionId, getClientIp(req));

    // Необязательный фильтр: отдать данные только одного домена
    // (список доменов при этом возвращается полный).
    const onlyDomainId = req.nextUrl.searchParams.get("domainId");

    const isAdmin = auth.user.role === "admin";
    const domains = await prisma.domain.findMany({
      where: isAdmin ? {} : { archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, archived: true, updatedAt: true, monthlyPlans: true },
    });

    // Фоновая чистка tombstone'ов старше 60 дней (не чаще раза в час на инстанс)
    maybeCleanupTombstones();
    const allDomainIds = domains.map((d) => d.id);
    const domainIds = onlyDomainId
      ? allDomainIds.filter((id) => id === onlyDomainId)
      : allDomainIds;

    // Тombstone'ы за последние 7 дней тоже отдаём: клиент мержит построчно
    // по _ts и корректно применяет чужие удаления, не откатывая свои правки.
    const tombstoneHorizon = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rowFilter = {
      domainId: { in: domainIds },
      OR: [{ deleted: false }, { deleted: true, ts: { gt: tombstoneHorizon } }],
    };
    const [tasks, backlogItems] = await Promise.all([
      prisma.task.findMany({
        where: rowFilter,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.backlogItem.findMany({
        where: rowFilter,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const domainData: Record<string, {
      allData: Record<string, ClientTask[]>;
      backlog: ClientTask[];
      monthlyPlanByYearMonth?: Record<string, number>;
    }> = {};
    for (const d of domains) {
      if (onlyDomainId && d.id !== onlyDomainId) continue;
      domainData[d.id] = { allData: {}, backlog: [] };
      // План часов отдаём только непустой — чтобы не затирать локальный
      // план у клиентов, которые ещё не успели его запушить.
      try {
        const plans = JSON.parse(d.monthlyPlans || "{}");
        if (plans && typeof plans === "object" && Object.keys(plans).length > 0) {
          domainData[d.id].monthlyPlanByYearMonth = plans;
        }
      } catch { /* повреждённый JSON игнорируем */ }
    }

    let maxUpdated = 0;
    for (const t of tasks) {
      const dom = domainData[t.domainId];
      if (!dom) continue;
      if (!dom.allData[t.monthKey]) dom.allData[t.monthKey] = [];
      dom.allData[t.monthKey].push(rowToClientTask(t));
      if (t.updatedAt.getTime() > maxUpdated) maxUpdated = t.updatedAt.getTime();
    }
    for (const b of backlogItems) {
      const dom = domainData[b.domainId];
      if (!dom) continue;
      dom.backlog.push(rowToClientTask(b));
      if (b.updatedAt.getTime() > maxUpdated) maxUpdated = b.updatedAt.getTime();
    }

    return NextResponse.json({
      id: "global",
      name: "Общее пространство",
      domains: domains.map((d) => ({ id: d.id, name: d.name, archived: d.archived })),
      domainData,
      updatedAt: new Date(maxUpdated || Date.now()).toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  POST — приём изменений с LWW и пер-доменными правами
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domainData: clientDomainData, token, domainNames } = body as {
      domainData?: Record<string, ClientDomainData>;
      token?: string;
      domainNames?: Record<string, string>;
    };

    const auth = token ? await resolveSession(token) : await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!roleCanEverEdit(auth.user.role)) {
      return NextResponse.json(
        { error: "Ваша роль не позволяет изменять данные" },
        { status: 403 }
      );
    }

    const ip = getClientIp(req);
    await touchSession(auth.sessionId, ip);

    if (!clientDomainData || typeof clientDomainData !== "object") {
      return NextResponse.json({ success: true, updatedAt: new Date().toISOString() });
    }

    // Домены, куда пользователь имеет право писать
    const globalEditor = isGlobalEditor(auth.user.role);
    const editableIds = globalEditor
      ? null // все
      : new Set(
          (
            await prisma.domainEditor.findMany({
              where: { userId: auth.user.id },
              select: { domainId: true },
            })
          ).map((r) => r.domainId),
        );

    // Существующие домены — по id и по имени (клиент может прислать локальный
    // ключ несозданного домена + его имя в domainNames)
    const allDomains = await prisma.domain.findMany({
      select: { id: true, name: true },
    });
    const byId = new Map(allDomains.map((d) => [d.id, d]));
    const byName = new Map(allDomains.map((d) => [d.name, d]));

    const skippedDomains: string[] = [];
    const logRows: Array<{
      action: string; entityId: string; oldValue: string; newValue: string;
    }> = [];

    for (const [clientDomainKey, domainPayload] of Object.entries(clientDomainData)) {
      // ── Резолвим домен ────────────────────────────────────────────────
      let domain = byId.get(clientDomainKey);
      if (!domain) {
        const name = domainNames?.[clientDomainKey] || clientDomainKey;
        domain = byName.get(name);
        if (!domain) {
          // Новый домен, созданный на клиенте офлайн — создаём.
          const created = await prisma.domain.create({
            data: {
              name,
              createdById: auth.user.id,
              editors: { create: { userId: auth.user.id, grantedBy: auth.user.username } },
            },
            select: { id: true, name: true },
          });
          byId.set(created.id, created);
          byName.set(created.name, created);
          if (editableIds) editableIds.add(created.id);
          domain = created;
        }
      }

      // ── Право записи в этот домен ─────────────────────────────────────
      if (editableIds && !editableIds.has(domain.id)) {
        skippedDomains.push(domain.name);
        continue;
      }

      // ── План часов по месяцам (мерж по ключам YYYY-MM) ────────────────
      if (
        domainPayload.monthlyPlanByYearMonth &&
        typeof domainPayload.monthlyPlanByYearMonth === "object" &&
        Object.keys(domainPayload.monthlyPlanByYearMonth).length > 0
      ) {
        try {
          const row = await prisma.domain.findUnique({
            where: { id: domain.id },
            select: { monthlyPlans: true },
          });
          let existingPlans: Record<string, number> = {};
          try { existingPlans = JSON.parse(row?.monthlyPlans || "{}"); } catch { /* ignore */ }
          const mergedPlans: Record<string, number> = { ...existingPlans };
          for (const [mk, v] of Object.entries(domainPayload.monthlyPlanByYearMonth)) {
            if (/^\d{4}-\d{2}$/.test(mk) && typeof v === "number" && isFinite(v) && v >= 0) {
              mergedPlans[mk] = v;
            }
          }
          if (JSON.stringify(mergedPlans) !== JSON.stringify(existingPlans)) {
            await prisma.domain.update({
              where: { id: domain.id },
              data: { monthlyPlans: JSON.stringify(mergedPlans) },
            });
          }
        } catch (e) {
          console.error("[sync] monthlyPlans merge failed:", e);
        }
      }

      // ── Задачи по месяцам (батч: 1 чтение + createMany + транзакции) ──
      if (domainPayload.allData) {
        // Собираем все входящие строки домена одним списком
        const incoming: Array<{ monthKey: string; index: number; t: ClientTask }> = [];
        for (const [monthKey, tasks] of Object.entries(domainPayload.allData)) {
          if (!Array.isArray(tasks)) continue;
          for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            if (!t?.id) continue;
            if (isEmptyTask(t) && !t._deleted) continue;
            incoming.push({ monthKey, index: i, t });
          }
        }

        // Одно чтение существующих строк по всем id
        const ids = incoming.map((r) => r.t.id);
        const existingRows = ids.length > 0
          ? await prisma.task.findMany({ where: { id: { in: ids } } })
          : [];
        const existingById = new Map(existingRows.map((r) => [r.id, r]));

        const creates: Array<Record<string, unknown>> = [];
        const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

        for (const { monthKey, index, t } of incoming) {
          const incomingTs = new Date(t._ts || Date.now());
          const existing = existingById.get(t.id);

          // LWW: строго устаревшее пропускаем; при равных ts пропускаем
          // ТОЛЬКО если контент идентичен (no-op повторного push).
          if (existing && existing.ts.getTime() > incomingTs.getTime()) continue;

          const data = {
            domainId: domain.id,
            monthKey,
            num: t.num || "",
            name: t.name || "",
            planH: t.planH || "0",
            factH: t.factH || "0",
            priority: t.priority || "Средний",
            status: t.status || "Идея",
            comment: t.comment || "",
            commentLog: JSON.stringify(t.commentLog || []),
            extra: extractExtra(t),
            sortOrder: index,
            ts: incomingTs,
            updatedBy: auth.user.username,
            deleted: Boolean(t._deleted),
          };

          if (
            existing &&
            existing.ts.getTime() === incomingTs.getTime() &&
            sameContent(existing as unknown as Record<string, unknown>, data, true)
          ) continue;

          if (!existing) {
            if (t._deleted) continue; // tombstone неизвестной задачи
            creates.push({ id: t.id, ...data });
            logRows.push({
              action: "task_create",
              entityId: t.id,
              oldValue: "",
              newValue: JSON.stringify(pickLogFields(t)),
            });
          } else {
            const wasChanged =
              existing.deleted !== data.deleted ||
              existing.monthKey !== data.monthKey ||
              LOG_FIELDS.some((f) => (existing as Record<string, unknown>)[f] !== (data as Record<string, unknown>)[f]);
            updates.push({ id: t.id, data });
            if (data.deleted && !existing.deleted) {
              logRows.push({
                action: "task_delete",
                entityId: t.id,
                oldValue: JSON.stringify(pickLogFieldsFromRow(existing)),
                newValue: "",
              });
            } else if (wasChanged && !data.deleted) {
              logRows.push({
                action: "task_update",
                entityId: t.id,
                oldValue: JSON.stringify(pickLogFieldsFromRow(existing)),
                newValue: JSON.stringify(pickLogFields(t)),
              });
            }
          }
        }

        if (creates.length > 0) {
          await prisma.task.createMany({ data: creates as never, skipDuplicates: true });
        }
        // Обновления пакетами по 25 в транзакции
        for (let i = 0; i < updates.length; i += 25) {
          const chunk = updates.slice(i, i + 25);
          await prisma.$transaction(
            chunk.map((u) => prisma.task.update({ where: { id: u.id }, data: u.data as never }))
          );
        }
      }

      // ── Бэклог (батч, как и задачи) ───────────────────────────────────
      if (Array.isArray(domainPayload.backlog)) {
        const incomingB: Array<{ index: number; t: ClientTask }> = [];
        for (let i = 0; i < domainPayload.backlog.length; i++) {
          const t = domainPayload.backlog[i];
          if (!t?.id) continue;
          if (isEmptyTask(t) && !t._deleted) continue;
          incomingB.push({ index: i, t });
        }

        const idsB = incomingB.map((r) => r.t.id);
        const existingB = idsB.length > 0
          ? await prisma.backlogItem.findMany({ where: { id: { in: idsB } } })
          : [];
        const existingBById = new Map(existingB.map((r) => [r.id, r]));

        const createsB: Array<Record<string, unknown>> = [];
        const updatesB: Array<{ id: string; data: Record<string, unknown> }> = [];

        for (const { index, t } of incomingB) {
          const incomingTs = new Date(t._ts || Date.now());
          const existing = existingBById.get(t.id);
          if (existing && existing.ts.getTime() > incomingTs.getTime()) continue;

          const data = {
            domainId: domain.id,
            num: t.num || "",
            name: t.name || "",
            planH: t.planH || "0",
            factH: t.factH || "0",
            priority: t.priority || "Средний",
            status: t.status || "Идея",
            comment: t.comment || "",
            commentLog: JSON.stringify(t.commentLog || []),
            extra: extractExtra(t),
            sortOrder: index,
            ts: incomingTs,
            updatedBy: auth.user.username,
            deleted: Boolean(t._deleted),
          };

          if (
            existing &&
            existing.ts.getTime() === incomingTs.getTime() &&
            sameContent(existing as unknown as Record<string, unknown>, data, false)
          ) continue;

          if (!existing) {
            if (t._deleted) continue;
            createsB.push({ id: t.id, ...data });
          } else {
            updatesB.push({ id: t.id, data });
          }
        }

        if (createsB.length > 0) {
          await prisma.backlogItem.createMany({ data: createsB as never, skipDuplicates: true });
        }
        for (let i = 0; i < updatesB.length; i += 25) {
          const chunk = updatesB.slice(i, i + 25);
          await prisma.$transaction(
            chunk.map((u) => prisma.backlogItem.update({ where: { id: u.id }, data: u.data as never }))
          );
        }
      }
    }

    // Активити-лог одним батчем
    if (logRows.length > 0) {
      try {
        await prisma.activityLog.createMany({
          data: logRows.map((r) => ({
            userId: auth.user.id,
            username: auth.user.username,
            action: r.action,
            entityType: "task",
            entityId: r.entityId,
            oldValue: r.oldValue,
            newValue: r.newValue,
            ipAddress: ip,
          })),
        });
      } catch { /* лог не должен ломать sync */ }
    }

    return NextResponse.json({
      success: true,
      updatedAt: new Date().toISOString(),
      ...(skippedDomains.length > 0 ? { skippedDomains } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync] POST error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function pickLogFields(t: ClientTask): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of LOG_FIELDS) if (t[f] !== undefined) out[f] = t[f];
  return out;
}

function pickLogFieldsFromRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of LOG_FIELDS) if (row[f] !== undefined) out[f] = row[f];
  return out;
}
