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
  ts?: number;
  deleted?: boolean;
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
//  GET — return tasks for workspace, filtered by visibleTo
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const token = req.nextUrl.searchParams.get("token") || undefined;
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await checkWorkspaceAccess(auth.user.id, workspaceId, false);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId,
        deleted: false,
      },
      orderBy: { createdAt: "asc" },
    });

    // Все задачи видны всем — фильтрация по visibleTo не нужна

    return NextResponse.json({
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
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
        _ts: t.ts.getTime(),
        _deleted: t.deleted,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  POST — create task
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const body = await req.json();
    const { workspaceId, domainId, monthKey, num, name, planH, factH, priority, status, comment, commentLog, visibleTo } = body as TaskData & { workspaceId: string };

    if (!workspaceId || !domainId || !monthKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Гость не может создавать задачи
    if (auth.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может создавать задачи" }, { status: 403 });
    }

    const access = await checkWorkspaceAccess(auth.user.id, workspaceId, true);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Auto-add owner to visibleTo if not set
    const finalVisibleTo = visibleTo || "[]";

    const task = await prisma.task.create({
      data: {
        workspaceId,
        domainId,
        monthKey,
        num: num || "",
        name: name || "",
        planH: planH || "0",
        factH: factH || "0",
        priority: priority || "QUEUE",
        status: status || "IDEA",
        comment: comment || "",
        commentLog: commentLog || "[]",
        visibleTo: finalVisibleTo,
      },
    });

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        domainId: task.domainId,
        monthKey: task.monthKey,
        num: task.num,
        name: task.name,
        planH: task.planH,
        factH: task.factH,
        priority: task.priority,
        status: task.status,
        comment: task.comment,
        commentLog: task.commentLog,
        visibleTo: task.visibleTo,
        _ts: task.ts.getTime(),
        _deleted: task.deleted,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  PUT — update task
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const body = await req.json();
    const { id, domainId, monthKey, num, name, planH, factH, priority, status, comment, commentLog, visibleTo, ts: clientTs, deleted: clientDeleted } = body as TaskData;

    if (!id) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Гость не может изменять задачи
    if (auth.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может изменять задачи" }, { status: 403 });
    }

    // Get existing task to check workspace access
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const access = await checkWorkspaceAccess(auth.user.id, existing.workspaceId, true);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Last-write-wins: only update if client timestamp >= server timestamp
    if (clientTs && existing.ts.getTime() > clientTs) {
      return NextResponse.json({ success: true, message: "Server version is newer" });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(domainId !== undefined && { domainId }),
        ...(monthKey !== undefined && { monthKey }),
        ...(num !== undefined && { num }),
        ...(name !== undefined && { name }),
        ...(planH !== undefined && { planH }),
        ...(factH !== undefined && { factH }),
        ...(priority !== undefined && { priority }),
        ...(status !== undefined && { status }),
        ...(comment !== undefined && { comment }),
        ...(commentLog !== undefined && { commentLog }),
        ...(visibleTo !== undefined && { visibleTo }),
        ...(clientDeleted !== undefined && { deleted: clientDeleted }),
        ts: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        domainId: task.domainId,
        monthKey: task.monthKey,
        num: task.num,
        name: task.name,
        planH: task.planH,
        factH: task.factH,
        priority: task.priority,
        status: task.status,
        comment: task.comment,
        commentLog: task.commentLog,
        visibleTo: task.visibleTo,
        _ts: task.ts.getTime(),
        _deleted: task.deleted,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  DELETE — soft delete task
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const token = req.nextUrl.searchParams.get("token") || undefined;

    if (!id) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Гость не может удалять задачи
    if (auth.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может удалять задачи" }, { status: 403 });
    }

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const access = await checkWorkspaceAccess(auth.user.id, existing.workspaceId, true);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    await prisma.task.update({
      where: { id },
      data: { deleted: true, ts: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}