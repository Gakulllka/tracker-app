import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSession, roleCanEverEdit } from "@/lib/auth";

/**
 * Вопросы. Привязаны к домену (domainId). На переходный период domainId
 * необязателен — вопросы без домена считаются общими и видны везде.
 * Для совместимости со старым клиентом принимаем и параметр workspaceId,
 * трактуя его как domainId.
 */

function serializeQuestion(q: {
  id: string; text: string; author: string; answer: string; status: string;
  questionDate: Date; answerDate: Date | null; domainId: string | null;
}) {
  let answers: Array<{ id: string; author: string; text: string; date: string }> = [];
  if (q.answer) {
    try {
      const parsed = JSON.parse(q.answer);
      if (Array.isArray(parsed)) answers = parsed;
      else if (typeof parsed === "string" && parsed.trim()) {
        answers = [{ id: "legacy", author: "Аноним", text: parsed, date: q.questionDate.toISOString() }];
      }
    } catch {
      if (q.answer.trim()) {
        answers = [{ id: "legacy", author: "Аноним", text: q.answer, date: q.questionDate.toISOString() }];
      }
    }
  }
  return {
    id: q.id,
    text: q.text,
    author: q.author,
    answers,
    status: q.status || "open",
    questionDate: q.questionDate.toISOString(),
    answerDate: q.answerDate?.toISOString() || null,
    domainId: q.domainId,
    workspaceId: q.domainId, // совместимость со старым фронтендом
  };
}

// GET /api/question[?domainId=...]
export async function GET(req: NextRequest) {
  try {
    const domainId =
      req.nextUrl.searchParams.get("domainId") ||
      req.nextUrl.searchParams.get("workspaceId");

    // С доменом: вопросы домена + общие (без домена). Без параметра: все.
    const where = domainId ? { OR: [{ domainId }, { domainId: null }] } : {};

    const questions = await prisma.question.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ questions: questions.map(serializeQuestion) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/question — создать вопрос
// Body: { question, author?, domainId? }
export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = token ? await resolveSession(token) : null;

    if (auth && !roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет создавать вопросы" }, { status: 403 });
    }

    const body = await req.json();
    const { question, author } = body;
    const domainId: string | undefined = body.domainId || body.workspaceId || undefined;
    if (!question) {
      return NextResponse.json({ error: "Missing question text" }, { status: 400 });
    }

    // Проверяем что домен существует (иначе вопрос общий)
    let validDomainId: string | null = null;
    if (domainId) {
      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (domain) validDomainId = domain.id;
    }

    const q = await prisma.question.create({
      data: {
        text: question,
        author: author || "Аноним",
        domainId: validDomainId,
      },
    });

    return NextResponse.json({ success: true, question: serializeQuestion(q) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/question — сменить статус вопроса
// Body: { id, status }
export async function PUT(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = token ? await resolveSession(token) : null;
    if (auth && !roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет изменять вопросы" }, { status: 403 });
    }

    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const updated = await prisma.question.update({ where: { id }, data: { status } });
    return NextResponse.json({ success: true, question: { id: updated.id, status: updated.status } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/question?id=<questionId>
export async function DELETE(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = token ? await resolveSession(token) : null;
    if (auth && !roleCanEverEdit(auth.user.role)) {
      return NextResponse.json({ error: "Ваша роль не позволяет удалять вопросы" }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing question id" }, { status: 400 });
    }
    await prisma.question.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
