"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { billingSettingsFixture, companyBillingFixture, customerBillingFixture, billingActionFixtures } from "./billingFixtures";

type E2ERole = "super-admin" | "company-admin" | "user" | "read-only" | "auditor";
type FunctionReference = Parameters<typeof getFunctionName>[0];

const now = 1_717_200_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const companyId = "company_e2e";
const superAdminId = "user_e2e_super_admin";
const userId = "user_e2e";

/**
 * A week of agent activity with a shape worth looking at: a quiet weekend, a
 * failure that starts partway through, and a slow tail. Flat fixture data makes
 * a chart look correct no matter how badly it is drawn.
 */
function observabilityAnalyticsFixture(lookbackDays: number) {
  const perDay = [
    { total: 103, failed: 4 },
    { total: 109, failed: 3 },
    { total: 97, failed: 5 },
    { total: 56, failed: 2 },
    { total: 49, failed: 1 },
    { total: 138, failed: 38 },
    { total: 142, failed: 41 },
  ];
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const dailySeries = perDay.map((day, index) => ({
    dayStartMs: todayStart - (perDay.length - 1 - index) * DAY_MS,
    total: day.total,
    succeeded: day.total - day.failed,
    failed: day.failed,
    costGBP: day.total * 0.014,
  }));

  const runs = dailySeries.reduce((sum, day) => sum + day.total, 0);
  const failed = dailySeries.reduce((sum, day) => sum + day.failed, 0);
  const costGBP = dailySeries.reduce((sum, day) => sum + day.costGBP, 0);

  return {
    sampledRuns: runs,
    sampledToolCalls: 2504,
    sampledApprovals: 3,
    sampledFeedback: 0,
    totals: {
      runs,
      successfulRuns: runs - failed,
      failedRuns: failed,
      activeRuns: 4,
      toolCalls: 2504,
      approvals: 3,
      feedback: 0,
      costGBP,
      inputTokens: 1_482_000,
      outputTokens: 214_000,
      successRate: (runs - failed) / runs,
      positiveFeedbackRate: 0,
      averageLatencyMs: 6600,
    },
    lookbackDays,
    latency: { medianMs: 4200, p95Ms: 31400, averageMs: 6600, sampleSize: runs },
    dailySeries,
    comparison: {
      current: {
        runs,
        succeeded: runs - failed,
        failed,
        costGBP,
        successRate: (runs - failed) / runs,
        costPerRunGBP: costGBP / runs,
      },
      previous: {
        runs: 619,
        succeeded: 604,
        failed: 15,
        costGBP: 8.19,
        successRate: 604 / 619,
        costPerRunGBP: 8.19 / 619,
      },
    },
    versionChangeDays: [todayStart - 2 * DAY_MS],
    sampleTruncated: false,
    failureGroups: [
      {
        failureKey: "the property search timed out",
        label: "The property search timed out",
        count: 42,
        firstSeenAt: now - 2 * DAY_MS,
        lastSeenAt: now - 10 * 60 * 1000,
        runIds: ["run_e2e_failed"],
      },
      {
        failureKey: "gave up before finishing the job",
        label: "Gave up before finishing the job",
        count: 8,
        firstSeenAt: now - 2 * DAY_MS,
        lastSeenAt: now - 40 * 60 * 1000,
        runIds: [],
      },
      {
        failureKey: "nobody answered the approval request",
        label: "Nobody answered the approval request",
        count: 3,
        firstSeenAt: now - 4 * DAY_MS,
        lastSeenAt: now - DAY_MS,
        runIds: [],
      },
    ],
    statusCounts: {
      QUEUED: 1,
      RUNNING: 1,
      PENDING_APPROVAL: 3,
      SUCCESS: runs - failed,
      FAILED: failed,
      CANCELLED: 0,
    },
    triggerCounts: { SCHEDULE: runs - 40, MANUAL: 40 },
    approvalCounts: { PENDING: 3, APPROVED: 12, REJECTED: 1, CANCELLED: 0 },
    feedbackCounts: { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 },
    feedbackLabelCounts: [],
    modelStats: [],
    versionStats: [],
    toolStats: [
      { handlerMapping: "research.search", calls: 1180, successes: 1038, failures: 142, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0, typicalMs: 1_450 },
      { handlerMapping: "records.save", calls: 964, successes: 964, failures: 0, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0, typicalMs: 120 },
      { handlerMapping: "email.send", calls: 212, successes: 210, failures: 0, approvalsRequired: 3, denied: 0, cancelled: 0, notImplemented: 2, typicalMs: 640 },
      { handlerMapping: "postcode.lookup", calls: 148, successes: 148, failures: 0, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0, typicalMs: 85 },
    ],
    failureGroupsOmitted: 0,
    failureReasons: [
      { reason: "The property search timed out", count: 42 },
      { reason: "Gave up before finishing the job", count: 8 },
    ],
    recentFailures: [],
  };
}

function observabilityRunFixtures() {
  return [
    {
      _id: "run_e2e_running",
      _creationTime: now - 12_000,
      agentId: "agent_e2e",
      companyId,
      triggerType: "SCHEDULE",
      objective: "Find new three-bed listings in Bath under £450k",
      status: "RUNNING",
      startedAt: now - 12_000,
      updatedAt: now,
    },
    {
      _id: "run_e2e_failed",
      _creationTime: now - 40 * 60 * 1000,
      agentId: "agent_e2e",
      companyId,
      triggerType: "SCHEDULE",
      objective: "Find new three-bed listings in Bristol under £400k",
      status: "FAILED",
      error: "The property search timed out",
      startedAt: now - 40 * 60 * 1000,
      completedAt: now - 40 * 60 * 1000 + 31_400,
      costGBP: 0.021,
      updatedAt: now,
    },
    {
      _id: "run_e2e_waiting",
      _creationTime: now - 2 * DAY_MS,
      agentId: "agent_e2e",
      companyId,
      triggerType: "MANUAL",
      objective: "Email this week's shortlist to the Henderson account",
      status: "PENDING_APPROVAL",
      startedAt: now - 2 * DAY_MS,
      updatedAt: now,
    },
    {
      _id: "run_e2e_done",
      _creationTime: now - 3 * 60 * 60 * 1000,
      agentId: "agent_e2e",
      companyId,
      triggerType: "SCHEDULE",
      objective: "Find new three-bed listings in Bath under £450k",
      status: "SUCCESS",
      startedAt: now - 3 * 60 * 60 * 1000,
      completedAt: now - 3 * 60 * 60 * 1000 + 4_100,
      costGBP: 0.013,
      finalOutput: "Filed 14 listings",
      updatedAt: now,
    },
    {
      _id: "run_e2e_refresh",
      _creationTime: now - 5 * 60 * 60 * 1000,
      agentId: "agent_e2e",
      companyId,
      triggerType: "MANUAL",
      objective: "Refresh prices on everything saved this month",
      status: "SUCCESS",
      startedAt: now - 5 * 60 * 60 * 1000,
      completedAt: now - 5 * 60 * 60 * 1000 + 8_900,
      costGBP: 0.028,
      finalOutput: "Updated 62 records",
      updatedAt: now,
    },
  ];
}

