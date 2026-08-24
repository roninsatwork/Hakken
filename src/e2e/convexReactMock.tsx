"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { getFunctionName } from "convex/server";

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
      { handlerMapping: "rightmove.search", calls: 1180, successes: 1038, failures: 142, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0 },
      { handlerMapping: "records.save", calls: 964, successes: 964, failures: 0, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0 },
      { handlerMapping: "email.send", calls: 212, successes: 210, failures: 0, approvalsRequired: 3, denied: 0, cancelled: 0, notImplemented: 2 },
      { handlerMapping: "postcode.lookup", calls: 148, successes: 148, failures: 0, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0 },
    ],
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
  platformName: "Sonae E2E",
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
  updatedAt: now,
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
  inputTokenCostGBP: 0.000001,
  outputTokenCostGBP: 0.000003,
}));

const modelProviders = [
  {
    _id: "provider_google",
    _creationTime: now,
    providerKey: "google",
    displayName: "Google Vertex AI",
    isEnabled: true,
  },
];

const inviteTemplateFixture = {
  _id: "invite_template_e2e",
  _creationTime: now,
  subject: "Join E2E Company on Sonae",
  headline: "Your workspace is ready",
  body: "Use this invitation to join the deterministic E2E workspace.",
  ctaText: "Join Workspace",
  isActive: true,
  createdAt: now,
  updatedAt: now,
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
const movementId = "movement_e2e_roll_down";

const rules = [
  {
    _id: "rule_e2e_global",
    _creationTime: now,
    name: "Global Safety Rule",
    trigger: "Every prompt",
    content: "Keep responses tenant-safe.",
    priority: 10,
    isActive: true,
    scope: "GLOBAL",
    createdAt: now,
  },
];

const analytics = {
  aggregates: {
    aggregationType: "day",
    activeUsers: 4,
    mau: 4,
    mrr: 2400,
    totalCostGBP: 12.34567,
    totalInputTokens: 12000,
    totalMessages: 42,
    totalOutputTokens: 9000,
    totalTokens: 21000,
  },
  modelDistribution: [{ name: "E2E Primary Model", value: 42, cost: 12.34 }],
  planDistribution: [{ planId: "plan_pro_e2e", name: "Pro", companies: 2, mrr: 2400 }],
  systemIntegrity: { totalProvisionedCompanies: 2 },
  timeline: [
    { date: "2026-06-01", cost: 6.12, messages: 21, tokens: 10000 },
    { date: "2026-06-02", cost: 6.22, messages: 21, tokens: 11000 },
  ],
  topAgents: [{ id: "agent_e2e", name: "E2E Assistant", cost: 4.2, messages: 12 }],
  topCompanies: [{ id: companyId, name: "E2E Company", cost: 8.1, messages: 24 }],
  topUsers: [{ id: userId, name: "E2E User", email: "user.e2e@example.com", cost: 2.1, messages: 6 }],
};

const makeMovementPose = () => {
  const pose = Array.from({ length: 33 }, (_, landmarkIndex) => ({
    x: 0.45 + landmarkIndex * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.92,
  }));

  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.92 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.92 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.92 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.92 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.92 };
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.92 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.92 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.92 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.92 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.92 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.92 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.9 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.9 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.88 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.88 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.88 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.88 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.88 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.88 };

  return pose;
};

const movementFrames = [
  makeMovementPose(),
  (() => {
    const pose = makeMovementPose();
    pose[23] = { ...pose[23]!, y: 0.82 };
    pose[24] = { ...pose[24]!, y: 0.82 };
    pose[25] = { ...pose[25]!, y: 0.74 };
    pose[26] = { ...pose[26]!, y: 0.74 };
    return pose;
  })(),
  (() => {
    const pose = makeMovementPose();
    pose[25] = { ...pose[25]!, y: 0.54 };
    pose[27] = { ...pose[27]!, y: 0.68 };
    pose[29] = { ...pose[29]!, y: 0.7 };
    pose[31] = { ...pose[31]!, y: 0.7 };
    return pose;
  })(),
  (() => {
    const pose = makeMovementPose();
    pose[26] = { ...pose[26]!, y: 0.54 };
    pose[28] = { ...pose[28]!, y: 0.68 };
    pose[30] = { ...pose[30]!, y: 0.7 };
    pose[32] = { ...pose[32]!, y: 0.7 };
    return pose;
  })(),
].map((landmarks, frameIndex) => ({
  timestamp: frameIndex * 33,
  landmarks,
  worldLandmarks: landmarks.map((landmark) => ({ ...landmark })),
}));

