import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface TaskData {
  id: string;
  domainId: string;
  monthKey: string;
  num?: string;
  name?: string;
  planH?: string;
  factH?: string;
  priority?: string;
  status?: string;
  comment?: string;
  commentLog?: string;
  visibleTo?: string;
  _ts?: number;
  _deleted?: boolean;
}

// ---------------------------------------------------------------------------
//  Auth helpers
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

// ---------------------------------------------------------------------------
//  POST — bulk upsert tasks (for sync)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const body = await req.json();
    const { workspaceId, tasks: clientTasks } = body as { workspaceId: string; tasks: TaskData[] };

    if (!workspaceId || !Array.isArray(clientTasks)) {
      return NextResponse.json({ error: "Missing workspaceId or tasks" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Гость не может массово обновлять задачи
    if (auth.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может изменять задачи" }, { status: 403 });
    }

    // Check workspace access (owner or editor can write)
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    let isOwner = workspace.userId === auth.user.id;
    let shareRole: string | null = null;

    if (!isOwner) {
      const share = await prisma.workspaceShare.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: auth.user.id } },
      });
      if (!share || share.role === "viewer") {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      shareRole = share.role;
    }

    // Process each task with last-write-wins
    const results = await prisma.$transaction(
      clientTasks.map((clientTask) => {
        return prisma.task.upsert({
          where: { id: clientTask.id },
          create: {
            id: clientTask.id,
            workspaceId,
            domainId: clientTask.domainId,
            monthKey: clientTask.monthKey,
            num: clientTask.num || "",
            name: clientTask.name || "",
            planH: clientTask.planH || "0",
            factH: clientTask.factH || "0",
            priority: clientTask.priority || "QUEUE",
            status: clientTask.status || "IDEA",
            comment: clientTask.comment || "",
            commentLog: clientTask.commentLog || "[]",
            visibleTo: clientTask.visibleTo || "[]",
            ts: clientTask._ts ? new Date(clientTask._ts) : new Date(),
            deleted: clientTask._deleted || false,
          },
          update: {
            // Last-write-wins: only update if client timestamp >= server timestamp
            ...(clientTask._ts ? { ts: { gte: new Date(clientTask._ts) } } : {}),
            domainId: clientTask.domainId,
            monthKey: clientTask.monthKey,
            num: clientTask.num,
            name: clientTask.name,
            planH: clientTask.planH,
            factH: clientTask.factH,
            priority: clientTask.priority,
            status: clientTask.status,
            comment: clientTask.comment,
            commentLog: clientTask.commentLog,
            visibleTo: clientTask.visibleTo,
            ts: new Date(),
            deleted: clientTask._deleted,
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}