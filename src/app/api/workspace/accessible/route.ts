import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

// GET — list all workspaces the user can access (own + shared)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = await resolveUserFromToken(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Own workspace
    const ownWorkspace = await prisma.workspace.findFirst({
      where: { userId: auth.user.id },
      select: { id: true, name: true },
    });

    // Shared workspaces
    const shares = await prisma.workspaceShare.findMany({
      where: { userId: auth.user.id },
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

    const result: Array<{
      id: string;
      name: string;
      role: string;
      ownerName: string;
    }> = [];

    if (ownWorkspace) {
      result.push({
        id: ownWorkspace.id,
        name: ownWorkspace.name,
        role: "owner",
        ownerName: auth.user.username,
      });
    }

    for (const share of shares) {
      result.push({
        id: share.workspace.id,
        name: share.workspace.name,
        role: share.role,
        ownerName: share.workspace.user.displayName || share.workspace.user.username,
      });
    }

    return NextResponse.json({ success: true, workspaces: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
