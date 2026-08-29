import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware Next.js 16 (в 15-й версии файл назывался middleware.ts).
 * Единственная задача — не пускать в /admin без токена авторизации.
 * Полная проверка прав всё равно выполняется на сервере в src/lib/auth.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token =
      request.cookies.get("auth_token")?.value ||
      request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
