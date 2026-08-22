import { describe, expect, test } from "vitest";
import { buildAppContentSecurityPolicy } from "./securityHeaders";

describe("app content security policy", () => {
  test("production enforces a narrowed policy without eval or broad HTTPS scripts and requests", () => {
    const policy = buildAppContentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_CONVEX_URL: "https://tenant.convex.cloud",
      CONVEX_SITE_URL: "https://tenant.convex.site",
    });

    expect(policy.reportOnly).toBe(false);
    expect(policy.directives.scriptSrc).not.toContain("'unsafe-eval'");
    expect(policy.directives.scriptSrc).not.toContain("https:");
    expect(policy.directives.connectSrc).not.toContain("https:");
    expect(policy.directives.connectSrc).not.toContain("ws:");
    expect(policy.directives.connectSrc).toEqual(expect.arrayContaining([
      "https://tenant.convex.cloud",
      "wss://tenant.convex.cloud",
      "https://tenant.convex.site",
      "wss://tenant.convex.site",
    ]));
    expect(policy.directives.objectSrc).toEqual(["'none'"]);
  });

  test("development keeps the websocket and eval allowances required by local tooling", () => {
    const policy = buildAppContentSecurityPolicy({
      NODE_ENV: "development",
      NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
    });

    expect(policy.directives.scriptSrc).toContain("'unsafe-eval'");
    expect(policy.directives.connectSrc).toEqual(expect.arrayContaining([
      "http://127.0.0.1:3210",
      "ws://127.0.0.1:3210",
      "ws:",
    ]));
  });

  test("invalid configured URLs do not widen the policy", () => {
    const policy = buildAppContentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_CONVEX_URL: "javascript:alert(1)",
    });

    expect(policy.directives.connectSrc.join(" ")).not.toContain("javascript:");
  });
});
