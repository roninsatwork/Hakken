import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

function requestFor(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example-deployment.convex.cloud";
  process.env.CONVEX_DEPLOYMENT = "dev:example-deployment";
  delete process.env.E2E_AUTH_ENABLED;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("health endpoint", () => {
  test("reports ok without touching the network by default", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(requestFor("/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    // Liveness must stay cheap: a container healthcheck runs this constantly.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body.checks.convex.status).toBe("skipped");
  });

  test("never leaks configuration values, only their presence", async () => {
    const response = await GET(requestFor("/api/health"));
    const raw = JSON.stringify(await response.json());

    expect(raw).not.toContain("example-deployment.convex.cloud");
    expect(raw).not.toContain("dev:example-deployment");
    expect(JSON.parse(raw).checks.convexConfigured).toBe(true);
  });

  test("checks the backend when readiness is requested", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(requestFor("/api/health?deps=1"));
    const body = await response.json();

    // Any HTTP answer proves reachability; Convex 404s unrouted paths.
    expect(response.status).toBe(200);
    expect(body.checks.convex.status).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  test("reports 503 when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const response = await GET(requestFor("/api/health?deps=1"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.convex.status).toBe("unreachable");
  });

  test("reports 503 when the backend is not configured at all", async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;

    const response = await GET(requestFor("/api/health?deps=1"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.convex.status).toBe("not_configured");
  });

  test("flags the e2e auth backdoor as degraded in production", async () => {
    // One misconfigured env var away from a total auth bypass, so it must be
    // loud rather than silent.
    vi.stubEnv("NODE_ENV", "production");
    process.env.E2E_AUTH_ENABLED = "1";

    const response = await GET(requestFor("/api/health"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.e2eBackdoorExposed).toBe(true);
  });

  test("does not flag the e2e backdoor outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.E2E_AUTH_ENABLED = "1";

    const response = await GET(requestFor("/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.e2eBackdoorExposed).toBe(false);
  });
});
