import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * What error monitoring may send (errorMonitoring.ts, "What is deliberately not sent"). Sentry 11 collects people's
 * details, cookies, request bodies, database queries and AI inputs and outputs unless `dataCollection` says not to —
 * v10 left them out by default (dependency-updates-plan.md, phase 8). This holds the setting that keeps them out.
 */

const init = vi.fn();
vi.mock("@sentry/nextjs", () => ({ init: (options: unknown) => init(options), withScope: vi.fn(), captureException: vi.fn() }));

afterEach(() => {
  init.mockReset();
});

describe("error monitoring", () => {
  test("started, it sends what broke and keeps people's data, bodies, queries and AI inputs out", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o0.ingest.sentry.io/0");
    const { initErrorMonitoring } = await import("./initErrorMonitoring");
    expect(initErrorMonitoring()).toEqual({ started: true });
    const options = init.mock.calls[0][0] as { dataCollection: Record<string, unknown>; sendDefaultPii?: unknown };
    expect(options.sendDefaultPii).toBeUndefined();
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    });
    const deny = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };
    expect(options.dataCollection).toMatchObject({ httpHeaders: { request: deny, response: deny }, urlQueryParams: deny });
  });

  test("with no address to send to, nothing starts", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { initErrorMonitoring } = await import("./initErrorMonitoring");
    expect(initErrorMonitoring().started).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });
});
