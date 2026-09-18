import {
  renderEmail,
  type EmailCard,
  type EmailContent,
  type EmailStat,
  type RenderedEmail,
} from "./emailLayoutService";
import { resolvePlatformName } from "./settingsService";

export type AnalyticsHealthSnapshotDuplicateGroup = {
  count: number;
  date: string;
  scopeId: string;
  type: "global" | "company" | "user";
};

export type AnalyticsHealthReport = {
  checkedDates: string[];
  daysBack: number;
  liveToday: {
    agentTransactions: number;
    assistantMessages: number;
    date: string;
  };
  messageDimensions: {
    examples: string[];
    mismatched: number;
    missingDimensions: number;
    missingThreads: number;
    scanned: number;
    windowStartDate: string;
  };
  snapshotCoverage: {
    dates: Array<{
      companySnapshots: number;
      date: string;
      globalSnapshots: number;
      hasGlobalSnapshot: boolean;
      userSnapshots: number;
    }>;
    duplicateSnapshotGroups: AnalyticsHealthSnapshotDuplicateGroup[];
    missingGlobalDates: string[];
    totalSnapshots: number;
  };
};

export type OperationalFailureExample = {
  id: string;
  label: string;
  occurredAt?: number;
  summary?: string;
  /**
   * The agent, schedule or workflow this happened to — as an id, so an alert
   * can link straight to it. Distinct from `id`, which identifies the failing
   * record (a log line, a tool call) and is not routable on its own.
   */
  targetId?: string;
  targetName?: string;
  targetType?: "agent" | "schedule" | "workflow" | "decision";
};

export type OperationalHealthReport = {
  agentFailures: {
    count: number;
    examples: OperationalFailureExample[];
  };
  failedAgentTransactions: {
    count: number;
    examples: OperationalFailureExample[];
  };
  failedToolCalls: {
    count: number;
    examples: OperationalFailureExample[];
  };
  failedScheduledExecutions: {
    count: number;
    examples: OperationalFailureExample[];
  };
  highCostAgents: {
    count: number;
    examples: OperationalFailureExample[];
  };
  overdueSchedules: {
    count: number;
    examples: OperationalFailureExample[];
  };
  pendingApprovals: {
    count: number;
    examples: OperationalFailureExample[];
  };
  providerFailures: {
    count: number;
    examples: OperationalFailureExample[];
  };
  schedulesMissingNextRun: {
    count: number;
    examples: OperationalFailureExample[];
  };
  staleAgentRuns: {
    count: number;
    examples: OperationalFailureExample[];
  };
  staleRunningScheduledExecutions: {
    count: number;
    examples: OperationalFailureExample[];
  };
  decisionsHandedToPerson: {
    count: number;
    examples: OperationalFailureExample[];
  };
  decisionsOnSimpleRules: {
    count: number;
    examples: OperationalFailureExample[];
  };
  decisionsUnsure: {
    count: number;
    examples: OperationalFailureExample[];
  };
};

export type BudgetHealthExample = {
  id: string;
  limit: number;
  occurredAt?: number;
  percentUsed: number;
  summary: string;
  targetName: string;
  targetType: "agent" | "company";
  used: number;
};

export type BudgetHealthReport = {
  agentCostBudgets: {
    count: number;
    examples: BudgetHealthExample[];
  };
  tenantMessageBudgets: {
    count: number;
    examples: BudgetHealthExample[];
  };
};

export type AlertRuleStatus = {
  count: number;
  details: string[];
  key:
    | "costSpikes"
    | "repeatedProviderFailures"
    | "staleApprovals"
    | "stuckRuns"
    | "toolFailures";
  label: string;
  nextAction: string;
  status: "ok" | "warning" | "critical";
  threshold: string;
};

