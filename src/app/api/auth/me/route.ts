import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/me?token=<sessionToken>
 *
 * Validates the session token and returns:
 *   - user (id, username, displayName, role-name-lowercase, roleName)
 *   - workspaceId
 *   - permissions  — user-level overrides (legacy UserPermission table)
 *   - rolePermissions — JSON permissions of the user's Role
 *                       (canViewTasks, canEditTasks, ..., visibleDomains)
 *
 * Also touches Session.lastActivity (acts as a soft heartbeat).
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { role: true } } },
    });

    if (!session) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    // Touch lastActivity — /me called on each mount.
    try {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastActivity: new Date() },
      });
    } catch {
      /* ignore — optional for /me */
    }

    let workspace = await prisma.workspace.findFirst({
      where: { userId: session.userId },
    });
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: "Моё пространство",
          userId: session.userId,
        },
      });
    }

    // User-level permission overrides (legacy грубая модель)
    const perms = await prisma.userPermission.findUnique({
      where: { userId: session.userId },
    });

    // Role permissions JSON — основная модель прав, привязанных к роли.
    let rolePermissions: Record<string, unknown> | null = null;
    try {
      rolePermissions = JSON.parse(session.user.role.permissions || "{}");
    } catch {
      rolePermissions = {};
    }

    // Shared workspaces (workspaces this user has been granted access to)
    const sharedWorkspaces = await prisma.workspaceShare.findMany({
      where: { userId: session.userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            user: { select: { displayName: true, username: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        role: session.user.role?.name?.toLowerCase() || "viewer",
        roleName: session.user.role?.name || "viewer",
      },
      workspaceId: workspace.id,
      accessibleWorkspaces: sharedWorkspaces.map((s) => {
        let domainIds: string[] = [];
        try { domainIds = JSON.parse(s.domainIds || "[]"); } catch { /* empty */ }
        return {
          workspaceId: s.workspace.id,
          name: s.workspace.name,
          role: s.role,
          ownerName: s.workspace.user.displayName || s.workspace.user.username,
          domainIds,
        };
      }),
      permissions: perms ? {
        visibleTabs: perms.visibleTabs,
        visibleDomainIds: perms.visibleDomainIds,
        canEdit: perms.canEdit,
        canSeeQuestions: perms.canSeeQuestions,
      } : null,
      rolePermissions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
