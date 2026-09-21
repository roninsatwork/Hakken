import { convexAuthNextjsMiddleware, createRouteMatcher, isAuthenticatedNextjs, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";
import { legacyAdminRedirect } from "@/src/lib/legacyAdminRedirect";
import { decideWidgetEmbed, widgetIdFromPathname } from "@/src/lib/widgetEmbedPolicy";

const isSignInPage = createRouteMatcher(["/login"]);
const isLandingPage = createRouteMatcher(["/"]);
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/app(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

/**
 * Which fixture roles reach the admin section, in end-to-end mode only.
 *
 * Mirrors `ADMIN_SECTION_ROLES` in the admin layout, which is the real gate.
 * Outside end-to-end mode this middleware checks only that someone is signed
 * in — it has never known about roles — so this list exists purely so the
 * fixture harness can show what a read-only account sees.
 */
const E2E_ADMIN_ROLES = new Set(["super-admin", "read-only", "auditor"]);

function requestedProtectedRoute(request: Parameters<typeof isProtectedRoute>[0]) {
  return sanitizeAuthRedirect(`${request.nextUrl.pathname}${request.nextUrl.search}`);
}

function requestedLoginRedirect(request: Parameters<typeof isSignInPage>[0]) {
  const requested = request.nextUrl.searchParams.get("redirectTo");
  return requested ? sanitizeAuthRedirect(requested) : null;
}

/**
 * Emit a per-widget `frame-ancestors` policy for `/w/<widgetId>`.
 *
 * The static header in `next.config.ts` cannot do this: it has no request
 * context, so it cannot look up which domains a given widget authorises. This
 * is the only control that actually stops the widget being embedded on a site
 * its owner never approved — the iframe runs on our own origin, so neither the
 * `Origin` header nor anything the iframe reports about its parent can be
 * trusted for that decision.
 */
async function applyWidgetEmbedPolicy(request: Request & { nextUrl: URL }, widgetId: string) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  // Fail closed. Without a backend we cannot know the allowlist, so the widget
  // must not be embeddable at all rather than falling back to permissive.
  if (!convexUrl) {
    return new NextResponse("Widget embedding is unavailable.", {
      status: 503,
      headers: { "Content-Security-Policy": "frame-ancestors 'none'" },
    });
  }

  let allowedDomains: string[] | undefined;
  let widgetExists = false;

  try {
    const widget = await new ConvexHttpClient(convexUrl).query(api.widgets.getWidgetById, {
      widgetId: widgetId as Id<"widgets">,
    });
    widgetExists = Boolean(widget);
    allowedDomains = widget?.allowedDomains;
  } catch {
    // An invalid id or an unreachable backend both mean we cannot authorise an
    // embed, so deny rather than guess.
    widgetExists = false;
  }

  const decision = decideWidgetEmbed({
    allowedDomains,
    widgetExists,
    referer: request.headers.get("referer"),
  });

  if (!decision.allowed) {
    return new NextResponse("This widget is not authorised for this site.", {
      status: 403,
      headers: { "Content-Security-Policy": `frame-ancestors ${decision.frameAncestors}` },
    });
  }

  const response = NextResponse.next();
  // Enforcing, unlike the report-only policy in next.config.ts.
  response.headers.set("Content-Security-Policy", `frame-ancestors ${decision.frameAncestors}`);
  return response;
}

export default convexAuthNextjsMiddleware(async (request) => {
  // Runs before the auth branches: the widget iframe is a public, anonymous
  // surface and its embedding policy does not depend on the visitor's session.
  const widgetId = widgetIdFromPathname(request.nextUrl.pathname);
  if (widgetId) {
    return await applyWidgetEmbedPolicy(request, widgetId);
  }

  if (process.env.E2E_AUTH_ENABLED === "1") {
    const e2eRole = request.cookies.get("hakken_e2e_auth")?.value;
    if (e2eRole) {
      if (isSignInPage(request)) {
        return nextjsMiddlewareRedirect(
          request,
          requestedLoginRedirect(request) ?? (E2E_ADMIN_ROLES.has(e2eRole) ? "/admin" : "/app"),
        );
      }
      if (isAdminRoute(request) && !E2E_ADMIN_ROLES.has(e2eRole)) {
        return nextjsMiddlewareRedirect(request, "/app");
      }
      const legacyRedirect = legacyAdminRedirect(request.nextUrl.pathname);
      if (legacyRedirect) {
        return nextjsMiddlewareRedirect(request, legacyRedirect);
      }
      return;
    }
  }

  // If user is already authenticated and visits public entry points, redirect to the app
  const isAuth = await isAuthenticatedNextjs();
  if ((isSignInPage(request) || isLandingPage(request)) && isAuth) {
    return nextjsMiddlewareRedirect(request, requestedLoginRedirect(request) ?? "/app");
  }
  // If user is unauthenticated and visits protected admin area, redirect to login
  if (isProtectedRoute(request) && !isAuth) {
    const redirectTo = encodeURIComponent(requestedProtectedRoute(request));
    return nextjsMiddlewareRedirect(request, `/login?redirectTo=${redirectTo}`);
  }

  const legacyRedirect = legacyAdminRedirect(request.nextUrl.pathname);
  if (legacyRedirect) {
    return nextjsMiddlewareRedirect(request, legacyRedirect);
  }
});

export const config = {
  // Match all request paths except for the ones starting with:
  // - _next/static (static files)
  // - _next/image (image optimization files)
  // - favicon.ico (favicon file)
  // - public resources like images
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
