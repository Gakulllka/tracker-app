import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Clone the request and remove ALL conditional headers that cause 412
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

  // Strip ETag and set aggressive no-cache headers to prevent proxy caching
  response.headers.delete("etag");
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");

  return response;
}

export const config = {
  matcher: [
    // Match everything except api routes and _next internals
    "/((?!api|_next/static|_next/image|_next/webpack).*)",
  ],
};
