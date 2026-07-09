import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface Task {
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
  [key: string]: unknown;
}

interface DomainData {
  allData: Record<string, Task[]>;
  backlog: Task[];
  monthlyPlanByYearMonth?: Record<string, number>;
}

// ---------------------------------------------------------------------------
//  Merge logic — last-write-wins per task using _ts timestamp
// ---------------------------------------------------------------------------

function mergeTasks(server: Task[], client: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of server) map.set(t.id, t);
  for (const t of client) {
    const existing = map.get(t.id);
    const serverTs = existing?._ts ?? 0;
    const clientTs = t._ts ?? 0;
    if (!existing || clientTs >= serverTs) {
      map.set(t.id, t);
    }
  }
  return Array.from(map.values());
}

function mergeMonthData(
  serverMonths: Record<string, Task[]>,
  clientMonths: Record<string, Task[]>,
): Record<string, Task[]> {
  const result: Record<string, Task[]> = { ...serverMonths };
  for (const [month, clientTasks] of Object.entries(clientMonths)) {
    const serverTasks = result[month] ?? [];
    result[month] = mergeTasks(serverTasks, clientTasks);
  }
  return result;
}

function mergeDomains(
  serverDomains: Record<string, DomainData>,
  clientDomains: Record<string, DomainData>,
): Record<string, DomainData> {
  const result: Record<string, DomainData> = { ...serverDomains };
  for (const [domainId, clientDomain] of Object.entries(clientDomains)) {
    const serverDomain = result[domainId];
    if (!serverDomain) {
      result[domainId] = clientDomain;
    } else {
      result[domainId] = {
        allData: mergeMonthData(
          (serverDomain.allData || {}) as Record<string, Task[]>,
          (clientDomain.allData || {}) as Record<string, Task[]>,
        ),
        backlog: mergeTasks(
          (Array.isArray(serverDomain.backlog) ? serverDomain.backlog : []) as Task[],
          (Array.isArray(clientDomain.backlog) ? clientDomain.backlog : []) as Task[],
        ),
        monthlyPlanByYearMonth: clientDomain.monthlyPlanByYearMonth ?? serverDomain.monthlyPlanByYearMonth,
      };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
//  Filter tombstones for client responses
// ---------------------------------------------------------------------------

function filterDeletedFromDomains(
  domains: Record<string, DomainData>,
): Record<string, DomainData> {
  const result: Record<string, DomainData> = {};
  for (const [domainId, domain] of Object.entries(domains)) {
    const filteredAllData: Record<string, Task[]> = {};
    const allData = domain.allData || {};
    for (const [month, tasks] of Object.entries(allData)) {
      filteredAllData[month] = (Array.isArray(tasks) ? tasks : []).filter((t) => !t._deleted);
    }
    result[domainId] = {
      allData: filteredAllData,
      backlog: (Array.isArray(domain.backlog) ? domain.backlog : []).filter((t) => !t._deleted),
      monthlyPlanByYearMonth: domain.monthlyPlanByYearMonth,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
//  Format migration — old flat format → domainData format
// ---------------------------------------------------------------------------

function isDomainDataFormat(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  for (const val of Object.values(data as object)) {
    if (val && typeof val === "object" && !Array.isArray(val) && "allData" in (val as object))
      return true;
  }
  return false;
}

function wrapAsDomainData(
  allData: Record<string, unknown>,
  backlog: unknown[],
): Record<string, DomainData> {
  return {
    default: {
      allData: (allData || {}) as Record<string, Task[]>,
      backlog: (Array.isArray(backlog) ? backlog : []) as Task[],
    },
  };
}

function parseDomainData(rawAllData: string, rawBacklog: string): Record<string, DomainData> {
  const parsed = JSON.parse(rawAllData);
  if (isDomainDataFormat(parsed)) {
    return parsed as Record<string, DomainData>;
  }
  return wrapAsDomainData(parsed as Record<string, unknown>, JSON.parse(rawBacklog));
}

// ---------------------------------------------------------------------------
//  Diff calculation for activity logging
//  Compares pre-merge server state with post-merge state to find what
//  THIS CLIENT actually changed. We only consider changes that were in
//  clientDomains (so other clients' pushes don't get logged twice).
// ---------------------------------------------------------------------------

interface TaskChange {
  kind: "create" | "update" | "delete";
  task: Task;
  prev?: Task;
}

const LOG_FIELDS: Array<keyof Task> = ["num", "name", "status", "priority", "planH", "factH", "comment"];

function diffTasks(
  serverBefore: Task[],
  clientChanges: Task[],
): TaskChange[] {
  const beforeById = new Map<string, Task>();
  for (const t of serverBefore) beforeById.set(t.id, t);

  const result: TaskChange[] = [];
  for (const t of clientChanges) {
    const prev = beforeById.get(t.id);
    if (!prev) {
      // Tombstone-only client push (delete of unknown task) — игнорим
      if (t._deleted) continue;
      result.push({ kind: "create", task: t });
      continue;
    }
    if (t._deleted && !prev._deleted) {
      result.push({ kind: "delete", task: t, prev });
      continue;
    }
    if (!t._deleted && prev._deleted) {
      // revive — считаем как create
      result.push({ kind: "create", task: t, prev });
      continue;
    }
    // Update — проверяем, реально ли изменились поля
    const changed = LOG_FIELDS.some((f) => prev[f] !== t[f]);
    if (changed) {
      result.push({ kind: "update", task: t, prev });
    }
  }
  return result;
}

async function logTaskChanges(
  user: { id: string; username: string } | null,
  ipAddress: string,
  changes: TaskChange[],
) {
  if (!user || changes.length === 0) return;

  // Bulk insert — Prisma даст одну транзакцию.
  // Действие: task_create | task_update | task_delete.
  // entityType = "task", entityId = task.id, на новой строке для каждого изменения.
  const rows = changes.map((c) => {
    const oldValue =
      c.prev && (c.kind === "update" || c.kind === "delete")
        ? JSON.stringify(
            LOG_FIELDS.reduce<Record<string, unknown>>((acc, f) => {
              if (c.prev![f] !== undefined) acc[f] = c.prev![f];
              return acc;
            }, {}),
          )
        : "";
    const newValue =
      c.kind !== "delete"
        ? JSON.stringify(
            LOG_FIELDS.reduce<Record<string, unknown>>((acc, f) => {
              if (c.task[f] !== undefined) acc[f] = c.task[f];
              return acc;
            }, {}),
          )
        : "";
    return {
      userId: user.id,
      username: user.username,
      action: `task_${c.kind}`,
      entityType: "task",
      entityId: c.task.id,
      oldValue,
      newValue,
      ipAddress,
    };
  });

  try {
    await prisma.activityLog.createMany({ data: rows });
  } catch {
    /* ignore log errors — sync должен работать даже если активити-логи отвалились */
  }
}

// Достаём все задачи (по всем доменам, по всем месяцам и беклогу) одним списком,
// чтобы потом по id находить prev для diff.
function flattenAllTasks(domains: Record<string, DomainData>): Task[] {
  const out: Task[] = [];
  for (const d of Object.values(domains)) {
    if (d.allData) {
      for (const tasks of Object.values(d.allData)) out.push(...(Array.isArray(tasks) ? tasks : []));
    }
    if (Array.isArray(d.backlog)) out.push(...d.backlog);
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Helpers — auth resolution & ip
// ---------------------------------------------------------------------------

async function resolveUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "";
}

// ---------------------------------------------------------------------------
//  Access control: check if user can access / write to a workspace
// ---------------------------------------------------------------------------

type AccessResult = { allowed: true; isOwner: boolean; shareRole: string | null } | { allowed: false; status: number; error: string };

async function checkWorkspaceAccess(
  userId: string,
  workspaceId: string,
  requireWrite: boolean,
): Promise<AccessResult> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return { allowed: false, status: 404, error: "Workspace not found" };

  if (workspace.userId === userId) {
    return { allowed: true, isOwner: true, shareRole: null };
  }

  const share = await prisma.workspaceShare.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });

  if (!share) {
    return { allowed: false, status: 403, error: "Access denied" };
  }

  if (requireWrite && share.role === "viewer") {
    return { allowed: false, status: 403, error: "Viewer cannot modify workspace" };
  }

  return { allowed: true, isOwner: false, shareRole: share.role };
}

// ---------------------------------------------------------------------------
//  GET — return workspace data (tombstones filtered out)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const token = req.nextUrl.searchParams.get("token") || undefined;
    if (!id) return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });

    // Access control
    const auth = token ? await resolveUserFromToken(token) : null;
    let access: AccessResult | null = null;
    if (auth) {
      access = await checkWorkspaceAccess(auth.user.id, id, false);
      if (!access.allowed) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
    }

    // Heartbeat
    if (token) {
      const auth = await resolveUserFromToken(token);
      if (auth) {
        try {
          await prisma.session.update({
            where: { id: auth.sessionId },
            data: { lastActivity: new Date(), ipAddress: getClientIp(req) || undefined },
          });
        } catch { /* ignore */ }
      }
    }

    // Читаем задачи из таблицы Task
    const tasks = await prisma.task.findMany({
      where: { workspaceId: id, deleted: false },
      orderBy: { createdAt: "asc" },
    });

    // Читаем беклог из таблицы BacklogItem
    const backlogItems = await prisma.backlogItem.findMany({
      where: { deleted: false },
      orderBy: { createdAt: "asc" },
    });

    // Все задачи видны всем — фильтрация по visibleTo не нужна
    const validTasks = tasks.filter(
      (t) => (t.name && t.name !== "EMPTY") || (t.num && t.num !== "EMPTY")
    );

    // Собираем domainData из Task таблицы
    const domainData: Record<string, DomainData> = {};
    for (const task of validTasks) {
      if (!domainData[task.domainId]) {
        domainData[task.domainId] = { allData: {}, backlog: [] };
      }
      const domain = domainData[task.domainId];

      if (!domain.allData[task.monthKey]) {
        domain.allData[task.monthKey] = [];
      }
      domain.allData[task.monthKey].push({
        id: task.id,
        num: task.num,
        name: task.name,
        planH: task.planH,
        factH: task.factH,
        priority: task.priority,
        status: task.status,
        comment: task.comment,
        commentLog: JSON.parse(task.commentLog || "[]"),
        _ts: task.ts.getTime(),
      });
    }

    // Добавляем беклог из BacklogItem таблицы
    for (const item of backlogItems) {
      if (!domainData[item.domainId]) {
        domainData[item.domainId] = { allData: {}, backlog: [] };
      }
      domainData[item.domainId].backlog.push({
        id: item.id,
        num: item.num,
        name: item.name,
        planH: item.planH,
        factH: item.factH,
        priority: item.priority,
        status: item.status,
        comment: item.comment,
        commentLog: JSON.parse(item.commentLog || "[]"),
        _ts: item.ts.getTime(),
      });
    }

    // Также читаем allData для обратной совместимости
    const ws = await prisma.workspace.findUnique({ where: { id } });

    return NextResponse.json({
      id: ws?.id || id,
      name: ws?.name || "Моё пространство",
      domainData: Object.keys(domainData).length > 0 ? domainData : (ws ? (() => {
        try { return JSON.parse(ws.allData); } catch { return {}; }
      })() : {}),
      updatedAt: ws?.updatedAt?.toISOString() || new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  POST — merge client data into workspace + write activity log + heartbeat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, domainData: clientDomainData, token, domainNames } = body as {
      id?: string;
      domainData?: Record<string, DomainData>;
      token?: string;
      domainNames?: Record<string, string>;
    };

    if (!id) return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });

    // Resolve user
    const auth = token ? await resolveUserFromToken(token) : null;

    // Access control
    if (auth) {
      if (auth.user.username === "guest") {
        return NextResponse.json({ error: "Гость не может изменять данные" }, { status: 403 });
      }
      const access = await checkWorkspaceAccess(auth.user.id, id, true);
      if (!access.allowed) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
    }

    const ip = getClientIp(req);

    // Heartbeat
    if (auth) {
      try {
        await prisma.session.update({
          where: { id: auth.sessionId },
          data: { lastActivity: new Date(), ipAddress: ip || undefined },
        });
      } catch { /* ignore */ }
    }

    // Сохраняем задачи в таблицу Task
    if (clientDomainData != null) {
      // Разворачиваем domainData в плоский список задач
      const allTasks: Array<{
        id: string;
        domainId: string;
        monthKey: string;
        num: string;
        name: string;
        planH: string;
        factH: string;
        priority: string;
        status: string;
        comment: string;
        commentLog: string;
        visibleTo: string;
        ts: Date;
        deleted: boolean;
      }> = [];

      for (const [domainId, domain] of Object.entries(clientDomainData)) {
        // Используем имя домена вместо ID
        const domainName = domainNames?.[domainId] || domainId;
        if (domain.allData) {
          for (const [monthKey, tasks] of Object.entries(domain.allData)) {
            if (!Array.isArray(tasks)) continue;
            for (const t of tasks) {
              // Пропускаем пустые задачи
              if ((!t.name || t.name === "EMPTY") && (!t.num || t.num === "EMPTY")) continue;
              allTasks.push({
                id: t.id,
                domainId: domainName,
                monthKey,
                num: t.num || "",
                name: t.name || "",
                planH: t.planH || "0",
                factH: t.factH || "0",
                priority: t.priority || "Средний",
                status: t.status || "Идея",
                comment: t.comment || "",
                commentLog: JSON.stringify(t.commentLog || []),
                visibleTo: JSON.stringify(t.visibleTo || []),
                ts: t._ts ? new Date(t._ts) : new Date(),
                deleted: Boolean(t._deleted),
              });
            }
          }
        }
        // Беклог
        if (Array.isArray(domain.backlog)) {
          for (const t of domain.backlog) {
            if ((!t.name || t.name === "EMPTY") && (!t.num || t.num === "EMPTY")) continue;
            allTasks.push({
              id: t.id,
              domainId: domainName,
              monthKey: "backlog",
              num: t.num || "",
              name: t.name || "",
              planH: t.planH || "0",
              factH: t.factH || "0",
              priority: t.priority || "Средний",
              status: t.status || "Идея",
              comment: t.comment || "",
              commentLog: JSON.stringify(t.commentLog || []),
              visibleTo: JSON.stringify(t.visibleTo || []),
              ts: t._ts ? new Date(t._ts) : new Date(),
              deleted: Boolean(t._deleted),
            });
          }
        }
      }

      // Массовый upsert в таблицу Task
      if (allTasks.length > 0) {
        // Только обновляем/создаём задачи которые прислал клиент
        // НЕ удаляем то что клиент не прислал — это были бы чужие задачи
        for (const t of allTasks) {
          await prisma.task.upsert({
            where: { id: t.id },
            create: {
              id: t.id,
              workspaceId: id,
              domainId: t.domainId,
              monthKey: t.monthKey,
              num: t.num,
              name: t.name,
              planH: t.planH,
              factH: t.factH,
              priority: t.priority,
              status: t.status,
              comment: t.comment,
              commentLog: t.commentLog,
              visibleTo: t.visibleTo,
              ts: t.ts,
              deleted: t.deleted,
            },
            update: {
              domainId: t.domainId,
              monthKey: t.monthKey,
              num: t.num,
              name: t.name,
              planH: t.planH,
              factH: t.factH,
              priority: t.priority,
              status: t.status,
              comment: t.comment,
              commentLog: t.commentLog,
              visibleTo: t.visibleTo,
              ts: t.ts,
              deleted: t.deleted,
            },
          });
        }
      }

      // Сохраняем беклог в таблицу BacklogItem
      const backlogTasks = allTasks.filter(t => t.monthKey === "backlog");
      if (backlogTasks.length > 0) {
        // Удаляем старый беклог для этих domain
        const backlogDomainIds = [...new Set(backlogTasks.map(t => t.domainId))];
        for (const domainId of backlogDomainIds) {
          await prisma.backlogItem.deleteMany({
            where: { domainId, id: { notIn: backlogTasks.filter(t => t.domainId === domainId).map(t => t.id) } },
          }).catch(() => {});
        }
        // Upsert беклог
        for (const t of backlogTasks) {
          await prisma.backlogItem.upsert({
            where: { id: t.id },
            create: {
              id: t.id,
              domainId: t.domainId,
              num: t.num,
              name: t.name,
              planH: t.planH,
              factH: t.factH,
              priority: t.priority,
              status: t.status,
              comment: t.comment,
              commentLog: t.commentLog,
              ts: t.ts,
              deleted: t.deleted,
            },
            update: {
              domainId: t.domainId,
              num: t.num,
              name: t.name,
              planH: t.planH,
              factH: t.factH,
              priority: t.priority,
              status: t.status,
              comment: t.comment,
              commentLog: t.commentLog,
              ts: t.ts,
              deleted: t.deleted,
            },
          });
        }
      }

      // Также сохраняем в allData для обратной совместимости
      const existing = await prisma.workspace.findUnique({ where: { id } });
      if (existing) {
        await prisma.workspace.update({
          where: { id },
          data: { allData: JSON.stringify(clientDomainData), updatedAt: new Date() },
        });
      } else {
        await prisma.workspace.create({
          data: {
            id,
            allData: JSON.stringify(clientDomainData),
            backlog: "[]",
            userId: auth?.user.id || "system",
          },
        });
      }
    } else {
      await prisma.workspace.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => {});
    }

    const updated = await prisma.workspace.findUnique({ where: { id } });
    return NextResponse.json({ success: true, updatedAt: updated?.updatedAt.toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync] POST error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
