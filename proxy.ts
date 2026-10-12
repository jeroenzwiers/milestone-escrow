import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized, PUBLIC_PATHS } from "./lib/siteauth";

// Password-protects the whole hosted demo when SITE_PASSWORD is set (see lib/siteauth.ts).
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  if (PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  if (isAuthorized(request.headers.get("authorization"), process.env.SITE_USER || "demo", password)) return NextResponse.next();
  return new NextResponse("This demo is password protected. The login is in the project's testing instructions.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Milestone Escrow demo", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" },
  });
}
