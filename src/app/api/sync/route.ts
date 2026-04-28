import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  _ts?: number;
  _deleted?: boolean;
  [key: string]: unknown;
}

interface DomainData {
  allData: Record<string, Task[]>;
  backlog: Task[];
}

// ---------------------------------------------------------------------------
//  Merge logic — last-write-wins per task using _ts timestamp
//
//  Rules:
//  1. Each task has an optional _ts (ms timestamp of last modification).
//     Tasks without _ts are treated as _ts = 0 (old data).
//  2. For each task ID, the version with the HIGHER _ts wins.
//  3. Deletions use a soft-delete tombstone: { _deleted: true, _ts: <when> }.
//     Tombstones participate in the same last-write-wins comparison.
//  4. Tombstones are stored on the server but FILTERED OUT in GET responses
//     so clients never display or push them (keeping tombstones server-side).
// ---------------------------------------------------------------------------

function mergeTasks(server: Task[], client: Task[]): Task[] {
  const map = new Map<string, Task>();

  // Load server tasks
  for (const t of server) map.set(t.id, t);

  // Merge client tasks: client wins if its _ts >= server _ts
  for (const t of client) {
    const existing = map.get(t.id);
    const serverTs = existing?._ts ?? 0;
    const clientTs = t._ts ?? 0;
    if (!existing || clientTs >= serverTs) {
      map.set(t.id, t);
    }
  }

  return Array.from(map.values());
  // NOTE: tombstones (_deleted: true) are kept in storage for propagation.
  // They are filtered out in the GET handler before returning to clients.
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
      };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
//  Filter tombstones for client responses
//  Removes _deleted tasks from allData months and backlog.
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
//  GET — return workspace data (tombstones filtered out)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });

    let ws = await prisma.workspace.findUnique({ where: { id } });
    if (!ws) ws = await prisma.workspace.create({ data: { id } });

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
//  POST — merge client data into workspace (preserves tombstones)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, domainData: clientDomainData } = body;

    if (!id) return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });

    const existing = await prisma.workspace.findUnique({ where: { id } });

    if (existing) {
      if (clientDomainData != null) {
        const serverDomainData = parseDomainData(existing.allData, existing.backlog);
        const merged = mergeDomains(serverDomainData, clientDomainData as Record<string, DomainData>);

        await prisma.workspace.update({
          where: { id },
          data: { allData: JSON.stringify(merged), updatedAt: new Date() },
        });
      } else {
        // No data sent — just touch the timestamp
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
