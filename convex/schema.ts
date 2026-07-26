import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// template:remove:start movement
const movementCameraBodyPartValidator = v.union(
  v.literal("head"),
  v.literal("torso"),
  v.literal("leftArm"),
  v.literal("rightArm"),
  v.literal("leftHand"),
  v.literal("rightHand"),
  v.literal("leftLeg"),
  v.literal("rightLeg"),
  v.literal("leftFoot"),
  v.literal("rightFoot")
);

const movementStartReadinessValidator = v.object({
  blockedReasons: v.array(v.string()),
  calibrationQuality: v.union(v.number(), v.null()),
  canStartGame: v.boolean(),
  canStartRecording: v.boolean(),
  countdownMsRemaining: v.number(),
  promptEvents: v.array(v.union(
    v.literal("get-ready"),
    v.literal("walk-back-into-frame"),
    v.literal("show-your-whole-body"),
    v.literal("show-your-hands"),
    v.literal("show-your-feet"),
    v.literal("hold-still-for-calibration")
  )),
  requiredBodyParts: v.array(movementCameraBodyPartValidator),
  state: v.union(
    v.literal("countdown"),
    v.literal("checking-visibility"),
    v.literal("calibrating"),
    v.literal("ready"),
    v.literal("blocked")
  ),
  visibleBodyParts: v.array(movementCameraBodyPartValidator),
});
// template:remove:end

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
    emailSenderName: v.optional(v.string()),
    emailSenderAddress: v.optional(v.string()),
    // Where the assistant should send pricing enquiries. Deployment-specific,
    // so it must never be hardcoded into a seeded AI rule.
    salesContactEmail: v.optional(v.string()),
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
    diagnosticRoutingEnabled: v.optional(v.boolean()),
    // Which white-label navigation profile this deployment uses. Previously the
    // profiles were advisory text in an admin screen that nothing consumed.
    // Kept a scalar because SystemSettingsFormData carries scalars only; the
    // resolver also supports per-deployment overrides if that is ever needed.
    navigationProfileKey: v.optional(v.string()),
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

  /**
   * Counts for the model catalogue and the providers table.
   *
   * The pager needs a total and the providers screen wants "15 models, 4 on" per
   * row. Counting cannot be indexed away — an index finds rows, it does not
   * total them — and counting on every page load is the fan-out that had to be
   * removed from the Skill Center.
   *
   * Unlike the skills rollup this one is **recomputed on write rather than on a
   * schedule**, because models change only when an admin syncs a provider or
   * toggles a model. Recomputing costs one pass over the catalogue at those
   * moments and makes drift impossible, which is worth more than the saving from
   * keeping deltas correct across four separate write paths.
   */
  aiModelRollups: defineTable({
    /** One document. A fixed key so it can be found without scanning. */
    rollupKey: v.string(),
    totalModels: v.number(),
    enabledModels: v.number(),
    byProvider: v.array(v.object({
      providerKey: v.string(),
      total: v.number(),
      enabled: v.number(),
    })),
    computedAt: v.number(),
    /** True when the walk hit its ceiling, so the screen never presents a truncated count as a total. */
    isPartial: v.boolean(),
  }).index("by_rollup_key", ["rollupKey"]),

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
    .index("by_company_use_case", ["companyId", "useCase"])
    // Answers "what is this provider currently handling?" before someone
    // switches it off. Without it that question means reading every default row
    // in the deployment, which grows with the number of companies.
    .index("by_provider", ["providerKey"]),

  /**
   * Pre-computed counts for the Skill Center health panel.
   *
   * Those five numbers used to be produced on every page load by reading up to
   * 250 skills and up to 100 bindings for each — up to 25,000 documents, and
   * silently wrong past the 250th skill. Counting cannot be indexed away: an
   * index finds rows, it does not total them. So the totals are computed once,
   * on a schedule and on demand, and read as a single document.
   *
   * `computedAt` and `isPartial` exist so the screen can say how old the
   * numbers are and whether they cover the whole catalogue. A number whose age
   * and completeness are visible is honest; the same number presented as live
   * truth is not.
   */
  agentSkillRollups: defineTable({
    key: v.string(),
    skills: v.number(),
    activeSkills: v.number(),
    draftSkills: v.number(),
    archivedSkills: v.number(),
    highRiskSkills: v.number(),
    totalBindings: v.number(),
    enabledBindings: v.number(),
    activeAgentBindings: v.number(),
    outdatedBindings: v.number(),
    currentBindings: v.number(),
    validatedBindings: v.number(),
    needsSmokeBindings: v.number(),
    highRiskNeedsSmokeBindings: v.number(),
    needsAttention: v.array(v.object({
      skillId: v.id("agentSkills"),
      name: v.string(),
      category: v.string(),
      riskLevel: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH")),
      boundAgents: v.number(),
      enabledAgents: v.number(),
      outdatedAgents: v.number(),
      needsSmokeAgents: v.number(),
      validatedAgents: v.number(),
    })),
    /** How many skills the rebuild actually walked. */
    skillsCounted: v.number(),
    /** True when the catalogue is larger than one rebuild can cover. */
    isPartial: v.boolean(),
    computedAt: v.number(),
  }).index("by_key", ["key"]),

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
  
  // template:remove:start arcade
  arcadeScores: defineTable({
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    game: v.string(), // e.g., "pacman"
    score: v.number(),
    playedAt: v.number(),
  }).index("by_game_score", ["game", "score"])
    .index("by_user", ["userId"]),
  // template:remove:end

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

  apiKeys: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    keyPrefix: v.string(),
    keyDigest: v.string(),
    scopes: v.array(v.union(
      v.literal("agent:run"),
      v.literal("workflow:run"),
      v.literal("run:read"),
      v.literal("webhook:deliver")
    )),
    status: v.union(v.literal("ACTIVE"), v.literal("REVOKED")),
    rateLimitPerMinute: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
    revocationReason: v.optional(v.string()),
  })
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_prefix", ["keyPrefix"])
    .index("by_created", ["createdAt"]),

  publicApiRequests: defineTable({
    companyId: v.optional(v.id("companies")),
    apiKeyId: v.optional(v.id("apiKeys")),
    keyPrefix: v.optional(v.string()),
    method: v.string(),
    path: v.string(),
    requiredScope: v.optional(v.union(
      v.literal("agent:run"),
      v.literal("workflow:run"),
      v.literal("run:read"),
      v.literal("webhook:deliver")
    )),
    status: v.union(
      v.literal("AUTHORIZED"),
      v.literal("UNAUTHORIZED"),
      v.literal("FORBIDDEN"),
      v.literal("RATE_LIMITED")
    ),
    statusCode: v.number(),
    error: v.optional(v.string()),
    requestedAt: v.number(),
  })
    .index("by_company_requested", ["companyId", "requestedAt"])
    .index("by_api_key_requested", ["apiKeyId", "requestedAt"])
    .index("by_requested", ["requestedAt"]),

  aiActionRequests: defineTable({
    actorId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    actionName: v.union(
      v.literal("transcribeAudio"),
      v.literal("generateNodeConfig")
    ),
    requestedAt: v.number(),
  })
    .index("by_actor_action_requested", ["actorId", "actionName", "requestedAt"])
    .index("by_company_action_requested", ["companyId", "actionName", "requestedAt"])
    .index("by_requested", ["requestedAt"]),

  webhookDeliveries: defineTable({
    companyId: v.id("companies"),
    eventType: v.string(),
    destinationUrl: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("DELIVERING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("RETRY_SCHEDULED"),
      v.literal("ABANDONED")
    ),
    sourceType: v.optional(v.union(
      v.literal("agentRun"),
      v.literal("workflowRun"),
      v.literal("publicApi"),
      v.literal("manual")
    )),
    sourceId: v.optional(v.string()),
    requestBodyPreview: v.optional(v.string()),
    responseBodyPreview: v.optional(v.string()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    lastStatusCode: v.optional(v.number()),
    lastError: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_created", ["createdAt"]),

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
    // Which check this run was of, when it was one.
    //
    // The fixture id was only ever recorded inside a run *step's* metadata JSON, so
    // "show me this check's history" meant reading recent runs for the agent, then
    // reading every one's steps, then parsing each blob. Stamped on the run it is a
    // single indexed range read.
    evalFixtureId: v.optional(v.id("agentEvalFixtures")),
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
    // One check's history, without reading every run the agent has ever had.
    .index("by_eval_fixture_started", ["evalFixtureId", "startedAt"])
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_company_status_started", ["companyId", "status", "startedAt"])
    .index("by_replay_source_started", ["replayOfRunId", "startedAt"])
    .index("by_status_started", ["status", "startedAt"])
    .index("by_thread_started", ["threadId", "startedAt"])
    .index("by_workflow_started", ["workflowId", "startedAt"])
    .index("by_schedule_started", ["scheduleId", "startedAt"]),

  /**
   * The resumable state of an in-flight agent run: one row per run, replaced as
   * the objective loop advances.
   *
   * The loop used to hold everything in memory inside a single Convex action, so
   * a run that was killed part-way lost every step it had completed and the user
   * got a generic failure. This is what a continuation reads to pick up where the
   * previous segment left off, and what the sweeper reads to tell a dead run from
   * a slow one.
   *
   * Deleted once the run reaches a terminal state — it is working state, not an
   * audit trail. The audit trail is `agentRunSteps`.
   */
  agentRunCheckpoints: defineTable({
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    threadId: v.optional(v.id("threads")),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("AWAITING_APPROVAL")
    ),
    /**
     * The provider conversation so far, serialised. Carries the expensive parts
     * of the run — the RAG context, retrieved memories and every tool result —
     * so a continuation does not repeat that work or pay for it twice.
     */
    transcriptJson: v.string(),
    /** Set when the transcript had to be trimmed from the front to fit. */
    transcriptTrimmed: v.optional(v.boolean()),
    /** Loop counters, so budgets are enforced across the whole run, not per segment. */
    stepIndex: v.number(),
    loopIndex: v.number(),
    toolCallCount: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    /** The reply row being streamed into, so one answer stays one message. */
    streamMessageId: v.optional(v.id("messages")),
    /**
     * How many leading turns form the run's stable prompt prefix — the part
     * every turn re-sends and every provider's caching depends on being
     * unchanged. Zero means no prefix is being tracked, which is what a trimmed
     * transcript falls back to.
     */
    stablePrefixTurns: v.optional(v.number()),
    /**
     * Provider-side cache object holding that prefix, where the provider works
     * that way. Carried across segments so a continuation reuses the cache
     * rather than paying to build a second one.
     */
    promptCacheName: v.optional(v.string()),
    segmentCount: v.number(),
    resumeAttempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_company_updated", ["companyId", "updatedAt"]),

  /**
   * Completed side-effecting tool calls, keyed by the caller's idempotency key.
   *
   * `idempotencyKey` was accepted by the one write tool and recorded in the
   * audit log, and nothing ever read it back — so a retried write applied twice.
   * With the runtime now able to resume a run after a crash or an approval, a
   * tool call genuinely can be re-issued, and a key that does not deduplicate is
   * worse than no key at all: it advertises a protection that is not there.
   *
   * Scoped by company so one tenant's key can never suppress another's write.
   */
  agentToolIdempotency: defineTable({
    companyId: v.id("companies"),
    handlerMapping: v.string(),
    idempotencyKey: v.string(),
    /** The original result, replayed verbatim so a retry looks like the first call. */
    resultJson: v.string(),
    runId: v.optional(v.id("agentRuns")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_scope_key", ["companyId", "handlerMapping", "idempotencyKey"])
    .index("by_expires", ["expiresAt"]),

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
      v.literal("NOT_IMPLEMENTED"),
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
    sourceSkillId: v.optional(v.id("agentSkills")),
    sourceSkillVersionId: v.optional(v.id("agentSkillVersions")),
    skillAttributionReason: v.optional(v.string()),
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
    /** Carried onto the memory when the suggestion is applied. */
    applyMode: v.optional(v.union(
      v.literal("ALWAYS"),
      v.literal("WHEN_RELEVANT")
    )),
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
    /**
     * Set when a suggestion is turned down, so the same wording is not proposed
     * again. The company side has had this since the start; the agent side did
     * not, which was survivable only while nothing proposed automatically.
     */
    rejectedFingerprint: v.optional(v.string()),
    appliedMemoryId: v.optional(v.id("agentMemories")),
    /**
     * Absent when the platform proposed it at the end of a run rather than an
     * admin asking for suggestions. On approval the memory records whoever
     * accepted it.
     */
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["sourceRunId", "createdAt"])
    .index("by_reflection_created", ["sourceReflectionId", "createdAt"])
    .index("by_skill_status_created", ["sourceSkillId", "status", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_agent_rejected_fingerprint", ["agentId", "rejectedFingerprint"]),

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
    /*
     * How many times to give the agent the task, per run. Absent means once.
     *
     * Same reasoning as the company side: a check that passes two times in three is a
     * check that fails one conversation in three, and one attempt cannot tell those
     * apart. Opt-in, because each extra sample is a whole agent turn plus a grade.
     */
    sampleCount: v.optional(v.number()),
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
    sourceSkillId: v.optional(v.id("agentSkills")),
    sourceSkillVersionId: v.optional(v.id("agentSkillVersions")),
    createdBy: v.id("users"),
    type: v.union(
      v.literal("PROMPT_CHANGE"),
      v.literal("RULE_CHANGE"),
      v.literal("TOOL_SCHEMA_CHANGE"),
      v.literal("ROUTING_CHANGE"),
      v.literal("APPROVAL_POLICY_CHANGE"),
      v.literal("SKILL_INSTRUCTION_CHANGE")
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
    appliedSkillVersionId: v.optional(v.id("agentSkillVersions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["sourceRunId", "createdAt"])
    .index("by_agent_status_created", ["agentId", "status", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_eval_fixture_created", ["sourceEvalFixtureId", "createdAt"])
    .index("by_reflection_created", ["sourceReflectionId", "createdAt"])
    .index("by_skill_status_created", ["sourceSkillId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  agentVersions: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    versionNumber: v.number(),
    snapshotHash: v.string(),
    snapshotJson: v.string(),
    promptHash: v.string(),
    toolSetHash: v.string(),
    skillSetHash: v.optional(v.string()),
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
    ownerEmail: v.optional(v.string()),
    approvalComment: v.optional(v.string()),
    rollbackReason: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
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

  agentSkills: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("ACTIVE"),
      v.literal("ARCHIVED")
    ),
    riskLevel: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH")
    ),
    instruction: v.string(),
    requiredToolMappingsJson: v.optional(v.string()),
    recommendedToolMappingsJson: v.optional(v.string()),
    recommendedKnowledgeJson: v.optional(v.string()),
    defaultRulesJson: v.optional(v.string()),
    suggestedEvalFixturesJson: v.optional(v.string()),
    // Where the skill came from, when it came from a SKILL.md file.
    //
    // Before these existed the filename was written to an audit log and the
    // markdown was thrown away, so re-uploading an edited file created a second
    // skill rather than a new version of the first, and nothing could show the
    // reader what the file said. Optional because skills created in the admin
    // UI, cloned, or seeded as starters have no file behind them.
    sourceFilename: v.optional(v.string()),
    /** Hash of the uploaded markdown, so an unchanged re-upload is a no-op. */
    sourceHash: v.optional(v.string()),
    /** The uploaded file verbatim: the source of truth the screens render. */
    sourceMarkdown: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_created", ["status", "createdAt"])
    .index("by_category_created", ["category", "createdAt"])
    // Re-uploading a SKILL.md must find the skill it already created. The file
    // is usually named SKILL.md whatever it contains, so the frontmatter name
    // is the identity, not the filename.
    .index("by_name", ["name"])
    // `filterFields` so a search can be narrowed in the database. Filtering a
    // page after it arrives is the mistake this whole pass exists to remove:
    // ask for fifteen, get three, and no way to tell whether that is the answer
    // or the truncation.
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["status", "category", "riskLevel"],
    }),

  agentSkillVersions: defineTable({
    skillId: v.id("agentSkills"),
    versionNumber: v.number(),
    snapshotHash: v.string(),
    snapshotJson: v.string(),
    instructionHash: v.string(),
    toolRequirementHash: v.string(),
    evalHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_skill_created", ["skillId", "createdAt"])
    .index("by_skill_hash", ["skillId", "snapshotHash"]),

  agentSkillBindings: defineTable({
    agentId: v.id("agents"),
    skillId: v.id("agentSkills"),
    skillVersionId: v.id("agentSkillVersions"),
    companyId: v.optional(v.id("companies")),
    isEnabled: v.boolean(),
    assignedBy: v.id("users"),
    assignedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_enabled", ["agentId", "isEnabled"])
    .index("by_skill_enabled", ["skillId", "isEnabled"])
    .index("by_agent_skill", ["agentId", "skillId"])
    .index("by_company_enabled", ["companyId", "isEnabled"]),

  agentMemories: defineTable({
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    sourceRunId: v.optional(v.id("agentRuns")),
    sourceThreadId: v.optional(v.id("threads")),
    /**
     * Retained for existing rows and for the audit trail. Nothing reads it:
     * applyMode below is what decides when a memory reaches the model.
     */
    kind: v.union(
      v.literal("FACT"),
      v.literal("PREFERENCE"),
      v.literal("SUMMARY"),
      v.literal("INSTRUCTION")
    ),
    /**
     * When this memory reaches the model. ALWAYS is added to the system
     * instruction on every message; WHEN_RELEVANT is looked up per message.
     * Optional so existing rows stay valid — absent reads as WHEN_RELEVANT.
     */
    applyMode: v.optional(v.union(
      v.literal("ALWAYS"),
      v.literal("WHEN_RELEVANT")
    )),
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
    .index("by_agent_active_applymode_updated", ["agentId", "isActive", "applyMode", "updatedAt"])
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

  companyMemories: defineTable({
    companyId: v.id("companies"),
    title: v.string(),
    content: v.string(),
    normalizedContent: v.string(),
    /**
     * Retained for existing rows and for the audit trail. Nothing reads it:
     * applyMode below is what decides when a memory reaches the model.
     */
    category: v.string(),
    /**
     * When this memory reaches the model. ALWAYS is added to the system
     * instruction on every message; WHEN_RELEVANT is looked up per message.
     * Optional so existing rows stay valid — absent reads as WHEN_RELEVANT.
     */
    applyMode: v.optional(v.union(
      v.literal("ALWAYS"),
      v.literal("WHEN_RELEVANT")
    )),
    status: v.union(
      v.literal("APPROVED"),
      v.literal("ARCHIVED")
    ),
    confidence: v.number(),
    sourceType: v.union(
      v.literal("MANUAL"),
      v.literal("CHAT"),
      v.literal("WIDGET"),
      v.literal("KNOWLEDGE"),
      v.literal("EVAL"),
      v.literal("AGENT_RUN"),
      v.literal("WORKFLOW_RUN")
    ),
    sourceIdsJson: v.optional(v.string()),
    rejectedFingerprint: v.optional(v.string()),
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    archivedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    usageCount: v.number(),
  })
    .index("by_company_updated", ["companyId", "updatedAt"])
    .index("by_company_status_updated", ["companyId", "status", "updatedAt"])
    .index("by_company_category_status", ["companyId", "category", "status"])
    .index("by_company_status_applymode_updated", ["companyId", "status", "applyMode", "updatedAt"])
    .index("by_company_rejected_fingerprint", ["companyId", "rejectedFingerprint"])
    .searchIndex("search_content", {
      searchField: "normalizedContent",
      filterFields: ["companyId", "status"],
    }),

  companyMemoryCandidates: defineTable({
    companyId: v.id("companies"),
    title: v.optional(v.string()),
    content: v.string(),
    normalizedContent: v.string(),
    category: v.string(),
    /** Carried onto the memory when the suggestion is approved. */
    applyMode: v.optional(v.union(
      v.literal("ALWAYS"),
      v.literal("WHEN_RELEVANT")
    )),
    sourceType: v.union(
      v.literal("MANUAL"),
      v.literal("CHAT"),
      v.literal("WIDGET"),
      v.literal("KNOWLEDGE"),
      v.literal("EVAL"),
      v.literal("AGENT_RUN"),
      v.literal("WORKFLOW_RUN")
    ),
    sourceIdsJson: v.optional(v.string()),
    reason: v.optional(v.string()),
    confidence: v.number(),
    status: v.union(
      v.literal("PROPOSED"),
      v.literal("APPROVED"),
      v.literal("REJECTED")
    ),
    rejectedFingerprint: v.optional(v.string()),
    /**
     * Absent when the platform proposed it rather than a person. Naming an
     * admin who was not involved would be a lie the audit trail then repeats;
     * on approval the memory records whoever accepted it.
     */
    createdBy: v.optional(v.id("users")),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    appliedMemoryId: v.optional(v.id("companyMemories")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_company_status_created", ["companyId", "status", "createdAt"])
    .index("by_company_source", ["companyId", "sourceType", "createdAt"])
    .index("by_company_rejected_fingerprint", ["companyId", "rejectedFingerprint"]),

  companyMemoryUsage: defineTable({
    memoryId: v.id("companyMemories"),
    companyId: v.id("companies"),
    threadId: v.id("threads"),
    messageId: v.optional(v.id("messages")),
    queryText: v.string(),
    score: v.number(),
    usedAt: v.number(),
  })
    .index("by_memory_used", ["memoryId", "usedAt"])
    .index("by_company_used", ["companyId", "usedAt"])
    .index("by_thread_used", ["threadId", "usedAt"]),

  /**
   * Where the memory-suggestion sweep got to for each company.
   *
   * One row per company, so a sweep reads only the messages that have arrived
   * since it last looked. Without this the sweep would re-read the same
   * conversations every few hours and pay a model for the same answer.
   */
  companyMemorySweeps: defineTable({
    companyId: v.id("companies"),
    /** Messages at or before this point have already been considered. */
    lastSweptAt: v.number(),
    lastRunAt: v.number(),
    /** What the last sweep did, so the operator can see it working. */
    lastMessagesRead: v.number(),
    lastSuggested: v.number(),
    lastSkippedReason: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  companySkills: defineTable({
    companyId: v.id("companies"),
    sourceAgentSkillId: v.optional(v.id("agentSkills")),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("ACTIVE"),
      v.literal("ARCHIVED")
    ),
    riskLevel: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH")
    ),
    instruction: v.string(),
    inputContractJson: v.optional(v.string()),
    outputContractJson: v.optional(v.string()),
    requiredToolsJson: v.optional(v.string()),
    approvalPolicyJson: v.optional(v.string()),
    recommendedKnowledgeJson: v.optional(v.string()),
    versionLabel: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedBy: v.optional(v.id("users")),
    archivedAt: v.optional(v.number()),
  })
    .index("by_company_status_updated", ["companyId", "status", "updatedAt"])
    .index("by_company_category_status", ["companyId", "category", "status"])
    .index("by_company_source_skill", ["companyId", "sourceAgentSkillId"])
    // Re-uploading a SKILL.md has to reach every company copy made from it, and
    // the company is not known at that point — only the skill.
    .index("by_source_skill", ["sourceAgentSkillId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["companyId", "status"],
    }),

  companySkillBindings: defineTable({
    companyId: v.id("companies"),
    skillId: v.id("companySkills"),
    surfaceType: v.union(
      v.literal("COMPANY_CHAT"),
      v.literal("WIDGET"),
      v.literal("AGENT"),
      v.literal("WORKFLOW"),
      v.literal("APP_KIT")
    ),
    surfaceId: v.optional(v.string()),
    isEnabled: v.boolean(),
    assignedBy: v.id("users"),
    assignedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_surface_enabled", ["companyId", "surfaceType", "isEnabled"])
    .index("by_company_skill_enabled", ["companyId", "skillId", "isEnabled"])
    .index("by_company_skill_surface", ["companyId", "skillId", "surfaceType"]),

  companyAiDriftEvents: defineTable({
    companyId: v.id("companies"),
    sourceType: v.union(
      v.literal("KNOWLEDGE"),
      v.literal("MEMORY"),
      v.literal("SKILL"),
      v.literal("EVAL"),
      v.literal("RULE"),
      v.literal("MODEL"),
      v.literal("WIDGET"),
      v.literal("PROMPT")
    ),
    sourceId: v.optional(v.string()),
    reason: v.string(),
    affectedEvalCategoriesJson: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolvedRunId: v.optional(v.id("companyEvalRuns")),
  })
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_company_source_created", ["companyId", "sourceType", "createdAt"])
    .index("by_company_resolved_created", ["companyId", "resolvedAt", "createdAt"]),

  companyEvalCases: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    severity: v.union(
      v.literal("BLOCKER"),
      v.literal("WARNING"),
      v.literal("ADVISORY")
    ),
    targetSurface: v.union(
      v.literal("COMPANY_CHAT"),
      v.literal("WIDGET"),
      v.literal("AGENT"),
      v.literal("WORKFLOW"),
      v.literal("APP_KIT")
    ),
    prompt: v.string(),
    expectedBehavior: v.string(),
    requiredSourcesJson: v.optional(v.string()),
    requiredMemoriesJson: v.optional(v.string()),
    requiredSkillsJson: v.optional(v.string()),
    forbiddenClaimsJson: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("ARCHIVED")),
    lastRunId: v.optional(v.id("companyEvalRuns")),
    // Rolled up from the latest run so readiness and the summary never scan the
    // run table. Reading "the latest run per case" by taking 1000 runs and
    // reducing them in memory was the same work repeated in three places, and it
    // silently truncated for any company past the limit. Absent means never run,
    // which is the safe reading for rows written before this field existed.
    lastRunStatus: v.optional(v.union(
      v.literal("PASSED"),
      v.literal("FAILED"),
      v.literal("NEEDS_REVIEW")
    )),
    // When that result landed. With this on the row, the checks list needs no run
    // query at all: the case carries everything the table shows.
    lastRunAt: v.optional(v.number()),
    /*
     * How many times to ask, per run. Absent means once.
     *
     * A single sample of a non-deterministic system is weak evidence. A check that
     * passes two times in three is a check that fails one conversation in three, and
     * one ask cannot tell those apart. Opt-in rather than default, because each extra
     * sample is another two provider calls and real money.
     */
    sampleCount: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedBy: v.optional(v.id("users")),
    archivedAt: v.optional(v.number()),
  })
    .index("by_company_status_updated", ["companyId", "status", "updatedAt"])
    .index("by_company_surface", ["companyId", "targetSurface"])
    // Must-pass cases drive the readiness gates, so they are selected by index
    // rather than by filtering every active case in memory.
    .index("by_company_status_severity", ["companyId", "status", "severity"])
    .index("by_company_status_surface_severity", ["companyId", "status", "targetSurface", "severity"]),

  companyEvalRuns: defineTable({
    companyId: v.id("companies"),
    evalCaseId: v.id("companyEvalCases"),
    status: v.union(
      v.literal("PASSED"),
      v.literal("FAILED"),
      v.literal("NEEDS_REVIEW")
    ),
    score: v.number(),
    answer: v.string(),
    evidenceJson: v.optional(v.string()),
    deterministicResultsJson: v.string(),
    resolvedModelId: v.optional(v.string()),
    resolvedUseCase: v.optional(v.string()),
    tokenUsageJson: v.optional(v.string()),
    costJson: v.optional(v.string()),
    judgeNotes: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_company_completed", ["companyId", "completedAt"])
    .index("by_case_completed", ["evalCaseId", "completedAt"])
    .index("by_company_status_completed", ["companyId", "status", "completedAt"]),

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
    lastQueuedAt: v.optional(v.number()),
    lastIngestionStartedAt: v.optional(v.number()),
    lastIngestedAt: v.optional(v.number()),
    lastIngestionError: v.optional(v.string()),
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
  })
    .index("by_document", ["documentId"])
    // Which model embedded a chunk, so a re-embed after a model change is
    // countable. Without it, "how many chunks are still on the old model" meant
    // reading every chunk, which on 2,000 chunks came within 0.4MB of Convex's
    // 16.7MB per-execution read limit.
    .index("by_embedding_model", ["embeddingModelId"]),

  // Sonae Assistant Tables
  threads: defineTable({
    userId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")), // Sandbox tracking
    widgetId: v.optional(v.id("widgets")), // To link threads directly to a widget
    widgetAccessTokenHash: v.optional(v.string()),
    sourceUrl: v.optional(v.string()), // The URL where the user initiated the chat
    title: v.optional(v.string()), // Generated lazily after first exchange
    /**
     * Marks a thread the platform created for itself rather than for a person.
     *
     * An eval has to run through the real chat runtime to test the agent that
     * ships — same tools, memories, skills, retrieval and budgets — and that
     * runtime needs a thread. Without this flag those threads would appear in
     * the admin's own conversation list, which is both confusing and a slow
     * leak of eval transcripts into a personal history.
     */
    purpose: v.optional(v.literal("EVAL")),
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
    companyMemoryEvidenceJson: v.optional(v.string()),
    // Which company skills reached the model and which knowledge chunks retrieval
    // admitted, as `{version, skillIds, sourceIds}`. A check that requires a
    // document or a skill is graded against this; without it, the ids were
    // computed during prompt assembly and thrown away.
    companyRuntimeEvidenceJson: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    agentId: v.optional(v.id("agents")),
    widgetId: v.optional(v.id("widgets")),
    analyticsDimensionsVersion: v.optional(v.number()),
    attachments: v.optional(v.array(v.id("_storage"))),
    // Set while a reply is still being written token by token. Clients show a
    // caret; readers see the answer build instead of watching a spinner.
    isStreaming: v.optional(v.boolean()),
    // When the stream opened, so a reply orphaned by a killed run can be told
    // apart from one that is genuinely still arriving.
    streamStartedAt: v.optional(v.number()),
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
    // Per-agent runtime budget. Unset means the platform default; values are
    // clamped to the ceilings in agentRuntimeService so a misconfigured agent
    // cannot spend without limit. Previously every agent on the platform shared
    // one hardcoded budget.
    maxSteps: v.optional(v.number()),
    maxToolCalls: v.optional(v.number()),
    maxRuntimeMs: v.optional(v.number()),
    maxCostGBP: v.optional(v.number()),
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
    companyId: v.optional(v.id("companies")),
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
    companyId: v.optional(v.id("companies")),
    webhookSecret: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  workflowExecutions: defineTable({
    workflowId: v.optional(v.id("workflows")),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    agentRunId: v.optional(v.id("agentRuns")),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    triggerType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    startedBy: v.id("users"),
    state: v.optional(v.string()), // JSON representation of final execution state for debugging
  }).index("by_workflow", ["workflowId", "startedAt"])
    .index("by_company_started", ["companyId", "startedAt"])
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

  // Applied-migration ledger. One row per named migration, so a backfill runs
  // once, can resume from its cursor after a failure, and leaves an audit
  // trail of what was changed and when.
  dataMigrations: defineTable({
    name: v.string(),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
    ),
    /** Pagination cursor for the next batch; absent once complete. */
    cursor: v.optional(v.string()),
    /** Documents examined, including ones that needed no change. */
    processed: v.number(),
    /** Documents actually patched. */
    updated: v.number(),
    batches: v.number(),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_name", ["name"]),

  swarmLogs: defineTable({
    threadId: v.id("threads"),
    // Denormalised from the owning thread so swarm logs carry tenant
    // provenance of their own. Optional because rows written before this field
    // was added are not backfilled; see the migrations item in
    // docs/plans/active/platform-hardening-plan.md.
    companyId: v.optional(v.id("companies")),
    message: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
    order: v.number(),
    isHeading: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId", "order"])
    .index("by_company", ["companyId"]),

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
    /**
     * Everything a reader might type, in one field.
     *
     * The catalogue used to search two indexes — one over `displayName`, one
     * over `modelId` — and merge the results in memory. Two paginated queries
     * cannot be merged into one page without reading both in full, which is why
     * that query took the whole catalogue and sliced it in the browser's stead.
     *
     * One field means one index, which means the page can genuinely come from
     * the database. It holds the friendly name, the display name, the stable id
     * and the provider's own id, and is rebuilt by `buildModelSearchText`
     * wherever a model is written.
     */
    searchText: v.optional(v.string()),
  })
    .index("by_model_id", ["modelId"])
    .index("by_provider", ["providerKey"])
    .index("by_provider_model", ["providerKey", "providerModelId"])
    .index("by_provider_enabled", ["providerKey", "isEnabled"])
    .index("by_enabled", ["isEnabled"])
    .index("by_default", ["isDefault"])
    // `filterFields` is the point: without them a filter is applied after the
    // search has already paged, so a search whose first page is entirely
    // inactive returns nothing at all. That exact fault was found and fixed in
    // the Skill Center; this is the same shape.
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["providerKey", "isEnabled"],
    }),

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

  // template:remove:start salesReports
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
  // template:remove:end

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

  // template:remove:start properties
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
  // template:remove:end

  // template:remove:start movement
  movements: defineTable({
    title: v.string(),
    difficulty: v.string(),
    poseData: v.string(),
    poseDataFormat: v.optional(v.union(
      v.literal("legacy-inline-json"),
      v.literal("legacy-storage-json"),
      v.literal("storage-json-v1"),
      v.literal("storage-json-v2"),
      v.literal("storage-json-v3")
    )),
    poseStorageId: v.optional(v.id("_storage")),
    frameCount: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    captureFps: v.optional(v.number()),
    schemaVersion: v.optional(v.number()),
    spineGoal: v.optional(v.union(
      v.literal("neutralStack"),
      v.literal("hipHinge"),
      v.literal("rollDown"),
      v.literal("thoracicRotation"),
      v.literal("sideBend"),
      v.literal("extension"),
      v.literal("squatWithStack")
    )),
    primaryCue: v.optional(v.string()),
    bodyFocus: v.optional(v.array(v.union(
      v.literal("neck"),
      v.literal("shoulders"),
      v.literal("ribcage"),
      v.literal("pelvis"),
      v.literal("hips"),
      v.literal("feet")
    ))),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"])
    .index("by_spineGoal_createdAt", ["spineGoal", "createdAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["spineGoal"],
    }),

  movementDebugSessions: defineTable({
    movementId: v.id("movements"),
    trigger: v.union(
      v.literal("debug-auto-baseline"),
      v.literal("manual-debug-save")
    ),
    sampleCount: v.number(),
    durationMs: v.number(),
    startedAt: v.number(),
    endedAt: v.number(),
    baselineSummary: v.string(),
    warningSummary: v.string(),
    captureStartReadiness: v.optional(movementStartReadinessValidator),
    samplesJson: v.string(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"])
    .index("by_movement_createdAt", ["movementId", "createdAt"]),
  // template:remove:end

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
