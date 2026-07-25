/**
 * Single funnel for unexpected errors.
 *
 * Everything that catches an error it did not expect should call this rather
 * than `console.error` directly, so that adding an error-tracking vendor later
 * is one edit here instead of a sweep across the codebase.
 *
 * Today it emits one structured JSON line, which a log aggregator can parse and
 * alert on. `setErrorReporter` is the seam a vendor SDK plugs into.
 *
 * This must never throw: it runs on paths that are already failing.
 */

export type ErrorSeverity = "error" | "warning";

export type ErrorReport = {
  /** Where the failure happened, e.g. "admin-segment" or "global-layout". */
  scope: string;
  message: string;
  severity: ErrorSeverity;
  /** Next.js error digest, when the boundary provides one. */
  digest?: string;
  stack?: string;
  /** Non-sensitive structured context. Never put user data or secrets here. */
  context?: Record<string, unknown>;
};

export type ErrorReporter = (report: ErrorReport) => void;

let externalReporter: ErrorReporter | undefined;

/**
 * Register an external sink (Sentry, OTel, etc). Returns a function that
 * removes it again, which keeps tests isolated.
 */
export function setErrorReporter(reporter: ErrorReporter | undefined) {
  externalReporter = reporter;
  return () => {
    externalReporter = undefined;
  };
}

function toMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unserializable error value";
  }
}

export function buildErrorReport(
  error: unknown,
  options: { scope: string; severity?: ErrorSeverity; context?: Record<string, unknown> },
): ErrorReport {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "") || undefined
      : undefined;

  return {
    scope: options.scope,
    message: toMessage(error),
    severity: options.severity ?? "error",
    digest,
    stack: error instanceof Error ? error.stack : undefined,
    context: options.context,
  };
}

export function reportError(
  error: unknown,
  options: { scope: string; severity?: ErrorSeverity; context?: Record<string, unknown> },
) {
  const report = buildErrorReport(error, options);

  try {
    externalReporter?.(report);
  } catch {
    // A broken reporter must not mask the error it was asked to report.
  }

  try {
    // One line, machine-parseable, so this is useful before a vendor exists.
    const serialized = JSON.stringify({ level: report.severity, ...report });
    if (report.severity === "warning") console.warn(serialized);
    else console.error(serialized);
  } catch {
    console.error(`[${report.scope}] ${report.message}`);
  }

  return report;
}
