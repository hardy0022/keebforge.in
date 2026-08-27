import { NextResponse, type NextRequest } from "next/server";

// Next.js redirect() matches sources case-insensitively, so case-variant old
// URLs are handled here instead of next.config to avoid shadowing real routes.
const CASED_PATHS: Record<string, string> = {
  "/About": "/about",
  "/About/": "/about",
};

export async function proxy(request: NextRequest) {
  const target = CASED_PATHS[request.nextUrl.pathname];
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }

  // /auth/error: Better Auth appends ?error=<code>&error_description=<raw
  // provider text> on OAuth failures. Only known-safe codes may reach the
  // page — everything else is stripped so raw upstream error text never
  // enters the rendered HTML/RSC payload.
  if (request.nextUrl.pathname === "/auth/error") {
    const sp = request.nextUrl.searchParams;
    const code = sp.get("error");
    if (sp.has("error_description") || sp.size > 1 || (code !== null && !SAFE_AUTH_ERROR_CODES.has(code))) {
      const url = request.nextUrl.clone();
      url.search = "";
      if (code && SAFE_AUTH_ERROR_CODES.has(code)) url.searchParams.set("error", code);
      return NextResponse.redirect(url, 307);
    }
  }

  return NextResponse.next();
}

const SAFE_AUTH_ERROR_CODES = new Set(["access_denied", "state_mismatch", "state_invalid"]);

export const config = {
  matcher: [
    /*
     * Case-variant old URLs only; api/ (incl. Better Auth) and public files
     * are excluded.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-32.png|images/|api/|track/|.*\\.(?:webp|png|jpg|jpeg|svg|ico|txt|xml)$).*)",
  ],
};