/**
 * One failed job with a shape worth drawing: a fast start, two quick tool calls,
 * then a second search that swallows three quarters of the run before failing.
 */
function observabilityRunDetailFixture() {
  const start = now - 40 * 60 * 1000;
  const at = (offsetMs: number) => start + offsetMs;
  const mkStep = (id: string, kind: string, status: string, offsetMs: number, input?: string) => ({
    _id: id,
    _creationTime: at(offsetMs),
    runId: "run_e2e_failed",
    agentId: "agent_e2e",
    companyId,
    stepIndex: Number(id.split("_")[1]),
    kind,
    status,
    input,
    startedAt: at(offsetMs),
    completedAt: at(offsetMs),
  });

  return {
    run: {
      _id: "run_e2e_failed",
      _creationTime: start,
      agentId: "agent_e2e",
      companyId,
      triggerType: "SCHEDULE",
      objective: "Find new three-bed listings in Bristol under £400k",
      status: "FAILED",
      error: "The property search timed out",
      startedAt: start,
      completedAt: at(31_400),
      costGBP: 0.021,
      updatedAt: at(31_400),
    },
    steps: [
      mkStep("step_1", "OBSERVE", "SUCCESS", 900),
      mkStep("step_2", "PLAN", "SUCCESS", 2_500),
      mkStep("step_3", "TOOL_CALL", "SUCCESS", 5_900, "property search"),
      mkStep("step_4", "TOOL_CALL", "SUCCESS", 6_300, "records save"),
      mkStep("step_5", "REPLAN", "SUCCESS", 7_500),
      mkStep("step_6", "TOOL_CALL", "FAILED", 31_400, "property search"),
    ],
    toolCalls: [],
    approvals: [],
    timeline: [],
    evalFixtureContext: { canCreateFromRun: true, activeCount: 0, archivedCount: 0, fixtures: [] },
    replayContext: { sourceRun: null, replayRuns: [], comparison: null, timelineDiff: [] },
  };
}

function observabilityRunLogFixtures() {
  const start = now - 40 * 60 * 1000;
  return [
    {
      _id: "log_e2e_1",
      _creationTime: start + 900,
      agentId: "agent_e2e",
      companyId,
      runId: "run_e2e_failed",
      interactionType: "LLM SYNTHESIS",
      promptContent: "Find new three-bed listings in Bristol under \u00a3400k",
      responseContent: "I will search Bristol for three-bed properties up to \u00a3400,000.",
      outcome: "SUCCESS",
      durationMs: 900,
      createdAt: start + 900,
    },
    {
      _id: "log_e2e_2",
      _creationTime: start + 5_900,
      agentId: "agent_e2e",
      companyId,
      runId: "run_e2e_failed",
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Find new three-bed listings in Bristol under \u00a3400k",
      responseContent: '{"functionCall": {"name": "property_search", "args": {"area": "Bristol", "bedrooms": 3, "maxPrice": 400000, "page": 1}}}',
      outcome: "SUCCESS",
      durationMs: 3_400,
      createdAt: start + 5_900,
    },
    {
      _id: "log_e2e_3",
      _creationTime: start + 31_400,
      agentId: "agent_e2e",
      companyId,
      runId: "run_e2e_failed",
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Find new three-bed listings in Bristol under \u00a3400k",
      responseContent: "The property search timed out after 24000ms",
      outcome: "FAILED",
      durationMs: 23_900,
      failureKey: "the property search timed out",
      createdAt: start + 31_400,
    },
  ];
}

function observabilityLogGroupsFixture() {
  const entries = observabilityRunLogFixtures();
  return {
    groups: [
      {
        runId: "run_e2e_failed",
        startedAt: entries[0].createdAt,
        lastAt: entries[entries.length - 1].createdAt,
        job: {
          objective: "Find new three-bed listings in Bristol under \u00a3400k",
          status: "FAILED",
          startedAt: now - 40 * 60 * 1000,
          completedAt: now - 40 * 60 * 1000 + 31_400,
          costGBP: 0.021,
          triggerType: "SCHEDULE",
        },
        entries,
      },
      {
        runId: "run_e2e_done",
        startedAt: now - 3 * 60 * 60 * 1000,
        lastAt: now - 3 * 60 * 60 * 1000 + 4_100,
        job: {
          objective: "Find new three-bed listings in Bath under \u00a3450k",
          status: "SUCCESS",
          startedAt: now - 3 * 60 * 60 * 1000,
          completedAt: now - 3 * 60 * 60 * 1000 + 4_100,
          costGBP: 0.013,
          triggerType: "SCHEDULE",
        },
        entries: [
          {
            _id: "log_e2e_done_1",
            _creationTime: now - 3 * 60 * 60 * 1000,
            agentId: "agent_e2e",
            companyId,
            runId: "run_e2e_done",
            interactionType: "LLM SYNTHESIS",
            promptContent: "Find new three-bed listings in Bath under \u00a3450k",
            responseContent: "Searching Bath for three-bed properties up to \u00a3450,000.",
            outcome: "SUCCESS",
            durationMs: 800,
            createdAt: now - 3 * 60 * 60 * 1000,
          },
          {
            _id: "log_e2e_done_2",
            _creationTime: now - 3 * 60 * 60 * 1000 + 4_100,
            agentId: "agent_e2e",
            companyId,
            runId: "run_e2e_done",
            interactionType: "TOOL DISPATCH: records_save",
            promptContent: "Find new three-bed listings in Bath under \u00a3450k",
            responseContent: '{"functionCall": {"name": "records_save", "args": {"count": 14}}}',
            outcome: "SUCCESS",
            durationMs: 400,
            createdAt: now - 3 * 60 * 60 * 1000 + 4_100,
          },
        ],
      },
    ],
    totalGroups: 2,
    totalPages: 1,
    failureCounts: { "the property search timed out": 42 },
    windowTruncated: false,
  };
}

