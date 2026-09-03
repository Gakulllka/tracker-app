import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSessionFromRequest, touchSession, getClientIp } from "@/lib/auth";
import {
  NOTIFIED_FIELDS, mergeEvents, feedSince, retentionBefore,
  type FieldChange as NotifChange,
} from "@/lib/notifications";

/* ============================================================================
 *  GET /api/owner-notifications
 *
 *  Лента уведомлений владельца домена (ТЗ, блок 2.2).
 *
 *  Владелец = создатель домена, Domain.createdById.
 *
 *  Почему отдельный маршрут, а не переделка /api/notifications: старый
 *  строит ленту из commentLog, где нет автора, поэтому «кто изменил»
 *  оттуда получить нельзя. Здесь источник — ActivityLog: там есть
 *  username, oldValue, newValue и время. Старый маршрут оставлен нетронутым,
 *  чтобы ничего не сломать при переключении.
 *
 *  Что попадает в ленту:
 *    task_create / task_update / task_delete
 *    backlog_create / backlog_update / backlog_delete
 *    вопросы и ответы по доменам владельца
 *
 *  Свои действия владелец не видит.
 *
 *  Домены с пустым createdById: владельцем считается администратор,
 *  зарегистрированный первым. Иначе уведомления по унаследованным
 *  доменам просто некому получать.
 * ==========================================================================*/

const TASK_ACTIONS = [
  "task_create", "task_update", "task_delete",
  "backlog_create", "backlog_update", "backlog_delete",
];

const ACTION_LABEL: Record<string, string> = {
  task_create: "создал задачу",
  task_update: "изменил задачу",
  task_delete: "удалил задачу",
  backlog_create: "создал задачу в беклоге",
  backlog_update: "изменил задачу в беклоге",
  backlog_delete: "удалил задачу из беклога",
};

/* Поля, о которых уведомляем, и границы окон — в lib/notifications.ts.
   Комментарий и факт оттуда исключены: их правят по ходу работы, и
   синхронизация ловила промежуточные состояния. */
const FIELD_LABEL = NOTIFIED_FIELDS;

type FieldChange = NotifChange;

