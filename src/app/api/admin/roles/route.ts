import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";

/**
 * Роли теперь фиксированные (поле User.role), таблицы Role больше нет.
 * GET возвращает статический список для админ-панели.
 * POST/PUT/DELETE (создание кастомных ролей) больше не поддерживаются.
 */

const ROLES = [
  { id: "admin",  name: "admin",  description: "Полный доступ и админ-панель", isSystem: true },
  { id: "editor", name: "editor", description: "Видит и редактирует все домены, без админ-панели", isSystem: true },
  { id: "member", name: "member", description: "Редактирует домены, где выданы права; остальные — просмотр", isSystem: true },
  { id: "viewer", name: "viewer", description: "Только просмотр всех доменов", isSystem: true },
  { id: "guest",  name: "guest",  description: "Гость — только просмотр, права не выдаются", isSystem: true },
];

export async function GET(req: NextRequest) {
  const admin = await validateAdminRequest(req);
  if (!admin) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  return NextResponse.json({ success: true, roles: ROLES });
}

export async function POST() {
  return NextResponse.json(
    { error: "Кастомные роли больше не поддерживаются — роли фиксированные" },
    { status: 410 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Кастомные роли больше не поддерживаются — роли фиксированные" },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Кастомные роли больше не поддерживаются — роли фиксированные" },
    { status: 410 }
  );
}
