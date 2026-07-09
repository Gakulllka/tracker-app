import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true, displayName: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

function parseDomainIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === "string");
  if (typeof raw === "string") {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === "string") : []; }
    catch { return []; }
  }
  return [];
}

// GET — list shares for a workspace (owner only)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    if (workspace.userId !== auth.user.id) {
      return NextResponse.json({ error: "Only owner can manage shares" }, { status: 403 });
    }

    const shares = await prisma.workspaceShare.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });

    return NextResponse.json({
      success: true,
      shares: shares.map((s) => ({
        id: s.id,
        userId: s.user.id,
        username: s.user.username,
        displayName: s.user.displayName,
        role: s.role,
        domainIds: parseDomainIds(s.domainIds),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — add a share
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, workspaceId, username, role, domainIds } = body as {
      token?: string;
      workspaceId?: string;
      username?: string;
      role?: string;
      domainIds?: string[];
    };

    if (!workspaceId || !username) {
      return NextResponse.json({ error: "Missing workspaceId or username" }, { status: 400 });
    }

    const validRoles = ["editor", "viewer", "executive"];
    const shareRole = validRoles.includes(role || "") ? role! : "editor";
    const shareDomainIds = shareRole === "executive" ? JSON.stringify(domainIds || []) : "[]";

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    if (workspace.userId !== auth.user.id) {
      return NextResponse.json({ error: "Only owner can manage shares" }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (targetUser.id === auth.user.id) {
      return NextResponse.json({ error: "Нельзя поделиться с самим собой" }, { status: 400 });
    }

    const existing = await prisma.workspaceShare.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUser.id } },
    });
    if (existing) {
      return NextResponse.json({ error: "Пользователь уже имеет доступ" }, { status: 409 });
    }

    const share = await prisma.workspaceShare.create({
      data: { workspaceId, userId: targetUser.id, role: shareRole, domainIds: shareDomainIds },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });

    return NextResponse.json({
      success: true,
      share: {
        id: share.id,
        userId: share.user.id,
        username: share.user.username,
        displayName: share.user.displayName,
        role: share.role,
        domainIds: parseDomainIds(share.domainIds),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — update share role and/or domainIds
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, shareId, role, domainIds } = body as {
      token?: string;
      shareId?: string;
      role?: string;
      domainIds?: string[];
    };

    if (!shareId) {
      return NextResponse.json({ error: "Missing shareId" }, { status: 400 });
    }

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const share = await prisma.workspaceShare.findUnique({ where: { id: shareId } });
    if (!share) return NextResponse.json({ error: "Share not found" }, { status: 404 });

    const workspace = await prisma.workspace.findUnique({ where: { id: share.workspaceId } });
    if (!workspace || workspace.userId !== auth.user.id) {
      return NextResponse.json({ error: "Only owner can manage shares" }, { status: 403 });
    }

    const updateData: { role?: string; domainIds?: string } = {};
    if (role) {
      const validRoles = ["editor", "viewer", "executive"];
      updateData.role = validRoles.includes(role) ? role : share.role;
    }
    // Update domainIds if provided, or if role changed to/from executive
    if (domainIds !== undefined) {
      updateData.domainIds = JSON.stringify(domainIds);
    } else if (updateData.role === "executive" && !domainIds) {
      // Switching to executive without domainIds — keep existing or set empty
      updateData.domainIds = share.domainIds || "[]";
    } else if (updateData.role && updateData.role !== "executive") {
      // Switching away from executive — clear domainIds
      updateData.domainIds = "[]";
    }

    await prisma.workspaceShare.update({ where: { id: shareId }, data: updateData });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — remove a share
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, shareId } = body as { token?: string; shareId?: string };

    if (!shareId) return NextResponse.json({ error: "Missing shareId" }, { status: 400 });

    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const share = await prisma.workspaceShare.findUnique({ where: { id: shareId } });
    if (!share) return NextResponse.json({ error: "Share not found" }, { status: 404 });

    const workspace = await prisma.workspace.findUnique({ where: { id: share.workspaceId } });
    if (!workspace || workspace.userId !== auth.user.id) {
      return NextResponse.json({ error: "Only owner can manage shares" }, { status: 403 });
    }

    await prisma.workspaceShare.delete({ where: { id: shareId } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
