import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminRequest } from "@/lib/admin-auth";

// PUT /api/admin/permissions
// Body: { token: string, userId: string, visibleTabs: string, visibleDomainIds: string, canEdit: boolean, canSeeQuestions: boolean }
// Updates a user's permissions. Admin only.
export async function PUT(req: NextRequest) {
  try {
    const admin = await validateAdminRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, visibleTabs, visibleDomainIds, canEdit, canSeeQuestions } = body;

    if (!userId) {
      return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    }

    // Don't allow changing own permissions
    if (userId === admin.user.id) {
      return NextResponse.json({ error: "Нельзя изменить свои права" }, { status: 400 });
    }

    // Upsert permissions
    const permissions = await prisma.userPermission.upsert({
      where: { userId },
      create: {
        userId,
        visibleTabs: visibleTabs || "",
        visibleDomainIds: visibleDomainIds || "[]",
        canEdit: canEdit ?? true,
        canSeeQuestions: canSeeQuestions ?? true,
      },
      update: {
        visibleTabs: visibleTabs ?? undefined,
        visibleDomainIds: visibleDomainIds ?? undefined,
        canEdit: canEdit ?? undefined,
        canSeeQuestions: canSeeQuestions ?? undefined,
      },
    });

    return NextResponse.json({ success: true, permissions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
