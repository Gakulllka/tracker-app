import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth";

/**
 * СОВМЕСТИМОСТЬ. Шаринг воркспейсов заменён пер-доменными правами
 * редактирования: см. /api/domains/access.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || undefined;
  const auth = await resolveSession(token);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, shares: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Шаринг воркспейсов заменён: используйте /api/domains/access" },
    { status: 410 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Шаринг воркспейсов заменён: используйте /api/domains/access" },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Шаринг воркспейсов заменён: используйте /api/domains/access" },
    { status: 410 }
  );
}
