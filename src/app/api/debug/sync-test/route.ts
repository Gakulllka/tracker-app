import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/debug/sync-test?token=...
 * Diagnostic endpoint to debug sync issues.
 * Shows: workspace info, user info, token validity.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    // Check session
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { role: true } } },
    });

    if (!session) {
      return NextResponse.json({ error: "Invalid token - session not found" }, { status: 401 });
    }

    if (session.expiresAt < new Date()) {
      return NextResponse.json({ error: "Session expired", expiresAt: session.expiresAt.toISOString() }, { status: 401 });
    }

    // Check workspace
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.userId },
    });

    // Check shares
    const shares = await prisma.workspaceShare.findMany({
      where: { userId: session.userId },
    });

    return NextResponse.json({
      session: {
        valid: true,
        userId: session.userId,
        username: session.user.username,
        role: session.user.role?.name,
        expiresAt: session.expiresAt.toISOString(),
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name,
        allDataLength: workspace.allData?.length || 0,
        updatedAt: workspace.updatedAt.toISOString(),
      } : null,
      shares: shares.map(s => ({
        workspaceId: s.workspaceId,
        role: s.role,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
