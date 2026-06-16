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
  targetName?: string;
  targetType?: "agent" | "schedule" | "workflow";
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
  key:
    | "agentErrorLogs"
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compactDetails(values: string[], fallback: string) {
  return values.length > 0 ? values.slice(0, 10) : [fallback];
}

function buildAnalyticsHealthSignals(report: AnalyticsHealthReport) {
  const signals: PlatformAlertSignal[] = [];

  if (report.snapshotCoverage.missingGlobalDates.length > 0) {
    signals.push({
      count: report.snapshotCoverage.missingGlobalDates.length,
      details: compactDetails(report.snapshotCoverage.missingGlobalDates, "No missing global snapshot dates."),
      key: "missingGlobalSnapshots",
      label: "Missing global snapshots",
      runbook: "Run analyticsCron:generateDailySnapshots for each missing date after confirming the date is safe to regenerate.",
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
      key: "agentErrorLogs",
      label: "Agent execution errors",
      runbook: "Open the agent log, inspect provider/config/tool failure, then retry or fix the agent configuration.",
    });
  }

  if (report.failedAgentTransactions.count > 0) {
    signals.push({
      count: report.failedAgentTransactions.count,
      details: compactDetails(report.failedAgentTransactions.examples.map(formatOperationalExample), "No failed transaction examples captured."),
      key: "failedAgentTransactions",
      label: "Failed agent transactions",
      runbook: "Compare with agent logs and provider health before treating it as billing-only telemetry.",
    });
  }

  if (report.staleAgentRuns.count > 0) {
    signals.push({
      count: report.staleAgentRuns.count,
      details: compactDetails(report.staleAgentRuns.examples.map(formatOperationalExample), "No stale agent run examples captured."),
      key: "staleAgentRuns",
      label: "Stale agent runs",
      runbook: "Open the run detail timeline, inspect the latest step, and decide whether the run needs cancellation, replay, or provider/tool repair.",
    });
  }

  if (report.pendingApprovals.count > 0) {
    signals.push({
      count: report.pendingApprovals.count,
      details: compactDetails(report.pendingApprovals.examples.map(formatOperationalExample), "No pending approval examples captured."),
      key: "pendingApprovals",
      label: "Pending agent approvals",
      runbook: "Open agent approvals and either approve, reject, or tune the approval policy if these are repeatedly stranded.",
    });
  }

  if (report.failedToolCalls.count > 0) {
    signals.push({
      count: report.failedToolCalls.count,
      details: compactDetails(report.failedToolCalls.examples.map(formatOperationalExample), "No failed tool-call examples captured."),
      key: "failedToolCalls",
      label: "Failed agent tool calls",
      runbook: "Inspect the tool call arguments/result, connector diagnostics, and tenant policy before retrying the agent run.",
    });
  }

  if (report.providerFailures.count > 0) {
    signals.push({
      count: report.providerFailures.count,
      details: compactDetails(report.providerFailures.examples.map(formatOperationalExample), "No provider failure examples captured."),
      key: "providerFailures",
      label: "Provider failure clusters",
      runbook: "Check provider health, model defaults, credentials, and recent deploys before changing agent prompts or tools.",
    });
  }

  if (report.highCostAgents.count > 0) {
    signals.push({
      count: report.highCostAgents.count,
      details: compactDetails(report.highCostAgents.examples.map(formatOperationalExample), "No high-cost agent examples captured."),
      key: "highCostAgents",
      label: "High-cost agents",
      runbook: "Review run volume, token usage, model choice, budgets, and whether cheaper defaults or tighter retrieval limits are appropriate.",
    });
  }

  if (report.failedScheduledExecutions.count > 0) {
    signals.push({
      count: report.failedScheduledExecutions.count,
      details: compactDetails(report.failedScheduledExecutions.examples.map(formatOperationalExample), "No failed scheduled execution examples captured."),
      key: "failedScheduledExecutions",
      label: "Failed scheduled executions",
      runbook: "Open workflow execution logs, fix the failed node or target configuration, then rerun manually.",
    });
  }

  if (report.staleRunningScheduledExecutions.count > 0) {
    signals.push({
      count: report.staleRunningScheduledExecutions.count,
      details: compactDetails(report.staleRunningScheduledExecutions.examples.map(formatOperationalExample), "No stale scheduled execution examples captured."),
      key: "staleScheduledExecutions",
      label: "Stale running scheduled executions",
      runbook: "Inspect Convex action logs and workflow steps; determine whether the run is still processing or stranded.",
    });
  }

  if (report.overdueSchedules.count > 0) {
    signals.push({
      count: report.overdueSchedules.count,
      details: compactDetails(report.overdueSchedules.examples.map(formatOperationalExample), "No overdue schedule examples captured."),
      key: "overdueSchedules",
      label: "Overdue active schedules",
      runbook: "Check whether workflow-schedule-dispatcher is running, the target exists, and nextRunAt recalculates.",
    });
  }

  if (report.schedulesMissingNextRun.count > 0) {
    signals.push({
      count: report.schedulesMissingNextRun.count,
      details: compactDetails(report.schedulesMissingNextRun.examples.map(formatOperationalExample), "No missing next-run examples captured."),
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
      key: "agentCostBudgetPressure",
      label: "Agent cost budget pressure",
      runbook: "Open the agent run timeline, check model choice, retrieval breadth, and maxCostGBP before raising the budget.",
    });
  }

  if (report.tenantMessageBudgets.count > 0) {
    signals.push({
      count: report.tenantMessageBudgets.count,
      details: compactDetails(report.tenantMessageBudgets.examples.map(formatBudgetExample), "No tenant budget examples captured."),
      key: "tenantMessageBudgetPressure",
      label: "Tenant message budget pressure",
      runbook: "Review the tenant plan assignment, current usage, and expected month-end activity before increasing capacity.",
    });
  }

  return signals;
}

