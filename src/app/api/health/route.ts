import { NextRequest, NextResponse } from "next/server";

/**
 * Operational health endpoint.
 *
 * Two modes, because they answer different questions:
 *
 * - Default (liveness): does this process run and is it configured? No network
 *   calls, so it is safe for a container healthcheck at high frequency.
 *   Restarting the container is a sensible response to a failure here.
 * - `?deps=1` (readiness): additionally checks that the Convex deployment
 *   answers over HTTP. Use this for external monitoring. Restarting the
 *   container would NOT fix a failure here, which is why it is not the default.
 *
 * The dependency check treats any HTTP response as reachable: it proves DNS,
 * TLS and routing to the deployment. It does not prove that Convex functions or
 * the database are healthy — that would need an authenticated call, and this
 * endpoint is deliberately unauthenticated.
 *
 * Never return configuration values, only whether they are present.
 */

export const dynamic = "force-dynamic";

const DEPENDENCY_TIMEOUT_MS = 2000;

type DependencyResult = {
  status: "ok" | "unreachable" | "skipped" | "not_configured";
  latencyMs?: number;
};

async function checkConvexReachable(convexUrl: string | undefined): Promise<DependencyResult> {
  if (!convexUrl) return { status: "not_configured" };

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_TIMEOUT_MS);

  try {
    // An HTTP status of any kind proves the deployment is reachable; Convex
    // answers 404 for unrouted paths, which is a perfectly good signal here.
    await fetch(convexUrl, { method: "GET", signal: controller.signal, cache: "no-store" });
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch {
    return { status: "unreachable", latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const checkDependencies = request.nextUrl.searchParams.get("deps") === "1";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  // The e2e auth route is a deliberate test backdoor. It is off by default, but
  // if it is ever enabled in production that is an incident, so surface it here
  // rather than leaving it silent.
  const e2eAuthEnabled = process.env.E2E_AUTH_ENABLED === "1";
  const isProduction = process.env.NODE_ENV === "production";
  const e2eBackdoorExposed = isProduction && e2eAuthEnabled;

  const convex = checkDependencies
    ? await checkConvexReachable(convexUrl)
    : ({ status: "skipped" } as DependencyResult);

  const healthy = !e2eBackdoorExposed && convex.status !== "unreachable" && convex.status !== "not_configured";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      // Set at image build time; "unknown" locally.
      version: process.env.BUILD_SHA ?? "unknown",
      environment: process.env.NODE_ENV ?? "unknown",
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        convexConfigured: Boolean(convexUrl),
        convexDeploymentConfigured: Boolean(process.env.CONVEX_DEPLOYMENT),
        convex,
        e2eBackdoorExposed,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
