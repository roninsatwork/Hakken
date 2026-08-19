import { describe, expect, test } from "vitest";
import {
  buildAnalyticsHealthPlatformAlertDecision,
  buildSystemHealthAlertEmail,
  buildSystemHealthPlatformAlertDecision,
  groupAlertOccurrences,
  humaniseFailureSummary,
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
    failedToolCalls: { count: 0, examples: [] },
    failedScheduledExecutions: { count: 0, examples: [] },
    highCostAgents: { count: 0, examples: [] },
    overdueSchedules: { count: 0, examples: [] },
    pendingApprovals: { count: 0, examples: [] },
    providerFailures: { count: 0, examples: [] },
    schedulesMissingNextRun: { count: 0, examples: [] },
    staleAgentRuns: { count: 0, examples: [] },
    staleRunningScheduledExecutions: { count: 0, examples: [] },
    ...overrides,
  };
}

function buildSystemReport(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    analytics: buildReport(),
    alertRules: [],
    budgetHealth: {
      agentCostBudgets: { count: 0, examples: [] },
      tenantMessageBudgets: { count: 0, examples: [] },
    },
    checkedAt: Date.parse("2026-06-02T10:00:00.000Z"),
    checkedDate: "2026-06-02",
    daysBack: 7,
    highCostAgentThresholdGBP: 5,
    operations: buildOperationalReport(),
    overdueScheduleThresholdMinutes: 15,
    pendingApprovalThresholdMinutes: 30,
    scope: { type: "platform" },
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

  test("alerts when retention pipelines are switched off", () => {
    const decision = buildSystemHealthPlatformAlertDecision(
      buildSystemReport({ disabledPurgePipelines: ["phoneCalls", "mailboxMessages"] })
    );

    expect(decision.shouldAlert).toBe(true);
    const signal = decision.signals.find((s) => s.key === "disabledPurgePipelines");
    expect(signal).toMatchObject({ count: 2, label: "Retention pipelines switched off" });
    expect(signal?.details[0]).toContain("phoneCalls");

    // A report with every pipeline running stays clean — the signal exists to
    // surface the deliberate switch-off, not to nag healthy deployments.
    expect(
      buildSystemHealthPlatformAlertDecision(buildSystemReport({ disabledPurgePipelines: [] }))
        .shouldAlert
    ).toBe(false);
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

  test("alerts for budget pressure", () => {
    const decision = buildSystemHealthPlatformAlertDecision(buildSystemReport({
      budgetHealth: {
        agentCostBudgets: {
          count: 1,
          examples: [{
            id: "run_1",
            limit: 1,
            percentUsed: 95,
            summary: "GBP 0.95 of GBP 1.00",
            targetName: "Budget Agent",
            targetType: "agent",
            used: 0.95,
          }],
        },
        tenantMessageBudgets: {
          count: 1,
          examples: [{
            id: "company_1",
            limit: 100,
            percentUsed: 90,
            summary: "90 of 100 messages",
            targetName: "Acme",
            targetType: "company",
            used: 90,
          }],
        },
      },
    }));

    expect(decision.shouldAlert).toBe(true);
    expect(decision.signals.map((signal) => signal.key)).toEqual([
      "agentCostBudgetPressure",
      "tenantMessageBudgetPressure",
    ]);
    expect(decision.subject).toBe("[Sonae] Platform alert: system health (2 signals)");
  });

  /* ---------------------------------------------------------------------
   * The alert Anthony received on 2026-07-31, rebuilt.
   *
   * These are the exact payloads from that email: four identical 400s from one
   * agent, plus two distinct Apify faults. Everything here asserts the thing
   * that made the original unreadable.
   * ------------------------------------------------------------------- */

  const THOUGHT_SIGNATURE_ERROR =
    '{"error":{"message":"{\\n \\"error\\": {\\n \\"code\\": 400,\\n \\"message\\": \\"Function call is missing a thought_signature in functionCall parts. This is required for tools to work co...';
  const APIFY_402_ERROR =
    'Uncaught Error: Apify replied 402 to POST /acts/jKpgGfgRfzrGgEMa8/runs: { "error": { "type": "not-enough-usage-to-run-paid-actor", "message": "By launching this job you will exc...';
  const APIFY_SECRET_ERROR =
    "Uncaught Error: APIFY_WEBHOOK_SECRET environment variable is missing. at startApifyActor (../convex/apify.ts:191:33) at handler (../convex/apify.ts:86:20)";

  function buildScreenshotReport() {
    return buildSystemReport({
      operations: buildOperationalReport({
        agentFailures: {
          count: 4,
          examples: Array.from({ length: 4 }, (_, index) => ({
            id: `log_${index}`,
            label: "ERROR",
            occurredAt: Date.UTC(2026, 6, 29, 16, 39 + index),
            summary: THOUGHT_SIGNATURE_ERROR,
            targetId: "agent_rightmove",
            targetName: "Rightmove Agent",
            targetType: "agent" as const,
          })),
        },
        failedToolCalls: {
          count: 2,
          examples: [
            {
              id: "call_1",
              label: "apify",
              occurredAt: Date.UTC(2026, 6, 30, 7, 40),
              summary: APIFY_402_ERROR,
              targetId: "agent_rightmove",
              targetName: "Rightmove Agent",
              targetType: "agent" as const,
            },
            {
              id: "call_2",
              label: "apify",
              occurredAt: Date.UTC(2026, 6, 29, 16, 35),
              summary: APIFY_SECRET_ERROR,
              targetId: "agent_rightmove",
              targetName: "Rightmove Agent",
              targetType: "agent" as const,
            },
          ],
        },
      }),
    });
  }

  test("pulls the human sentence out of a nested provider payload", () => {
    expect(humaniseFailureSummary(THOUGHT_SIGNATURE_ERROR)).toBe(
      "Function call is missing a thought_signature in functionCall parts. This is required for tools to work co"
    );
  });

  test("keeps the useful half of an Apify failure and drops the envelope", () => {
    expect(humaniseFailureSummary(APIFY_402_ERROR)).toBe(
      "Apify replied 402 to POST /acts/jKpgGfgRfzrGgEMa8/runs — not-enough-usage-to-run-paid-actor"
    );
  });

  test("strips the stack trace from a plain error", () => {
    expect(humaniseFailureSummary(APIFY_SECRET_ERROR)).toBe(
      "APIFY_WEBHOOK_SECRET environment variable is missing."
    );
  });

  test("collapses four identical faults into one group", () => {
    const groups = groupAlertOccurrences([
      { cause: "same", at: 3, targetName: "Rightmove Agent", targetId: "a1", targetType: "agent" },
      { cause: "same", at: 1, targetName: "Rightmove Agent" },
      { cause: "same", at: 5, targetName: "Rightmove Agent" },
      { cause: "other", at: 2, targetName: "Other Agent" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ cause: "same", count: 3, firstAt: 1, lastAt: 5, targetId: "a1" });
    expect(groups[0].targetNames).toEqual(["Rightmove Agent"]);
  });

  test("the rebuilt alert shows two cards, not six rows", () => {
    const report = buildScreenshotReport();
    const decision = buildSystemHealthPlatformAlertDecision(report);
    const email = buildSystemHealthAlertEmail(report, decision, {
      platformName: "Sonae",
      baseUrl: "https://app.test",
    });

    expect(decision.signals).toHaveLength(2);
    expect(email.html).toContain("Agent execution errors");
    expect(email.html).toContain("Failed agent tool calls");
    expect(email.html).toContain("4 × SAME FAULT");
    expect(email.html).toContain("2 CAUSES");
  });

  test("never prints a provider payload", () => {
    const report = buildScreenshotReport();
    const email = buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report));

    expect(email.html).not.toContain('{"error"');
    expect(email.html).not.toContain("\\n");
    expect(email.html).not.toContain("../convex/apify.ts");
    expect(email.text).not.toContain('{"error"');
  });

  test("drops every zero and says what passed instead", () => {
    const report = buildScreenshotReport();
    const email = buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report));

    // The original listed eight zero rows above the two real problems.
    expect(email.html).not.toContain("Today assistant messages");
    expect(email.html).not.toContain("Agent budget warnings");
    expect(email.html).toContain("Also checked and clear:");
    expect(email.html).toContain("16"); // 18 checks minus the 2 that fired
  });

  test("gives every agent signal a way back into the app", () => {
    const report = buildScreenshotReport();
    const email = buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report), {
      baseUrl: "https://app.test",
    });

    expect(email.html).toContain("https://app.test/admin/agents/agent_rightmove/logs");
    expect(email.text).toContain("https://app.test/admin/agents/agent_rightmove/logs");
  });

  test("renders no links at all when the deployment has no base URL", () => {
    const report = buildScreenshotReport();
    const email = buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report));

    expect(email.html).not.toContain("undefined/admin");
    expect(email.html).not.toContain("/admin/agents");
  });

  test("counts issues in the subject, not summed occurrences", () => {
    const report = buildScreenshotReport();
    const decision = buildSystemHealthPlatformAlertDecision(report);
    const email = buildSystemHealthAlertEmail(report, decision, { platformName: "Acme Ops" });

    // The original said "(6 signals)" for what a person would call two problems.
    expect(email.subject).toBe("Acme Ops · 2 issues need attention");
    expect(email.html).toContain("Two things need you.");
  });

  test("escapes hostile content coming through a signal", () => {
    const report = buildSystemReport({
      operations: buildOperationalReport({
        overdueSchedules: {
          count: 1,
          examples: [{
            id: "schedule_1",
            label: "Bad <script>",
            summary: "Overdue <script>alert(1)</script>",
            targetName: "Schedule <script>",
            targetType: "schedule",
          }],
        },
      }),
    });
    const email = buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report));

    expect(email.html).toContain("Overdue active schedules");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  test("parses comma-separated platform alert recipients", () => {
    expect(parsePlatformAlertRecipients(" ops@example.com,admin@example.com ,, ")).toEqual([
      "ops@example.com",
      "admin@example.com",
    ]);
    expect(parsePlatformAlertRecipients(undefined)).toEqual([]);
  });
});
