import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const ORIGINAL_ENV = { ...process.env };

function requestFor(path: string) {
  return new Request(new URL(path, "http://localhost:3000"));
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
});

describe("email preview route", () => {
  test("fails closed in production even when the preview flag is enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PREVIEW_ENABLED", "1");

    const response = await GET(requestFor("/api/email-preview"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  test("keeps the preview available outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const response = await GET(requestFor("/api/email-preview"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
