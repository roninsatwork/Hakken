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

/**
 * What the policy must not refuse.
 *
 * A policy tightened on 2026-08-22 left three things out that the app genuinely
 * does, and the result was invisible in Chrome and broken in Safari: the posture
 * studio's characters rendered as white silhouettes and its tracking never
 * started. Nothing logged an error where anyone was looking.
 *
 * These are pinned by name rather than by "the policy is narrow", because the
 * fault was not a policy that was too wide — it was one that was too narrow in
 * exactly four places, and only a browser that enforces it strictly said so.
 */
describe("what the app is allowed to do", () => {
  const production = () => buildAppContentSecurityPolicy({
    NODE_ENV: "production",
    NEXT_PUBLIC_CONVEX_URL: "https://tenant.convex.cloud",
  });

  test("a 3D model's own textures can be fetched back", () => {
    // A loader unpacks the pictures inside a model into `blob:` URLs and reads
    // them back. Refused, the shape loads and the pictures do not — a white
    // character with correct outlines, and no error in Chrome.
    expect(production().directives.connectSrc).toContain("blob:");
  });

  test("the tracking engine can load its own code and models", () => {
    const policy = production();
    expect(policy.directives.scriptSrc).toContain("https://cdn.jsdelivr.net");
    expect(policy.directives.connectSrc).toContain("https://cdn.jsdelivr.net");
    expect(policy.directives.connectSrc).toContain("https://storage.googleapis.com");
  });

  test("the tracking engine can run off the main thread", () => {
    // It creates its own worker from a blob. Refused, there is no tracking at
    // all and the studio says nothing about why.
    expect(production().directives.workerSrc).toEqual(expect.arrayContaining(["'self'", "blob:"]));
  });

  test("none of this widens the policy to all of HTTPS", () => {
    // The allowances above are named hosts and same-origin blobs. If this ever
    // fails, something has reached for the blunt instrument instead.
    const policy = production();
    expect(policy.directives.scriptSrc).not.toContain("https:");
    expect(policy.directives.connectSrc).not.toContain("https:");
    expect(policy.directives.imgSrc).toContain("https:");
  });
});
