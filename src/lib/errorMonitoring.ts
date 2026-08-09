/**
 * Whether unexpected errors leave this machine, and on what terms.
 *
 * `reportError` has always funnelled failures into one place, but that place
 * only ever wrote a log line. Nobody reads log lines at 2am, so a broken agent
 * run was found by a customer noticing rather than by us being told. This is
 * the sink that closes that gap.
 *
 * The decision lives here, apart from the Sentry SDK, for two reasons. It is
 * the only part worth unit testing — the SDK's own `init` is not ours to prove
 * — and there are three separate entry points (browser, server, edge) that must
 * agree. A shared module means they cannot drift; three copies of a sample rate
 * eventually become three different sample rates.
 *
 * ## Off by default, deliberately
 *
 * With no DSN configured this returns `enabled: false` and nothing initialises:
 * no network, no SDK overhead, no noise in a local dev run. That is not a
 * degraded mode, it is the expected state for local work and for anyone who
 * clones this repo. Monitoring switches on when someone sets the DSN in the
 * deployed environment, and not before.
 *
 * ## What is deliberately not sent
 *
 * `sendDefaultPii` stays off. The point of this is knowing what broke, not who
 * it broke for, and this platform holds other companies' data — a stack trace
 * is ours to look at, a tenant's request body is not. `reportError` already
 * carries the same warning about its `context` field.
 */

/** Environments we distinguish in the monitoring dashboard. */
export type MonitoredEnvironment = "development" | "production";

export type ErrorMonitoringConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      dsn: string;
      environment: MonitoredEnvironment;
      /** Commit or image tag, when the deployment knows it. Groups errors by release. */
      release?: string;
      /**
       * Fraction of requests traced for performance. Zero by default: this was
       * bought to catch failures, and traces are billed per event.
       */
      tracesSampleRate: number;
    };

export type MonitoringEnvSource = {
  NEXT_PUBLIC_SENTRY_DSN?: string;
  NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
  NEXT_PUBLIC_SENTRY_RELEASE?: string;
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?: string;
};

/**
 * Read a sample rate, refusing anything that is not a fraction.
 *
 * A typo here is expensive in a way a typo elsewhere is not: `10` meaning "10
 * percent" would trace every request and bill for all of them. Out-of-range and
 * unparseable values fall back to zero rather than being clamped, because a
 * value nobody meant should cost nothing.
 */
export function parseTracesSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0 || parsed > 1) return 0;

  return parsed;
}

function resolveEnvironment(raw: string | undefined): MonitoredEnvironment {
  return raw?.trim().toLowerCase() === "production" ? "production" : "development";
}

/**
 * Decide whether monitoring runs, from environment variables alone.
 *
 * Takes its source as an argument so a test can state the environment outright
 * rather than mutating `process.env` and hoping it is restored.
 */
export function resolveErrorMonitoringConfig(
  env: MonitoringEnvSource
): ErrorMonitoringConfig {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (!dsn) {
    return {
      enabled: false,
      reason: "No NEXT_PUBLIC_SENTRY_DSN is configured, so errors stay in the logs.",
    };
  }

  const release = env.NEXT_PUBLIC_SENTRY_RELEASE?.trim();

  return {
    enabled: true,
    dsn,
    environment: resolveEnvironment(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT),
    ...(release ? { release } : {}),
    tracesSampleRate: parseTracesSampleRate(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
  };
}

/**
 * The config for the running process.
 *
 * Every key is read as a literal `process.env.X` rather than through a loop,
 * because Next.js inlines public environment variables at build time by
 * matching that exact syntax. A dynamic lookup compiles to `undefined` in the
 * browser bundle, which would silently disable monitoring on the client only —
 * the hardest version of this to notice.
 */
export function currentErrorMonitoringConfig(): ErrorMonitoringConfig {
  return resolveErrorMonitoringConfig({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  });
}