export type SystemHealthReport = {
  analytics: AnalyticsHealthReport;
  alertRules: AlertRuleStatus[];
  budgetHealth: BudgetHealthReport;
  checkedAt: number;
  checkedDate: string;
  daysBack: number;
  /**
   * Retention pipelines a stored config has switched off. Platform scope
   * only (the purge config is global); empty on company-scoped reports.
   * Pipelines ship enabled, so anything listed here is a deliberate switch
   * — the alert keeps that decision visible rather than second-guessing it.
   */
  disabledPurgePipelines?: string[];
  highCostAgentThresholdGBP: number;
  operations: OperationalHealthReport;
  pendingApprovalThresholdMinutes: number;
  staleRunningThresholdMinutes: number;
  overdueScheduleThresholdMinutes: number;
  scope: {
    companyId?: string;
    companyName?: string;
    type: "company" | "platform";
  };
  windowStartDate: string;
  windowStartTs: number;
};

export type PlatformAlertSignal = {
  count: number;
  details: string[];
  /**
   * Structured causes, used to group repeats and drop provider noise when
   * the signal is rendered into an email. Absent on analytics signals, whose
   * `details` are already plain values (dates, ids) rather than payloads.
   */
  occurrences?: PlatformAlertOccurrence[];
  key:
    | "agentErrorLogs"
    | "disabledPurgePipelines"
    | "duplicateSnapshots"
    | "failedAgentTransactions"
    | "failedToolCalls"
    | "failedScheduledExecutions"
    | "highCostAgents"
    | "agentCostBudgetPressure"
    | "mismatchedDimensions"
    | "missingDimensions"
    | "missingGlobalSnapshots"
    | "missingThreads"
    | "overdueSchedules"
    | "pendingApprovals"
    | "providerFailures"
    | "schedulesMissingNextRun"
    | "staleAgentRuns"
    | "staleScheduledExecutions"
    | "tenantMessageBudgetPressure";
  label: string;
  runbook: string;
};

export type PlatformAlertDecision = {
  alertType: "analyticsHealth" | "systemHealth";
  shouldAlert: boolean;
  subject: string;
  signals: PlatformAlertSignal[];
  summary: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function compactDetails(values: string[], fallback: string) {
  return values.length > 0 ? values.slice(0, 10) : [fallback];
}

/* ---------------------------------------------------------------------------
 * Turning raw failures into something a person can read
 *
 * The alert that started this work put `signal.details.join(", ")` into a table
 * cell, and those details are provider payloads: nested JSON, escaped newlines,
 * stack frames, and the same 400 error four times because nothing grouped
 * repeats. The functions below are the fix — they run at email-build time, so
 * the stored report keeps the full fidelity an operator gets in the app.
 * ------------------------------------------------------------------------- */

const MAX_CAUSE_LENGTH = 180;

function unescapeJsonish(value: string) {
  return value
    .replace(/\\r/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dig out the innermost human sentence from a provider error.
 *
 * Providers wrap the useful message several layers deep, and each layer is a
 * JSON *string* containing more JSON. Recursing is what separates "Function
 * call is missing a thought_signature" from the 400 characters of envelope
 * wrapped around it.
 */
function extractMessage(text: string, depth = 0): string | undefined {
  if (depth > 4) return undefined;

  // No closing quote is required. These payloads reach us already truncated by
  // `truncateHealthSummary`, so the JSON is usually unterminated — insisting on
  // a balanced string is what would leave the raw envelope in the email. The
  // capture stops at the first unescaped quote regardless.
  const matches = [...text.matchAll(/"(?:message|type|reason)"\s*:\s*"((?:[^"\\]|\\.)*)/g)];

  for (const match of matches) {
    const value = unescapeJsonish(match[1]);
    if (value.length === 0) continue;

    if (value.trimStart().startsWith("{")) {
      const nested = extractMessage(value, depth + 1);
      if (nested) return nested;
      continue;
    }

    return value;
  }

  return undefined;
}

/**
 * One readable sentence describing why something failed.
 *
 * Never returns raw JSON and never returns a stack trace. The full payload
 * stays one click away in the app, which is where it belongs.
 */