function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** Различия между старым и новым состоянием — для строки «что изменилось». */
function diffFields(oldRaw: string, newRaw: string): FieldChange[] {
  const a = safeParse(oldRaw);
  const b = safeParse(newRaw);
  const out: FieldChange[] = [];
  for (const key of Object.keys(FIELD_LABEL)) {
    const from = a[key];
    const to = b[key];
    if (to === undefined) continue;
    if (String(from ?? "") === String(to ?? "")) continue;
    out.push({
      field: key,
      label: FIELD_LABEL[key],
      from: String(from ?? "—"),
      to: String(to ?? "—"),
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await touchSession(auth.sessionId, getClientIp(req));

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    const before = req.nextUrl.searchParams.get("before");

    // ── Домены, которыми владеет пользователь ────────────────────────────
    const allDomains = await prisma.domain.findMany({
      select: { id: true, name: true, createdById: true },
    });

    // Пер-доменные creator-записи пользователя (новая ролевая модель).
    const creatorRights = await prisma.domainEditor.findMany({
      where: { userId: auth.user.id, role: "creator" },
      select: { domainId: true },
    });
    const creatorDomainIds = new Set(creatorRights.map(r => r.domainId));

    // admin = creator-equivalent всех доменов.
    const isAdmin = auth.user.role === "admin";
    // Первый администратор наследует домены без владельца (legacy createdById="").
    const firstAdmin = !isAdmin
      ? null
      : await prisma.user.findFirst({
          where: { role: "admin" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

    const ownedDomains = allDomains.filter(d => {
      if (isAdmin) return true; // admin видит все
      if (creatorDomainIds.has(d.id)) return true; // новая creator-роль
      // Legacy: домены, где createdById заполнен и совпадает (до миграции).
      return !!d.createdById && d.createdById === auth.user.id;
    });

    if (ownedDomains.length === 0) {
      return NextResponse.json({ success: true, items: [], hasMore: false });
    }

    const domainName = new Map(ownedDomains.map(d => [d.id, d.name]));
    const ownedIds = ownedDomains.map(d => d.id);

    // ── Журнал активности ────────────────────────────────────────────────
    // ActivityLog не хранит domainId, поэтому домен восстанавливаем через
    // саму задачу. Тянем с запасом: часть записей отсеется как чужая.
    /* Окно ленты — две недели. Раньше запрос брал последние записи
       независимо от давности, и правки месячной давности лежали
       наравне со свежими. */
    const since = feedSince();

    const logs = await prisma.activityLog.findMany({
      where: {
        action: { in: TASK_ACTIONS },
        username: { not: auth.user.username },   // свои действия не показываем
        createdAt: {
          gte: since,
          ...(before ? { lt: new Date(before) } : {}),
        },
      },
      orderBy: { createdAt: "desc" },
      /* Запас больше прежнего: часть записей отсеется как чужая, часть
         схлопнется в одно уведомление. */
      take: limit * 8,
    });

    const taskIds = logs.filter(l => l.entityType !== "backlog").map(l => l.entityId);
    const backlogIds = logs.filter(l => l.entityType === "backlog").map(l => l.entityId);

    const [tasks, backlogItems] = await Promise.all([
      taskIds.length
        ? prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, domainId: true, num: true, name: true, monthKey: true },
          })
        : Promise.resolve([]),
      backlogIds.length
        ? prisma.backlogItem.findMany({
            where: { id: { in: backlogIds } },
            select: { id: true, domainId: true, num: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const entity = new Map<string, { domainId: string; num: string; name: string; monthKey?: string }>();
    for (const t of tasks) entity.set(t.id, t);
    for (const b of backlogItems) entity.set(b.id, b);

    const rawItems = logs
      .map(l => {
        const e = entity.get(l.entityId);
        if (!e || !ownedIds.includes(e.domainId)) return null;
        const changes = l.action.endsWith("_update") ? diffFields(l.oldValue, l.newValue) : [];
        // Правка, не затронувшая значимых полей, в ленту не идёт.
        if (l.action.endsWith("_update") && changes.length === 0) return null;
        return {
          id: l.id,
          kind: l.entityType === "backlog" ? "backlog" : "task",
          action: l.action,
          actionLabel: ACTION_LABEL[l.action] || l.action,
          author: l.username,
          domainId: e.domainId,
          domainName: domainName.get(e.domainId) || "",
          taskId: l.entityId,
          taskNum: e.num,
          taskName: e.name,
          monthKey: e.monthKey ?? null,
          changes,
          createdAt: l.createdAt.toISOString(),
        };
      })
      .filter(Boolean) as unknown as Parameters<typeof mergeEvents>[0];

    /* Правки одной задачи одним автором за час сливаются в одно
       уведомление: показывается переход от первого значения к последнему
       и число правок. Раньше каждая синхронизация давала свою строку. */
    const items = mergeEvents(rawItems).slice(0, limit);

    // ── Вопросы и ответы по доменам владельца ───────────────────────────
    const questions = await prisma.question.findMany({
      where: {
        domainId: { in: ownedIds },
        author: { not: auth.user.username },
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, domainId: true, text: true, author: true,
        status: true, questionDate: true, answerDate: true,
      },
    });

    const questionItems = questions.map(q => ({
      id: `q_${q.id}`,
      kind: "question" as const,
      action: q.answerDate ? "question_answered" : "question_created",
      actionLabel: q.answerDate ? "ответил на вопрос" : "задал вопрос",
      author: q.author,
      domainId: q.domainId || "",
      domainName: domainName.get(q.domainId || "") || "",
      taskId: null,
      taskNum: "",
      taskName: q.text.slice(0, 120),
      monthKey: null,
      changes: [] as FieldChange[],
      createdAt: (q.answerDate ?? q.questionDate).toISOString(),
    }));

    // ── Запросы доступа к доменам владельца (pending) ────────────────────
    const accessRequests = await prisma.editRequest.findMany({
      where: {
        status: "pending",
        domainId: { in: ownedIds },
      },
      include: {
        user: { select: { username: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const accessItems = accessRequests.map(r => ({
      id: `ar_${r.id}`,
      kind: "access" as const,
      action: "access_request",
      actionLabel: "запросил доступ к домену",
      author: r.user.displayName || r.user.username,
      domainId: r.domainId,
      domainName: domainName.get(r.domainId) || "",
      taskId: null,
      taskNum: "",
      taskName: "",
      monthKey: null,
      changes: [] as FieldChange[],
      requestId: r.id,
      createdAt: r.createdAt.toISOString(),
    }));

    /* Уборка журнала. Записи старше трёх месяцев удаляются: очистки не было
       нигде, и ActivityLog рос бесконечно. Делается на первой странице
       и не блокирует ответ — если не получится, попробуем в следующий раз. */
    if (!before) {
      void prisma.activityLog
        .deleteMany({ where: { createdAt: { lt: retentionBefore() } } })
        .catch(() => { /* уборка не критична */ });
    }

    const merged = [...items, ...questionItems, ...accessItems]
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      items: merged,
      hasMore: merged.length >= limit,
      cursor: merged.length ? merged[merged.length - 1].createdAt : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[owner-notifications] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
