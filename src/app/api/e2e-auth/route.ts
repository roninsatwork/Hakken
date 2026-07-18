import { NextRequest, NextResponse } from "next/server";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";

const E2E_ROLES = new Set(["super-admin", "company-admin", "user"]);

export function GET(request: NextRequest) {
  if (process.env.E2E_AUTH_ENABLED !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const role = request.nextUrl.searchParams.get("role");
  if (!role || !E2E_ROLES.has(role)) {
    return new NextResponse("Invalid E2E role", { status: 400 });
  }

  const requestedRedirect = request.nextUrl.searchParams.get("redirectTo") ?? "/app";
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const response = NextResponse.redirect(
    new URL(sanitizeAuthRedirect(requestedRedirect), `${protocol}://${host}`),
  );
  response.cookies.set("sonae_e2e_auth", role, {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}
