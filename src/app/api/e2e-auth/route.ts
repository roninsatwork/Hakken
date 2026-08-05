import { NextRequest, NextResponse } from "next/server";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";

/**
 * `read-only` is here so the oversight role added for the governance layer can
 * actually be looked at. Without it the only way to see what a read-only
 * account sees would be to create one against real data and sign in as it,
 * which is enough friction that the check gets skipped.
 */
const E2E_ROLES = new Set(["super-admin", "company-admin", "user", "read-only", "auditor"]);

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
