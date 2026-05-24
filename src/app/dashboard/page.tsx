// Эта страница использует Prisma — отключаем статическую генерацию.
// Без этой строки Next.js пытается пре-рендерить её при билде,
// когда DATABASE_URL ещё недоступен.
export const dynamic = "force-dynamic";

// Перенаправляем на главную страницу приложения.
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/");
}
