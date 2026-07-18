import { convexAuthNextjsMiddleware, createRouteMatcher, isAuthenticatedNextjs, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";

const isSignInPage = createRouteMatcher(["/login"]);
const isLandingPage = createRouteMatcher(["/"]);
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/app(.*)", "/demos(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

function requestedProtectedRoute(request: Parameters<typeof isProtectedRoute>[0]) {
  return sanitizeAuthRedirect(`${request.nextUrl.pathname}${request.nextUrl.search}`);
}

function requestedLoginRedirect(request: Parameters<typeof isSignInPage>[0]) {
  const requested = request.nextUrl.searchParams.get("redirectTo");
  return requested ? sanitizeAuthRedirect(requested) : null;
}

export default convexAuthNextjsMiddleware(async (request) => {
  if (process.env.E2E_AUTH_ENABLED === "1") {
    const e2eRole = request.cookies.get("sonae_e2e_auth")?.value;
    if (e2eRole) {
      if (isSignInPage(request)) {
        return nextjsMiddlewareRedirect(
          request,
          requestedLoginRedirect(request) ?? (e2eRole === "super-admin" ? "/admin" : "/app"),
        );
      }
      if (isAdminRoute(request) && e2eRole !== "super-admin") {
        return nextjsMiddlewareRedirect(request, "/app");
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
});

export const config = {
  // Match all request paths except for the ones starting with:
  // - _next/static (static files)
  // - _next/image (image optimization files)
  // - favicon.ico (favicon file)
  // - public resources like images
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
