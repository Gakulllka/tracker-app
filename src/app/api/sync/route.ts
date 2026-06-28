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
          serverDomain.allData as Record<string, Task[]>,
          clientDomain.allData as Record<string, Task[]>,
        ),
        backlog: mergeTasks(
          serverDomain.backlog as Task[],
          clientDomain.backlog as Task[],
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
    for (const [month, tasks] of Object.entries(domain.allData)) {
      filteredAllData[month] = (tasks as Task[]).filter((t) => !t._deleted);
    }
    result[domainId] = {
      allData: filteredAllData,
      backlog: (domain.backlog as Task[]).filter((t) => !t._deleted),
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
      allData: allData as Record<string, Task[]>,
      backlog: backlog as Task[],
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
    for (const tasks of Object.values(d.allData)) out.push(...(tasks as Task[]));
    out.push(...(d.backlog as Task[]));
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
//  GET — return workspace data (tombstones filtered out)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const token = req.nextUrl.searchParams.get("token") || undefined;
    if (!id) return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });

    // Touch lastActivity on pull too — pull часто означает «открыл вкладку, синкаю».
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

    const ws = await prisma.workspace.findUnique({ where: { id } });
    if (!ws) {
      return NextResponse.json({
        id,
        name: "Моё пространство",
        domainData: {},
        updatedAt: new Date().toISOString(),
      });
    }

    const domainData = parseDomainData(ws.allData, ws.backlog);
    const cleanDomainData = filterDeletedFromDomains(domainData);

    return NextResponse.json({
      id: ws.id,
      name: ws.name,
      domainData: cleanDomainData,
      updatedAt: ws.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  POST — merge client data into workspace + write activity log + heartbeat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, domainData: clientDomainData, token } = body as {
      id?: string;
      domainData?: Record<string, DomainData>;
      token?: string;
    };

    if (!id) return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });

    // Resolve user (best-effort, не блокируем sync, если токена нет —
    // backward-compat для legacy клиентов).
    const auth = await resolveUserFromToken(token);
    const ip = getClientIp(req);

    // Heartbeat: каждый sync обновляет lastActivity сессии.
    if (auth) {
      try {
        await prisma.session.update({
          where: { id: auth.sessionId },
          data: { lastActivity: new Date(), ipAddress: ip || undefined },
        });
      } catch { /* ignore */ }
    }

    const existing = await prisma.workspace.findUnique({ where: { id } });

    if (existing) {
      if (clientDomainData != null) {
        const serverDomainData = parseDomainData(existing.allData, existing.backlog);
        const merged = mergeDomains(serverDomainData, clientDomainData);

        // Считаем diff и пишем логи — только при наличии auth-юзера,
        // иначе мы не знаем кто это.
        if (auth) {
          const serverBefore = flattenAllTasks(serverDomainData);
          const clientPushed = flattenAllTasks(clientDomainData);
          const changes = diffTasks(serverBefore, clientPushed);
          // Огранчим — слишком большой sync не валит DB логами:
          // 1000 строк за один пуш максимум.
          if (changes.length > 0 && changes.length <= 1000) {
            await logTaskChanges(auth.user, ip, changes);
          }
        }

        await prisma.workspace.update({
          where: { id },
          data: { allData: JSON.stringify(merged), updatedAt: new Date() },
        });
      } else {
        await prisma.workspace.update({ where: { id }, data: { updatedAt: new Date() } });
      }

      const updated = await prisma.workspace.findUnique({ where: { id } });
      return NextResponse.json({ success: true, updatedAt: updated?.updatedAt.toISOString() });
    } else {
      // New workspace
      try {
        await prisma.workspace.create({
          data: {
            id,
            allData: clientDomainData ? JSON.stringify(clientDomainData) : "{}",
            backlog: "[]",
            userId: "system",
          },
        });
      } catch (err) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === "P2002") {
          const ws = await prisma.workspace.findUnique({ where: { id } });
          if (ws) return NextResponse.json({ success: true, updatedAt: ws.updatedAt.toISOString() });
        }
        throw err;
      }
      return NextResponse.json({ success: true });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
