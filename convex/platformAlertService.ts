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

export type PlatformAlertSignal = {
  count: number;
  details: string[];
  key: "missingGlobalSnapshots" | "duplicateSnapshots" | "missingDimensions" | "mismatchedDimensions" | "missingThreads";
  label: string;
  runbook: string;
};

export type PlatformAlertDecision = {
  alertType: "analyticsHealth";
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

export function buildAnalyticsHealthPlatformAlertDecision(report: AnalyticsHealthReport): PlatformAlertDecision {
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

export function parsePlatformAlertRecipients(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