const settings = {
  platformName: "Hakken E2E",
  brandColorHex: "#8b5cf6",
  headingFontFamily: "Inter",
  bodyFontFamily: "Inter",
  fontSizeBase: "100%",
  borderRadius: "12px",
};

const companyFixture = {
  _id: companyId,
  _creationTime: now,
  name: "E2E Company",
  description: "Deterministic company workspace for e2e coverage.",
  systemPrompt: "Keep responses tenant-safe for E2E Company.",
  createdAt: now,
};

const models = Array.from({ length: 18 }, (_, index) => ({
  _id: `model_e2e_${index + 1}`,
  _creationTime: now + index,
  modelId: index === 0 ? "e2e-primary-model" : `e2e-model-${index + 1}`,
  displayName: index === 0 ? "E2E Primary Model" : `E2E Model ${index + 1}`,
  isDefault: index === 0,
  isEnabled: index < 16,
  providerKey: "google",
  providerModelId: index === 0 ? "e2e-primary-model" : `e2e-model-${index + 1}`,
  lastSyncedAt: now,
  standardInputCostBelow200k: 0.000001,
  outputResponseCost: 0.000003,
}));

const modelProviders = [
  {
    _id: "provider_google",
    _creationTime: now,
    providerKey: "google",
    displayName: "Google Vertex AI",
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  },
];

const inviteTemplateFixture = {
  subject: "Join E2E Company on Hakken",
  headline: "Your workspace is ready",
  body: "Use this invitation to join the deterministic E2E workspace.",
  ctaText: "Join Workspace",
};

const modelDefaultUseCases = [
  "chat",
  "fast-chat",
  "reasoning",
  "agent",
  "workflow",
  "report",
  "router",
  "title",
  "transcription",
  "embedding",
];

const workflowId = "workflow_e2e";
const createdWorkflowId = "workflow_e2e_created";
const widgetId = "widget_e2e";


const rules = [
  {
    _id: "rule_e2e_global",
    _creationTime: now,
    name: "Global Safety Rule",
    trigger: "Every prompt",
    instruction: "Keep responses tenant-safe.",
    priority: "NORMAL",
    isActive: true,
    createdAt: now,
  },
];

/**
 * Three different questions, three different answers.
 *
 * One object used to stand in for all three. It matched none of them: the
 * distribution chart reads `calls` and got `value`, the token chart reads
 * `inputTokens` and `outputTokens` and got a single `tokens`, and none of the
 * three carried the `coverage` every analytics answer now returns. Those charts
 * drew nothing in every browser run and nobody could tell, because a blank
 * chart and an untested chart look identical.
 */
const analyticsCoverage = { complete: true, incomplete: [] as string[] };

const analyticsTopAgents = [
  { id: "agent_e2e", name: "E2E Assistant", avatar: "", cost: 4.2, interactions: 12 },
];
const analyticsTopCompanies = [
  { id: companyId, name: "E2E Company", logo: "", cost: 8.1, messages: 24 },
];
const analyticsModelDistribution = [
  { name: "E2E Primary Model", cost: 12.34, calls: 42 },
];
const analyticsProviderDistribution = [
  { providerKey: "google", cost: 12.34, calls: 42 },
];
const analyticsPlanDistribution = [
  { planId: "plan_pro_e2e", name: "Pro", companies: 2, mrr: 2400 },
];
const analyticsSystemIntegrity = { totalProvisionedUsers: 2, totalProvisionedCompanies: 2 };

const companyMetricsFixture = {
  coverage: analyticsCoverage,
  timeline: [
    { date: "2026-06-01", cost: 6.12, messages: 21, inputTokens: 6_000, outputTokens: 4_000, internalMessages: 9, externalMessages: 12 },
    { date: "2026-06-02", cost: 6.22, messages: 21, inputTokens: 6_000, outputTokens: 5_000, internalMessages: 8, externalMessages: 13 },
  ],
  aggregates: {
    aggregationType: "day",
    activeUsers: 4,
    mau: 4,
    mrr: 2400,
    knowledgeDocuments: 3,
    totalCostGBP: 12.34567,
    totalInputTokens: 12_000,
    totalMessages: 42,
    totalOutputTokens: 9_000,
    totalTokens: 21_000,
    costPerActiveUser: 3.0864,
    avgCostPerMessage: 0.2939,
  },
  topUsers: [
    { id: userId, name: "E2E User", image: "", email: "user.e2e@example.com", cost: 2.1, messages: 6 },
  ],
  topAgents: analyticsTopAgents,
  topCompanies: analyticsTopCompanies,
  modelDistribution: analyticsModelDistribution,
  providerDistribution: analyticsProviderDistribution,
};

const globalAnalyticsFixture = {
  coverage: analyticsCoverage,
  timeline: [
    { date: "2026-06-01", cost: 6.12, messages: 21, inputTokens: 6_000, outputTokens: 4_000 },
    { date: "2026-06-02", cost: 6.22, messages: 21, inputTokens: 6_000, outputTokens: 5_000 },
  ],
  aggregates: {
    aggregationType: "day",
    activeUsers: 4,
    mau: 4,
    totalCostGBP: 12.34567,
    totalInputTokens: 12_000,
    totalMessages: 42,
    totalOutputTokens: 9_000,
    totalTokens: 21_000,
    costPerActiveUser: 3.0864,
    avgCostPerMessage: 0.2939,
  },
  topCompanies: analyticsTopCompanies,
  // The platform leaderboard names each person's workspace; the company one
  // cannot, because everyone on it is already in the same workspace.
  topUsers: [
    { id: userId, name: "E2E User", image: "", email: "user.e2e@example.com", cost: 2.1, messages: 6, companyName: "E2E Company" },
  ],
  topAgents: analyticsTopAgents,
  modelDistribution: analyticsModelDistribution,
  providerDistribution: analyticsProviderDistribution,
  planDistribution: analyticsPlanDistribution,
  systemIntegrity: analyticsSystemIntegrity,
};

const globalInventoryFixture = {
  aggregates: { mrr: 2400 },
  planDistribution: analyticsPlanDistribution,
  systemIntegrity: analyticsSystemIntegrity,
};











function workflowFixture(id = workflowId, name = "E2E Workflow") {
  return {
    _id: id,
    _creationTime: now,
    companyId,
    name,
    description: "Route smoke workflow",
    triggerType: "MANUAL",
    isActive: true,
    nodes: JSON.stringify([
      {
        id: "trigger-node",
        type: "triggerNode",
        position: { x: 120, y: 120 },
        data: { label: "Manual Trigger", _triggerType: "MANUAL" },
      },
    ]),
    edges: "[]",
    createdAt: now,
    updatedAt: now,
  };
}

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