const movementDebugSamples = movementFrames.map((frame, frameIndex) => {
  const squatDepth = frameIndex === 1 ? 0.38 : 0;
  const leftKneeLift = frameIndex === 2 ? 0.42 : 0;
  const rightKneeLift = frameIndex === 3 ? 0.42 : 0;

  return {
    bodyConfidence: {
      hips: 0.95,
      leftFoot: 0.9,
      leftKnee: 0.92,
      rightFoot: 0.9,
      rightKnee: 0.92,
      torso: 0.96,
    },
    camera: {
      aspectRatio: 1.333,
      frameRate: 30,
      trackHeight: 960,
      trackWidth: 1280,
      videoHeight: 960,
      videoWidth: 1280,
    },
    capturedAt: now + frameIndex * 500,
    fallbacks: {
      lowerBody: squatDepth > 0 ? "squat player-retarget" : "neutral player-retarget",
      owners: "head player; torso player; lower player-retarget; feet player-retarget",
    },
    health: {
      primaryAction: squatDepth > 0 ? "squat" : "stand",
      score: 91,
      warnings: [],
    },
    poseBounds: {
      maxX: 0.68,
      maxY: 0.97,
      minX: 0.32,
      minY: 0.28,
      outOfFrameCount: 0,
    },
    retarget: {
      appliedLowerBody: 6,
      hipDrop: squatDepth,
      leftFootContact: leftKneeLift === 0,
      leftKneeLift,
      rightFootContact: rightKneeLift === 0,
      rightKneeLift,
      solvedSegments: 11,
      sourceQuality: 0.96,
      squatDepth,
      totalLowerBody: 6,
      totalSegments: 11,
      visualRootDrop: squatDepth,
    },
    tracking: {
      pose: frame.landmarks,
      worldPose: frame.worldLandmarks,
    },
  };
});

const movementDebugSessionFixture = {
  _id: "movement_debug_e2e_replay",
  _creationTime: now,
  baselineSummary: "neutral e2e replay baseline",
  createdAt: now,
  createdBy: superAdminId,
  durationMs: 1500,
  endedAt: now + 1500,
  movementId,
  sampleCount: movementDebugSamples.length,
  samplesJson: JSON.stringify(movementDebugSamples),
  startedAt: now,
  trigger: "manual-debug-save",
  warningSummary: "none",
};

const movementFixture = {
  _id: movementId,
  _creationTime: now,
  title: "E2E Roll Down",
  difficulty: "Beginner",
  poseData: JSON.stringify({
    schemaVersion: 1,
    capturedAt: now,
    fps: 30,
    frames: movementFrames,
  }),
  poseDataFormat: "storage-json-v1",
  frameCount: movementFrames.length,
  durationMs: 100,
  captureFps: 30,
  schemaVersion: 1,
  spineGoal: "rollDown",
  primaryCue: "Roll down one segment at a time.",
  bodyFocus: ["ribcage", "pelvis"],
  createdAt: now,
  updatedAt: now,
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
  const role = getCookie("sonae_e2e_auth");
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
  const raw = window.localStorage.getItem(`sonae:e2e:thread:${threadId}`);
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
  window.localStorage.setItem(`sonae:e2e:thread:${threadId}`, JSON.stringify(messages));
}

type E2EFeedbackEntry = {
  rating: "POSITIVE" | "NEGATIVE";
  labels: Array<"GREAT_ANSWER" | "INCORRECT" | "MISSED_CONTEXT" | "UNHELPFUL">;
  hasCorrection: boolean;
};

