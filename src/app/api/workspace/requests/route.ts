import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
//  GET — get pending access requests for workspace (owner only)
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

    // Only workspace owner can see requests
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || workspace.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const requests = await prisma.workspaceAccessRequest.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      requests: requests.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.user.username,
        displayName: r.user.displayName,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  POST — request access to workspace
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const body = await req.json();
    const { workspaceId, message } = body as { workspaceId: string; message?: string };

    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check workspace exists
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Cannot request access to own workspace
    if (workspace.userId === auth.user.id) {
      return NextResponse.json({ error: "Cannot request access to own workspace" }, { status: 400 });
    }

    // Check if already has access
    const existingShare = await prisma.workspaceShare.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: auth.user.id } },
    });
    if (existingShare) {
      return NextResponse.json({ error: "Already have access" }, { status: 400 });
    }

    // Check if already has pending request
    const existingRequest = await prisma.workspaceAccessRequest.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: auth.user.id } },
    });
    if (existingRequest) {
      return NextResponse.json({ error: "Request already pending" }, { status: 400 });
    }

    const request = await prisma.workspaceAccessRequest.create({
      data: {
        workspaceId,
        userId: auth.user.id,
        message: message || "",
      },
    });

    return NextResponse.json({
      success: true,
      request: {
        id: request.id,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  PUT — approve/reject request (owner only)
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const body = await req.json();
    const { requestId, status } = body as { requestId: string; status: "approved" | "rejected" };

    if (!requestId || !status) {
      return NextResponse.json({ error: "Missing requestId or status" }, { status: 400 });
    }

    const auth = token ? await resolveUserFromToken(token) : null;
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the request
    const accessRequest = await prisma.workspaceAccessRequest.findUnique({
      where: { id: requestId },
    });
    if (!accessRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Only workspace owner can approve/reject
    const workspace = await prisma.workspace.findUnique({ where: { id: accessRequest.workspaceId } });
    if (!workspace || workspace.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update request status
    await prisma.workspaceAccessRequest.update({
      where: { id: requestId },
      data: { status },
    });

    // If approved, create workspace share
    if (status === "approved") {
      await prisma.workspaceShare.create({
        data: {
          workspaceId: accessRequest.workspaceId,
          userId: accessRequest.userId,
          role: "editor",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}