import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/question
// Returns all questions (shared across all users)
export async function GET() {
  try {
    const questions = await prisma.question.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text,
        author: q.author,
        answer: q.answer,
        questionDate: q.questionDate.toISOString(),
        answerDate: q.answerDate?.toISOString() || null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/question
// Body: { question: string, author?: string }
// Creates a new shared question
export async function POST(req: NextRequest) {
  try {
    const { question, author } = await req.json();
    if (!question) {
      return NextResponse.json({ error: "Missing question text" }, { status: 400 });
    }

    const q = await prisma.question.create({
      data: {
        text: question,
        author: author || "Аноним",
      },
    });

    return NextResponse.json({
      success: true,
      question: {
        id: q.id,
        text: q.text,
        author: q.author,
        answer: q.answer,
        questionDate: q.questionDate.toISOString(),
        answerDate: null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/question?id=<questionId>
// Deletes a question (any user can delete)
export async function DELETE(req: NextRequest) {
  try {
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
