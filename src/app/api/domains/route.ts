import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSession, resolveSessionFromRequest, roleCanEverEdit, logActivity, getClientIp } from "@/lib/auth";

/**
 * Домены глобальны: их видят все пользователи.
 * Архивные домены видит только админ.
 * Создать домен может любой не-readonly пользователь; создатель
 * автоматически получает право редактирования (DomainEditor).
 * Удалить/архивировать домен может только админ.
 */

// GET /api/domains?token=...
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    const isAdmin = auth?.user.role === "admin";

    const domains = await prisma.domain.findMany({
      where: isAdmin ? {} : { archived: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        archived: true,
        createdById: true,
        editors: { select: { userId: true } },
      },
    });

    return NextResponse.json({
      domains: domains.map((d) => ({
        id: d.id,
        name: d.name,
        archived: d.archived,
        createdById: d.createdById,
        editorUserIds: d.editors.map((e) => e.userId),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/domains — создать домен
// Body: { token, name }
export async function POST(req: NextRequest) {
  try {
    const { token, name } = await req.json();
    if (!token || !name?.trim()) {
      return NextResponse.json({ error: "Missing token or name" }, { status: 400 });
    }

    const auth = await resolveSession(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет создавать домены" }, { status: 403 });
    }

    const existing = await prisma.domain.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Домен с таким названием уже существует" }, { status: 409 });
    }

    const domain = await prisma.domain.create({
      data: {
        name: name.trim(),
        createdById: auth.user.id,
        // Создатель автоматически становится редактором домена
        editors: { create: { userId: auth.user.id, grantedBy: auth.user.username } },
      },
    });

    await logActivity({
      userId: auth.user.id,
      username: auth.user.username,
      action: "domain_create",
      entityType: "domain",
      entityId: domain.id,
      newValue: JSON.stringify({ name: domain.name }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, domain: { id: domain.id, name: domain.name } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/domains — переименовать или архивировать/разархивировать
// Body: { token, domainId, name? , archived? }
export async function PATCH(req: NextRequest) {
  try {
    const { token, domainId, name, archived } = await req.json();
    if (!token || !domainId) {
      return NextResponse.json({ error: "Missing token or domainId" }, { status: 400 });
    }

    const auth = await resolveSession(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const domain = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!domain) return NextResponse.json({ error: "Домен не найден" }, { status: 404 });

    // Архивация — только админ. Переименование — админ/редактор.
    if (archived !== undefined && auth.user.role !== "admin") {
      return NextResponse.json({ error: "Архивировать домены может только администратор" }, { status: 403 });
    }
    if (name !== undefined && !["admin", "editor"].includes(auth.user.role)) {
      return NextResponse.json({ error: "Недостаточно прав для переименования" }, { status: 403 });
    }

    const updated = await prisma.domain.update({
      where: { id: domainId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(archived !== undefined ? { archived: Boolean(archived) } : {}),
      },
    });

    await logActivity({
      userId: auth.user.id,
      username: auth.user.username,
      action: archived !== undefined ? (archived ? "domain_archive" : "domain_unarchive") : "domain_rename",
      entityType: "domain",
      entityId: domainId,
      oldValue: JSON.stringify({ name: domain.name, archived: domain.archived }),
      newValue: JSON.stringify({ name: updated.name, archived: updated.archived }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      domain: { id: updated.id, name: updated.name, archived: updated.archived },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/domains — удалить домен со всеми данными (только админ)
// Body: { token, domainId }
export async function DELETE(req: NextRequest) {
  try {
    const { token, domainId } = await req.json();
    if (!token || !domainId) {
      return NextResponse.json({ error: "Missing token or domainId" }, { status: 400 });
    }

    const auth = await resolveSession(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (auth.user.role !== "admin") {
      return NextResponse.json({ error: "Удалять домены может только администратор" }, { status: 403 });
    }

    const domain = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!domain) return NextResponse.json({ error: "Домен не найден" }, { status: 404 });

    // Каскад удалит задачи, бэклог, вопросы, инсайты, права и запросы
    await prisma.domain.delete({ where: { id: domainId } });

    await logActivity({
      userId: auth.user.id,
      username: auth.user.username,
      action: "domain_delete",
      entityType: "domain",
      entityId: domainId,
      oldValue: JSON.stringify({ name: domain.name }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