function getRole(): E2ERole | null {
  const role = getCookie("hakken_e2e_auth");
  if (role === "super-admin" || role === "company-admin" || role === "user" || role === "read-only" || role === "auditor") return role;
  return null;
}

function getCurrentUser() {
  const role = getRole();
  if (!role) return null;

  if (role === "super-admin") {
    return {
      _id: superAdminId,
      _creationTime: now,
      email: "super.e2e@example.com",
      name: "E2E Super Admin",
      role: "SUPER_ADMIN",
      createdAt: now,
    };
  }

  // Reaches the Governance section and nothing else.
  if (role === "auditor") {
    return {
      _id: superAdminId,
      _creationTime: now,
      email: "auditor.e2e@example.com",
      name: "E2E Auditor",
      role: "AUDITOR",
      createdAt: now,
    };
  }

  // Reaches the admin section like a super admin, and every write control on
  // it is removed by AccessLevelProvider.
  if (role === "read-only") {
    return {
      _id: superAdminId,
      _creationTime: now,
      email: "readonly.e2e@example.com",
      name: "E2E Read Only",
      role: "READ_ONLY",
      createdAt: now,
    };
  }

  return {
    _id: userId,
    _creationTime: now,
    companyId,
    email: role === "company-admin" ? "admin.e2e@example.com" : "user.e2e@example.com",
    name: role === "company-admin" ? "E2E Company Admin" : "E2E User",
    phone: "+1555010000",
    role: role === "company-admin" ? "ADMIN" : "USER",
    createdAt: now,
  };
}

function pageData<T>(data: T[], page = 1, pageSize = 15) {
  const start = (page - 1) * pageSize;
  return {
    data: data.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount: data.length,
    totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
  };
}

/**
 * The thread's messages, from the browser store that stands in for the database.
 *
 * **Returns `undefined` on the server, not `[]`.** The two mean different things
 * to every screen that reads a query: `undefined` is "still loading" and `[]` is
 * "there is nothing here". This lived on the wrong side of that line and it made
 * the chat smoke test flaky.
 *
 * The store is `localStorage`, which the server cannot see. Returning `[]` there
 * made the server render "Awaiting Instructions...", while the browser rendered
 * the actual conversation — a hydration mismatch React resolves by *sometimes*
 * keeping its own markup and sometimes keeping the server's. When it kept the
 * server's, the message a person had just typed never appeared, the test timed
 * out, and it looked like the chat was broken. Locally it usually passed; on CI,
 * slower and single-worker, it did not.
 *
 * Saying "still loading" is both honest and identical on both sides: the spinner
 * renders, hydration matches, and the real answer arrives once there is a window
 * to read it from.
 */