const FEEDBACK_STORAGE_KEY = "sonae:e2e:feedback";

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
  if (path === "settings:get") return settings;
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
  if (path === "aiModels:getOffsetPaginatedModels") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const statusFilter = queryArgs.statusFilter;
    const providerFilter = String(queryArgs.providerFilter || "all");
    const filtered = models.filter((model) => {
      const matchesSearch = !searchTerm || model.displayName.toLowerCase().includes(searchTerm) || model.modelId.includes(searchTerm);
      const matchesStatus =
        statusFilter === "active" ? model.isEnabled : statusFilter === "inactive" ? !model.isEnabled : true;
      const matchesProvider = providerFilter === "all" || model.providerKey === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
    return pageData(filtered, Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15));
  }
  if (path === "aiRules:getOffsetPaginatedRules") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const filtered = searchTerm ? rules.filter((rule) => rule.name.toLowerCase().includes(searchTerm)) : rules;
    return pageData(filtered, Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15));
  }
  if (path === "invites:getActiveTemplate") return inviteTemplateFixture;
  if (path === "invites:getInvitesByCompany") return [];
  if (path === "aiTools:getConnectorMarketplace") {
    return [
      {
        key: "sonae-knowledge",
        name: "Knowledge search",
        description: "Lets an agent search the documents you have uploaded, and quote from them.",
        availability: "AVAILABLE",
        executableToolCount: 1,
        totalToolCount: 1,
        authMode: "NONE",
        requiredScopes: ["knowledge:read"],
        requiredSecretRefs: [],
        toolDefinitions: [],
        installation: { _id: "connector_e2e", installStatus: "INSTALLED", testStatus: "SUCCESS" },
      },
      {
        key: "http-rest",
        name: "Call an API",
        description: "Lets an agent call another system over the web. You set the address and the credentials; the agent only chooses what to ask for.",
        availability: "AVAILABLE",
        executableToolCount: 1,
        totalToolCount: 1,
        authMode: "SECRET_REF",
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
        key: "sonae-knowledge",
        name: "Sonae Knowledge",
        description: "Search approved tenant knowledge through the governed RAG path.",
        configuredSecretRefs: [],
        enabledToolMappings: ["knowledge.search"],
        isActive: true,
        tenantAvailability: "GLOBAL",
        installStatus: "INSTALLED",
        testStatus: "SUCCESS",
      },
      definition: {
        key: "sonae-knowledge",
        name: "Knowledge search",
        description: "Lets an agent search the documents you have uploaded, and quote from them.",
        requiredSecretRefs: [],
        toolDefinitions: [
          {
            name: "Knowledge Search",
            description: "Searches your approved documents and returns short quotes with their source.",
            handlerMapping: "knowledge.search",
          },
        ],
      },
      company: null,
      canManageTenantScope: true,
      tools: [{ _id: "tool_e2e", name: "Knowledge Search", isActive: true }],
      secretRefs: [],
      oauthConnections: [],
      oauthConnection: null,
      testLogs: [
        { _id: "log_e2e", status: "SUCCESS", message: "Connection test passed.", testedAt: now - 60000 },
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
        name: "Rightmove Connector",
        description: "Property search connector",
        handlerMapping: "rightmove.search",
        requiredRole: "ADMIN",
        inputSchema: '{"type":"object","properties":{}}',
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        provider: "apify",
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
        updatedAt: now,
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
      updatedAt: now,
    };
  }
  if (path === "plans:getActivePlans" || path === "plans:getPlans") {
    return [{ _id: "plan_e2e", _creationTime: now, name: "Pro", description: "E2E plan", priceGBP: 99, messageLimit: 1000, isActive: true, createdAt: now }];
  }
  if (path === "plans:getMyCompanyPlanStatus") {
    return { planName: "Pro", messagesUsed: 42, messageLimit: 1000, isUnlimited: false };
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
        companyId,
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
        cronExpression: "0 9 * * *",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
  if (path === "analytics:getGlobalAnalytics" || path === "analytics:getCompanyMetrics" || path === "analytics:getGlobalInventoryMetrics") return analytics;
  if (path === "movements:get") {
    return queryArgs.id === movementId ? movementFixture : null;
  }
  if (path === "movements:listReplayAlignmentRecordings") {
    return [
      {
        ...movementFixture,
        poseDataUrl: null,
      },
    ];
  }
  if (path === "movements:listDebugTrackingSessions") {
    return [
      {
        ...movementDebugSessionFixture,
        samplesJson: undefined,
        samplesPreview: movementDebugSessionFixture.samplesJson.slice(0, 800),
      },
    ];
  }
  if (path === "movements:getDebugTrackingSession") {
    return queryArgs.id === movementDebugSessionFixture._id ? movementDebugSessionFixture : null;
  }
  if (path === "movements:getDebugTrackingSessions") {
    const ids = Array.isArray(queryArgs.ids) ? queryArgs.ids : [];
    return ids.includes(movementDebugSessionFixture._id) ? [movementDebugSessionFixture] : [];
  }
  if (path === "movements:getFileUrl") {
    return null;
  }
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
      page: observabilityRunFixtures().map((run, index) => ({
        ...run,
        markers: {
          feedback: index === 1 ? { rating: "NEGATIVE", labels: ["TOO_SLOW"], comment: "too slow" } : null,
          reflected: index === 1,
          memoryCandidateIds: [],
          usedAsCheck: index === 3,
          suggestionIds: [],
        },
      })),
      isDone: true,
      continueCursor: null,
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
      createdAt: now,
      updatedAt: now,
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
      snapshotCoverage: { missingGlobalDates: [], duplicateSnapshotGroups: [], totalSnapshots: 0 },
      messageDimensions: { missingDimensions: 0, mismatched: 0, missingThreads: 0, scanned: 0, examples: [] },
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
        window.localStorage.setItem(`sonae:e2e:thread:${threadId}`, JSON.stringify([]));
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
  void functionReference;
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
      results: [{ _id: "thread_e2e_seed", _creationTime: now, title: "E2E Conversation", createdAt: now, updatedAt: now }],
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
        { _id: superAdminId, _creationTime: now, name: "E2E Super Admin", email: "super.e2e@example.com", role: "SUPER_ADMIN", createdAt: now },
        { _id: userId, _creationTime: now, name: "E2E User", email: "user.e2e@example.com", role: "USER", companyId, createdAt: now },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "companies:getPaginatedCompanies") {
    return {
      results: [{ ...companyFixture, userCount: 2 }],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "agents:getPaginatedAgents") {
    return {
      results: [{ _id: "agent_e2e", _creationTime: now, name: "E2E Assistant", modelId: "e2e-primary-model", isActive: true, createdAt: now, updatedAt: now }],
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
  if (path === "movements:getPaginated") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const spineGoal = typeof queryArgs.spineGoal === "string" ? queryArgs.spineGoal : null;
    const matchesSearch = !searchTerm || movementFixture.title.toLowerCase().includes(searchTerm);
    const matchesSpineGoal = !spineGoal || movementFixture.spineGoal === spineGoal;
    const results = matchesSearch && matchesSpineGoal ? [movementFixture] : [];

    return {
      results,
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
          name: "Rightmove Connector",
          description: "Property search connector",
          handlerMapping: "rightmove.search",
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
