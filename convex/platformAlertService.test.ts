import { describe, expect, test } from "vitest";
import {
  buildAnalyticsHealthPlatformAlertDecision,
  buildPlatformAlertEmailHtml,
  buildSystemHealthPlatformAlertDecision,
  buildSystemHealthPlatformAlertEmailHtml,
  parsePlatformAlertRecipients,
  type AnalyticsHealthReport,
  type OperationalHealthReport,
  type SystemHealthReport,
} from "./platformAlertService";

function buildReport(overrides: Partial<AnalyticsHealthReport> = {}): AnalyticsHealthReport {
  return {
    checkedDates: ["2026-05-26", "2026-05-27", "2026-05-28"],
    daysBack: 3,
    liveToday: {
      agentTransactions: 1,
      assistantMessages: 2,
      date: "2026-06-02",
    },
    messageDimensions: {
      examples: [],
      mismatched: 0,
      missingDimensions: 0,
      missingThreads: 0,
      scanned: 10,
      windowStartDate: "2026-05-26",
    },
    snapshotCoverage: {
      dates: [],
      duplicateSnapshotGroups: [],
      missingGlobalDates: [],
      totalSnapshots: 3,
    },
    ...overrides,
  };
}

function buildOperationalReport(overrides: Partial<OperationalHealthReport> = {}): OperationalHealthReport {
  return {
    agentFailures: { count: 0, examples: [] },
    failedAgentTransactions: { count: 0, examples: [] },
    failedScheduledExecutions: { count: 0, examples: [] },
    overdueSchedules: { count: 0, examples: [] },
    schedulesMissingNextRun: { count: 0, examples: [] },
    staleRunningScheduledExecutions: { count: 0, examples: [] },
    ...overrides,
  };
}

function buildSystemReport(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    analytics: buildReport(),
    checkedAt: Date.parse("2026-06-02T10:00:00.000Z"),
    checkedDate: "2026-06-02",
    daysBack: 7,
    operations: buildOperationalReport(),
    overdueScheduleThresholdMinutes: 15,
    staleRunningThresholdMinutes: 60,
    windowStartDate: "2026-05-26",
    windowStartTs: Date.parse("2026-05-26T10:00:00.000Z"),
    ...overrides,
  };
}

describe("platform alert service", () => {
  test("does not alert when analytics health report is clean", () => {
    const decision = buildAnalyticsHealthPlatformAlertDecision(buildReport());

    expect(decision).toMatchObject({
      alertType: "analyticsHealth",
      shouldAlert: false,
      signals: [],
      subject: "[Sonae] Platform alerts healthy: analytics health",
    });
    expect(decision.summary).toContain("clean");
  });

  test("alerts for snapshot and message-dimension health drift", () => {
    const decision = buildAnalyticsHealthPlatformAlertDecision(
      buildReport({
        messageDimensions: {
          examples: ["message_1", "message_2"],
          mismatched: 1,
          missingDimensions: 2,
          missingThreads: 3,
          scanned: 10,
          windowStartDate: "2026-05-26",
        },
        snapshotCoverage: {
          dates: [],
          duplicateSnapshotGroups: [{ count: 2, date: "2026-05-28", scopeId: "global", type: "global" }],
          missingGlobalDates: ["2026-05-27"],
          totalSnapshots: 3,
        },
      })
    );

    expect(decision.shouldAlert).toBe(true);
    expect(decision.signals.map((signal) => signal.count)).toEqual([1, 1, 2, 1, 3]);
    expect(decision.subject).toBe("[Sonae] Platform alert: analytics health (8 signals)");
    expect(decision.signals.map((signal) => signal.key)).toEqual([
      "missingGlobalSnapshots",
      "duplicateSnapshots",
      "missingDimensions",
      "mismatchedDimensions",
      "missingThreads",
    ]);
  });

  test("renders escaped platform alert email content", () => {
    const report = buildReport({
      messageDimensions: {
        examples: ["message_<script>"],
        mismatched: 1,
        missingDimensions: 0,
        missingThreads: 0,
        scanned: 10,
        windowStartDate: "2026-05-26",
      },
    });
    const decision = buildAnalyticsHealthPlatformAlertDecision(report);
    const html = buildPlatformAlertEmailHtml(report, decision);

    expect(html).toContain("Alert type: analyticsHealth");
    expect(html).toContain("Message dimension mismatches");
    expect(html).toContain("message_&lt;script&gt;");
    expect(html).not.toContain("message_<script>");
  });

  test("does not alert when system health report is clean", () => {
    const decision = buildSystemHealthPlatformAlertDecision(buildSystemReport());

    expect(decision).toMatchObject({
      alertType: "systemHealth",
      shouldAlert: false,
      signals: [],
      subject: "[Sonae] Platform alerts healthy: system health",
    });
    expect(decision.summary).toContain("clean");
  });

  test("alerts for operational health failures", () => {
    const decision = buildSystemHealthPlatformAlertDecision(buildSystemReport({
      operations: buildOperationalReport({
        agentFailures: {
          count: 1,
          examples: [{
            id: "log_1",
            label: "ERROR",
            occurredAt: Date.parse("2026-06-02T09:00:00.000Z"),
            summary: "Provider failed",
            targetName: "Sales Agent",
            targetType: "agent",
          }],
        },
        failedScheduledExecutions: {
          count: 2,
          examples: [{
            id: "exec_1",
            label: "SCHEDULE",
            occurredAt: Date.parse("2026-06-02T08:00:00.000Z"),
            summary: "Node failed",
            targetName: "Daily Workflow",
            targetType: "workflow",
          }],
        },
      }),
    }));

    expect(decision.shouldAlert).toBe(true);
    expect(decision.subject).toBe("[Sonae] Platform alert: system health (3 signals)");
    expect(decision.signals.map((signal) => signal.key)).toEqual(["agentErrorLogs", "failedScheduledExecutions"]);
    expect(decision.signals[0].details[0]).toContain("Sales Agent");
    expect(decision.signals[1].details[0]).toContain("Daily Workflow");
  });

  test("renders escaped system health email content", () => {
    const report = buildSystemReport({
      operations: buildOperationalReport({
        overdueSchedules: {
          count: 1,
          examples: [{
            id: "schedule_1",
            label: "Bad <script>",
            summary: "Overdue <script>",
            targetName: "Schedule <script>",
            targetType: "schedule",
          }],
        },
      }),
    });
    const decision = buildSystemHealthPlatformAlertDecision(report);
    const html = buildSystemHealthPlatformAlertEmailHtml(report, decision);

    expect(html).toContain("Alert type: systemHealth");
    expect(html).toContain("Overdue active schedules");
    expect(html).toContain("Schedule &lt;script&gt;");
    expect(html).not.toContain("Schedule <script>");
  });

  test("parses comma-separated platform alert recipients", () => {
    expect(parsePlatformAlertRecipients(" ops@example.com,admin@example.com ,, ")).toEqual([
      "ops@example.com",
      "admin@example.com",
    ]);
    expect(parsePlatformAlertRecipients(undefined)).toEqual([]);
  });
});
