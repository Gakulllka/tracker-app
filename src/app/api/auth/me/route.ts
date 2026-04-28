import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/auth/me?token=<sessionToken>
// Validates the session token and returns the current user + workspace info + permissions
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

    // Check expiration
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    // Get workspace
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

    // Get permissions for this user
    let perms = await prisma.userPermission.findUnique({
      where: { userId: session.userId },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        role: session.user.role?.name?.toLowerCase() || "viewer",
      },
      workspaceId: workspace.id,
      permissions: perms ? {
        visibleTabs: perms.visibleTabs,
        visibleDomainIds: perms.visibleDomainIds,
        canEdit: perms.canEdit,
        canSeeQuestions: perms.canSeeQuestions,
      } : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
