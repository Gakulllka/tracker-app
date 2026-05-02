import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Admin route protection ─────────────────────────────────────────────
  // The /admin page requires an auth_token cookie.
  // We can't validate the token in Edge middleware (no DB access), so we
  // just ensure the cookie exists. The page itself calls /api/admin/* which
  // fully validates admin role server-side.
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("auth_token")?.value
      || request.nextUrl.searchParams.get("token");

    if (!token) {
      // Redirect to home — the auth screen will appear
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ── Strip conditional request headers (prevent 412 / proxy caching) ───
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("if-none-match");
  requestHeaders.delete("if-modified-since");
  requestHeaders.delete("if-match");
  requestHeaders.delete("if-unmodified-since");
  requestHeaders.delete("cache-control");
  requestHeaders.delete("pragma");

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.delete("etag");
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/webpack).*)",
  ],
};
