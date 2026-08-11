import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSession,
  resolveSessionFromRequest,
  roleCanEverEdit,
  canManageDomainAccess,
  logActivity,
  getClientIp,
} from "@/lib/auth";

/**
 * Управление правами редактирования доменов.
 *
 * GET  /api/domains/access?token=...
 *      → { rights: [{domainId, userId, username, displayName, grantedBy}],
 *          requests: [{id, domainId, domainName, userId, username, displayName, status, createdAt}] }
 *      Запросы (pending) видят те, кто может ими управлять; свои запросы видит каждый.
 *
 * POST /api/domains/access  { token, domainId }
 *      → пользователь запрашивает право редактирования домена.
 *
 * PUT  /api/domains/access
 *      { token, action: "approve"|"reject", requestId }        — решить запрос
 *      { token, action: "grant"|"revoke", domainId, userId }   — выдать/забрать напрямую
 */

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rights = await prisma.domainEditor.findMany({
      include: { user: { select: { username: true, displayName: true } } },
      // role выбирается автоматически (скалярное поле модели)
    });

    // Домены, запросами к которым может управлять текущий пользователь (creator + admin)
    let manageableDomainIds: string[] | "all" = [];
    if (auth.user.role === "admin") {
      manageableDomainIds = "all";
    } else {
      // creator доменов может управлять доступом
      manageableDomainIds = rights
        .filter((r) => r.userId === auth.user.id && r.role === "creator")
        .map((r) => r.domainId);
    }

    const pending = await prisma.editRequest.findMany({
      where: {
        OR: [
          { userId: auth.user.id }, // свои запросы видны всегда
          ...(manageableDomainIds === "all"
            ? [{ status: "pending" }]
            : manageableDomainIds.length > 0
              ? [{ status: "pending", domainId: { in: manageableDomainIds } }]
              : []),
        ],
      },
      include: {
        user: { select: { username: true, displayName: true } },
        domain: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      rights: rights.map((r) => ({
        domainId: r.domainId,
        userId: r.userId,
        username: r.user.username,
        displayName: r.user.displayName,
        role: r.role || "editor",
        grantedBy: r.grantedBy,
      })),
      requests: pending.map((r) => ({
        id: r.id,
        domainId: r.domainId,
        domainName: r.domain.name,
        userId: r.userId,
        username: r.user.username,
        displayName: r.user.displayName,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        canResolve:
          manageableDomainIds === "all" || manageableDomainIds.includes(r.domainId),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, domainId } = await req.json();
    if (!token || !domainId) {
      return NextResponse.json({ error: "Missing token or domainId" }, { status: 400 });
    }

    const auth = await resolveSession(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!roleCanEverEdit(auth.user.role)) {
      return NextResponse.json(
        { error: "Вашей роли нельзя выдать права редактирования" },
        { status: 403 }
      );
    }

    const domain = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!domain) return NextResponse.json({ error: "Домен не найден" }, { status: 404 });

    const already = await prisma.domainEditor.findUnique({
      where: { domainId_userId: { domainId, userId: auth.user.id } },
    });
    if (already) {
      return NextResponse.json({ error: "У вас уже есть право редактирования" }, { status: 409 });
    }

    const existing = await prisma.editRequest.findFirst({
      where: { domainId, userId: auth.user.id, status: "pending" },
    });
    if (existing) {
      return NextResponse.json({ error: "Запрос уже отправлен и ожидает решения" }, { status: 409 });
    }

    const request = await prisma.editRequest.create({
      data: { domainId, userId: auth.user.id },
    });

    await logActivity({
      userId: auth.user.id,
      username: auth.user.username,
      action: "access_request",
      entityType: "domain",
      entityId: domainId,
      newValue: JSON.stringify({ domain: domain.name }),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, requestId: request.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, action } = body as { token?: string; action?: string };
    if (!token || !action) {
      return NextResponse.json({ error: "Missing token or action" }, { status: 400 });
    }

    const auth = await resolveSession(token);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── approve / reject запроса ─────────────────────────────────────────
    if (action === "approve" || action === "reject") {
      const requestId: string | undefined = body.requestId;
      if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

      const request = await prisma.editRequest.findUnique({
        where: { id: requestId },
        include: { user: { select: { username: true, role: true } }, domain: { select: { name: true } } },
      });
      if (!request) return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
      if (request.status !== "pending") {
        return NextResponse.json({ error: "Запрос уже обработан" }, { status: 409 });
      }

      const allowed = await canManageDomainAccess(auth.user.id, auth.user.role, request.domainId);
      if (!allowed) {
        return NextResponse.json({ error: "Недостаточно прав для решения этого запроса" }, { status: 403 });
      }

      await prisma.editRequest.update({
        where: { id: requestId },
        data: {
          status: action === "approve" ? "approved" : "rejected",
          resolvedAt: new Date(),
          resolvedById: auth.user.id,
        },
      });

      if (action === "approve") {
        await prisma.domainEditor.upsert({
          where: { domainId_userId: { domainId: request.domainId, userId: request.userId } },
          create: {
            domainId: request.domainId,
            userId: request.userId,
            role: "editor", // одобренный запрос → редактор
            grantedBy: auth.user.username,
          },
          update: {},
        });
      }

      await logActivity({
        userId: auth.user.id,
        username: auth.user.username,
        action: action === "approve" ? "access_grant" : "access_reject",
        entityType: "domain",
        entityId: request.domainId,
        newValue: JSON.stringify({ domain: request.domain.name, targetUser: request.user.username }),
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({ success: true });
    }

    // ── grant / revoke напрямую ──────────────────────────────────────────
    if (action === "grant" || action === "revoke") {
      const { domainId, userId, role: grantRole } = body as {
        domainId?: string; userId?: string; role?: string;
      };
      if (!domainId || !userId) {
        return NextResponse.json({ error: "Missing domainId or userId" }, { status: 400 });
      }
      // Валидация пер-доменной роли
      const validRoles = ["creator", "editor", "viewer"];
      const newRole = validRoles.includes(grantRole as string) ? (grantRole as string) : "editor";

      const allowed = await canManageDomainAccess(auth.user.id, auth.user.role, domainId);
      if (!allowed) {
        return NextResponse.json({ error: "Недостаточно прав. Управление доступом — только для создателя домена" }, { status: 403 });
      }

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      // guest-аккаунту права не выдаются
      if (action === "grant" && target.role === "guest") {
        return NextResponse.json(
          { error: "Гостевому аккаунту нельзя выдать права" },
          { status: 400 }
        );
      }

      if (action === "grant") {
        await prisma.domainEditor.upsert({
          where: { domainId_userId: { domainId, userId } },
          create: { domainId, userId, role: newRole, grantedBy: auth.user.username },
          update: { role: newRole, grantedBy: auth.user.username },
        });
      } else {
        await prisma.domainEditor.deleteMany({ where: { domainId, userId } });
      }

      await logActivity({
        userId: auth.user.id,
        username: auth.user.username,
        action: action === "grant" ? "access_grant" : "access_revoke",
        entityType: "domain",
        entityId: domainId,
        newValue: JSON.stringify({ targetUser: target.username }),
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
