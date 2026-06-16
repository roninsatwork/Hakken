import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  
  companies: defineTable({
    name: v.string(),
    logo: v.optional(v.string()),
    description: v.optional(v.string()),
    overview: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    planId: v.optional(v.id("plans")),
    messagesUsedThisPeriod: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_plan", ["planId"])
    .searchIndex("search_name", { searchField: "name" }),
  
  systemSettings: defineTable({
    platformName: v.string(),
    currencySymbol: v.optional(v.string()),
    monthlyBasePrice: v.optional(v.number()),
    monthlySeatPrice: v.optional(v.number()),
    logoUrlLight: v.optional(v.string()),
    logoUrlDark: v.optional(v.string()),
    brandColorHex: v.optional(v.string()),
    fontFamily: v.optional(v.string()), // Deprecated, keep for legacy
    headingFontFamily: v.optional(v.string()),
    bodyFontFamily: v.optional(v.string()),
    fontSizeBase: v.optional(v.string()),
    headingSizeGlobal: v.optional(v.string()),
    subTextSizeGlobal: v.optional(v.string()),
    borderRadius: v.optional(v.string()),

    lightBg: v.optional(v.string()),
    lightFg: v.optional(v.string()),
    lightCardBg: v.optional(v.string()),
    lightCardFg: v.optional(v.string()),
    lightBorder: v.optional(v.string()),
    lightMuted: v.optional(v.string()),
    lightMutedFg: v.optional(v.string()),
    lightSuccess: v.optional(v.string()),
    lightDestructive: v.optional(v.string()),
    lightRing: v.optional(v.string()),

    darkBg: v.optional(v.string()),
    darkFg: v.optional(v.string()),
    darkCardBg: v.optional(v.string()),
    darkCardFg: v.optional(v.string()),
    darkBorder: v.optional(v.string()),
    darkMuted: v.optional(v.string()),
    darkMutedFg: v.optional(v.string()),
    darkSuccess: v.optional(v.string()),
    darkDestructive: v.optional(v.string()),
    darkRing: v.optional(v.string()),
    diagnosticRoutingEnabled: v.optional(v.boolean())
  }),

  aiProviders: defineTable({
    providerKey: v.string(),
    displayName: v.string(),
    isEnabled: v.boolean(),
    authMode: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("unknown"),
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("disabled"),
      v.literal("error")
    )),
    lastHealthCheckAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    syncStatus: v.optional(v.string()),
    settings: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_key", ["providerKey"])
    .index("by_enabled", ["isEnabled"]),

  aiModelDefaults: defineTable({
    scope: v.union(v.literal("global"), v.literal("company")),
    companyId: v.optional(v.id("companies")),
    useCase: v.string(),
    providerKey: v.string(),
    modelId: v.string(),
    fallbackModelId: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_scope_use_case", ["scope", "useCase"])
    .index("by_company_use_case", ["companyId", "useCase"]),

  inventoryRollups: defineTable({
    key: v.string(),
    totalProvisionedUsers: v.number(),
    totalProvisionedCompanies: v.number(),
    mrr: v.number(),
    planInventory: v.array(v.object({
      planId: v.string(),
      name: v.string(),
      priceGBP: v.number(),
      isActive: v.boolean(),
      companies: v.number(),
    })),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  
  arcadeScores: defineTable({
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    game: v.string(), // e.g., "pacman"
    score: v.number(),
    playedAt: v.number(),
  }).index("by_game_score", ["game", "score"])
    .index("by_user", ["userId"]),

  plans: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    messageLimit: v.number(), // -1 indicates unlimited
    priceGBP: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_active", ["isActive"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Sonae Custom Fields
    companyId: v.optional(v.id("companies")),
    impersonatingCompanyId: v.optional(v.id("companies")),
    role: v.optional(v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN"))),
    planOverrideId: v.optional(v.id("plans")),
    messagesUsedThisPeriod: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    tokenIdentifier: v.optional(v.string()),
  }).index("email", ["email"])
    .index("by_company", ["companyId"])
    .index("by_token", ["tokenIdentifier"])
    .searchIndex("search_email", { searchField: "email" }),
  
  logins: defineTable({
    userId: v.id("users"),
    ip: v.string(),
    device: v.string(),
    location: v.string(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    timestamp: v.number(),
  })
    .index("by_user", ["userId", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .searchIndex("search_device", {
      searchField: "device",
      filterFields: ["userId"],
    }),

  invitations: defineTable({
    email: v.string(),
    companyId: v.optional(v.id("companies")),
    role: v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    status: v.union(v.literal("PENDING"), v.literal("ACCEPTED"), v.literal("REVOKED")),
    token: v.string(),
    invitedBy: v.optional(v.id("users")),
    invitedAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_company_status", ["companyId", "status"])
    .index("by_token", ["token"]),
    
  emailTemplates: defineTable({
    templateType: v.string(), // "INVITE"
    subject: v.string(),
    headline: v.string(),
    body: v.string(),
    ctaText: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_type", ["templateType"]),

  // Sonae System Configurations
  systemConfig: defineTable({
    key: v.string(), // e.g. "SYSTEM_PROMPT"
    value: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  auditLogs: defineTable({
    actorId: v.id("users"), // The admin who did it
    actionType: v.string(), // e.g. "UPDATE_COMPANY"
    entityId: v.optional(v.string()), // Target ID
    entityType: v.string(), // "companies", "users"
    metadata: v.optional(v.string()), // JSON diff or params
    companyId: v.optional(v.id("companies")), // Context organization
    timestamp: v.number(),
  })
    .index("by_actor", ["actorId", "timestamp"])
    .index("by_company", ["companyId", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  appLaunchPlans: defineTable({
    templateId: v.string(),
    templateName: v.string(),
    category: v.string(),
    riskProfile: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH")),
    status: v.union(v.literal("DRAFT"), v.literal("MATERIALIZED"), v.literal("ARCHIVED")),
    targetCompanyId: v.optional(v.id("companies")),
    targetCompanyName: v.optional(v.string()),
    notes: v.optional(v.string()),
    planJson: v.string(),
    createdResourceJson: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_template_created", ["templateId", "createdAt"]),

  authEvents: defineTable({
    email: v.string(),
    eventType: v.union(
      v.literal("MAGIC_LINK_REQUESTED"),
      v.literal("MAGIC_LINK_STARTED"),
      v.literal("INVITE_FOUND"),
      v.literal("INVITE_MISSING"),
      v.literal("INVITE_EXPIRED"),
      v.literal("INVITE_REVOKED"),
      v.literal("INVITE_STALE_ACCEPTED_RECOVERED"),
      v.literal("USER_FOUND"),
      v.literal("EMAIL_DISPATCH_SIMULATED"),
      v.literal("EMAIL_DISPATCH_STARTED"),
      v.literal("EMAIL_DISPATCH_FAILED"),
      v.literal("MAGIC_LINK_VERIFIED")
    ),
    timestamp: v.number(),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    inviteId: v.optional(v.id("invitations")),
    provider: v.optional(v.string()),
    reasonCode: v.optional(v.string()),
  })
    .index("by_email", ["email", "timestamp"])
    .index("by_company", ["companyId", "timestamp"])
    .index("by_type", ["eventType", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  // AI Agent Usage Billing & Activity Logs
  agentTransactions: defineTable({
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    userId: v.optional(v.id("users")), // The user who triggered the agent
    companyId: v.optional(v.id("companies")), // Tenant context
    actionContext: v.string(), // e.g. "Chat Completion", "Email Draft", "Summarization"
    inputTokens: v.number(),
    outputTokens: v.number(),
    modelUsed: v.string(),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    costGBP: v.number(), // Processed cost for this transaction
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_provider_created", ["providerKey", "createdAt"]),

  // Agent Raw Debug Logs (Execution Payload Storage)
  agentLogs: defineTable({
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    interactionType: v.string(), // "Tool Execution", "Generation", "Error"
    promptContent: v.string(), // What the Agent was sent
    responseContent: v.string(), // What the Agent replied or did
    companyId: v.optional(v.id("companies")), // Strict tenant isolation
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_content", {
      searchField: "promptContent",
      filterFields: ["agentId"]
    }),

  // Durable Agentic Runtime Records
  agentRuns: defineTable({
    agentId: v.id("agents"),
    agentVersionId: v.optional(v.id("agentVersions")),
    threadId: v.optional(v.id("threads")),
    workflowId: v.optional(v.id("workflows")),
    scheduleId: v.optional(v.id("schedules")),
    triggerType: v.union(
      v.literal("CHAT"),
      v.literal("MANUAL"),
      v.literal("SCHEDULE"),
      v.literal("WEBHOOK"),
      v.literal("WORKFLOW"),
      v.literal("EVENT")
    ),
    objective: v.string(),
    status: v.union(
      v.literal("QUEUED"),
      v.literal("RUNNING"),
      v.literal("PENDING_APPROVAL"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("CANCELLED")
    ),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    modelId: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    maxSteps: v.optional(v.number()),
    maxCostGBP: v.optional(v.number()),
    maxRuntimeMs: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costGBP: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    updatedAt: v.number(),
    error: v.optional(v.string()),
    finalOutput: v.optional(v.string()),
    replayOfRunId: v.optional(v.id("agentRuns")),
    replayMode: v.optional(v.union(
      v.literal("CURRENT_ACTIVE"),
      v.literal("SAME_VERSION")
    )),
  })
    .index("by_agent_started", ["agentId", "startedAt"])
    .index("by_agent_version_started", ["agentVersionId", "startedAt"])
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_company_status_started", ["companyId", "status", "startedAt"])
    .index("by_replay_source_started", ["replayOfRunId", "startedAt"])
    .index("by_status_started", ["status", "startedAt"])
    .index("by_thread_started", ["threadId", "startedAt"])
    .index("by_workflow_started", ["workflowId", "startedAt"])
    .index("by_schedule_started", ["scheduleId", "startedAt"]),

  agentRunSteps: defineTable({
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    stepIndex: v.number(),
    kind: v.union(
      v.literal("OBSERVE"),
      v.literal("PLAN"),
      v.literal("MODEL"),
      v.literal("TOOL_CALL"),
      v.literal("TOOL_RESULT"),
      v.literal("APPROVAL_REQUEST"),
      v.literal("REPLAN"),
      v.literal("FINAL")
    ),
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("SKIPPED")
    ),
    input: v.optional(v.string()),
    output: v.optional(v.string()),
    modelId: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costGBP: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_run_step", ["runId", "stepIndex"])
    .index("by_run_status_step", ["runId", "status", "stepIndex"])
    .index("by_agent_started", ["agentId", "startedAt"])
    .index("by_company_started", ["companyId", "startedAt"]),

  agentToolCalls: defineTable({
    runId: v.id("agentRuns"),
    stepId: v.optional(v.id("agentRunSteps")),
    agentId: v.id("agents"),
    toolId: v.optional(v.id("aiTools")),
    normalizedToolName: v.string(),
    handlerMapping: v.string(),
    argumentsJson: v.string(),
    redactedArgumentsJson: v.optional(v.string()),
    resultJson: v.optional(v.string()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("APPROVAL_REQUIRED"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("DENIED"),
      v.literal("CANCELLED")
    ),
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    sideEffectLevel: v.union(
      v.literal("READ"),
      v.literal("WRITE"),
      v.literal("DESTRUCTIVE"),
      v.literal("EXTERNAL")
    ),
    confirmationRequired: v.boolean(),
    confirmationGrantedAt: v.optional(v.number()),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_run_started", ["runId", "startedAt"])
    .index("by_agent_started", ["agentId", "startedAt"])
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_status_started", ["status", "startedAt"]),

  agentRunApprovals: defineTable({
    runId: v.id("agentRuns"),
    stepId: v.optional(v.id("agentRunSteps")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    requestedBy: v.optional(v.id("users")),
    reviewedBy: v.optional(v.id("users")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("CANCELLED")
    ),
    message: v.optional(v.string()),
    previewJson: v.optional(v.string()),
    requestedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    decisionReason: v.optional(v.string()),
  })
    .index("by_run_requested", ["runId", "requestedAt"])
    .index("by_company_status_requested", ["companyId", "status", "requestedAt"])
    .index("by_status_requested", ["status", "requestedAt"])
    .index("by_agent_requested", ["agentId", "requestedAt"]),

  agentRunFeedback: defineTable({
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    userId: v.id("users"),
    rating: v.union(
      v.literal("POSITIVE"),
      v.literal("NEGATIVE"),
      v.literal("NEUTRAL")
    ),
    labels: v.array(v.union(
      v.literal("GOOD_ANSWER"),
      v.literal("INCORRECT"),
      v.literal("MISSED_CONTEXT"),
      v.literal("WRONG_TOOL"),
      v.literal("BAD_TOOL_ARGS"),
      v.literal("UNSAFE_SUGGESTION"),
      v.literal("TOO_EXPENSIVE"),
      v.literal("TOO_SLOW"),
      v.literal("NEEDS_APPROVAL_POLICY_CHANGE"),
      v.literal("SHOULD_BECOME_EVAL")
    )),
    comment: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["runId", "createdAt"])
    .index("by_agent_created", ["agentId", "createdAt"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_user_agent_updated", ["userId", "agentId", "updatedAt"]),

  agentRunReflections: defineTable({
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    createdBy: v.id("users"),
    category: v.union(
      v.literal("MISSING_CONTEXT"),
      v.literal("BAD_TOOL_PLAN"),
      v.literal("BAD_TOOL_ARGUMENTS"),
      v.literal("TOOL_FAILURE"),
      v.literal("PROVIDER_FAILURE"),
      v.literal("POLICY_BLOCKED"),
      v.literal("APPROVAL_REJECTED"),
      v.literal("TENANT_SCOPE_BLOCKED"),
      v.literal("PROMPT_INJECTION_BLOCKED"),
      v.literal("USER_CANCELLED"),
      v.literal("UNKNOWN")
    ),
    sourceStatus: v.union(v.literal("FAILED"), v.literal("CANCELLED")),
    objectiveSummary: v.string(),
    failureStepIndex: v.optional(v.number()),
    failureStepKind: v.optional(v.string()),
    toolCallId: v.optional(v.id("agentToolCalls")),
    approvalId: v.optional(v.id("agentRunApprovals")),
    rootCause: v.string(),
    missingContext: v.optional(v.string()),
    proposedMemory: v.optional(v.string()),
    proposedPromptChange: v.optional(v.string()),
    proposedToolChange: v.optional(v.string()),
    proposedEvalFixture: v.optional(v.string()),
    confidence: v.number(),
    evidenceJson: v.string(),
    status: v.union(
      v.literal("GENERATED"),
      v.literal("DISMISSED"),
      v.literal("CONVERTED")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    dismissalReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["runId", "createdAt"])
    .index("by_agent_created", ["agentId", "createdAt"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  agentMemoryCandidates: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    sourceRunId: v.id("agentRuns"),
    sourceReflectionId: v.optional(v.id("agentRunReflections")),
    proposedBy: v.union(
      v.literal("AGENT"),
      v.literal("USER"),
      v.literal("ADMIN"),
      v.literal("SYSTEM_REFLECTION")
    ),
    kind: v.union(
      v.literal("FACT"),
      v.literal("PREFERENCE"),
      v.literal("SUMMARY"),
      v.literal("INSTRUCTION")
    ),
    content: v.string(),
    normalizedContent: v.string(),
    confidence: v.number(),
    riskLevel: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH")
    ),
    status: v.union(
      v.literal("PROPOSED"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("APPLIED")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    appliedMemoryId: v.optional(v.id("agentMemories")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["sourceRunId", "createdAt"])
    .index("by_reflection_created", ["sourceReflectionId", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  agentEvalFixtures: defineTable({
    agentId: v.id("agents"),
    agentVersionId: v.optional(v.id("agentVersions")),
    companyId: v.optional(v.id("companies")),
    sourceRunId: v.id("agentRuns"),
    sourceReflectionId: v.optional(v.id("agentRunReflections")),
    sourceFeedbackId: v.optional(v.id("agentRunFeedback")),
    sourceMemoryCandidateId: v.optional(v.id("agentMemoryCandidates")),
    createdBy: v.id("users"),
    type: v.union(
      v.literal("HAPPY_PATH"),
      v.literal("APPROVAL_PAUSE"),
      v.literal("REJECTED_ACTION"),
      v.literal("PROMPT_INJECTION"),
      v.literal("TENANT_BOUNDARY"),
      v.literal("BAD_TOOL_ARGS"),
      v.literal("CANCELLATION"),
      v.literal("REPLAYED_FAILURE"),
      v.literal("TOOL_PLAN"),
      v.literal("COST_LATENCY_BUDGET")
    ),
    objective: v.string(),
    expectedToolPlanJson: v.optional(v.string()),
    expectedBlockedActionsJson: v.optional(v.string()),
    expectedFinalOutputRubric: v.string(),
    expectedMemoryUsageJson: v.optional(v.string()),
    sourceEvidenceJson: v.string(),
    tags: v.array(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("ARCHIVED")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["sourceRunId", "createdAt"])
    .index("by_agent_created", ["agentId", "createdAt"])
    .index("by_agent_version_created", ["agentVersionId", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  agentImprovementSuggestions: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    sourceRunId: v.optional(v.id("agentRuns")),
    sourceReflectionId: v.optional(v.id("agentRunReflections")),
    sourceEvalFixtureId: v.optional(v.id("agentEvalFixtures")),
    createdBy: v.id("users"),
    type: v.union(
      v.literal("PROMPT_CHANGE"),
      v.literal("RULE_CHANGE"),
      v.literal("TOOL_SCHEMA_CHANGE"),
      v.literal("ROUTING_CHANGE"),
      v.literal("APPROVAL_POLICY_CHANGE")
    ),
    title: v.string(),
    description: v.string(),
    proposedPatchJson: v.string(),
    riskLevel: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH")
    ),
    status: v.union(
      v.literal("PROPOSED"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("APPLIED")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    appliedAgentVersionId: v.optional(v.id("agentVersions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["sourceRunId", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_eval_fixture_created", ["sourceEvalFixtureId", "createdAt"])
    .index("by_reflection_created", ["sourceReflectionId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  agentVersions: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    versionNumber: v.number(),
    snapshotHash: v.string(),
    snapshotJson: v.string(),
    promptHash: v.string(),
    toolSetHash: v.string(),
    memoryRevisionHash: v.string(),
    ruleSetHash: v.string(),
    modelConfigHash: v.string(),
    policyHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_agent_created", ["agentId", "createdAt"])
    .index("by_agent_hash", ["agentId", "snapshotHash"])
    .index("by_agent_company_created", ["agentId", "companyId", "createdAt"]),

  agentReleases: defineTable({
    agentId: v.id("agents"),
    agentVersionId: v.id("agentVersions"),
    status: v.union(
      v.literal("PENDING_SIGNOFF"),
      v.literal("APPROVED"),
      v.literal("ACTIVATED"),
      v.literal("ROLLED_BACK"),
      v.literal("CANCELLED")
    ),
    title: v.string(),
    releaseNotes: v.string(),
    rollbackPlan: v.string(),
    activationWindowStart: v.optional(v.number()),
    activationWindowEnd: v.optional(v.number()),
    readinessJson: v.string(),
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    activatedBy: v.optional(v.id("users")),
    rolledBackBy: v.optional(v.id("users")),
    cancelledBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    rolledBackAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_agent_created", ["agentId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"]),

  agentMemories: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    sourceRunId: v.optional(v.id("agentRuns")),
    sourceThreadId: v.optional(v.id("threads")),
    kind: v.union(
      v.literal("FACT"),
      v.literal("PREFERENCE"),
      v.literal("SUMMARY"),
      v.literal("INSTRUCTION")
    ),
    content: v.string(),
    normalizedContent: v.string(),
    importance: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("users")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_agent_active_updated", ["agentId", "isActive", "updatedAt"])
    .index("by_company_active_updated", ["companyId", "isActive", "updatedAt"])
    .index("by_agent_company_active_updated", ["agentId", "companyId", "isActive", "updatedAt"])
    .index("by_source_run", ["sourceRunId"])
    .searchIndex("search_content", {
      searchField: "normalizedContent",
      filterFields: ["agentId", "companyId", "isActive"],
    }),

  agentMemoryUsage: defineTable({
    memoryId: v.id("agentMemories"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    runId: v.id("agentRuns"),
    score: v.number(),
    queryText: v.string(),
    outcome: v.union(
      v.literal("OBSERVED"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("CANCELLED")
    ),
    usedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_memory_used", ["memoryId", "usedAt"])
    .index("by_run", ["runId"])
    .index("by_agent_used", ["agentId", "usedAt"])
    .index("by_company_used", ["companyId", "usedAt"]),

  // AI Rule Engine (Triggers & Logic Processing)
  aiRules: defineTable({
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")), // Link for agent-specific logic
    name: v.optional(v.string()),
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_active", ["isActive", "createdAt"])
    .index("by_company_active", ["companyId", "isActive"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_company_active_created", ["companyId", "isActive", "createdAt"])
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_agent_company_created", ["agentId", "companyId", "createdAt"])
    .index("by_agent_active_created", ["agentId", "isActive", "createdAt"])
    .index("by_global_created", ["companyId", "agentId", "createdAt"])
    .index("by_global_active_created", ["companyId", "agentId", "isActive", "createdAt"]),

  // Knowledge Base Vector Engine & Document Storage
  knowledgeDocuments: defineTable({
    title: v.string(),
    fileId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    textContent: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("ready"), v.literal("failed")),
    format: v.string(), // "application/pdf", "text/plain", "url"
    embeddingProviderKey: v.optional(v.string()),
    embeddingModelId: v.optional(v.string()),
    embeddingProviderModelId: v.optional(v.string()),
    embeddingDimensions: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_company", ["companyId", "createdAt"])
    .index("by_company_format", ["companyId", "format", "createdAt"])
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_agent_format", ["agentId", "format", "createdAt"])
    .index("by_agent_company", ["agentId", "companyId", "createdAt"])
    .index("by_global", ["companyId", "agentId", "threadId", "createdAt"])
    .index("by_global_format", ["companyId", "agentId", "threadId", "format", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_source_company", ["sourceUrl", "companyId", "agentId"]),

  // Knowledge Base Vector Store
  knowledgeChunks: defineTable({
    documentId: v.id("knowledgeDocuments"),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    isGlobal: v.boolean(),
    text: v.string(),
    embedding: v.array(v.number()),
    embeddingProviderKey: v.optional(v.string()),
    embeddingModelId: v.optional(v.string()),
    embeddingProviderModelId: v.optional(v.string()),
    embeddingDimensions: v.optional(v.number()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768, // Current text embedding provider uses 768-length vectors
    filterFields: ["companyId", "agentId", "documentId", "isGlobal", "threadId"],
  }).index("by_document", ["documentId"]),

  // Sonae Assistant Tables
  threads: defineTable({
    userId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")), // Sandbox tracking
    widgetId: v.optional(v.id("widgets")), // To link threads directly to a widget
    sourceUrl: v.optional(v.string()), // The URL where the user initiated the chat
    title: v.optional(v.string()), // Generated lazily after first exchange
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"])
    .index("by_widget", ["widgetId", "updatedAt"])
    .index("by_company", ["companyId", "updatedAt"])
    .index("by_updatedAt", ["updatedAt"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    // Sonae AI Logistics
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    agentId: v.optional(v.id("agents")),
    widgetId: v.optional(v.id("widgets")),
    analyticsDimensionsVersion: v.optional(v.number()),
    attachments: v.optional(v.array(v.id("_storage"))),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_role_created", ["role", "createdAt"])
    .index("by_company_role_created", ["companyId", "role", "createdAt"])
    .index("by_user_role_created", ["userId", "role", "createdAt"])
    .index("by_agent_role_created", ["agentId", "role", "createdAt"])
    .index("by_provider_created", ["providerKey", "createdAt"]),

  // Agent Orchestration Engine
  agents: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()), // Optional icon/avatar
    modelId: v.string(), // Provider model identifier
    modelSelectionMode: v.optional(v.union(v.literal("inherit"), v.literal("override"))),
    thinkingMode: v.boolean(),
    systemPrompt: v.optional(v.string()),
    // Link to specific rule IDs
    ruleIds: v.optional(v.array(v.id("aiRules"))), 
    // Link to specific knowledge document IDs for RAG
    knowledgeDocumentIds: v.optional(v.array(v.id("knowledgeDocuments"))),
    reasoningEffort: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))),
    allowInternetAccess: v.optional(v.boolean()),
    // Deterministic Execution Parameters
    temperature: v.optional(v.number()), // 0.0 to 2.0
    humanApprovalRequired: v.optional(v.boolean()),
    inputSchema: v.optional(v.string()), // Stringified JSON Schema
    outputSchema: v.optional(v.string()), // Stringified JSON Schema
    triggerType: v.optional(v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE"))),
    releaseGateMode: v.optional(v.union(v.literal("TAG"), v.literal("PRESET"), v.literal("NONE"))),
    releaseGateTags: v.optional(v.array(v.string())),
    releaseGateSuitePresetId: v.optional(v.id("agentEvalSuitePresets")),
    releaseGateRequiresModelGrading: v.optional(v.boolean()),
    isActive: v.boolean(),
    // Inline Sandbox Configuration
    isGlobal: v.optional(v.boolean()),
    workflowId: v.optional(v.id("workflows")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"])
    .index("by_workflow", ["workflowId", "isGlobal"])
    .index("by_workflow_created", ["workflowId", "createdAt"])
    .index("by_active_created", ["isActive", "createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  agentEvalSuitePresets: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    description: v.optional(v.string()),
    suiteTag: v.optional(v.string()),
    fixtureIds: v.optional(v.array(v.id("agentEvalFixtures"))),
    isReleaseGate: v.optional(v.boolean()),
    requiresModelGrading: v.optional(v.boolean()),
    status: v.union(v.literal("ACTIVE"), v.literal("ARCHIVED")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_created", ["agentId", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"])
    .index("by_agent_release_created", ["agentId", "isReleaseGate", "createdAt"])
    .index("by_company_created", ["companyId", "createdAt"]),

  // Installable connector definitions and tenant/global install state.
  toolConnectors: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("KNOWLEDGE"),
      v.literal("PROFILE"),
      v.literal("WORKFLOW"),
      v.literal("HTTP"),
      v.literal("EMAIL"),
      v.literal("CUSTOM")
    ),
    authMode: v.union(
      v.literal("NONE"),
      v.literal("SECRET_REF"),
      v.literal("OAUTH")
    ),
    requiredScopes: v.optional(v.array(v.string())),
    requiredSecretRefs: v.optional(v.array(v.string())),
    configuredSecretRefs: v.optional(v.array(v.string())),
    enabledToolMappings: v.optional(v.array(v.string())),
    tenantAvailability: v.union(v.literal("GLOBAL"), v.literal("TENANT_RESTRICTED")),
    companyId: v.optional(v.id("companies")),
    installStatus: v.union(v.literal("INSTALLED"), v.literal("DISABLED"), v.literal("ERROR")),
    testStatus: v.optional(v.union(v.literal("UNTESTED"), v.literal("SUCCESS"), v.literal("FAILURE"))),
    lastTestedAt: v.optional(v.number()),
    lastTestMessage: v.optional(v.string()),
    authConnectionStatus: v.optional(v.union(
      v.literal("NOT_CONNECTED"),
      v.literal("PENDING"),
      v.literal("CONNECTED"),
      v.literal("ERROR")
    )),
    authAccountRef: v.optional(v.string()),
    tokenRef: v.optional(v.string()),
    oauthScopes: v.optional(v.array(v.string())),
    oauthConnectedAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_key", ["key"])
    .index("by_key_company", ["key", "companyId"])
    .index("by_company", ["companyId"])
    .index("by_status", ["installStatus"])
    .index("by_createdAt", ["createdAt"]),

  toolConnectorTestLogs: defineTable({
    connectorId: v.id("toolConnectors"),
    key: v.string(),
    companyId: v.optional(v.id("companies")),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILURE")),
    message: v.string(),
    diagnosticCode: v.optional(v.string()),
    diagnosticDetailsJson: v.optional(v.string()),
    missingSecretRefs: v.optional(v.array(v.string())),
    testedAt: v.number(),
    testedBy: v.id("users"),
  })
    .index("by_connector_tested", ["connectorId", "testedAt"])
    .index("by_company_tested", ["companyId", "testedAt"]),

  toolConnectorSecretRefs: defineTable({
    connectorId: v.id("toolConnectors"),
    key: v.string(),
    providerRef: v.string(),
    status: v.union(v.literal("CONFIGURED"), v.literal("MISSING")),
    required: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  })
    .index("by_connector", ["connectorId"])
    .index("by_connector_key", ["connectorId", "key"]),

  toolConnectorOAuthConnections: defineTable({
    connectorId: v.id("toolConnectors"),
    key: v.string(),
    companyId: v.optional(v.id("companies")),
    provider: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("CONNECTED"),
      v.literal("DISCONNECTED"),
      v.literal("ERROR")
    ),
    state: v.string(),
    authorizationUrl: v.string(),
    scopes: v.array(v.string()),
    accountRef: v.optional(v.string()),
    tokenRef: v.optional(v.string()),
    message: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    connectedAt: v.optional(v.number()),
    initiatedBy: v.id("users"),
  })
    .index("by_connector_updated", ["connectorId", "updatedAt"])
    .index("by_state", ["state"])
    .index("by_company_updated", ["companyId", "updatedAt"]),

  // Global Tool Library
  aiTools: defineTable({
    name: v.string(), // "search_web", "query_database"
    description: v.string(), // Provide clear instructions on what the tool does
    handlerMapping: v.string(), // Points to internal mutation/action route (e.g., "internalActions.executeDatabaseQuery")
    connectorId: v.optional(v.id("toolConnectors")),
    connectorKey: v.optional(v.string()),
    secretRefKeys: v.optional(v.array(v.string())),
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    inputSchema: v.optional(v.string()),
    outputSchema: v.optional(v.string()),
    sideEffectLevel: v.optional(v.union(
      v.literal("READ"),
      v.literal("WRITE"),
      v.literal("DESTRUCTIVE"),
      v.literal("EXTERNAL")
    )),
    confirmationRequired: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    version: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_name", ["name"])
    .index("by_connector", ["connectorId"])
    .index("by_connector_key", ["connectorKey"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  // Junction table: Authorized Tools per Agent
  agentTools: defineTable({
    agentId: v.id("agents"),
    toolId: v.id("aiTools"),
    assignedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_tool", ["toolId"]),

  // AI Workflows Orchestration
  workflows: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    triggerType: v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE")),
    nodes: v.optional(v.string()), // JSON stringified array of React Flow nodes
    edges: v.optional(v.string()), // JSON stringified array of React Flow edges
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
    webhookSecret: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  workflowExecutions: defineTable({
    workflowId: v.optional(v.id("workflows")),
    agentId: v.optional(v.id("agents")),
    agentRunId: v.optional(v.id("agentRuns")),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    triggerType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    startedBy: v.id("users"),
    state: v.optional(v.string()), // JSON representation of final execution state for debugging
  }).index("by_workflow", ["workflowId", "startedAt"])
    .index("by_startedAt", ["startedAt"]),
  schedules: defineTable({
    name: v.string(),
    workflowId: v.optional(v.id("workflows")),
    agentId: v.optional(v.id("agents")),
    intervalStr: v.string(), // "daily", "weekly"
    isActive: v.boolean(),
    lastRunTs: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_agent", ["agentId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_active_next_run", ["isActive", "nextRunAt"])
    .index("by_active_workflow_last_run", ["isActive", "workflowId", "lastRunTs"])
    .index("by_active_last_run", ["isActive", "lastRunTs"]),

  swarmLogs: defineTable({
    threadId: v.id("threads"),
    message: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
    order: v.number(),
    isHeading: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_thread", ["threadId", "order"]),

  aiModels: defineTable({
    modelId: v.string(), // Provider model identifier
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    displayName: v.string(),
    description: v.optional(v.string()), // A short description 
    isEnabled: v.boolean(),
    isDefault: v.boolean(),
    status: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    supportedUseCases: v.optional(v.array(v.string())),
    contextWindowTokens: v.optional(v.number()),
    maxOutputTokens: v.optional(v.number()),
    inputTokenUnit: v.optional(v.string()),
    outputTokenUnit: v.optional(v.string()),
    currency: v.optional(v.string()),
    pricingSource: v.optional(v.string()),
    pricingEffectiveAt: v.optional(v.number()),
    lastSyncedAt: v.number(),
    friendlyName: v.optional(v.string()), // A short user-friendly name
    standardInputCostBelow200k: v.optional(v.number()),
    standardInputCostAbove200k: v.optional(v.number()),
    cachedInputCostBelow200k: v.optional(v.number()),
    cachedInputCostAbove200k: v.optional(v.number()),
    outputResponseCost: v.optional(v.number()),
    outputReasoningCost: v.optional(v.number()),
  })
    .index("by_model_id", ["modelId"])
    .index("by_provider", ["providerKey"])
    .index("by_provider_model", ["providerKey", "providerModelId"])
    .index("by_provider_enabled", ["providerKey", "isEnabled"])
    .index("by_enabled", ["isEnabled"])
    .index("by_default", ["isDefault"])
    .searchIndex("search_display_name", { searchField: "displayName" })
    .searchIndex("search_model_id", { searchField: "modelId" }),

  workflowExecutionSteps: defineTable({
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    agentId: v.optional(v.id("agents")),
    agentRunId: v.optional(v.id("agentRuns")),
    input: v.string(), // JSON stringified
    output: v.optional(v.string()), // JSON stringified
    status: v.union(v.literal("PENDING"), v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED"), v.literal("PENDING_APPROVAL")),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_execution", ["executionId", "nodeId"])
    .index("by_execution_started", ["executionId", "startedAt"])
    .index("by_execution_node_started", ["executionId", "nodeId", "startedAt"])
    .index("by_execution_node_status_started", ["executionId", "nodeId", "status", "startedAt"])
    .index("by_execution_status_started", ["executionId", "status", "startedAt"]),

  // Generated Agent Reports
  salesReports: defineTable({
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    headline: v.string(), // Section 1
    executiveSummary: v.optional(v.string()), // Section 1 Text
    markdownReport: v.optional(v.string()), // Legacy Fallback
    kpis: v.object({ // Section 2
      totalPipeline: v.number(),
      totalPipelineChange: v.optional(v.string()),
      weightedPipeline: v.number(),
      weightedPipelineChange: v.optional(v.string()),
      openDeals: v.number(),
      openDealsChange: v.optional(v.string()),
      winRatePct: v.number(),
      winRatePctChange: v.optional(v.string()),
      avgDealSize: v.optional(v.number()),
      avgDealSizeChange: v.optional(v.string()),
      avgSalesCycleDays: v.optional(v.number()),
      avgSalesCycleDaysChange: v.optional(v.string()),
    }),
    closingWindows: v.optional(v.array(v.object({ // Section 3
        window: v.string(),
        deals: v.number(),
        totalValue: v.number(),
        weightedValue: v.number()
    }))),
    topDeals: v.optional(v.array(v.object({ // Section 3
        dealName: v.string(),
        rep: v.string(),
        value: v.number(),
        probability: v.number(),
        status: v.string()
    }))),
    chartData: v.optional(v.object({ // Section 4 / 9
      funnel: v.array(v.object({ stage: v.string(), value: v.number(), count: v.number() })),
      timeline: v.array(v.object({ month: v.string(), expectedValue: v.number() })),
      sources: v.array(v.object({ source: v.string(), winRate: v.number(), count: v.number() }))
    })),
    riskTables: v.optional(v.any()), // Legacy support
    pipelineHealth: v.optional(v.object({ // Section 4
        byStage: v.array(v.object({ stage: v.string(), value: v.number(), valueFormatted: v.optional(v.string()), barChart: v.string(), observation: v.string() })),
        byRep: v.array(v.object({ rep: v.string(), valPct: v.number(), valueFormatted: v.optional(v.string()), barChart: v.string(), observation: v.string() }))
    })),
    riskRadar: v.optional(v.object({ // Section 5
        critical: v.array(v.object({ dealName: v.string(), rep: v.string(), value: v.number(), reason: v.string(), recommendation: v.string() })),
        atRisk: v.array(v.object({ dealName: v.string(), rep: v.string(), value: v.number(), reason: v.string(), recommendation: v.string() })),
        quiet: v.array(v.object({ dealName: v.string(), rep: v.string(), value: v.number(), reason: v.string(), recommendation: v.string() }))
    })),
    teamSpotlight: v.optional(v.object({ // Section 6
        momentum: v.union(v.string(), v.array(v.object({ rep: v.string(), summary: v.string() }))),
        supportNeeded: v.union(v.string(), v.array(v.object({ rep: v.string(), summary: v.string() })))
    })),
    patterns: v.optional(v.array(v.object({ // Section 7
        pattern: v.string(),
        observation: v.string()
    }))),
    priorities: v.optional(v.array(v.string())), // Section 8
    createdAt: v.number()
  }).index("by_company", ["companyId", "createdAt"])
    .index("by_agent", ["agentId", "createdAt"]),

  // Website Widget Integration
  widgets: defineTable({
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    name: v.string(), // Identifier (e.g., "Main Website Bot")
    allowedDomains: v.array(v.string()), // Security boundary e.g., ["https://acmecorp.com"]
    themePrimaryColor: v.optional(v.string()),
    themeGreeting: v.optional(v.string()),
    themeLogoUrl: v.optional(v.string()),
    themePlaceholder: v.optional(v.string()),
    enableSounds: v.optional(v.boolean()),
    showPopupPreview: v.optional(v.boolean()),
    requireName: v.optional(v.boolean()),
    requireEmail: v.optional(v.boolean()),
    conversationStarters: v.optional(v.array(v.string())),
    enableGreeting: v.optional(v.boolean()),
    isActive: v.boolean(),
    isGlobal: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_company", ["companyId"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_global", ["isGlobal"])
    .index("by_global_created", ["isGlobal", "createdAt"]),

  // Aggregated Analytics Snapshots
  analyticsDailySnapshots: defineTable({
    date: v.string(), // "YYYY-MM-DD"
    type: v.union(v.literal("global"), v.literal("company"), v.literal("user")),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    metrics: v.object({
      totalMessages: v.number(),
      totalInputTokens: v.number(),
      totalOutputTokens: v.number(),
      costGBP: v.number(),
      activeUsersCount: v.optional(v.number()),
    }),
    uniqueUserIds: v.optional(v.array(v.string())), // Array of user IDs (strings to allow WIDGET_USER_GROUP)
    modelMetrics: v.optional(v.array(v.object({
      model: v.string(),
      cost: v.number(),
      calls: v.number()
    }))),
    leaderboards: v.optional(v.object({
      topAgents: v.array(v.object({
        id: v.string(),
        name: v.string(),
        avatar: v.string(),
        cost: v.number(),
        interactions: v.number(),
      })),
      topUsers: v.array(v.object({
        id: v.string(),
        name: v.string(),
        image: v.string(),
        email: v.optional(v.string()),
        companyName: v.optional(v.string()),
        cost: v.number(),
        messages: v.number(),
      })),
    })),
  })
    .index("by_date", ["date"])
    .index("by_type_date", ["type", "date"])
    .index("by_company_date", ["companyId", "date"])
    .index("by_user_date", ["userId", "date"]),

  apifyRuns: defineTable({
    runId: v.string(), // The Apify run ID
    actorId: v.string(),
    status: v.union(v.literal("PENDING"), v.literal("COMPLETED"), v.literal("FAILED")),
    startedBy: v.id("users"),
    companyId: v.optional(v.id("companies")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    propertiesScraped: v.optional(v.number()),
  }).index("by_runId", ["runId"])
    .index("by_company", ["companyId", "startedAt"]),

  properties: defineTable({
    runId: v.optional(v.string()), // The Apify run ID that scraped this
    rightmoveId: v.string(), // The unique Rightmove property ID
    address: v.string(),
    price: v.number(),
    currency: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    url: v.string(),
    imageUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    features: v.optional(v.array(v.string())),
    images: v.optional(v.array(v.string())),
    floorplans: v.optional(v.array(v.string())),
    epcRating: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    agentName: v.optional(v.string()),
    agentPhone: v.optional(v.string()),
    agentProfileUrl: v.optional(v.string()),
    addedOn: v.optional(v.string()),
    firstVisibleDate: v.optional(v.string()),
    listingUpdateDate: v.optional(v.string()),
    listingUpdateReason: v.optional(v.string()),
    productLabel: v.optional(v.string()),
    sizeSqFeetMin: v.optional(v.string()),
    sizeSqFeetMax: v.optional(v.string()),
    companyId: v.optional(v.id("companies")), // Which tenant triggered the scrape
    scrapedAt: v.number(),
  }).index("by_rightmoveId", ["rightmoveId"])
    .index("by_company", ["companyId", "scrapedAt"])
    .index("by_runId", ["runId"])
    .searchIndex("search_address", {
      searchField: "address",
      filterFields: ["companyId"],
    }),

  movements: defineTable({
    title: v.string(),
    difficulty: v.string(),
    poseData: v.string(),
    poseDataFormat: v.optional(v.union(
      v.literal("legacy-inline-json"),
      v.literal("legacy-storage-json"),
      v.literal("storage-json-v1")
    )),
    poseStorageId: v.optional(v.id("_storage")),
    frameCount: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    captureFps: v.optional(v.number()),
    schemaVersion: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"])
    .searchIndex("search_title", { searchField: "title" }),

  mockStorageMetadata: defineTable({
    storageId: v.string(),
    size: v.number(),
    contentType: v.optional(v.string()),
  }).index("by_storageId", ["storageId"]),

  purgeHistory: defineTable({
    pipelineKey: v.union(
      v.literal("agentLogs"),
      v.literal("workflowLogs"),
      v.literal("userLogins"),
      v.literal("chatHistory"),
      v.literal("auditLogs")
    ),
    triggerType: v.union(v.literal("SCHEDULED"), v.literal("MANUAL")),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("CANCELLED")
    ),
    recordsPurged: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    actorId: v.optional(v.id("users")), // Super Admin who manually triggered it
  })
    .index("by_started", ["startedAt"])
    .index("by_pipeline_started", ["pipelineKey", "startedAt"]),

  maintenanceScriptRuns: defineTable({
    scriptId: v.string(),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    actorId: v.id("users"),
    actorName: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    metadata: v.optional(v.string()),
  })
    .index("by_script_started", ["scriptId", "startedAt"])
    .index("by_started", ["startedAt"]),
});
