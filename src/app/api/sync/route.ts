import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
//  Merge helpers — combine client & server task arrays by task ID so that
//  two concurrent editors never lose each other's work.
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  [key: string]: unknown;
}

function mergeArrays<T extends Task>(server: T[], client: T[]): T[] {
  const map = new Map<string, T>();
  for (const t of server) map.set(t.id, t);
  for (const t of client) map.set(t.id, t);
  return Array.from(map.values());
}

function mergeAllData(
  serverRaw: Record<string, unknown>,
  clientRaw: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(serverRaw),
    ...Object.keys(clientRaw),
  ]);
  for (const k of keys) {
    const sv = serverRaw[k];
    const cv = clientRaw[k];
    if (Array.isArray(sv) && Array.isArray(cv)) {
      result[k] = mergeArrays(sv as Task[], cv as Task[]);
    } else if (Array.isArray(cv)) {
      result[k] = cv;
    } else if (Array.isArray(sv)) {
      result[k] = sv;
    } else if (cv !== undefined) {
      result[k] = cv;
    } else if (sv !== undefined) {
      result[k] = sv;
    }
  }
  return result;
}

function mergeBacklog(serverArr: unknown[], clientArr: unknown[]): unknown[] {
  return mergeArrays(serverArr as Task[], clientArr as Task[]) as unknown[];
}

/** Merge domainData by domain ID, then merge allData/backlog within each domain */
function mergeDomainData(
  server: Record<string, { allData: Record<string, unknown>; backlog: unknown[] }>,
  client: Record<string, { allData: Record<string, unknown>; backlog: unknown[] }>,
): Record<string, { allData: Record<string, unknown>; backlog: unknown[] }> {
  const result: Record<string, { allData: Record<string, unknown>; backlog: unknown[] }> = { ...server };
  for (const [domainId, clientData] of Object.entries(client)) {
    const serverData = result[domainId];
    if (serverData) {
      result[domainId] = {
        allData: mergeAllData(serverData.allData, clientData.allData),
        backlog: mergeBacklog(serverData.backlog, clientData.backlog),
      };
    } else {
      result[domainId] = clientData;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
//  Format detection — distinguish old (flat allData) from new (domainData)
// ---------------------------------------------------------------------------

function isDomainDataFormat(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  // domainData values have an "allData" key; old allData values are arrays (month → Task[])
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val) && "allData" in (val as object)) return true;
  }
  return false;
}

function wrapAsDomainData(
  allData: Record<string, unknown>,
  backlog: unknown[],
): Record<string, { allData: Record<string, unknown>; backlog: unknown[] }> {
  return { "default": { allData, backlog } };
}

// ---------------------------------------------------------------------------
//  GET — return current workspace data
// ---------------------------------------------------------------------------

// GET /api/sync?id=<workspaceId>
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });
    }

    let ws = await prisma.workspace.findUnique({ where: { id } });
    if (!ws) {
      ws = await prisma.workspace.create({ data: { id } });
    }

    // Parse allData column — may be old format or new domainData format
    const parsedAllData: unknown = JSON.parse(ws.allData);
    const parsedBacklog: unknown[] = JSON.parse(ws.backlog);

    let domainData: Record<string, { allData: Record<string, unknown>; backlog: unknown[] }>;
    if (isDomainDataFormat(parsedAllData)) {
      domainData = parsedAllData as Record<string, { allData: Record<string, unknown>; backlog: unknown[] }>;
    } else {
      // Old format — migrate on the fly
      domainData = wrapAsDomainData(
        parsedAllData as Record<string, unknown>,
        parsedBacklog,
      );
    }

    return NextResponse.json({
      id: ws.id,
      name: ws.name,
      domainData,
      updatedAt: ws.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  POST — merge (not overwrite) client data into workspace
// ---------------------------------------------------------------------------

// POST /api/sync
// Body: { id, domainData?, clientUpdatedAt? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, domainData, clientUpdatedAt } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });
    }

    const existing = await prisma.workspace.findUnique({ where: { id } });

    if (existing) {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      // Merge domainData by domain ID, then by task ID within each domain
      if (domainData !== undefined && domainData !== null) {
        // Parse existing allData column — may be old or new format
        const parsedExisting: unknown = JSON.parse(existing.allData);
        let serverDomainData: Record<string, { allData: Record<string, unknown>; backlog: unknown[] }>;
        if (isDomainDataFormat(parsedExisting)) {
          serverDomainData = parsedExisting as typeof serverDomainData;
        } else {
          // Old format — wrap it
          serverDomainData = wrapAsDomainData(
            parsedExisting as Record<string, unknown>,
            JSON.parse(existing.backlog),
          );
        }
        const merged = mergeDomainData(serverDomainData, domainData);
        updateData.allData = JSON.stringify(merged);
      }

      await prisma.workspace.update({ where: { id }, data: updateData });

      // Read back fresh state to return
      const updated = await prisma.workspace.findUnique({ where: { id } });
      return NextResponse.json({
        success: true,
        updatedAt: updated?.updatedAt.toISOString(),
      });
    } else {
      // New workspace — store domainData directly
      try {
        await prisma.workspace.create({
          data: {
            id,
            allData: domainData ? JSON.stringify(domainData) : "{}",
            backlog: "[]",
          },
        });
      } catch (err) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === "P2002") {
          // Race condition: another request created it first — fetch existing data
          const existing = await prisma.workspace.findUnique({ where: { id } });
          if (existing) {
            return NextResponse.json({
              success: true,
              updatedAt: existing.updatedAt.toISOString(),
            });
          }
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
