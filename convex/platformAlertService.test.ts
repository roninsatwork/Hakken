import { describe, expect, test } from "vitest";
import {
  buildAnalyticsHealthPlatformAlertDecision,
  buildPlatformAlertEmailHtml,
  parsePlatformAlertRecipients,
  type AnalyticsHealthReport,
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

  test("parses comma-separated platform alert recipients", () => {
    expect(parsePlatformAlertRecipients(" ops@example.com,admin@example.com ,, ")).toEqual([
      "ops@example.com",
      "admin@example.com",
    ]);
    expect(parsePlatformAlertRecipients(undefined)).toEqual([]);
  });
});