function readThreadMessages(threadId: string) {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(`hakken:e2e:thread:${threadId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeThreadMessages(threadId: string, content: string) {
  if (typeof window === "undefined") return;
  const messages = [
    {
      _id: `${threadId}_user`,
      _creationTime: now,
      content,
      createdAt: now,
      role: "user",
      threadId,
    },
    {
      _id: `${threadId}_assistant`,
      _creationTime: now + 1,
      content: "E2E assistant response ready.",
      createdAt: now + 1,
      role: "assistant",
      threadId,
    },
  ];
  window.localStorage.setItem(`hakken:e2e:thread:${threadId}`, JSON.stringify(messages));
}

type E2EFeedbackEntry = {
  rating: "POSITIVE" | "NEGATIVE";
  labels: Array<"GREAT_ANSWER" | "INCORRECT" | "MISSED_CONTEXT" | "UNHELPFUL">;
  hasCorrection: boolean;
};

const FEEDBACK_STORAGE_KEY = "hakken:e2e:feedback";

/** As above: absent on the server means "not loaded", not "nothing recorded". */
function readFeedbackStore(): Record<string, E2EFeedbackEntry> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, E2EFeedbackEntry>;
  } catch {
    return {};
  }
}

function writeFeedbackEntry(messageId: string, entry: E2EFeedbackEntry) {
  if (typeof window === "undefined") return;
  const store = readFeedbackStore();
  store[messageId] = entry;
  window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(store));
}

function functionPath(functionReference: FunctionReference) {
  try {
    return getFunctionName(functionReference);
  } catch {
    return "";
  }
}

function subscribeToHydration(onStoreChange: () => void) {
  queueMicrotask(onStoreChange);
  return () => {};
}

function getHydratedClientSnapshot() {
  return true;
}

function getHydratedServerSnapshot() {
  return false;
}

function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydratedClientSnapshot,
    getHydratedServerSnapshot,
  );
}

/**
 * The real client pushes a mutation's result to every subscribed query, so a
 * screen redraws where it stands. The mock's queries are plain functions, so
 * until now only a navigation could show a write — fine for sending a message,
 * which navigates, and wrong for rating an answer, which does not.
 */
let mockRevision = 0;
const revisionListeners = new Set<() => void>();

function subscribeToRevision(onStoreChange: () => void) {
  revisionListeners.add(onStoreChange);
  return () => {
    revisionListeners.delete(onStoreChange);
  };
}

function getRevisionSnapshot() {
  return mockRevision;
}

function getRevisionServerSnapshot() {
  return 0;
}

function bumpRevision() {
  mockRevision += 1;
  for (const listener of revisionListeners) listener();
}

function useMockRevision() {
  return useSyncExternalStore(subscribeToRevision, getRevisionSnapshot, getRevisionServerSnapshot);
}

export class ConvexReactClient {
  constructor(url: string) {
    void url;
  }
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ConvexProviderWithAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useQuery(functionReference: FunctionReference, args?: unknown): unknown {
  const path = functionPath(functionReference);
  const queryArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const hasHydrated = useHasHydrated();
  useMockRevision();

  if (path === "users:getMe") return hasHydrated ? getCurrentUser() : undefined;
  if (path === "billing:getStatus") return !hasHydrated ? undefined : getCurrentUser()?.role === "ADMIN" ? customerBillingFixture : null;
  if (path === "billingAdmin:getSettings") return billingSettingsFixture;
  if (path === "billingAdmin:getCompany") return companyBillingFixture;
  if (path === "billingAdmin:getPlan") return { name: "Pro", active: true };
  if (path === "settings:get") return settings;
  // The admin settings forms read the wider row through their own door. Without
  // this they fell to the catch-all below, which builds a fresh array on every
  // render — and a form that adopts its server data during render then never
  // settles, so the screen re-rendered until React gave up. Production was
  // unaffected (real Convex holds the reference stable) but this mock is the
  // mode the admin screens are looked at in, so it broke exactly where someone
  // would go to check them.
  if (path === "settings:getForAdmin") return settings;
  if (path === "system:getAnalyticsId") return null;
  if (path === "aiModels:getModels") return models;
  if (path === "aiModels:getActiveModels") {
    const useCase = typeof queryArgs.useCase === "string" ? queryArgs.useCase : undefined;
    return models.filter((model) => {
      if (!model.isEnabled) return false;
      if (!useCase || !("supportedUseCases" in model) || !Array.isArray(model.supportedUseCases)) return true;
      return model.supportedUseCases.includes(useCase);
    });
  }
  if (path === "aiModels:getProviders") return modelProviders;
  if (path === "aiRules:getOffsetPaginatedRules") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const filtered = searchTerm ? rules.filter((rule) => rule.name.toLowerCase().includes(searchTerm)) : rules;
    const paged = pageData(filtered, Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15));
    return { data: paged.data, totalCount: paged.totalCount, totalPages: paged.totalPages };
  }
  if (path === "invites:getActiveTemplate") return inviteTemplateFixture;
  if (path === "invites:getInvitesByCompany") return [];
  if (path === "aiTools:getConnectorMarketplace") {
    return [
      {
        key: "hakken-knowledge",
        name: "Knowledge search",
        description: "Lets an agent search the documents you have uploaded, and quote from them.",
        category: "KNOWLEDGE",
        availability: "AVAILABLE",
        executableToolCount: 1,
        totalToolCount: 1,
        authMode: "NONE",
        tenantAvailability: "GLOBAL",
        requiredScopes: ["knowledge:read"],
        requiredSecretRefs: [],
        toolDefinitions: [],
        // An installed connector is the whole stored row, not a summary of it.
        installation: {
          key: "hakken-knowledge",
          name: "Knowledge search",
          description: "Lets an agent search the documents you have uploaded, and quote from them.",
          category: "KNOWLEDGE",
          authMode: "NONE",
          tenantAvailability: "GLOBAL",
          installStatus: "INSTALLED",
          testStatus: "SUCCESS",
          isActive: true,
          createdAt: now,
          updatedAt: now,
          _id: "connector_e2e",
          _creationTime: now,
        },
      },
      {
        key: "http-rest",
        name: "Call an API",
        description: "Lets an agent call another system over the web. You set the address and the credentials; the agent only chooses what to ask for.",
        category: "HTTP",
        availability: "AVAILABLE",
        executableToolCount: 1,
        totalToolCount: 1,
        authMode: "SECRET_REF",
        tenantAvailability: "GLOBAL",
        requiredScopes: ["http:request"],
        requiredSecretRefs: ["base_url", "auth_header"],
        toolDefinitions: [],
        installation: null,
      },
    ];
  }
  if (path === "aiTools:getConnectorInstallDetails") {
    return {
      connector: {
        _id: "connector_e2e",
        _creationTime: now,
        key: "hakken-knowledge",
        name: "Hakken Knowledge",
        description: "Search approved tenant knowledge through the governed RAG path.",
        category: "KNOWLEDGE",
        authMode: "NONE",
        configuredSecretRefs: [],
        enabledToolMappings: ["knowledge.search"],
        isActive: true,
        tenantAvailability: "GLOBAL",
        installStatus: "INSTALLED",
        testStatus: "SUCCESS",
        createdAt: now,
        updatedAt: now,
      },
      definition: {
        key: "hakken-knowledge",
        name: "Knowledge search",
        description: "Lets an agent search the documents you have uploaded, and quote from them.",
        category: "KNOWLEDGE",
        authMode: "NONE",
        tenantAvailability: "GLOBAL",
        requiredScopes: ["knowledge:read"],
        requiredSecretRefs: [],
        toolDefinitions: [
          {
            name: "Knowledge Search",
            description: "Searches your approved documents and returns short quotes with their source.",
            handlerMapping: "knowledge.search",
            modelName: "knowledge_search",
            requiredRole: "ADMIN",
            sideEffectLevel: "READ",
            confirmationRequired: false,
          },
        ],
      },
      company: null,
      canManageTenantScope: true,
      tools: [{
        _id: "tool_e2e",
        _creationTime: now,
        name: "Knowledge Search",
        description: "Searches your approved documents.",
        handlerMapping: "knowledge.search",
        requiredRole: "ADMIN",
        isActive: true,
        createdAt: now,
      }],
      secretRefs: [],
      oauthConnections: [],
      oauthConnection: null,
      testLogs: [
        {
          _id: "log_e2e",
          _creationTime: now,
          connectorId: "connector_e2e",
          key: "hakken-knowledge",
          status: "SUCCESS",
          message: "Connection test passed.",
          testedAt: now - 60000,
        },
      ],
    };
  }
  if (path === "companyEngagement:getCompanyEngagement") {
    const day = (offset: number) => new Date(now - offset * 86400000).toISOString().slice(0, 10);
    const daily = Array.from({ length: 14 }, (_, index) => {
      const offset = 13 - index;
      const signedIn = offset % 3 === 0 ? 2 : offset % 5 === 0 ? 1 : 0;
      return {
        day: day(offset),
        didNotSignIn: 4 - signedIn,
        oneSession: signedIn > 0 ? 1 : 0,
        twoSessions: signedIn > 1 ? 1 : 0,
        threeSessions: offset === 3 ? 1 : 0,
        fourSessions: 0,
        fivePlusSessions: offset === 6 ? 1 : 0,
        questions: offset % 2 === 0 ? offset : 0,
      };
    });
    return {
      daysBack: 14,
      people: { total: 4, active: 3, quiet: 1 },
      questions: { asked: 42, byPeople: 3 },
      signIns: { total: 11, onDays: 6 },
      invitations: { pending: 1, accepted: 3, revoked: 0 },
      daily,
      everyone: [
        { userId: "u_never", name: "Priya Shah", email: "priya@example.com", isAdmin: false, lastSeenAt: undefined, signIns: 0, questions: 0, agentRuns: 0 },
        { userId: "u_stale", name: "Tom Reid", email: "tom@example.com", isAdmin: false, lastSeenAt: now - 21 * 86400000, signIns: 1, questions: 2, agentRuns: 0 },
        { userId: "u_ok", name: "Sam Okafor", email: "sam@example.com", isAdmin: false, lastSeenAt: now - 2 * 86400000, signIns: 4, questions: 12, agentRuns: 1 },
        { userId: "u_admin", name: "Dana Lowe", email: "dana@example.com", isAdmin: true, lastSeenAt: now - 3600000, signIns: 6, questions: 28, agentRuns: 5 },
      ],
    };
  }
  if (path === "platformOverview:getPlatformOverview") {
    const day = (offset: number) => new Date(now - offset * 86400000).toISOString().slice(0, 10);
    const daily = Array.from({ length: 30 }, (_, index) => {
      const offset = 29 - index;
      const questions = offset < 12 ? Math.max(0, 9 - offset) : 0;
      return { day: day(offset), questions, aiCalls: questions * 2 + (offset % 4 === 0 ? 3 : 0), spendGBP: questions * 0.03 };
    });
    const signInBands = Array.from({ length: 30 }, (_, index) => {
      const offset = 29 - index;
      const one = offset % 3 === 0 ? 2 : 1;
      const two = offset % 5 === 0 ? 1 : 0;
      return {
        day: day(offset),
        didNotSignIn: Math.max(0, 12 - one - two),
        oneSession: one,
        twoSessions: two,
        threeSessions: offset === 4 ? 1 : 0,
        fourSessions: 0,
        fivePlusSessions: offset === 9 ? 1 : 0,
      };
    });
    return {
      windowDays: 30,
      // The screen reads this before anything else and renders nothing without
      // it. Complete, because the fixture is a small deterministic workspace
      // that no read here could truncate.
      coverage: { complete: true, incomplete: [] },
      clients: { total: 4, healthy: 2, needsAttention: 1, unused: 1 },
      money: { projectedMrrGBP: 400, aiSpendGBP: 12.54, spendAsPercentOfRevenue: 3.1 },
      seats: { total: 12, active: 4, utilisation: 33 },
      todo: { pendingInvitations: 2, companiesWithNoPlan: 1 },
      planDistribution: [
        { name: "Studio", companies: 2 },
        { name: "Trial", companies: 1 },
        { name: "No plan", companies: 1 },
      ],
      daily,
      signInBands,
      portfolio: [
        { companyId: "c_attention", name: "Ronins Website", planName: "Studio", mrrGBP: 200, people: 3, activeRecently: 1, quiet: 2, state: "NEEDS_ATTENTION" },
        { companyId: "c_unused", name: "New Client", planName: undefined, mrrGBP: 0, people: 0, activeRecently: 0, quiet: 0, state: "UNUSED" },
        { companyId: "c_healthy", name: "Happy Client", planName: "Studio", mrrGBP: 200, people: 2, activeRecently: 2, quiet: 0, state: "HEALTHY" },
        { companyId: "c_trial", name: "Trialling Co", planName: "Trial", mrrGBP: 0, people: 1, activeRecently: 1, quiet: 0, state: "HEALTHY" },
      ],
    };
  }
  if (path === "aiTools:getTools") {
    return [
      {
        _id: "tool_e2e",
        _creationTime: now,
        name: "Research Connector",
        description: "Property search connector",
        handlerMapping: "research.search",
        requiredRole: "ADMIN",
        inputSchema: '{"type":"object","properties":{}}',
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        createdAt: now,
      },
    ];
  }
  if (path === "companies:getCompanies") {
    return [{ ...companyFixture, userCount: 2 }];
  }
  if (path === "companies:getCompanyById") {
    return queryArgs.id === companyId ? companyFixture : null;
  }
  if (path === "companies:getCompanyOptions") {
    return [{ _id: companyId, name: companyFixture.name }];
  }
  if (path === "aiModels:getCompanyModelDefaults") {
    const primaryModel = models[0];
    // Every row used to come back following the platform default, so no e2e path
    // ever reached the two states that matter on this screen: a company with its
    // own model, and one left pointing at a model that has since been switched
    // off. The second is what the screen must name rather than silently hide.
    const overriddenModel = models[1];
    const disabledModel = models.find((model) => !model.isEnabled)!;
    const companyOverrides: Record<string, typeof primaryModel> = {
      chat: overriddenModel,
      report: disabledModel,
    };

    return {
      companyId,
      useCases: modelDefaultUseCases,
      defaults: modelDefaultUseCases.map((useCase) => ({
        useCase,
        companyDefault: companyOverrides[useCase]
          ? {
              _id: `company_default_${useCase}`,
              updatedAt: now,
              modelId: companyOverrides[useCase].modelId,
              providerKey: companyOverrides[useCase].providerKey,
              model: {
                modelId: companyOverrides[useCase].modelId,
                providerKey: companyOverrides[useCase].providerKey,
                providerModelId: companyOverrides[useCase].providerModelId,
                displayName: companyOverrides[useCase].displayName,
                isEnabled: companyOverrides[useCase].isEnabled,
              },
            }
          : null,
        globalDefault: {
          _id: `default_${useCase}`,
          modelId: primaryModel.modelId,
          providerKey: primaryModel.providerKey,
          fallbackModelId: undefined,
          updatedAt: now,
          model: {
            modelId: primaryModel.modelId,
            providerKey: primaryModel.providerKey,
            providerModelId: primaryModel.providerModelId,
            displayName: primaryModel.displayName,
            isEnabled: primaryModel.isEnabled,
          },
        },
      })),
      modelPickerOptions: models.map((model) => ({
        modelId: model.modelId,
        displayName: model.displayName,
        providerKey: model.providerKey,
        supportedUseCases: modelDefaultUseCases,
      })),
      providerNames: modelProviders.map((provider) => ({
        providerKey: provider.providerKey,
        displayName: provider.displayName,
      })),
    };
  }
  if (path === "widgets:getWidgetsByCompany") {
    return [
      {
        _id: widgetId,
        _creationTime: now,
        companyId,
        name: "E2E Website Bot",
        isActive: true,
        isGlobal: false,
        allowedDomains: ["example.com"],
        themeGreeting: "Welcome to the E2E widget.",
        themePrimaryColor: "#2563eb",
        themeLogoUrl: "",
        themePlaceholder: "Ask the E2E assistant...",
        enableSounds: false,
        showPopupPreview: false,
        requireName: false,
        requireEmail: true,
        enableGreeting: true,
        conversationStarters: ["What can you help with?"],
        createdAt: now,
      },
    ];
  }
  if (path === "widgets:getPrimaryWidgetByCompany" || path === "widgets:getPrimaryGlobalWidget") {
    return {
      _id: widgetId,
      _creationTime: now,
      companyId: path === "widgets:getPrimaryGlobalWidget" ? undefined : companyId,
      name: path === "widgets:getPrimaryGlobalWidget" ? "E2E Global Widget" : "E2E Website Bot",
      isActive: true,
      isGlobal: path === "widgets:getPrimaryGlobalWidget",
      allowedDomains: ["example.com"],
      themeGreeting: "Welcome to the E2E widget.",
      themePrimaryColor: "#2563eb",
      themeLogoUrl: "",
      themePlaceholder: "Ask the E2E assistant...",
      enableSounds: false,
      showPopupPreview: false,
      requireName: false,
      requireEmail: true,
      enableGreeting: true,
      conversationStarters: ["What can you help with?"],
      createdAt: now,
    };
  }
  if (path === "plans:getActivePlans" || path === "plans:getPlans") {
    return [{ _id: "plan_e2e", _creationTime: now, name: "Pro", description: "E2E plan", priceGBP: 99, messageLimit: 1000, isActive: true, createdAt: now }];
  }
  if (path === "plans:getMyCompanyPlanStatus") {
    return { planName: "Pro", messagesUsed: 42, messageLimit: 1000 };
  }
  if (path === "workflows:list") {
    return [workflowFixture()];
  }
  if (path === "workflows:get") {
    const id = String(queryArgs.id || workflowId);
    return workflowFixture(id, id === createdWorkflowId ? "Phase 6 Workflow" : "E2E Workflow");
  }
  if (path === "scheduler:getSchedules") {
    return [
      {
        _id: "schedule_e2e",
        _creationTime: now,
        name: "E2E Morning Schedule",
        workflowId,
        workflowName: "E2E Workflow",
        targetName: "E2E Workflow",
        intervalStr: JSON.stringify({
          version: 2,
          kind: "recurring",
          cadence: "daily",
          timeLocal: "09:00",
          timezone: "UTC",
        }),
        isActive: true,
        createdAt: now,
      },
    ];
  }
  if (path === "analytics:getCompanyMetrics") return companyMetricsFixture;
  if (path === "analytics:getGlobalAnalytics") return globalAnalyticsFixture;
  if (path === "analytics:getGlobalInventoryMetrics") return globalInventoryFixture;






  // Gated on hydration, like `users:getMe` above. These read `localStorage`,
  // which the server cannot see, so answering before the browser has taken over
  // means the server and the first client render disagree — and React resolves
  // that by regenerating the tree, sometimes keeping the server's markup. When
  // it did, a message a person had just typed never appeared. That is what made
  // the chat smoke test fail on CI and pass locally.
  if (path === "chat:getMessages") {
    return hasHydrated ? readThreadMessages(String(queryArgs.threadId || "thread_e2e_seed")) : undefined;
  }
  if (path === "chatAdmin:getAdminThreadMessages") {
    return hasHydrated ? readThreadMessages(String(queryArgs.threadId || "thread_e2e_seed")) : undefined;
  }
  if (path === "knowledge:getThreadDocuments") return [];
  // The Activity screen reads this before it can render anything. The generic
  // empty-array fall-through gave it no `totals`, so the whole screen crashed
  // rather than showing an agent with no checks yet.
  if (path === "agentEvalFixtures:getSmokeEvalHistory") {
    return {
      entries: [],
      totals: { total: 0, passed: 0, setupPassed: 0, failed: 0, active: 0, modelGraded: 0 },
    };
  }
  // The Activity table pages by cursor and carries its own row markers, so the
  // fixture answers with one page rather than a bare list of runs.
  if (path === "agentRuns:getPageForAgent") {
    return {
      // This door narrows on the way out — the run list shows what a run did,
      // not which agent or company row it hangs off. Spreading the whole
      // fixture here sent four fields the real answer does not carry.
      page: observabilityRunFixtures().map(({ _creationTime, agentId, companyId, updatedAt, ...run }, index) => ({
        ...run,
        isRehearsal: false,
        markers: {
          feedback: index === 1 ? { rating: "NEGATIVE", labels: ["TOO_SLOW"], comment: "too slow" } : null,
          reflected: index === 1,
          memoryCandidateIds: [],
          usedAsCheck: index === 3,
          suggestionIds: [],
        },
      })),
      isDone: true,
      continueCursor: "",
    };
  }
  if (path === "agentLogs:getJobGroups") return observabilityLogGroupsFixture();
  if (path === "agentRuns:getRunDetail") return observabilityRunDetailFixture();
  if (path === "agentLogs:getForRun") return observabilityRunLogFixtures();
  if (path === "agentRuns:getAnalyticsForAgent") {
    return observabilityAnalyticsFixture(Number(queryArgs.lookbackDays ?? 7));
  }
  if (path === "agents:get") {
    return {
      _id: "agent_e2e",
      _creationTime: now,
      name: "E2E Assistant",
      description: "Deterministic agent used to inspect the agent detail screens",
      modelId: "e2e-primary-model",
      isActive: true,
      thinkingMode: false,
      createdAt: now,
      updatedAt: now,
      populatedRules: [],
      populatedKnowledge: [],
    };
  }
  // The dashboard reads every field off this object, so the generic empty-array
  // fall-through below crashes the screen rather than rendering it empty.
  if (path === "agentTransactions:getStatsForAgent") {
    return {
      totalGenerations: 0,
      totalTokensIngested: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalOpexCost: 0,
    };
  }
  // Without this the controls read `enabled` off the catch-all empty array and
  // render nothing at all, so the rating journey had no buttons to click.
  if (path === "messageFeedback:getMineForThread") {
    const store = readFeedbackStore();
    const threadMessages = readThreadMessages(String(queryArgs.threadId ?? "")) as Array<{ _id: string }>;
    return {
      enabled: true,
      ratings: threadMessages
        .filter((message) => Boolean(store[message._id]))
        .map((message) => ({ messageId: message._id, ...store[message._id] })),
    };
  }

  // The analytics-health screen dereferences nested report fields, so the
  // catch-all empty array below (truthy) crashed it rather than rendering the
  // loading state. A healthy, empty report keeps the screen inspectable.
  if (path === "systemHealth:getAnalyticsDataHealthForAdmin") {
    return {
      daysBack: 7,
      checkedDates: ["2026-08-15", "2026-08-21"],
      snapshotCoverage: { missingGlobalDates: [], duplicateSnapshotGroups: [], totalSnapshots: 0, dates: [] },
      messageDimensions: { missingDimensions: 0, mismatched: 0, missingThreads: 0, scanned: 0, examples: [], windowStartDate: "2026-08-15" },
      liveToday: { date: "2026-08-21", assistantMessages: 0, agentTransactions: 0 },
    };
  }

  if (path.endsWith(":get") || path.endsWith(":list") || path.includes("getAll") || path.includes("getPending")) return [];

  return [];
}

export function useMutation(functionReference: FunctionReference) {
  const path = functionPath(functionReference);
  return async (args?: Record<string, unknown>) => {
    if (path === "chat:createThread") {
      const threadId = `thread_e2e_${Date.now()}`;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`hakken:e2e:thread:${threadId}`, JSON.stringify([]));
      }
      return threadId;
    }
    if (path === "workflows:createWorkflow") return createdWorkflowId;
    if (path === "chat:sendMessage") {
      writeThreadMessages(String(args?.threadId || "thread_e2e_seed"), String(args?.content || ""));
      return true;
    }
    if (path === "messageFeedback:upsertForMessage") {
      const messageId = String(args?.messageId ?? "");
      if (!messageId) return true;
      writeFeedbackEntry(messageId, {
        rating: args?.rating === "NEGATIVE" ? "NEGATIVE" : "POSITIVE",
        labels: Array.isArray(args?.labels) ? (args.labels as E2EFeedbackEntry["labels"]) : [],
        hasCorrection: typeof args?.comment === "string" && args.comment.trim().length > 0,
      });
      bumpRevision();
      return true;
    }
    if (path.includes("generateUploadUrl")) return "data:application/json,{}";
    return args?.id || args?._id || true;
  };
}

export function useAction(functionReference: FunctionReference) {
  const path = functionPath(functionReference);
  if (billingActionFixtures[path]) return billingActionFixtures[path];
  return async () => true;
}

/**
 * The imperative client handle, for screens that query outside the hook
 * cycle (the wiki's vault export). Fixture mode has no real client, so a
 * one-off query answers empty — enough for layout, never for data.
 */
export function useConvex() {
  return {
    query: async (functionReference: FunctionReference, args?: unknown) => {
      void functionReference;
      void args;
      return [];
    },
  };
}

export function usePaginatedQuery(functionReference: FunctionReference, args?: unknown) {
  const path = functionPath(functionReference);
  const queryArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  if (path === "billingAdmin:listCompanies") {
    const matches = (!queryArgs.status || queryArgs.status === companyBillingFixture.status)
      && (!queryArgs.searchTerm || companyBillingFixture.companyName.toLowerCase().includes(String(queryArgs.searchTerm).toLowerCase()));
    return { results: matches ? [companyBillingFixture] : [], status: "Exhausted", loadMore: async () => {}, isLoading: false };
  }

  // The catalogue pages by cursor through `getPaginatedModels`. It used to be
  // an offset query called `getOffsetPaginatedModels`, and when it was replaced
  // this stand-in kept the old name — so the screen fell to the empty
  // catch-all below and every browser test looked at a catalogue of nothing.
  if (path === "aiModels:getPaginatedModels") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const statusFilter = queryArgs.statusFilter;
    const providerFilter = String(queryArgs.providerFilter || "all");
    return {
      results: models.filter((model) => {
        const matchesSearch = !searchTerm
          || model.displayName.toLowerCase().includes(searchTerm)
          || model.modelId.includes(searchTerm);
        const matchesStatus =
          statusFilter === "active" ? model.isEnabled : statusFilter === "inactive" ? !model.isEnabled : true;
        const matchesProvider = providerFilter === "all" || model.providerKey === providerFilter;
        return matchesSearch && matchesStatus && matchesProvider;
      }),
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }

  if (path === "agentRuns:getForAgent") {
    return {
      results: observabilityRunFixtures(),
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }

  // The sidebar pages its conversation list now.
  if (path === "chat:getThreads") {
    return {
      results: [{ _id: "thread_e2e_seed", _creationTime: now, title: "E2E Conversation", updatedAt: now }],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }


  if (path === "scheduler:getWorkflowExecutions") {
    return {
      results: [
        {
          _id: "execution_e2e_halted",
          _creationTime: now,
          workflowId,
          workflowName: "E2E Workflow",
          startedByName: "E2E Super Admin",
          triggerType: "MANUAL",
          status: "RUNNING",
          startedAt: now,
          // So the "needs a decision" state is reachable in the browser journey
          // rather than only in unit tests.
          awaitingApprovalNodeId: "approval",
        },
        {
          _id: "execution_e2e",
          _creationTime: now,
          workflowId,
          workflowName: "E2E Workflow",
          startedByName: "E2E Super Admin",
          triggerType: "MANUAL",
          status: "SUCCESS",
          state: "Completed deterministic browser journey",
          startedAt: now,
          completedAt: now + 1000,
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }

  if (path === "users:getPaginatedUsers") {
    return {
      results: [
        { _id: superAdminId, _creationTime: now, name: "E2E Super Admin", email: "super.e2e@example.com", role: "SUPER_ADMIN", createdAt: now, companyName: null },
        { _id: userId, _creationTime: now, name: "E2E User", email: "user.e2e@example.com", role: "USER", companyId, createdAt: now, companyName: "E2E Company" },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "companies:getPaginatedCompanies") {
    return {
      results: [{ ...companyFixture, userCount: 2, userCountIsCapped: false }],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "agents:getPaginatedAgents") {
    return {
      results: [{ _id: "agent_e2e", _creationTime: now, name: "E2E Assistant", modelId: "e2e-primary-model", isActive: true, createdAt: now, updatedAt: now, thinkingMode: false }],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "workflows:getPaginatedWorkflows") {
    return {
      results: [workflowFixture()],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }

  if (path === "aiTools:getPaginatedTools") {
    return {
      results: [
        {
          _id: "tool_e2e",
          _creationTime: now,
          name: "Research Connector",
          description: "Property search connector",
          handlerMapping: "research.search",
          requiredRole: "ADMIN",
          inputSchema: '{"type":"object","properties":{}}',
          sideEffectLevel: "READ",
          confirmationRequired: false,
          isActive: true,
          version: 1,
          updatedAt: now,
          createdAt: now,
          createdBy: superAdminId,
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "plans:getPaginatedPlans") {
    return {
      results: [
        {
          _id: "plan_e2e",
          _creationTime: now,
          name: "Pro",
          description: "E2E plan",
          priceGBP: 99,
          messageLimit: 1000,
          isActive: true,
          createdAt: now,
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "chatAdmin:getPaginatedThreads" || path === "chatAdmin:getPaginatedCompanyThreads") {
    return {
      results: [
        {
          _id: "thread_e2e_seed",
          _creationTime: now,
          companyId,
          title: "E2E Conversation",
          createdAt: now,
          updatedAt: now,
          user: { name: "E2E User", email: "user.e2e@example.com", image: "https://api.dicebear.com/7.x/notionists/svg" },
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }

  return {
    results: pageData([], Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15)).data,
    status: "Exhausted",
    loadMore: async () => {},
    isLoading: false,
  };
}
