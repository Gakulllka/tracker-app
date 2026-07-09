import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Auth helper
async function resolveUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

// GET /api/question
// Returns questions, optionally filtered by workspaceId
export async function GET(req: NextRequest) {
  try {
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    const where = workspaceId ? { workspaceId } : {};

    const questions = await prisma.question.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      questions: questions.map((q) => {
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
          workspaceId: q.workspaceId,
        };
      }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/question
// Body: { question: string, author?: string, workspaceId?: string }
// Creates a new question, optionally linked to a workspace
export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = token ? await resolveUserFromToken(token) : null;

    // Гость не может создавать вопросы
    if (auth?.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может создавать вопросы" }, { status: 403 });
    }

    const { question, author, workspaceId } = await req.json();
    if (!question) {
      return NextResponse.json({ error: "Missing question text" }, { status: 400 });
    }

    const q = await prisma.question.create({
      data: {
        text: question,
        author: author || "Аноним",
        workspaceId: workspaceId || null,
      },
    });

    return NextResponse.json({
      success: true,
      question: {
        id: q.id,
        text: q.text,
        author: q.author,
        answer: q.answer,
        status: q.status || "open",
        questionDate: q.questionDate.toISOString(),
        answerDate: null,
        workspaceId: q.workspaceId,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/question — update question status
// Body: { id, status }
export async function PUT(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = token ? await resolveUserFromToken(token) : null;

    // Гость не может изменять вопросы
    if (auth?.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может изменять вопросы" }, { status: 403 });
    }

    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const updated = await prisma.question.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ success: true, question: { id: updated.id, status: updated.status } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/question?id=<questionId>
// Deletes a question (any user can delete)
export async function DELETE(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || undefined;
    const auth = token ? await resolveUserFromToken(token) : null;

    // Гость не может удалять вопросы
    if (auth?.user.username === "guest") {
      return NextResponse.json({ error: "Гость не может удалять вопросы" }, { status: 403 });
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
