/**
 * Start error monitoring, and connect it to the funnel that already exists.
 *
 * Two things reach the monitoring service, and they arrive by different routes:
 *
 *  1. **Errors nobody caught.** The Sentry SDK hooks the runtime itself, so an
 *     unhandled rejection, a failed server render, or a thrown React component
 *     is captured without any code calling anything. This is the larger half by
 *     far, and it is the reason for taking an SDK rather than posting JSON at
 *     the existing seam: only five places in this codebase call `reportError`,
 *     so a hand-rolled sink would report a sliver of what actually breaks.
 *
 *  2. **Errors we caught and chose to report.** `reportError` is called by the
 *     error boundaries, the toast layer, and the admin action hook, and it
 *     carries a `scope` saying where the failure came from. That context is
 *     worth keeping, so it is forwarded through `setErrorReporter` — the seam
 *     the funnel was built with for exactly this.
 *
 * Both are needed. The first catches what we did not anticipate; the second
 * arrives already labelled with which surface failed.
 *
 * Nothing here throws. It runs during process start-up, and a monitoring tool
 * that can take the application down with it is worse than no monitoring.
 */

import * as Sentry from "@sentry/nextjs";

import { currentErrorMonitoringConfig } from "./errorMonitoring";
import { setErrorReporter, type ErrorReport } from "./reportError";

/**
 * Hand a `reportError` call to Sentry without losing its scope.
 *
 * The scope goes on as a tag rather than into the message, so the dashboard can
 * group by it — "everything failing in the dashboard segment" is the question
 * this makes answerable. `context` is passed through as-is; `reportError`
 * already documents that it must never carry user data or secrets.
 */
export function forwardReportToSentry(report: ErrorReport) {
  Sentry.withScope((scope) => {
    scope.setTag("scope", report.scope);
    scope.setLevel(report.severity === "warning" ? "warning" : "error");
    if (report.digest) scope.setTag("digest", report.digest);
    if (report.context) scope.setContext("reported", report.context);

    Sentry.captureMessage(report.message, report.severity === "warning" ? "warning" : "error");
  });
}

/**
 * Initialise monitoring for whichever runtime is calling.
 *
 * Returns what it did so the caller — and the tests — can tell the difference
 * between "switched off" and "started", rather than inferring it from silence.
 */
export function initErrorMonitoring(): { started: boolean; reason?: string } {
  const config = currentErrorMonitoringConfig();

  if (!config.enabled) {
    return { started: false, reason: config.reason };
  }

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      ...(config.release ? { release: config.release } : {}),
      tracesSampleRate: config.tracesSampleRate,
      // Whose data broke is not ours to collect; what broke is.
      sendDefaultPii: false,
    });

    setErrorReporter(forwardReportToSentry);

    return { started: true };
  } catch (error) {
    // Report it the only way still guaranteed to work.
    console.error(
      JSON.stringify({
        level: "error",
        scope: "error-monitoring-init",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return { started: false, reason: "Sentry failed to initialise." };
  }
}
