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
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Case-variant old URLs only; api/ (incl. Better Auth) and public files
     * are excluded.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-32.png|images/|api/|track/|.*\\.(?:webp|png|jpg|jpeg|svg|ico|txt|xml)$).*)",
  ],
};