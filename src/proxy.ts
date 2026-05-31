import { convexAuthNextjsMiddleware, createRouteMatcher, isAuthenticatedNextjs, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/login"]);
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/app(.*)", "/demos(.*)"]);

export default convexAuthNextjsMiddleware(async (request) => {
  // If user is already authenticated and visits login, redirect to admin Dashboard
  const isAuth = await isAuthenticatedNextjs();
  if (isSignInPage(request) && isAuth) {
    return nextjsMiddlewareRedirect(request, "/app");
  }
  // If user is unauthenticated and visits protected admin area, redirect to login
  if (isProtectedRoute(request) && !isAuth) {
    return nextjsMiddlewareRedirect(request, "/login");
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
