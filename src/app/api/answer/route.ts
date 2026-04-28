import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/answer
// Body: { questionId: string, answer: string }
// Updates a specific question's answer
export async function POST(req: NextRequest) {
  try {
    const { questionId, answer } = await req.json();
    if (!questionId || !answer) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const updated = await prisma.question.update({
      where: { id: questionId },
      data: {
        answer,
        answerDate: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      question: {
        id: updated.id,
        text: updated.text,
        author: updated.author,
        answer: updated.answer,
        questionDate: updated.questionDate.toISOString(),
        answerDate: updated.answerDate?.toISOString() || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
