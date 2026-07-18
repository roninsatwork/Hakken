import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const originalE2EAuthEnabled = process.env.E2E_AUTH_ENABLED;

afterEach(() => {
  process.env.E2E_AUTH_ENABLED = originalE2EAuthEnabled;
});

function buildRequest(path: string) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: { host: "127.0.0.1:3000" },
  });
}

describe("GET /api/e2e-auth", () => {
  it("is unavailable unless deterministic E2E auth is enabled", () => {
    delete process.env.E2E_AUTH_ENABLED;

    expect(GET(buildRequest("/api/e2e-auth"))).toMatchObject({ status: 404 });
  });

  it("rejects unknown roles", () => {
    process.env.E2E_AUTH_ENABLED = "1";

    expect(GET(buildRequest("/api/e2e-auth?role=owner"))).toMatchObject({ status: 400 });
  });

  it("sets a deterministic role cookie and preserves a safe local redirect", () => {
    process.env.E2E_AUTH_ENABLED = "1";

    const response = GET(buildRequest(
      "/api/e2e-auth?role=super-admin&redirectTo=%2Fdemos%2Fmovement-capture%2Freadiness-proof",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/demos/movement-capture/readiness-proof",
    );
    expect(response.cookies.get("sonae_e2e_auth")?.value).toBe("super-admin");
  });

  it("falls back to the app for an external redirect", () => {
    process.env.E2E_AUTH_ENABLED = "1";

    const response = GET(buildRequest(
      "/api/e2e-auth?role=user&redirectTo=https%3A%2F%2Fexample.com%2Fsteal",
    ));

    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/app");
  });
});