export function buildAnalyticsHealthPlatformAlertDecision(report: AnalyticsHealthReport): PlatformAlertDecision {
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
      ? `[Sonae] Platform alert: analytics health (${formatNumber(issueCount)} signal${issueCount === 1 ? "" : "s"})`
      : "[Sonae] Platform alerts healthy: analytics health",
    summary: signals.length > 0
      ? `${formatNumber(issueCount)} analytics health signal${issueCount === 1 ? "" : "s"} detected across ${range}.`
      : `Analytics health is clean across ${range}.`,
  };
}

export function buildSystemHealthPlatformAlertDecision(report: SystemHealthReport): PlatformAlertDecision {
  const signals = [
    ...buildAnalyticsHealthSignals(report.analytics),
    ...buildOperationalHealthSignals(report.operations),
    ...buildBudgetHealthSignals(report.budgetHealth),
  ];
  const issueCount = signals.reduce((sum, signal) => sum + signal.count, 0);
  const range = `${report.windowStartDate} to ${report.checkedDate}`;

  return {
    alertType: "systemHealth",
    shouldAlert: signals.length > 0,
    signals,
    subject: signals.length > 0
      ? `[Sonae] Platform alert: system health (${formatNumber(issueCount)} signal${issueCount === 1 ? "" : "s"})`
      : "[Sonae] Platform alerts healthy: system health",
    summary: signals.length > 0
      ? `${formatNumber(issueCount)} system health signal${issueCount === 1 ? "" : "s"} detected across ${range}.`
      : `System health is clean across ${range}.`,
  };
}

export function buildPlatformAlertEmailHtml(report: AnalyticsHealthReport, decision: PlatformAlertDecision) {
  const signalRows = decision.signals.map((signal) => `
    <tr>
      <td>${escapeHtml(signal.label)}</td>
      <td>${formatNumber(signal.count)}</td>
      <td>${escapeHtml(signal.details.join(", "))}</td>
      <td>${escapeHtml(signal.runbook)}</td>
    </tr>
  `).join("");

  return `
    <div>
      <p>${escapeHtml(decision.summary)}</p>
      <ul>
        <li>Alert type: ${escapeHtml(decision.alertType)}</li>
        <li>Window: ${escapeHtml(report.messageDimensions.windowStartDate)} to ${escapeHtml(report.liveToday.date)}</li>
        <li>Recent messages scanned: ${formatNumber(report.messageDimensions.scanned)}</li>
        <li>Total snapshots checked: ${formatNumber(report.snapshotCoverage.totalSnapshots)}</li>
        <li>Today assistant messages: ${formatNumber(report.liveToday.assistantMessages)}</li>
        <li>Today agent transactions: ${formatNumber(report.liveToday.agentTransactions)}</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th>Count</th>
            <th>Examples</th>
            <th>Operator response</th>
          </tr>
        </thead>
        <tbody>
          ${signalRows}
        </tbody>
      </table>
    </div>
  `;
}

export function buildSystemHealthPlatformAlertEmailHtml(report: SystemHealthReport, decision: PlatformAlertDecision) {
  const signalRows = decision.signals.map((signal) => `
    <tr>
      <td>${escapeHtml(signal.label)}</td>
      <td>${formatNumber(signal.count)}</td>
      <td>${escapeHtml(signal.details.join(", "))}</td>
      <td>${escapeHtml(signal.runbook)}</td>
    </tr>
  `).join("");

  return `
    <div>
      <p>${escapeHtml(decision.summary)}</p>
      <ul>
        <li>Alert type: ${escapeHtml(decision.alertType)}</li>
        <li>Window: ${escapeHtml(report.windowStartDate)} to ${escapeHtml(report.checkedDate)}</li>
        <li>Recent messages scanned: ${formatNumber(report.analytics.messageDimensions.scanned)}</li>
        <li>Total snapshots checked: ${formatNumber(report.analytics.snapshotCoverage.totalSnapshots)}</li>
        <li>Today assistant messages: ${formatNumber(report.analytics.liveToday.assistantMessages)}</li>
        <li>Today agent transactions: ${formatNumber(report.analytics.liveToday.agentTransactions)}</li>
        <li>Agent errors: ${formatNumber(report.operations.agentFailures.count)}</li>
        <li>Agent budget warnings: ${formatNumber(report.budgetHealth.agentCostBudgets.count)}</li>
        <li>Tenant budget warnings: ${formatNumber(report.budgetHealth.tenantMessageBudgets.count)}</li>
        <li>Failed scheduled executions: ${formatNumber(report.operations.failedScheduledExecutions.count)}</li>
        <li>Stale scheduled executions: ${formatNumber(report.operations.staleRunningScheduledExecutions.count)}</li>
        <li>Overdue schedules: ${formatNumber(report.operations.overdueSchedules.count)}</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th>Count</th>
            <th>Examples</th>
            <th>Operator response</th>
          </tr>
        </thead>
        <tbody>
          ${signalRows}
        </tbody>
      </table>
    </div>
  `;
}

export function parsePlatformAlertRecipients(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
