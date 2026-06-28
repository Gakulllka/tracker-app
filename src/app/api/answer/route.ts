import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface AnswerEntry {
  id: string;
  author: string;
  text: string;
  date: string;
}

function parseAnswers(raw: string): AnswerEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as AnswerEntry[];
    // Legacy: plain string answer → wrap as single entry
    if (typeof parsed === "string" && parsed.trim()) {
      return [{ id: "legacy", author: "Аноним", text: parsed, date: new Date().toISOString() }];
    }
    return [];
  } catch {
    // Legacy plain text
    if (raw.trim()) {
      return [{ id: "legacy", author: "Аноним", text: raw, date: new Date().toISOString() }];
    }
    return [];
  }
}

// POST /api/answer — append a new answer to a question
// Body: { questionId, answer, author }
export async function POST(req: NextRequest) {
  try {
    const { questionId, answer, author } = await req.json();
    if (!questionId || !answer?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const existing = parseAnswers(question.answer);
    const newEntry: AnswerEntry = {
      id: crypto.randomUUID(),
      author: author?.trim() || "Аноним",
      text: answer.trim(),
      date: new Date().toISOString(),
    };
    const updated = [...existing, newEntry];

    const isAuthorReply = author?.trim() === question.author;
    const newStatus = isAuthorReply ? "reopened" : "answered";

    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        answer: JSON.stringify(updated),
        answerDate: new Date(),
        status: newStatus,
      },
    });

    return NextResponse.json({
      success: true,
      answer: newEntry,
      answers: updated,
      status: newStatus,
      question: {
        id: updatedQuestion.id,
        text: updatedQuestion.text,
        author: updatedQuestion.author,
        answers: updated,
        status: newStatus,
        questionDate: updatedQuestion.questionDate.toISOString(),
        answerDate: updatedQuestion.answerDate?.toISOString() || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/answer?questionId=<id>&answerId=<id> — delete a specific answer
export async function DELETE(req: NextRequest) {
  try {
    const questionId = req.nextUrl.searchParams.get("questionId");
    const answerId = req.nextUrl.searchParams.get("answerId");
    if (!questionId || !answerId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = parseAnswers(question.answer);
    const filtered = existing.filter(a => a.id !== answerId);
    const newStatus = filtered.length === 0 ? "open" : question.status;
    await prisma.question.update({
      where: { id: questionId },
      data: {
        answer: JSON.stringify(filtered),
        answerDate: filtered.length > 0 ? question.answerDate : null,
        status: newStatus,
      },
    });

    return NextResponse.json({ success: true, answers: filtered, status: newStatus });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
