import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/session";
import { passwordConfigured, serverSessionSecret } from "@/lib/settings";

const OPEN_PATHS = new Set(["/", "/login", "/setup", "/icon"]);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  const next = () => NextResponse.next({ request: { headers } });

  if (pathname.startsWith("/api/db-restore/")) return next();
  if (!passwordConfigured()) return next();

  const token = request.cookies.get("csm_session")?.value;
  const open = OPEN_PATHS.has(pathname);
  const ok = token ? await verifySession(token, serverSessionSecret()) : false;

  if (open) {
    if (ok && pathname === "/login") return NextResponse.redirect(new URL("/projects", request.url));
    return next();
  }

  if (!ok) return NextResponse.redirect(new URL("/login", request.url));
  return next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
