import { describe, expect, test } from "vitest";

import {
  parseTracesSampleRate,
  resolveErrorMonitoringConfig,
} from "./errorMonitoring";

/**
 * The whole point of this module is that it is off until someone switches it
 * on, and that switching it on wrongly costs nothing. Both are properties of
 * the resolver rather than of the Sentry SDK, so both are testable here.
 */
describe("resolveErrorMonitoringConfig", () => {
  test("stays off when no DSN is configured", () => {
    const config = resolveErrorMonitoringConfig({});

    expect(config.enabled).toBe(false);
    // The reason is shown to whoever is wondering why nothing arrived.
    expect(config.enabled === false && config.reason).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  test("treats a blank DSN as absent", () => {
    // An env var set to empty is how a deployment platform represents "unset",
    // and a whitespace-only value is how a copy-paste represents it.
    expect(resolveErrorMonitoringConfig({ NEXT_PUBLIC_SENTRY_DSN: "" }).enabled).toBe(false);
    expect(resolveErrorMonitoringConfig({ NEXT_PUBLIC_SENTRY_DSN: "   " }).enabled).toBe(false);
  });

  test("starts when a DSN is present, defaulting to development", () => {
    const config = resolveErrorMonitoringConfig({
      NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/2",
    });

    expect(config.enabled).toBe(true);
    if (!config.enabled) return;
    expect(config.dsn).toBe("https://key@o1.ingest.sentry.io/2");
    // Anything not explicitly production is development, so a missing value
    // cannot quietly pollute the production error stream.
    expect(config.environment).toBe("development");
    expect(config.tracesSampleRate).toBe(0);
    expect(config.release).toBeUndefined();
  });

  test("marks production only on an exact opt-in", () => {
    const production = resolveErrorMonitoringConfig({
      NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/2",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "Production",
      NEXT_PUBLIC_SENTRY_RELEASE: "abc123",
    });

    expect(production.enabled && production.environment).toBe("production");
    expect(production.enabled && production.release).toBe("abc123");

    const staging = resolveErrorMonitoringConfig({
      NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/2",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
    });

    expect(staging.enabled && staging.environment).toBe("development");
  });
});

describe("parseTracesSampleRate", () => {
  test("defaults to zero", () => {
    // Errors are what this was bought for. Tracing is billed per event, so it
    // is opt-in rather than something a forgotten variable turns on.
    expect(parseTracesSampleRate(undefined)).toBe(0);
    expect(parseTracesSampleRate("")).toBe(0);
  });

  test("accepts a fraction", () => {
    expect(parseTracesSampleRate("0.1")).toBe(0.1);
    expect(parseTracesSampleRate("1")).toBe(1);
    expect(parseTracesSampleRate("0")).toBe(0);
  });

  test("refuses anything that is not a fraction, rather than clamping it", () => {
    // `10` almost certainly meant "10 percent". Clamping it to 1 would trace
    // every single request and bill for all of them, which is the expensive
    // way to be wrong — so an out-of-range value costs nothing instead.
    expect(parseTracesSampleRate("10")).toBe(0);
    expect(parseTracesSampleRate("100")).toBe(0);
    expect(parseTracesSampleRate("-1")).toBe(0);
    expect(parseTracesSampleRate("all")).toBe(0);
    expect(parseTracesSampleRate("NaN")).toBe(0);
  });
});