export function humaniseFailureSummary(raw: string | undefined): string {
  const source = (raw ?? "").trim();
  if (source.length === 0) return "No detail captured.";

  // Stack frames tell an operator nothing the agent log will not show better.
  const withoutStack = source.split(/\s+at\s+\S+\s*\(/)[0].trim();

  const braceAt = withoutStack.indexOf("{");
  const prefix = (braceAt === -1 ? withoutStack : withoutStack.slice(0, braceAt))
    .replace(/^(uncaught\s+)?error:\s*/i, "")
    .replace(/[:\s-]+$/, "")
    .trim();
  const extracted = braceAt === -1 ? undefined : extractMessage(withoutStack.slice(braceAt));

  let cause = [prefix, extracted].filter((part) => part && part.length > 0).join(" — ");
  if (cause.length === 0) cause = unescapeJsonish(withoutStack);

  // Upstream already truncates with an ellipsis; do not stack a second one.
  cause = cause.replace(/\s*\.{3}$/, "").trim();

  if (cause.length > MAX_CAUSE_LENGTH) {
    const cut = cause.slice(0, MAX_CAUSE_LENGTH);
    const lastSpace = cut.lastIndexOf(" ");
    cause = `${(lastSpace > MAX_CAUSE_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  return cause.length > 0 ? cause : "No detail captured.";
}

export type PlatformAlertOccurrence = {
  cause: string;
  at?: number;
  targetId?: string;
  targetName?: string;
  targetType?: "agent" | "schedule" | "workflow" | "decision";
};

export type PlatformAlertCauseGroup = {
  cause: string;
  count: number;
  firstAt?: number;
  lastAt?: number;
  targetId?: string;
  targetNames: string[];
  targetType?: "agent" | "schedule" | "workflow" | "decision";
};

function toOperationalOccurrence(example: OperationalFailureExample): PlatformAlertOccurrence {
  return {
    cause: humaniseFailureSummary(example.summary ?? example.label),
    at: example.occurredAt,
    targetId: example.targetId,
    targetName: example.targetName,
    targetType: example.targetType,
  };
}

function toBudgetOccurrence(example: BudgetHealthExample): PlatformAlertOccurrence {
  return {
    cause: `${example.targetName} is at ${example.percentUsed.toFixed(0)}% of its limit`,
    at: example.occurredAt,
    targetId: example.targetType === "agent" ? example.id : undefined,
    targetName: example.targetName,
    targetType: example.targetType === "agent" ? "agent" : undefined,
  };
}

/**
 * Collapse repeats.
 *
 * Four identical `thought_signature` rejections are one fault seen four times.
 * Saying so is the difference between an alert an operator acts on and a wall
 * of text they learn to skim past.
 */
export function groupAlertOccurrences(occurrences: PlatformAlertOccurrence[]): PlatformAlertCauseGroup[] {
  const groups = new Map<string, PlatformAlertCauseGroup>();

  for (const occurrence of occurrences) {
    const existing = groups.get(occurrence.cause);

    if (!existing) {
      groups.set(occurrence.cause, {
        cause: occurrence.cause,
        count: 1,
        firstAt: occurrence.at,
        lastAt: occurrence.at,
        targetId: occurrence.targetId,
        targetNames: occurrence.targetName ? [occurrence.targetName] : [],
        targetType: occurrence.targetType,
      });
      continue;
    }

    existing.count += 1;
    if (occurrence.at !== undefined) {
      existing.firstAt = existing.firstAt === undefined ? occurrence.at : Math.min(existing.firstAt, occurrence.at);
      existing.lastAt = existing.lastAt === undefined ? occurrence.at : Math.max(existing.lastAt, occurrence.at);
    }
    if (occurrence.targetName && !existing.targetNames.includes(occurrence.targetName)) {
      existing.targetNames.push(occurrence.targetName);
    }
    existing.targetId ??= occurrence.targetId;
    existing.targetType ??= occurrence.targetType;
  }

  return [...groups.values()].sort((left, right) => right.count - left.count);
}

function buildAnalyticsHealthSignals(report: AnalyticsHealthReport) {
  const signals: PlatformAlertSignal[] = [];

  if (report.snapshotCoverage.missingGlobalDates.length > 0) {
    signals.push({
      count: report.snapshotCoverage.missingGlobalDates.length,
      details: compactDetails(report.snapshotCoverage.missingGlobalDates, "No missing global snapshot dates."),
      key: "missingGlobalSnapshots",
      label: "Missing global snapshots",
      runbook: "Run analyticsSnapshots:generateDailySnapshots for each missing date after confirming the date is safe to regenerate.",
    });
  }

  if (report.snapshotCoverage.duplicateSnapshotGroups.length > 0) {
    signals.push({
      count: report.snapshotCoverage.duplicateSnapshotGroups.length,
      details: compactDetails(
        report.snapshotCoverage.duplicateSnapshotGroups.map((group) => `${group.date} ${group.type}:${group.scopeId} (${group.count})`),
        "No duplicate snapshot groups."
      ),
      key: "duplicateSnapshots",
      label: "Duplicate snapshot groups",
      runbook: "Investigate before deleting data. Duplicates indicate a guard failure or manual repair drift.",
    });
  }

  if (report.messageDimensions.missingDimensions > 0) {
    signals.push({
      count: report.messageDimensions.missingDimensions,
      details: compactDetails(report.messageDimensions.examples, "No example message IDs captured."),
      key: "missingDimensions",
      label: "Messages missing analytics dimensions",
      runbook: "Run the message-dimension dry run, then backfill, then validate until missingDimensions returns to zero.",
    });
  }

  if (report.messageDimensions.mismatched > 0) {
    signals.push({
      count: report.messageDimensions.mismatched,
      details: compactDetails(report.messageDimensions.examples, "No example message IDs captured."),
      key: "mismatchedDimensions",
      label: "Message dimension mismatches",
      runbook: "Review the example message IDs manually. Do not overwrite automatically because this can indicate tenant attribution drift.",
    });
  }

  if (report.messageDimensions.missingThreads > 0) {
    signals.push({
      count: report.messageDimensions.missingThreads,
      details: compactDetails(report.messageDimensions.examples, "No example message IDs captured."),
      key: "missingThreads",
      label: "Messages with missing threads",
      runbook: "Investigate thread retention or historical deletes before relying on legacy analytics fallbacks.",
    });
  }

  return signals;
}

function formatOperationalExample(example: OperationalFailureExample) {
  const parts = [
    example.targetName || example.label,
    example.summary,
    example.occurredAt ? new Date(example.occurredAt).toISOString() : undefined,
    example.id,
  ].filter(Boolean);

  return parts.join(" | ");
}

function buildOperationalHealthSignals(report: OperationalHealthReport) {
  const signals: PlatformAlertSignal[] = [];

  if (report.agentFailures.count > 0) {
    signals.push({
      count: report.agentFailures.count,
      details: compactDetails(report.agentFailures.examples.map(formatOperationalExample), "No agent error examples captured."),
      occurrences: report.agentFailures.examples.map(toOperationalOccurrence),
      key: "agentErrorLogs",
      label: "Agent execution errors",
      runbook: "Open the agent log, inspect provider/config/tool failure, then retry or fix the agent configuration.",
    });
  }

  if (report.failedAgentTransactions.count > 0) {
    signals.push({
      count: report.failedAgentTransactions.count,
      details: compactDetails(report.failedAgentTransactions.examples.map(formatOperationalExample), "No failed transaction examples captured."),
      occurrences: report.failedAgentTransactions.examples.map(toOperationalOccurrence),
      key: "failedAgentTransactions",
      label: "Failed agent transactions",
      runbook: "Compare with agent logs and provider health before treating it as billing-only telemetry.",
    });
  }

  if (report.staleAgentRuns.count > 0) {
    signals.push({
      count: report.staleAgentRuns.count,
      details: compactDetails(report.staleAgentRuns.examples.map(formatOperationalExample), "No stale agent run examples captured."),
      occurrences: report.staleAgentRuns.examples.map(toOperationalOccurrence),
      key: "staleAgentRuns",
      label: "Stale agent runs",
      runbook: "Open the run detail timeline, inspect the latest step, and decide whether the run needs cancellation, replay, or provider/tool repair.",
    });
  }

  if (report.pendingApprovals.count > 0) {
    signals.push({
      count: report.pendingApprovals.count,
      details: compactDetails(report.pendingApprovals.examples.map(formatOperationalExample), "No pending approval examples captured."),
      occurrences: report.pendingApprovals.examples.map(toOperationalOccurrence),
      key: "pendingApprovals",
      label: "Pending agent approvals",
      runbook: "Open agent approvals and either approve, reject, or tune the approval policy if these are repeatedly stranded.",
    });
  }

  if (report.failedToolCalls.count > 0) {
    signals.push({
      count: report.failedToolCalls.count,
      details: compactDetails(report.failedToolCalls.examples.map(formatOperationalExample), "No failed tool-call examples captured."),
      occurrences: report.failedToolCalls.examples.map(toOperationalOccurrence),
      key: "failedToolCalls",
      label: "Failed agent tool calls",
      runbook: "Inspect the tool call arguments/result, connector diagnostics, and tenant policy before retrying the agent run.",
    });
  }

  if (report.providerFailures.count > 0) {
    signals.push({
      count: report.providerFailures.count,
      details: compactDetails(report.providerFailures.examples.map(formatOperationalExample), "No provider failure examples captured."),
      occurrences: report.providerFailures.examples.map(toOperationalOccurrence),
      key: "providerFailures",
      label: "Provider failure clusters",
      runbook: "Check provider health, model defaults, credentials, and recent deploys before changing agent prompts or tools.",
    });
  }

  if (report.highCostAgents.count > 0) {
    signals.push({
      count: report.highCostAgents.count,
      details: compactDetails(report.highCostAgents.examples.map(formatOperationalExample), "No high-cost agent examples captured."),
      occurrences: report.highCostAgents.examples.map(toOperationalOccurrence),
      key: "highCostAgents",
      label: "High-cost agents",
      runbook: "Review run volume, token usage, model choice, budgets, and whether cheaper defaults or tighter retrieval limits are appropriate.",
    });
  }

  if (report.failedScheduledExecutions.count > 0) {
    signals.push({
      count: report.failedScheduledExecutions.count,
      details: compactDetails(report.failedScheduledExecutions.examples.map(formatOperationalExample), "No failed scheduled execution examples captured."),
      occurrences: report.failedScheduledExecutions.examples.map(toOperationalOccurrence),
      key: "failedScheduledExecutions",
      label: "Failed scheduled executions",
      runbook: "Open workflow execution logs, fix the failed node or target configuration, then rerun manually.",
    });
  }

  if (report.staleRunningScheduledExecutions.count > 0) {
    signals.push({
      count: report.staleRunningScheduledExecutions.count,
      details: compactDetails(report.staleRunningScheduledExecutions.examples.map(formatOperationalExample), "No stale scheduled execution examples captured."),
      occurrences: report.staleRunningScheduledExecutions.examples.map(toOperationalOccurrence),
      key: "staleScheduledExecutions",
      label: "Stale running scheduled executions",
      runbook: "Inspect Convex action logs and workflow steps; determine whether the run is still processing or stranded.",
    });
  }

  if (report.overdueSchedules.count > 0) {
    signals.push({
      count: report.overdueSchedules.count,
      details: compactDetails(report.overdueSchedules.examples.map(formatOperationalExample), "No overdue schedule examples captured."),
      occurrences: report.overdueSchedules.examples.map(toOperationalOccurrence),
      key: "overdueSchedules",
      label: "Overdue active schedules",
      runbook: "Check whether workflow-schedule-dispatcher is running, the target exists, and nextRunAt recalculates.",
    });
  }

  if (report.schedulesMissingNextRun.count > 0) {
    signals.push({
      count: report.schedulesMissingNextRun.count,
      details: compactDetails(report.schedulesMissingNextRun.examples.map(formatOperationalExample), "No missing next-run examples captured."),
      occurrences: report.schedulesMissingNextRun.examples.map(toOperationalOccurrence),
      key: "schedulesMissingNextRun",
      label: "Active schedules missing next run",
      runbook: "Toggle the schedule or repair schedule config after validating intervalStr.",
    });
  }

  return signals;
}

function formatBudgetExample(example: BudgetHealthExample) {
  const parts = [
    example.targetName,
    `${example.percentUsed.toFixed(0)}% used`,
    example.summary,
    example.occurredAt ? new Date(example.occurredAt).toISOString() : undefined,
    example.id,
  ].filter(Boolean);

  return parts.join(" | ");
}

function buildBudgetHealthSignals(report: BudgetHealthReport) {
  const signals: PlatformAlertSignal[] = [];

  if (report.agentCostBudgets.count > 0) {
    signals.push({
      count: report.agentCostBudgets.count,
      details: compactDetails(report.agentCostBudgets.examples.map(formatBudgetExample), "No agent budget examples captured."),
      occurrences: report.agentCostBudgets.examples.map(toBudgetOccurrence),
      key: "agentCostBudgetPressure",
      label: "Agent cost budget pressure",
      runbook: "Open the agent run timeline, check model choice, retrieval breadth, and maxCostGBP before raising the budget.",
    });
  }

  if (report.tenantMessageBudgets.count > 0) {
    signals.push({
      count: report.tenantMessageBudgets.count,
      details: compactDetails(report.tenantMessageBudgets.examples.map(formatBudgetExample), "No tenant budget examples captured."),
      occurrences: report.tenantMessageBudgets.examples.map(toBudgetOccurrence),
      key: "tenantMessageBudgetPressure",
      label: "Tenant message budget pressure",
      runbook: "Review the tenant plan assignment, current usage, and expected month-end activity before increasing capacity.",
    });
  }

  return signals;
}

export function buildAnalyticsHealthPlatformAlertDecision(
  report: AnalyticsHealthReport,
  options: { platformName?: string } = {}
): PlatformAlertDecision {
  const platformName = resolvePlatformName(options.platformName);
  const signals = buildAnalyticsHealthSignals(report);
  const issueCount = signals.reduce((sum, signal) => sum + signal.count, 0);
  const range = report.checkedDates.length > 0
    ? `${report.checkedDates[0]} to ${report.checkedDates[report.checkedDates.length - 1]}`
    : "no checked dates";

  return {
    alertType: "analyticsHealth",
    shouldAlert: signals.length > 0,
    signals,
    subject: signals.length > 0
      ? `[${platformName}] Platform alert: analytics health (${formatNumber(issueCount)} signal${issueCount === 1 ? "" : "s"})`
      : `[${platformName}] Platform alerts healthy: analytics health`,
    summary: signals.length > 0
      ? `${formatNumber(issueCount)} analytics health signal${issueCount === 1 ? "" : "s"} detected across ${range}.`
      : `Analytics health is clean across ${range}.`,
  };
}

export function buildSystemHealthPlatformAlertDecision(
  report: SystemHealthReport,
  options: { platformName?: string } = {}
): PlatformAlertDecision {
  const platformName = resolvePlatformName(options.platformName);
  const signals = [
    ...buildAnalyticsHealthSignals(report.analytics),
    ...buildOperationalHealthSignals(report.operations),
    ...buildBudgetHealthSignals(report.budgetHealth),
  ];

  const disabledPipelines = report.disabledPurgePipelines ?? [];
  if (disabledPipelines.length > 0) {
    signals.push({
      count: disabledPipelines.length,
      details: [`Switched off: ${disabledPipelines.join(", ")}.`],
      key: "disabledPurgePipelines",
      label: "Retention pipelines switched off",
      runbook:
        "Open Settings → Security → Retention. Every pipeline ships enabled; anything off here means the deployment keeps that data forever, so either re-enable it or record why it stays off.",
    });
  }
  const issueCount = signals.reduce((sum, signal) => sum + signal.count, 0);
  const range = `${report.windowStartDate} to ${report.checkedDate}`;

  return {
    alertType: "systemHealth",
    shouldAlert: signals.length > 0,
    signals,
    subject: signals.length > 0
      ? `[${platformName}] Platform alert: system health (${formatNumber(issueCount)} signal${issueCount === 1 ? "" : "s"})`
      : `[${platformName}] Platform alerts healthy: system health`,
    summary: signals.length > 0
      ? `${formatNumber(issueCount)} system health signal${issueCount === 1 ? "" : "s"} detected across ${range}.`
      : `System health is clean across ${range}.`,
  };
}

/* ---------------------------------------------------------------------------
 * The alert email
 * ------------------------------------------------------------------------- */

/**
 * Every check this report runs, in plain English.
 *
 * Used to say what *passed*. The old email listed twelve metrics with eight of
 * them at zero, which buried the two that mattered; naming the clean ones in a
 * single closing line says the same thing without competing for attention.
 */
const HEALTH_CHECK_LABELS: Record<PlatformAlertSignal["key"], string> = {
  agentCostBudgetPressure: "agent budgets",
  agentErrorLogs: "agent errors",
  disabledPurgePipelines: "retention pipelines",
  duplicateSnapshots: "duplicate snapshots",
  failedAgentTransactions: "failed agent transactions",
  failedScheduledExecutions: "failed scheduled runs",
  failedToolCalls: "failed tool calls",
  highCostAgents: "high-cost agents",
  mismatchedDimensions: "dimension mismatches",
  missingDimensions: "missing dimensions",
  missingGlobalSnapshots: "missing snapshots",
  missingThreads: "missing threads",
  overdueSchedules: "overdue schedules",
  pendingApprovals: "pending approvals",
  providerFailures: "provider failures",
  schedulesMissingNextRun: "schedules missing a next run",
  staleAgentRuns: "stale agent runs",
  staleScheduledExecutions: "stale scheduled runs",
  tenantMessageBudgetPressure: "tenant budgets",
};

export const TOTAL_HEALTH_CHECKS = Object.keys(HEALTH_CHECK_LABELS).length;

/** Something broke, versus something needs looking at. */
const CRITICAL_KEYS = new Set<PlatformAlertSignal["key"]>([
  "agentErrorLogs",
  "failedAgentTransactions",
  "failedScheduledExecutions",
  "providerFailures",
]);

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

function countWord(value: number) {
  return COUNT_WORDS[value] ?? formatNumber(value);
}

function formatWhen(at: number | undefined) {
  if (at === undefined) return undefined;
  return new Date(at).toISOString().replace("T", " ").slice(0, 16);
}

/** "A, B and C" — and a trailing "and 4 more" once the list stops being a sentence. */
function listLabels(labels: string[]) {
  const shown = labels.slice(0, 3).map((label, index) =>
    index === 0 ? label : label.toLowerCase()
  );
  const extra = labels.length - shown.length;
  const joined = shown.length > 1
    ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
    : shown[0];

  return extra > 0 ? `${joined} and ${formatNumber(extra)} more` : joined;
}

function describeGroups(groups: PlatformAlertCauseGroup[], fallback: string[]) {
  if (groups.length === 0) return fallback.slice(0, 2).join(" ") || "No detail captured.";
  if (groups.length === 1) return groups[0].cause;
  return `${groups[0].cause}. Separately: ${groups[1].cause}`;
}

function describeBadge(signal: PlatformAlertSignal, groups: PlatformAlertCauseGroup[]) {
  if (groups.length > 1) return `${formatNumber(groups.length)} causes`;
  if (signal.count > 1) return `${formatNumber(signal.count)} × same fault`;
  return formatNumber(signal.count);
}

function describeMeta(groups: PlatformAlertCauseGroup[]) {
  const targets = [...new Set(groups.flatMap((group) => group.targetNames))].slice(0, 2);
  const first = formatWhen(groups.map((g) => g.firstAt).filter((v): v is number => v !== undefined).sort()[0]);
  const last = formatWhen(groups.map((g) => g.lastAt).filter((v): v is number => v !== undefined).sort().reverse()[0]);

  const when = first && last && first !== last ? `first ${first}, last ${last}` : (last ?? first);
  return [targets.join(", "), when].filter((part) => part && part.length > 0).join(" · ") || undefined;
}

export type SystemHealthAlertEmailOptions = {
  /** Resolved from settings. Never hardcode a platform name into a subject. */
  platformName?: string;
  /** Absolute app origin. Omitted in environments that have none, and then no link is rendered. */
  baseUrl?: string;
};

export function buildSystemHealthAlertSubject(
  decision: PlatformAlertDecision,
  options: SystemHealthAlertEmailOptions = {}
) {
  const name = resolvePlatformName(options.platformName);
  const issues = decision.signals.length;

  // The old subject counted summed occurrences — "6 signals" for two problems.
  // A person triaging an inbox wants to know how many things need them.
  return issues > 0
    ? `${name} · ${formatNumber(issues)} issue${issues === 1 ? "" : "s"} need${issues === 1 ? "s" : ""} attention`
    : `${name} · all clear`;
}

/**
 * Render a system health report into the shared shell.
 *
 * Everything shaping this is a reaction to the alert Anthony received on
 * 2026-07-31: lead with a verdict, show only what fired, group repeats, never
 * print a provider payload, and give every signal a way back into the app.
 */
export function buildSystemHealthAlertEmail(
  report: SystemHealthReport,
  decision: PlatformAlertDecision,
  options: SystemHealthAlertEmailOptions = {}
): RenderedEmail & { subject: string } {
  const platformName = resolvePlatformName(options.platformName);
  const baseUrl = options.baseUrl?.replace(/\/+$/, "");
  const signals = decision.signals;
  const passedKeys = (Object.keys(HEALTH_CHECK_LABELS) as PlatformAlertSignal["key"][])
    .filter((key) => !signals.some((signal) => signal.key === key));

  const ranked = [...signals].sort((left, right) => right.count - left.count);

  const cards: EmailCard[] = ranked.map((signal) => {
    const groups = groupAlertOccurrences(signal.occurrences ?? []);
    const agentGroup = groups.find((group) => group.targetType === "agent" && group.targetId);

    return {
      title: signal.label,
      badge: describeBadge(signal, groups),
      severity: CRITICAL_KEYS.has(signal.key) ? "critical" : "warning",
      body: describeGroups(groups, signal.details),
      meta: describeMeta(groups),
      fix: signal.runbook,
      link: baseUrl && agentGroup
        ? { label: "Open the agent log", url: `${baseUrl}/admin/agents/${agentGroup.targetId}/logs` }
        : undefined,
    };
  });

  const stats: EmailStat[] = [
    ...ranked.slice(0, 2).map((signal): EmailStat => ({
      label: signal.label,
      value: formatNumber(signal.count),
      tone: CRITICAL_KEYS.has(signal.key) ? "critical" : "warning",
    })),
    { label: "Checks passed", value: formatNumber(passedKeys.length), tone: "good" },
  ];

  const content: EmailContent = {
    kind: "System health",
    verdict: signals.length > 0
      ? `${countWord(signals.length)} thing${signals.length === 1 ? "" : "s"} need${signals.length === 1 ? "s" : ""} you.`
      : "Everything is clean.",
    lede: signals.length > 0
      ? `${listLabels(ranked.map((signal) => signal.label))} need attention. ` +
        `The other ${formatNumber(passedKeys.length)} checks are clear.`
      : `All ${formatNumber(TOTAL_HEALTH_CHECKS)} checks passed across ${report.windowStartDate} to ${report.checkedDate}.`,
    stats: signals.length > 0 ? stats : undefined,
    cards,
    overflow: baseUrl ? { label: "Open agent governance", url: `${baseUrl}/admin/agents` } : undefined,
    actions: baseUrl ? [{ label: "Open agent governance", url: `${baseUrl}/admin/agents` }] : undefined,
    quiet: passedKeys.length > 0 && signals.length > 0
      ? [`Also checked and clear: ${passedKeys.map((key) => HEALTH_CHECK_LABELS[key]).join(", ")}.`]
      : undefined,
    footer: {
      lines: [
        `Covering ${report.windowStartDate} to ${report.checkedDate}.`,
        signals.length > 0
          ? "Sent because a check failed. A clean run sends nothing."
          : "Sent as a scheduled confirmation.",
        "Recipients are configured by your platform administrator.",
      ],
    },
  };

  return {
    subject: buildSystemHealthAlertSubject(decision, { platformName }),
    ...renderEmail(content, { platformName }),
  };
}

export function parsePlatformAlertRecipients(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
