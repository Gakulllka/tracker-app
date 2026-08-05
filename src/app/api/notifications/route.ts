import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSessionFromRequest, touchSession, getClientIp, canManageDomainAccess } from "@/lib/auth";

/**
 * GET /api/notifications
 *
 * Возвращает все уведомления для текущего пользователя:
 * 1. Запросы доступа к доменам (входящие + свои)
 * 2. Комментарии к задачам в доменах, где пользователь — редактор
 * 3. Ответы на вопросы в доменах, где пользователь — редактор
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveSessionFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await touchSession(auth.sessionId, getClientIp(req));

    const userId = auth.user.id;
    const username = auth.user.username;
    const isAdmin = auth.user.role === "admin";
    const isEditor = auth.user.role === "editor";

    // ── 1. Запросы доступа ──────────────────────────────────────────────────
    let manageableDomainIds: string[] | "all" = [];
    if (isAdmin || isEditor) {
      manageableDomainIds = "all";
    } else {
      const rights = await prisma.domainEditor.findMany({
        where: { userId },
        select: { domainId: true },
      });
      manageableDomainIds = rights.map((r) => r.domainId);
    }

    const accessRequests = await prisma.editRequest.findMany({
      where: {
        OR: [
          { userId: userId }, // свои запросы видны всегда
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
      take: 50,
    });

    // ── 2. Комментарии к задачам в доменах редактора ───────────────────────
    // Ищем задачи, где есть commentLog с записями от ДРУГИХ пользователей
    const editableDomainIds = manageableDomainIds === "all"
      ? (await prisma.domain.findMany({ select: { id: true } })).map((d) => d.id)
      : manageableDomainIds;

    const taskComments: Array<{
      id: string;
      domainId: string;
      domainName: string;
      taskId: string;
      taskNum: string;
      taskName: string;
      author: string;
      text: string;
      date: string;
      type: "task_comment";
    }> = [];

    if (editableDomainIds.length > 0) {
      // Берём задачи с непустым commentLog из активных доменов
      const recentTasks = await prisma.task.findMany({
        where: {
          domainId: { in: editableDomainIds },
          deleted: false,
          commentLog: { not: "[]" },
        },
        select: {
          id: true,
          domainId: true,
          num: true,
          name: true,
          commentLog: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      // Получаем имена доменов
      const domainMap = new Map<string, string>();
      const domains = await prisma.domain.findMany({
        where: { id: { in: editableDomainIds } },
        select: { id: true, name: true },
      });
      for (const d of domains) domainMap.set(d.id, d.name);

      for (const task of recentTasks) {
        try {
          const logs = JSON.parse(task.commentLog || "[]") as Array<{
            date?: string;
            text?: string;
            status?: string;
          }>;
          // Берём последние 5 записей
          const recent = logs.slice(-5);
          for (const log of recent) {
            if (!log.text) continue;
            // Пропускаем системные записи (начинаются с 📦, ✅ и т.п.)
            if (/^[📦✅🔄📋📊💡⚡🎯]/.test(log.text)) continue;
            // Пропускаем записи от текущего пользователя
            // (в commentLog нет author, но мы можем определить по статусу)
            // Пока добавляем все несистемные комментарии
            taskComments.push({
              id: `${task.id}-${log.date}`,
              domainId: task.domainId,
              domainName: domainMap.get(task.domainId) || "",
              taskId: task.id,
              taskNum: task.num,
              taskName: task.name,
              author: "", // commentLog не хранит author
              text: log.text,
              date: log.date || "",
              type: "task_comment",
            });
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // ── 3. Вопросы в доменах редактора ─────────────────────────────────────
    const questionNotifications: Array<{
      id: string;
      domainId: string;
      domainName: string;
      questionId: string;
      questionText: string;
      author: string;
      hasNewAnswer: boolean;
      type: "question";
    }> = [];

    if (editableDomainIds.length > 0) {
      const recentQuestions = await prisma.question.findMany({
        where: {
          domainId: { in: editableDomainIds as string[] },
        },
        include: {
          domain: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      for (const q of recentQuestions) {
        const hasAnswer = q.status === "answered" || q.status === "closed";
        const isNew = q.status === "open" || q.status === "reopened";
        if (hasAnswer || isNew) {
          questionNotifications.push({
            id: q.id,
            domainId: q.domainId || "",
            domainName: q.domain?.name || "",
            questionId: q.id,
            questionText: q.text,
            author: q.author,
            hasNewAnswer: hasAnswer,
            type: "question",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      accessRequests: accessRequests.map((r) => ({
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
      taskComments: taskComments.slice(0, 20),
      questionNotifications: questionNotifications.slice(0, 20),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[notifications] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
