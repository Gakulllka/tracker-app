import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { token, allData } = await req.json();

    if (!token || !allData) {
      return NextResponse.json({ error: "Нет данных" }, { status: 400 });
    }

    // Ищем сессию пользователя по токену
    const session = await prisma.session.findUnique({
      where: { token },
      select: { userId: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Находим workspace пользователя и обновляем allData
    await prisma.workspace.update({
      where: { userId: session.userId },
      data: {
        allData: JSON.stringify(allData),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}