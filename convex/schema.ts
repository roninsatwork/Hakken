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

/** Named so the screen's shape can say "this, or nothing" without copying it. */
export const opportunityHeadlineValidator = v.object({
  totalOpportunityGBP: v.number(),
  prospectOpportunityGBP: v.number(),
  gapOpportunityGBP: v.number(),
  prospectCount: v.number(),
  prospectsSized: v.number(),
  prospectsUnsized: v.number(),
  prospectsUnpriced: v.number(),
  gapCount: v.number(),
  groupsExamined: v.number(),
});

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
    /**
     * Optional product modules switched on for this workspace.
     *
     * Absent or empty means the workspace sees only the platform surface,
     * which is what every existing company gets on deploy. Keys are declared
     * in `utils/companyModules.ts`; an unknown key here is inert rather than an
     * error, so removing a vertical cannot break a company record.
     */
    enabledModules: v.optional(v.array(v.string())),
    /**
     * The voice Sonae speaks with, everywhere it speaks — Ask Sonae's voice
     * overlay, the phone line, the reception screen. One of the Google live
     * voices (SPEECH_VOICE_KEYS); absent means the platform default.
     */
    spokenVoice: v.optional(v.string()),
    // Stage-three switch (wiki-replaces-knowledge plan): absent reads as ON —
    // company knowledge is answered from wiki pages, not chunk retrieval.
    // A per-company escape hatch, set false only to fall back to the old way.
    answersFromWiki: v.optional(v.boolean()),
    /**
     * When this company's memories finished moving into the wiki and rules
     * (one-brain-plan.md, phase 1). Present means the runtime stops reading
     * companyMemories for it (phase 2); absent means nothing has changed.
     */
    memoriesMigratedAt: v.optional(v.number()),
    /** The money view's visible assumptions (money-view, 2026-08-17):
     * minutes of a person's time per conversation and per call. Absent
     * means the platform defaults. Never hidden maths. */
    moneyMinutesPerConversation: v.optional(v.number()),
    moneyMinutesPerCall: v.optional(v.number()),
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
    // Retired 2026-08-10 (theme compliance plan): kept only so historic rows
    // stay valid. No screen writes them and nothing reads them any more.
    // fontFamily silently overrode the body font from legacy data;
    // subTextSizeGlobal targeted a CSS class used nowhere; fontSizeBase had
    // no editor; borderRadius steered 36 corners out of ~1,300.
    fontFamily: v.optional(v.string()),
    fontSizeBase: v.optional(v.string()),
    subTextSizeGlobal: v.optional(v.string()),
    borderRadius: v.optional(v.string()),

    // Stored as named keys ("default" | "mono"); legacy rows may hold raw
    // CSS strings, normalized on read (src/lib/themeFonts.ts).
    headingFontFamily: v.optional(v.string()),
    bodyFontFamily: v.optional(v.string()),
    headingSizeGlobal: v.optional(v.string()),

    lightBg: v.optional(v.string()),
    lightFg: v.optional(v.string()),
    lightCardBg: v.optional(v.string()),
    lightCardFg: v.optional(v.string()),
    lightBorder: v.optional(v.string()),
    lightMuted: v.optional(v.string()),
    lightMutedFg: v.optional(v.string()),
    lightSuccess: v.optional(v.string()),
    lightDestructive: v.optional(v.string()),
    lightWarning: v.optional(v.string()),
    lightInfo: v.optional(v.string()),
    lightRing: v.optional(v.string()),
    // Falls back to the card colour when absent, preserving the old
    // behaviour where cards and sidebar were one colour.
    lightSidebarBg: v.optional(v.string()),

    darkBg: v.optional(v.string()),
    darkFg: v.optional(v.string()),
    darkCardBg: v.optional(v.string()),
    darkCardFg: v.optional(v.string()),
    darkBorder: v.optional(v.string()),
    darkMuted: v.optional(v.string()),
    darkMutedFg: v.optional(v.string()),
    darkSuccess: v.optional(v.string()),
    darkDestructive: v.optional(v.string()),
    darkWarning: v.optional(v.string()),
    darkInfo: v.optional(v.string()),
    darkRing: v.optional(v.string()),
    darkSidebarBg: v.optional(v.string()),
    diagnosticRoutingEnabled: v.optional(v.boolean()),
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

  /**
   * One day of governance activity for one scope, counted as it happens.
   *
   * The governance screens used to count the estate on every visit — up to
   * ~34,500 rows across nineteen reads, capped at 2,000 per status, so the
   * compliance figures were already a floor rather than a total. These buckets
   * are rebuilt for the recent window by the cron and read whole by the
   * screen, the same trade the skills rollup already makes.
   *
   * `companyKey` is a company id, or "none" for rows belonging to nobody —
   * the register's scope rule, kept identical: companyless rows are in
   * everybody's scope. Buckets also outlive the 180-day purge of raw runs, so
   * the governance history stops being quietly erased with them.
   */
  governanceDayRollups: defineTable({
    companyKey: v.string(),
    /** ISO date, UTC — the same day key the timeline draws. */
    date: v.string(),
    finished: v.number(),
    waited: v.number(),
    unfinished: v.number(),
    runsTotal: v.number(),
    actions: v.object({
      read: v.number(),
      write: v.number(),
      external: v.number(),
      destructive: v.number(),
      total: v.number(),
    }),
    /** Who ran that day, for "busiest systems" and conformance — small: only agents that acted. */
    perAgent: v.array(v.object({
      agentId: v.string(),
      name: v.string(),
      risk: v.string(),
      runs: v.number(),
      /** Side-effect levels actually observed, for conformance checking. */
      observed: v.array(v.string()),
    })),
    /** True when a day held more rows than one rebuild reads — never expected. */
    truncated: v.boolean(),
    computedAt: v.number(),
  })
    .index("by_company_date", ["companyKey", "date"])
    .index("by_date", ["date"]),

  /**
   * The state of one scope's AI estate, snapshotted by the same cron.
   *
   * Everything here only moves when somebody changes a setting, so it is
   * rebuilt on the timer and read as a document — approvals and retention
   * config stay live reads on the dashboard, being few and indexed.
   */
  governanceEstateRollups: defineTable({
    companyKey: v.string(),
    systems: v.number(),
    riskMix: v.object({
      high: v.number(),
      medium: v.number(),
      low: v.number(),
      unrated: v.number(),
    }),
    unrated: v.number(),
    incomplete: v.number(),
    publicFacing: v.number(),
    unattendedHighRisk: v.number(),
    conformance: v.array(v.object({
      agentId: v.string(),
      agentName: v.string(),
      rating: v.string(),
      observed: v.array(v.string()),
      suggested: v.string(),
    })),
    /** True when the estate outgrew one rebuild's read — the skills rollup's own honesty flag. */
    isPartial: v.boolean(),
    computedAt: v.number(),
  }).index("by_company", ["companyKey"]),

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
    /**
     * Capabilities this tier switches on for every company holding it.
     *
     * A company reaches a capability if its plan grants it OR its own
     * `enabledModules` names it — the company list is the override, and it
     * only ever adds. Selling below the tier is not a thing this platform
     * says: to withhold what a plan grants, move the company to a plan
     * without it.
     */
    grantedModules: v.optional(v.array(v.string())),
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
    /**
     * What this person may do.
     *
     * `READ_ONLY` and `AUDITOR` are oversight roles, added for the governance
     * layer. Neither can write anywhere: `READ_ONLY` sees what an admin sees,
     * `AUDITOR` sees only the governance surfaces. They exist because the
     * alternative was making a compliance officer a full administrator so they
     * could read the register — giving the person whose job is oversight the
     * power to change what they are overseeing. See
     * docs/plans/active/governance-and-trust-plan.md.
     */
    role: v.optional(
      v.union(
        v.literal("USER"),
        v.literal("ADMIN"),
        v.literal("SUPER_ADMIN"),
        v.literal("READ_ONLY"),
        v.literal("AUDITOR")
      )
    ),
    planOverrideId: v.optional(v.id("plans")),
    messagesUsedThisPeriod: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    tokenIdentifier: v.optional(v.string()),
    /*
     * Denormalised login activity, for the admin user directory.
     *
     * Convex can only index fields on the table being paginated, so a sortable
     * "last login" column cannot be a join onto `logins`. See
     * docs/plans/active/user-directory-plan.md.
     *
     * `lastLoginAt` is exact and written inline by `recordLogin`.
     * `loginCount30d` is a rolling window and is recomputed nightly, so it is
     * accurate as of the last run rather than to the second.
     */
    lastLoginAt: v.optional(v.number()),
    loginCount30d: v.optional(v.number()),
  }).index("email", ["email"])
    .index("by_company", ["companyId"])
    .index("by_token", ["tokenIdentifier"])
    /*
     * Sorting the admin user directory by login recency, within a role or a
     * company. The trailing field is what makes the sort server-side; without
     * it the screen would have to read every user to order fifteen.
     */
    .index("by_lastLogin", ["lastLoginAt"])
    .index("by_loginCount", ["loginCount30d"])
    .index("by_role_lastLogin", ["role", "lastLoginAt"])
    .index("by_company_lastLogin", ["companyId", "lastLoginAt"])
    /*
     * `filterFields` are equality-only — Convex search indexes cannot range
     * filter, which is why the directory disables sorting while a search term
     * is active rather than pretending to combine the two.
     */
    .searchIndex("search_email", {
      searchField: "email",
      filterFields: ["role", "companyId"],
    }),
  
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
    role: v.union(
      v.literal("USER"),
      v.literal("ADMIN"),
      v.literal("SUPER_ADMIN"),
      v.literal("READ_ONLY"),
      v.literal("AUDITOR")
    ),
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

  /**
   * Work the platform is holding for a named person.
   *
   * Deliberately not an approval. `agentRunApprovals` answers "may the agent
   * do this, yes or no" and halts a run until someone says; a task says "here
   * is work for you" and nothing waits on it. Conflating the two would put a
   * to-do list in the path of a running agent.
   *
   * `sourceUrl` is how a task points back at the screen that produced it — an
   * opportunity report that raises twelve tasks is useless if none of them
   * can say where they came from.
   */
  tasks: defineTable({
    companyId: v.id("companies"),
    title: v.string(),
    detail: v.optional(v.string()),
    assigneeUserId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    status: v.union(v.literal("OPEN"), v.literal("DONE"), v.literal("CANCELLED")),
    /** Absent when a machine raised it; `createdBySource` says which. */
    createdByUserId: v.optional(v.id("users")),
    createdBySource: v.union(v.literal("PERSON"), v.literal("AGENT"), v.literal("WORKFLOW")),
    sourceRunId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    completedByUserId: v.optional(v.id("users")),
  })
    .index("by_company_status", ["companyId", "status", "dueAt"])
    .index("by_assignee_status", ["assigneeUserId", "status", "dueAt"]),

  /**
   * The platform telling one person that something happened.
   *
   * A record rather than a side channel: only `notifyUserInternal` writes
   * these, called by the thing that actually happened, so a notification can
   * never claim an event that did not occur. Read state belongs to the one
   * person named in `userId` — marking read must never touch a colleague's
   * copy, which is why there is no shared "seen" flag anywhere here.
   *
   * In-app only. Email already exists and has its own plan.
   */
  notifications: defineTable({
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    /** e.g. "TASK_ASSIGNED", "APPROVAL_WAITING", "AGENT_RUN_FAILED". */
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    /** Where pressing it should go. */
    href: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "readAt"]),

  /**
   * A question Sonae re-asks on a schedule, reporting when the answer moves.
   *
   * The scheduler could already run an agent; it could not ask a question
   * and notice that the answer changed. That is the difference between a
   * tool you visit and one that watches something for you.
   *
   * `lastAnswer` is the comparison point, so the run only has to compare
   * against one thing rather than re-read a history. Every run costs money,
   * which is why a question is explicitly active or not and its interval is
   * chosen rather than inferred.
   */
  auditLogs: defineTable({
    /**
     * The admin who did it, when a person did.
     *
     * Optional because some entries have no human behind them: a blocked
     * widget embed is an anonymous request from the internet, and naming the
     * widget's creator as the actor was a fiction that read as an accusation.
     * Erasure never clears this field — the trail is retained whole.
     */
    actorId: v.optional(v.id("users")),
    actionType: v.string(), // e.g. "UPDATE_COMPANY"
    entityId: v.optional(v.string()), // Target ID
    entityType: v.string(), // "companies", "users"
    metadata: v.optional(v.string()), // JSON diff or params
    companyId: v.optional(v.id("companies")), // Context organization
    timestamp: v.number(),
  })
    .index("by_actor", ["actorId", "timestamp"])
    .index("by_company", ["companyId", "timestamp"])
    .index("by_action_entity_timestamp", ["actionType", "entityId", "timestamp"])
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
    createdBy: v.optional(v.id("users")),
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
    .index("by_api_key_status_requested", ["apiKeyId", "status", "requestedAt"])
    .index("by_requested", ["requestedAt"]),

  aiActionRequests: defineTable({
    actorId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    actionName: v.union(
      v.literal("transcribeAudio"),
      v.literal("synthesizeSpeech"),
      v.literal("realtimeVoiceSession"),
      v.literal("voicePreview"),
      v.literal("generateNodeConfig")
    ),
    requestedAt: v.number(),
  })
    .index("by_actor_action_requested", ["actorId", "actionName", "requestedAt"])
    .index("by_company_action_requested", ["companyId", "actionName", "requestedAt"])
    .index("by_requested", ["requestedAt"]),

  /** One successful admission per signed live-voice ticket, shared by every relay instance. */
  voiceTicketRedemptions: defineTable({
    ticketId: v.string(),
    expiresAt: v.number(),
    redeemedAt: v.number(),
  })
    .index("by_ticket_id", ["ticketId"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * A phone call Sonae answered.
   *
   * A call is not a chat thread and is deliberately not stored as one: it has
   * a caller rather than a user, a duration, a ringing state, and an ending
   * that happens to it rather than being chosen. Bending threads to hold all
   * that would damage both.
   *
   * Only the words are kept. No call audio is ever stored — it passes through
   * the bridge to the model and is discarded, exactly as the browser
   * session's audio is.
   */
  phoneCalls: defineTable({
    companyId: v.id("companies"),
    /**
     * The provider's own id for the call, and this table's idempotency key.
     * A telephony provider will redeliver a webhook it thinks failed, so
     * every write is keyed on this rather than inserting on arrival.
     */
    providerCallId: v.string(),
    /** Personal data: masked in every list, shown only on the call itself. */
    fromNumber: v.string(),
    toNumber: v.string(),
    status: v.union(
      v.literal("RINGING"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    /**
     * Both sides of what was said, as the live model transcribed it. Bounded
     * on write: a call that never hangs up must not grow a row without end.
     */
    turns: v.array(
      v.object({
        role: v.union(v.literal("CALLER"), v.literal("SONAE")),
        text: v.string(),
        at: v.number(),
      })
    ),
    summary: v.optional(v.string()),
    /** Why a call ended the way it did — read on the call detail screen. */
    endedReason: v.optional(v.string()),
    /** Set only when the number matched a customer already in the CRM. */
    matchedCustomerKey: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    threadId: v.optional(v.id("threads")),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_provider_call", ["providerCallId"])
    .index("by_started", ["startedAt"])
    // The admin Calls screen searches what a call was about, never the
    // caller's number: the list masks numbers, and a search box that matched
    // them would hand back what the mask exists to withhold.
    .searchIndex("search_summary", {
      searchField: "summary",
      filterFields: ["companyId"],
    }),

  /**
   * One row per scheduled job, rewritten each time it finishes (seven-gaps
   * plan, phase 2). Twenty-three jobs ran the platform and none of them left
   * a trace an admin could read: a sweep that died stayed dead silently.
   *
   * Written once per run rather than twice (start and finish) on purpose —
   * the per-minute jobs would otherwise double the platform's write rate for
   * bookkeeping. A job that hangs never reaches the write, so a stale
   * lastRanAt is exactly the signal that something is stuck.
   */
  jobRuns: defineTable({
    job: v.string(),
    lastRanAt: v.number(),
    lastOk: v.boolean(),
    lastDurationMs: v.number(),
    lastError: v.optional(v.string()),
    /** When it last finished without throwing — the honest "it works" mark. */
    lastSucceededAt: v.optional(v.number()),
    consecutiveFailures: v.number(),
  }).index("by_job", ["job"]),

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
      // An address that asked for a link too often. Recorded rather than
      // silently dropped: a run of these is the shape of someone using the
      // sign-in form to post mail at a person.
      v.literal("MAGIC_LINK_THROTTLED"),
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
      v.literal("MAGIC_LINK_VERIFIED"),
      // Signing in through Google rather than through this platform's own
      // email. It accepts the invitation the same way a verified magic link
      // does, and is recorded separately so the trail does not claim a link
      // was sent when none was.
      v.literal("OAUTH_VERIFIED"),
      // Signing in with a typed code rather than a link. Recorded on the same
      // trail as the link, so the diagnostics screen shows one story about a
      // sign-in rather than two depending on which option was used.
      v.literal("ONE_TIME_CODE_REQUESTED"),
      v.literal("ONE_TIME_CODE_THROTTLED"),
      v.literal("ONE_TIME_CODE_VERIFIED"),
      // A code that did not work. Only successful sign-ins were ever recorded,
      // so a run of attempts against an account — the first thing anybody looks
      // for — left nothing behind at all.
      v.literal("ONE_TIME_CODE_FAILED")
    ),
    timestamp: v.number(),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    inviteId: v.optional(v.id("invitations")),
    provider: v.optional(v.string()),
    reasonCode: v.optional(v.string()),
  })
    .index("by_email", ["email", "timestamp"])
    .index("by_email_type_timestamp", ["email", "eventType", "timestamp"])
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
    // Set when the run was a rehearsal: real model spend (kept in cost
    // figures), but a drill, not customer traffic — interaction analytics
    // filter on this.
    isRehearsal: v.optional(v.boolean()),
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
    // Which run this entry belongs to. Without it the raw exchange and the
    // durable step trail were two accounts of the same event that could not be
    // read together: a log line could not name the run that produced it, and a
    // run could not show what was actually said. Optional because entries
    // written before this existed have no run to point at, and because the
    // workflow and sales-report paths log outside any agent run.
    runId: v.optional(v.id("agentRuns")),
    stepId: v.optional(v.id("agentRunSteps")),
    // What actually happened, recorded rather than inferred. The screen used to
    // decide between a tick and a cross by testing whether interactionType
    // contained the text "ERROR" or "FAIL", so a failed tool dispatch — whose
    // type is "TOOL DISPATCH: <name>" — was reported as a success. UNKNOWN is
    // for the rows written before this field existed; they are shown as not
    // recorded rather than guessed, because guessing is the fault being fixed.
    outcome: v.optional(v.union(
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("UNKNOWN")
    )),
    durationMs: v.optional(v.number()),
    // A normalised form of the failure with ids, durations, numbers and URLs
    // stripped out, so the same fault groups no matter how the message was
    // worded. Failures were previously counted under the raw error string, so
    // "search timed out" and "search timed out after 24000ms" were two separate
    // problems — and any error carrying an id never grouped at all.
    failureKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_run", ["runId", "createdAt"])
    .index("by_agent_outcome", ["agentId", "outcome", "createdAt"])
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
    // A rehearsal executes the real loop — real model, real reads — but every
    // non-read tool call is recorded as "would have done this" instead of
    // performed. The flag lives on the run so checkpoint resume inherits it,
    // and so quotas, cost alerts, and analytics can exclude drills from
    // traffic. See the improvement plan, Phase 4.
    isRehearsal: v.optional(v.boolean()),
    // Which check this run was of, when it was one.
    //
    // The fixture id was only ever recorded inside a run *step's* metadata JSON, so
    // "show me this check's history" meant reading recent runs for the agent, then
    // reading every one's steps, then parsing each blob. Stamped on the run it is a
    // single indexed range read.
    evalFixtureId: v.optional(v.id("agentEvalFixtures")),
    /**
     * What this run was working on, in a few words.
     *
     * The run screen used to head itself with the whole objective, set in the
     * page-title style — for the research agent that is a paragraph of
     * instructions, three lines of large bold text where a name should be. One
     * agent, Rightmove collection, had a short title because that screen
     * special-cased it; everything else was left wearing its orders. Anthony,
     * 2026-08-03: *"what is this and why is the font so large."*
     *
     * Written by whatever starts the run, because only that knows what the run
     * is about. Optional so runs recorded before it existed still validate; the
     * screen falls back to deriving something for those.
     */
    title: v.optional(v.string()),
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
    // Calls a person has refused during this run, as tool-plus-arguments keys.
    // A refusal is now fed back to the model rather than ending the run, so
    // without this a model that still wants to send that email asks again, queues
    // another approval, and burns the reviewer's attention in a loop. Lives on the
    // run because it is read and written only by that run and dies with it.
    refusedToolCallsJson: v.optional(v.string()),
    /**
     * The run that picked this run's queue up after it ended.
     *
     * Set by the research job when it starts a successor. A run that worked to
     * its per-run ceiling and handed the queue on is the system working, and
     * without this the screens dressed every planned handover as a failure —
     * "it did not finish" over a job that finished fine.
     */
    continuedByRunId: v.optional(v.id("agentRuns")),
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
    // Retention: terminal runs age out on completedAt (agentRunHistory
    // pipeline). Missing completedAt sorts first, so range queries must
    // bound below with gt(0) to exclude still-running rows.
    .index("by_completed", ["completedAt"])
    .index("by_status_started", ["status", "startedAt"])
    // The rollup rebuild reads "everything since yesterday" regardless of
    // status; without this that read is a fan-out across every status.
    .index("by_started", ["startedAt"])
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
      v.literal("CANCELLED"),
      // Recorded, not executed: this call happened inside a rehearsal run.
      v.literal("REHEARSED")
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
    // Which model turn asked for this call. A single turn can request several
    // tools, and the provider contract is that one turn carrying N calls is
    // answered by one turn carrying N results, in order. When a run parks on an
    // approval the results arrive one at a time, so the batch has to be
    // reassembled to answer it properly — and nothing on the row identified the
    // turn it belonged to.
    turnIndex: v.optional(v.number()),
    // The opaque signature the model attached to this call and requires back
    // when the conversation continues. Stored rather than held in memory because
    // a call that parks for approval resumes in a later action and rebuilds the
    // model turn from this row — nothing in memory survives the wait.
    thoughtSignature: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_run_started", ["runId", "startedAt"])
    .index("by_agent_started", ["agentId", "startedAt"])
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_status_started", ["status", "startedAt"])
    // The rollup rebuild reads "everything since yesterday" regardless of
    // status; the governance dashboard used to walk this table backwards with
    // no index at all.
    .index("by_started", ["startedAt"])
    // startedAt in the key so the batch comes back in request order rather than
    // relying on insertion order as a happy accident.
    .index("by_run_turn", ["runId", "turnIndex", "startedAt"]),

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
      // Its own status rather than reusing CANCELLED: "nobody answered" and
      // "someone decided against it" are different facts about the platform, and
      // a queue that cannot tell them apart cannot tell you it is being ignored.
      v.literal("EXPIRED"),
      v.literal("CANCELLED")
    ),
    message: v.optional(v.string()),
    previewJson: v.optional(v.string()),
    // Agent name and tool name, denormalised so the queue can be searched.
    // What a reviewer types is one of those two, and both live on joined records
    // — so without this a search bar could only filter the page already loaded,
    // reporting "no matches" while matches sat on the next page. Cheap to
    // duplicate: the row is written once by the runtime and never updated.
    searchText: v.optional(v.string()),
    requestedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    decisionReason: v.optional(v.string()),
  })
    .index("by_run_requested", ["runId", "requestedAt"])
    .index("by_company_status_requested", ["companyId", "status", "requestedAt"])
    .index("by_status_requested", ["status", "requestedAt"])
    .index("by_agent_requested", ["agentId", "requestedAt"])
    .searchIndex("search_approval", { searchField: "searchText", filterFields: ["status"] }),

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
    /**
     * Who left it: an operator on the admin run screens, or the person the
     * agent was actually answering. Absent reads as ADMIN — every row written
     * before end users had a voice was an operator's.
     */
    source: v.optional(v.union(v.literal("ADMIN"), v.literal("END_USER"))),
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
    createdBy: v.optional(v.id("users")),
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
    createdBy: v.optional(v.id("users")),
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
    createdBy: v.optional(v.id("users")),
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
    createdBy: v.optional(v.id("users")),
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
    assignedBy: v.optional(v.id("users")),
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
    /**
     * How runs that consulted this memory ended, one count per run, cached
     * here from agentMemoryUsage so ranking never fans out a usage query per
     * candidate. Ground truth stays in the usage table; the backfill
     * migration rebuilds these. Self-improvement plan, Phase 2.
     */
    successCount: v.optional(v.number()),
    failureCount: v.optional(v.number()),
    cancelledCount: v.optional(v.number()),
    lastOutcomeAt: v.optional(v.number()),
    /**
     * Saved by the platform itself under the autonomous-memory switch, with
     * no person approving it. Shown as a label on the memory screens so what
     * the AI taught itself is always visible and removable.
     */
    autoApplied: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("users")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_agent_active_updated", ["agentId", "isActive", "updatedAt"])
    .index("by_company_active_updated", ["companyId", "isActive", "updatedAt"])
    .index("by_agent_company_active_updated", ["agentId", "companyId", "isActive", "updatedAt"])
    .index("by_agent_company_active_applymode_updated", ["agentId", "companyId", "isActive", "applyMode", "updatedAt"])
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
    createdBy: v.optional(v.id("users")),
    approvedBy: v.optional(v.id("users")),
    archivedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    usageCount: v.number(),
    /**
     * End-user sentiment about answers this memory grounded, via the message
     * evidence trail. The chat path has no run outcome, so ratings are its
     * outcome signal. Self-improvement plan, Phases 2–3.
     */
    positiveFeedbackCount: v.optional(v.number()),
    negativeFeedbackCount: v.optional(v.number()),
    lastFeedbackAt: v.optional(v.number()),
    /**
     * Saved by the platform itself under the autonomous-memory switch, with
     * no person approving it. Shown as a label on the memory screens so what
     * the AI taught itself is always visible and removable.
     */
    autoApplied: v.optional(v.boolean()),
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

  /**
   * The personal layer (personal-layer-and-goals-plan.md, part 2): what the
   * assistant knows about one person — role, preferences, recurring asks.
   * Private by ruling (Anthony, 2026-08-21): only the person reads their own
   * rows; admins see counts, never words. Keyed by userId alone — the note
   * travels with the person, not the workspace. A hard cap keeps it a sticky
   * note, not a dossier. Company facts never land here: they belong to the
   * wiki, per the one-brain sorting rule.
   */
  userMemories: defineTable({
    userId: v.id("users"),
    content: v.string(),
    normalizedContent: v.string(),
    /** One state only: a note exists or it was deleted outright. There is
     * no archive on purpose — an archived note about a person would be a
     * copy the person believed gone. */
    status: v.literal("APPROVED"),
    sourceType: v.union(v.literal("CHAT"), v.literal("MANUAL")),
    /** Saved by the sweep under the autonomousMemory switch, no person
     * approving it — labelled on screen so the person can see and remove
     * what the AI taught itself about them. */
    autoApplied: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    usageCount: v.number(),
  })
    .index("by_user_status_updated", ["userId", "status", "updatedAt"]),

  /** The per-person sweep's marker, mirror of companyMemorySweeps. */
  userMemorySweeps: defineTable({
    userId: v.id("users"),
    lastSweptAt: v.number(),
    lastRunAt: v.number(),
    lastMessagesRead: v.number(),
    lastSuggested: v.number(),
    lastSkippedReason: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

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
    createdBy: v.optional(v.id("users")),
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
    assignedBy: v.optional(v.id("users")),
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
    // Absent means a platform check (Anthony's SaaS ruling, 2026-08-17):
    // the global brain examined the way company brains are.
    companyId: v.optional(v.id("companies")),
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
    // PROPOSED is the Examiner's shelf (closing-the-loop plan, phase 4):
    // a drafted check that runs nothing and gates nothing until a person
    // approves it. Every runner and gate selects ACTIVE by index, so a
    // draft is inert by construction.
    status: v.union(v.literal("ACTIVE"), v.literal("ARCHIVED"), v.literal("PROPOSED")),
    /** Set on Examiner drafts: the normalised question it grew from, kept
     * on rejection so the same question is never proposed twice. */
    proposalFingerprint: v.optional(v.string()),
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
    createdBy: v.optional(v.id("users")),
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
    .index("by_company_status_surface_severity", ["companyId", "status", "targetSurface", "severity"])
    .index("by_company_fingerprint", ["companyId", "proposalFingerprint"])
    // The Evals screen searches by name at both heights, filtered to one
    // brain's list — searched where the rows are, like every other table.
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["companyId", "status"],
    }),

  companyEvalRuns: defineTable({
    companyId: v.optional(v.id("companies")),
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
    createdBy: v.optional(v.id("users")),
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
    createdBy: v.optional(v.id("users")),
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
    /**
     * Whether a person may contribute this document without being an admin.
     *
     * Absent means approved — every document that existed before saved
     * answers keeps working exactly as it did. A `PENDING` document is never
     * ingested, so it has no chunks and retrieval cannot reach it; approval
     * is what starts ingestion. That is the whole guard: unapproved content
     * is not "filtered out" at query time, it is simply not there.
     */
    reviewStatus: v.optional(v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("REJECTED")
    )),
    submittedBy: v.optional(v.id("users")),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    lastQueuedAt: v.optional(v.number()),
    lastIngestionStartedAt: v.optional(v.number()),
    lastIngestedAt: v.optional(v.number()),
    // When the wiki distiller last read this document (wiki-replaces-
    // knowledge plan, stage one). Absent means the wiki has not learned
    // from it yet — the catch-up sweep and the on-ready hook both key on it.
    wikiDistilledAt: v.optional(v.number()),
    // How many times distilling this document has been claimed and then
    // failed. The claim is released after a failure so the sweep tries
    // again — a document that imports but never becomes answerable is worse
    // than a retry — and this counter is what stops that becoming an
    // endless retry loop of model spend.
    wikiDistillAttempts: v.optional(v.number()),
    // Marked at import when a person wants the checkpoint (wiki-agents
    // plan, phase 4): the wiki must not learn from this document until the
    // review is approved. The Reviewer prepares the claims; a person decides.
    wikiReviewRequested: v.optional(v.boolean()),
    lastIngestionError: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_company", ["companyId", "createdAt"])
    .index("by_company_format", ["companyId", "format", "createdAt"])
    .index("by_company_review", ["companyId", "reviewStatus", "createdAt"])
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_agent_format", ["agentId", "format", "createdAt"])
    .index("by_agent_company", ["agentId", "companyId", "createdAt"])
    .index("by_global", ["companyId", "agentId", "threadId", "createdAt"])
    .index("by_global_format", ["companyId", "agentId", "threadId", "format", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_source_company", ["sourceUrl", "companyId", "agentId"])
    // Saved answers are the documents somebody submitted from a conversation,
    // and they get their own screen — so they get their own index rather than
    // being sifted out of every document the company has.
    .index("by_company_submitted", ["companyId", "submittedBy", "createdAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["companyId"],
    }),

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
    // The keyword half of hybrid retrieval: exact names and codes that are
    // poor embedding neighbours are found here and fused with the vector
    // ranking (see knowledgeRetrievalService.ts). Filter fields mirror the
    // vector index so both halves can express the same tenant scoping.
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["companyId", "agentId", "threadId", "isGlobal"],
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
    /** Upload URLs already issued to this anonymous conversation. */
    widgetUploadUrlCount: v.optional(v.number()),
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
    /**
     * What the assistant is actually doing right now, for the pre-reply pill.
     *
     * Written by `generateSonaeResponse` as it passes each real phase —
     * checking, reading files, searching knowledge, writing — and cleared when
     * the reply lands or fails. Replaced a client-side rotation of invented
     * phrases on a timer; a stage shown on screen must be one the run is in.
     * `assistantStageAt` lets the client ignore a stage a crashed run left
     * behind.
     */
    assistantStage: v.optional(v.string()),
    assistantStageAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"])
    .index("by_widget", ["widgetId", "updatedAt"])
    .index("by_company", ["companyId", "updatedAt"])
    .index("by_updatedAt", ["updatedAt"])
    // The sidebar search asks the database, not the loaded slice: a person
    // with years of conversations must be able to find one that never made
    // it into the first page.
    .searchIndex("search_title", { searchField: "title", filterFields: ["userId"] }),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    /** Stamped when a person saved this answer into the wiki, so the same
     * answer is filed once however many times the button is pressed. */
    savedToWikiAt: v.optional(v.number()),
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
    // Names a platform-authored message (e.g. "quotaRefusal") so a client can
    // render it in the reader's own language. `content` still carries the
    // English text as the fallback for clients that do not know the key —
    // exports, older UIs, and the admin transcript views stay readable.
    systemKey: v.optional(v.string()),
    // A follow-up the model read out of an attached photo, waiting for a human
    // tap. Extracted from the reply at save time (photoActionService) and only
    // ever written into a task by tasks.confirmPhotoAction — no photo acts by
    // itself. `photoActionTaskId` records the confirmation, so the chip can
    // show "filed" and a second tap cannot file a duplicate.
    photoActionProposal: v.optional(
      v.object({
        title: v.string(),
        detail: v.string(),
        reasoning: v.string(),
      })
    ),
    photoActionTaskId: v.optional(v.id("tasks")),
    // Set while a reply is still being written token by token. Clients show a
    // caret; readers see the answer build instead of watching a spinner.
    isStreaming: v.optional(v.boolean()),
    // When the stream opened, so a reply orphaned by a killed run can be told
    // apart from one that is genuinely still arriving.
    streamStartedAt: v.optional(v.number()),
    streamUpdatedAt: v.optional(v.number()),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_thread_role_created", ["threadId", "role", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_role_created", ["role", "createdAt"])
    .index("by_company_role_created", ["companyId", "role", "createdAt"])
    .index("by_user_role_created", ["userId", "role", "createdAt"])
    .index("by_agent_role_created", ["agentId", "role", "createdAt"])
    .index("by_provider_created", ["providerKey", "createdAt"]),

  /**
   * End-user ratings of assistant chat messages (self-improvement plan,
   * Phase 3). Chat answers have no agent run, so operator run feedback could
   * never hear from the people actually asking. One row per user per
   * message, rating changeable. Feedback is data, not instruction: nothing
   * here reaches a prompt — it feeds the suggestion sweep and the memory
   * feedback counters, both of which only propose or reorder.
   */
  messageFeedback: defineTable({
    messageId: v.id("messages"),
    threadId: v.id("threads"),
    companyId: v.optional(v.id("companies")),
    userId: v.id("users"),
    rating: v.union(v.literal("POSITIVE"), v.literal("NEGATIVE")),
    labels: v.array(v.union(
      v.literal("GREAT_ANSWER"),
      v.literal("INCORRECT"),
      v.literal("MISSED_CONTEXT"),
      v.literal("UNHELPFUL")
    )),
    comment: v.optional(v.string()),
    /**
     * False once the writer's daily cap is passed: the row is accepted (the
     * user is not punished for caring) but every learning consumer skips it,
     * so one account cannot flood the signal.
     */
    countsTowardLearning: v.boolean(),
    /**
     * The rating the knowledge-evidence sweep last folded into
     * `knowledgeChunkStats`. What makes the sweep idempotent and lets a
     * changed mind move the count across instead of stacking both sides.
     */
    lastCountedRating: v.optional(v.union(v.literal("POSITIVE"), v.literal("NEGATIVE"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_message_user", ["messageId", "userId"])
    .index("by_thread_created", ["threadId", "createdAt"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_company_updated", ["companyId", "updatedAt"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_updated", ["updatedAt"]),

  /**
   * Which knowledge chunks keep grounding well-rated answers (self-improvement
   * plan, Phase 4). Maintained by the hourly evidence sweep from rated
   * messages' evidence trails; read at retrieval time as a bounded prior on
   * the fused ranking. Tenant-scoped: one company's ratings never touch
   * another's retrieval, even of global documents.
   */
  knowledgeChunkStats: defineTable({
    companyId: v.id("companies"),
    chunkId: v.id("knowledgeChunks"),
    positiveEvidence: v.number(),
    negativeEvidence: v.number(),
    lastEvidenceAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_chunk", ["companyId", "chunkId"])
    .index("by_company_updated", ["companyId", "updatedAt"]),

  // Agent Orchestration Engine
  agents: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    /**
     * The person accountable for this assistant.
     *
     * Not who created it — creation is already in the audit trail, and the
     * person who set something up two years ago is rarely the person answerable
     * for it now. The AI register asks "who is accountable", and until this
     * field existed the honest answer was that nobody was.
     *
     * Optional in the schema so every assistant that already exists still
     * validates; the create path requires it, and the register shows anything
     * without one as incomplete until someone says. See
     * docs/plans/active/governance-and-trust-plan.md.
     */
    ownerId: v.optional(v.id("users")),
    /**
     * How much damage this assistant could do, and therefore what the platform
     * will let it do.
     *
     * Not a label. A `HIGH` rating makes human approval a consequence of the
     * classification rather than a setting an administrator can quietly switch
     * off — which is the difference between governance that is written down and
     * governance that holds.
     *
     * Optional because everything that predates the register is genuinely
     * unrated, and saying so is honest where defaulting to `LOW` would be a
     * claim nobody made. See
     * docs/plans/active/governance-and-trust-plan.md.
     */
    riskLevel: v.optional(
      v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))
    ),
    // Per-agent runtime budget. Unset means the platform default; values are
    // clamped to the ceilings in agentRuntimeService so a misconfigured agent
    // cannot spend without limit. Previously every agent on the platform shared
    // one hardcoded budget.
    maxSteps: v.optional(v.number()),
    maxToolCalls: v.optional(v.number()),
    /**
     * How much the run may read before it stops.
     *
     * Every page an agent fetches is fed back into the model and re-sent on
     * every turn after it, so a run that reads half a dozen pages exhausts this
     * long before it comes near its step, tool, minute or spend budget. It was
     * a platform constant, which meant a research agent and a classifier got
     * the same room and neither could be given more.
     */
    maxInputTokens: v.optional(v.number()),
    maxRuntimeMs: v.optional(v.number()),
    maxCostGBP: v.optional(v.number()),
    avatar: v.optional(v.string()), // Optional icon/avatar
    modelId: v.string(), // Provider model identifier
    modelSelectionMode: v.optional(v.union(v.literal("inherit"), v.literal("override"))),
    thinkingMode: v.boolean(),
    systemPrompt: v.optional(v.string()),
    /**
     * What this agent should do when it is run with no other instruction.
     *
     * Separate from `systemPrompt`, which says how it behaves. Left empty, the
     * agent can only be run by something that supplies an instruction — a
     * conversation, or a screen passing one in — and the Run button refuses
     * rather than spending money to ask a question back.
     */
    standingObjective: v.optional(v.string()),
    // Link to specific rule IDs
    ruleIds: v.optional(v.array(v.id("aiRules"))), 
    // Link to specific knowledge document IDs for RAG
    knowledgeDocumentIds: v.optional(v.array(v.id("knowledgeDocuments"))),
    reasoningEffort: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))),
    allowInternetAccess: v.optional(v.boolean()),
    // Deterministic Execution Parameters
    temperature: v.optional(v.number()), // 0.0 to 2.0
    humanApprovalRequired: v.optional(v.boolean()),
    // Run without a human anywhere in the loop. Absent or false means gated, so
    // every agent that already exists keeps stopping before a write; only a
    // deliberate flip on agent settings writes true. A separate field from
    // `humanApprovalRequired` on purpose: that one is written false on every
    // agent at creation and only ever tightens the gate, so redefining it would
    // have stripped the brake off the whole platform in one deploy.
    autonomousToolExecution: v.optional(v.boolean()),
    // How long this agent's approvals may wait before the platform gives up.
    // Unset follows the platform window.
    approvalExpiryHours: v.optional(v.number()),
    inputSchema: v.optional(v.string()), // Stringified JSON Schema
    outputSchema: v.optional(v.string()), // Stringified JSON Schema
    triggerType: v.optional(v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE"))),
    releaseGateMode: v.optional(v.union(v.literal("TAG"), v.literal("PRESET"), v.literal("NONE"))),
    releaseGateTags: v.optional(v.array(v.string())),
    releaseGateSuitePresetId: v.optional(v.id("agentEvalSuitePresets")),
    releaseGateRequiresModelGrading: v.optional(v.boolean()),
    isActive: v.boolean(),
    // Names a built-in member of the wiki's staff (wiki-agents plan, phase
    // 0): "WIKI_DISTILLER", "WIKI_TIDIER", "WIKI_LINKER", and later hires.
    // System agents are seeded, visible on the Agents screen, switchable
    // via isActive above — and never deletable.
    systemKey: v.optional(v.string()),
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
    createdBy: v.optional(v.id("users")),
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
      v.literal("VOICE"),
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
    // What the hourly probe found when it last actually contacted the other
    // side (seven-gaps plan, phase 2). Distinct from testStatus, which is a
    // configuration check that deliberately contacts nothing: these three
    // fields only ever move when a real request was made and answered.
    lastProbeAt: v.optional(v.number()),
    lastProbeOk: v.optional(v.boolean()),
    lastProbeMessage: v.optional(v.string()),
    // What the Gmail watcher's own once-a-minute poll last did. Before this,
    // a mailbox that silently stopped answering was discovered by a customer:
    // poll failures went to console.error and nowhere else.
    lastPolledAt: v.optional(v.number()),
    lastPollError: v.optional(v.string()),
    authAccountRef: v.optional(v.string()),
    tokenRef: v.optional(v.string()),
    oauthScopes: v.optional(v.array(v.string())),
    oauthConnectedAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("users")),
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
    testedBy: v.optional(v.id("users")),
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
    updatedBy: v.optional(v.id("users")),
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
    initiatedBy: v.optional(v.id("users")),
  })
    .index("by_connector_updated", ["connectorId", "updatedAt"])
    .index("by_state", ["state"])
    .index("by_company_updated", ["companyId", "updatedAt"]),

  // A connection's OAuth tokens, as ciphertext only (connectorTokenCrypto).
  // No client-callable function reads this table — internal functions only,
  // held true by the function-access enumeration test. One row per
  // connection: reconnect replaces, disconnect revokes at the provider and
  // then deletes.
  connectorOAuthTokens: defineTable({
    connectionId: v.id("toolConnectorOAuthConnections"),
    connectorId: v.id("toolConnectors"),
    companyId: v.optional(v.id("companies")),
    provider: v.string(),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    // When the access token dies, from the provider's expires_in. The getter
    // refreshes just before this; the hourly sweep catches long-idle rows.
    expiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_connector", ["connectorId"])
    .index("by_expiry", ["expiresAt"]),

  // Every Gmail message the mailbox watcher has seen, recorded before action
  // (commitment 7 of the Gmail plan) so double delivery or cron overlap can
  // never answer twice. Also the reply rails' ledger: the per-thread hourly
  // cap and per-day ceiling are counted off `repliedAt`.
  mailboxMessages: defineTable({
    companyId: v.optional(v.id("companies")),
    connectorId: v.id("toolConnectors"),
    gmailMessageId: v.string(),
    gmailThreadId: v.string(),
    // The counterparty and subject, never body text — the same restraint the
    // audit trail shows.
    sender: v.string(),
    subject: v.string(),
    decision: v.union(
      v.literal("PENDING"),
      v.literal("REPLIED"),
      v.literal("TASK"),
      v.literal("SKIPPED")
    ),
    decisionReason: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    repliedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_connector_message", ["connectorId", "gmailMessageId"])
    .index("by_thread_replied", ["gmailThreadId", "repliedAt"])
    .index("by_connector_replied", ["connectorId", "repliedAt"])
    .index("by_created", ["createdAt"])
    // The admin Mailbox screen (seven-gaps plan, phase 1): the handled
    // mail was recorded from day one but had no screen; this is its door.
    .index("by_company_created", ["companyId", "createdAt"])
    .searchIndex("search_subject", {
      searchField: "subject",
      filterFields: ["companyId"],
    }),

  /**
   * A tool server a company has connected.
   *
   * The platform's own connectors are a curated catalogue: a fixed key, a known
   * shape, installed per workspace. A tool server is the opposite — an address
   * an administrator supplies, offering whatever tools it chooses to offer.
   * Putting arbitrary customer-created rows into the connector catalogue would
   * make every catalogue screen a mixture of platform capability and one
   * client's private plumbing, so they are separate tables that happen to feed
   * the same tool library.
   *
   * `companyId` is **required**, deliberately. Elsewhere an absent company means
   * "global", and `aiToolExecutionService` carries an explicit warning about a
   * global and a tenant install being confused. There is no global tool server
   * and there should not be one: a server is somebody's account, reached with
   * somebody's credential.
   *
   * Agents stay global (see `docs/plans/active/tool-server-plan.md`). What a
   * shared agent may reach is decided by the company the run belongs to, never
   * by narrowing the agent.
   */
  mcpServers: defineTable({
    companyId: v.id("companies"),
    /** What the administrator called it. Unique within a company. */
    name: v.string(),
    /** Checked by `validateHttpConnectorBaseUrl` before it is ever stored. */
    url: v.string(),
    authMode: v.union(v.literal("NONE"), v.literal("SECRET_REF")),
    /** A pointer into the vault, never a credential. See `connectorSecretPolicy`. */
    secretRef: v.optional(v.string()),
    status: v.union(
      v.literal("CONNECTED"),
      v.literal("DISABLED"),
      v.literal("ERROR")
    ),
    // What the last attempt to contact this server actually found. These only
    // ever move when a real request was made and answered — the same
    // distinction `toolConnectors` draws between a configuration check and a
    // probe, and for the same reason: "configured" and "reachable" are
    // different questions and conflating them hides the one that matters.
    lastDiscoveryAt: v.optional(v.number()),
    lastDiscoveryOk: v.optional(v.boolean()),
    lastDiscoveryMessage: v.optional(v.string()),
    discoveredToolCount: v.optional(v.number()),
    /** What the server called itself, for a screen that would otherwise show only a URL. */
    serverLabel: v.optional(v.string()),
    /** The version the server agreed to speak, which may be older than ours. */
    protocolVersion: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_company", ["companyId"])
    .index("by_company_name", ["companyId", "name"]),

  /**
   * What a connected server said it offers, exactly as discovered.
   *
   * Deliberately **not** `aiTools`. Discovering what a server can do and letting
   * an agent do it are different decisions, and collapsing them would mean
   * connecting a server silently armed it. These rows are a record of what was
   * found; phase 3 of the tool-server plan is what promotes them into tools an
   * agent may be given, under the company boundary.
   *
   * `companyId` is carried here as well as on the server, denormalised on
   * purpose: every read of this table is scoped by company, and a scoped read
   * that has to join through another table to learn its scope is one refactor
   * away from being an unscoped read.
   *
   * **The contents are untrusted.** Names and descriptions are written by
   * whoever runs the server. `mcpProtocol` bounds and cleans them on the way in;
   * anything rendering a description into a prompt owes it the same treatment
   * retrieved documents already get.
   */
  mcpServerTools: defineTable({
    serverId: v.id("mcpServers"),
    companyId: v.id("companies"),
    name: v.string(),
    title: v.optional(v.string()),
    description: v.string(),
    /** JSON Schema for the arguments, as a string. Validated before any call is made. */
    inputSchemaJson: v.string(),
    outputSchemaJson: v.optional(v.string()),
    discoveredAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_company", ["companyId"])
    .index("by_server_name", ["serverId", "name"]),

  // Global Tool Library
  aiTools: defineTable({
    /** The label an administrator types. Shown on screens; never reaches a model. */
    name: v.string(),
    description: v.string(), // Provide clear instructions on what the tool does
    /**
     * **What the model is offered this tool as.** Chosen per tool, never derived.
     *
     * Until 2026-08-24 there was no such field: the model was shown the routing
     * key with its punctuation swapped for underscores. That was an accident
     * that read well for some tools (`knowledge_search`) and badly for others
     * (`salesCustomers_research_read`), and it welded the name to the routing so
     * neither could move without the other.
     *
     * Optional here only because Convex cannot express "required once
     * backfilled". It is required at every write path, and
     * `toolModelName.test.ts` fails the build if a row is missing one. There is
     * no fallback: a tool without this is not offered to a model at all.
     */
    modelName: v.optional(v.string()),
    handlerMapping: v.string(), // Where the call is routed. Internal; never reaches a model.
    connectorId: v.optional(v.id("toolConnectors")),
    connectorKey: v.optional(v.string()),
    secretRefKeys: v.optional(v.array(v.string())),
    /**
     * Who owns this tool. **Absent means global** — every tool that predates
     * connected servers, unchanged.
     *
     * A tool acquired an owner when companies gained the ability to connect
     * their own servers: one company's tool is reached with one company's
     * credential, so a shared agent running for another company must not see
     * it. `isToolVisibleToCompany` in `mcpToolPolicy.ts` is the single rule,
     * applied where tools are resolved for a run.
     */
    companyId: v.optional(v.id("companies")),
    /** The server this tool was discovered from, so deleting it takes them too. */
    mcpServerId: v.optional(v.id("mcpServers")),
    /**
     * What the server itself calls this tool.
     *
     * Distinct from `modelName`, which carries a prefix so two servers offering
     * `search` stay apart. The server only knows its own name, so this is what
     * is sent back when the tool is called — stored rather than re-derived,
     * because reversing a prefix is a guess and this is not a place to guess.
     */
    mcpToolName: v.optional(v.string()),
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
    createdBy: v.optional(v.id("users")),
  })
    .index("by_name", ["name"])
    .index("by_connector", ["connectorId"])
    .index("by_connector_key", ["connectorKey"])
    .index("by_company", ["companyId"])
    .index("by_mcp_server", ["mcpServerId"])
    .index("by_model_name", ["modelName"])
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
    createdBy: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
    webhookSecret: v.optional(v.string()),
    // Webhook triggers are rate-windowed per workflow (2026-08 security
    // audit): a leaked secret can no longer be replayed into unbounded runs.
    webhookWindowStart: v.optional(v.number()),
    webhookCountInWindow: v.optional(v.number()),
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
    startedBy: v.optional(v.id("users")),
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
    createdBy: v.optional(v.id("users")),
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
    // 1-based try counter; absent means first attempt. Only transient failures
    // of provably re-runnable node types requeue (see workflowRetryService.ts),
    // and a FAILED step keeps the count so the review list shows what was tried.
    attempt: v.optional(v.number()),
    // Copied from the parent execution on insert. Tenancy lived only on the
    // parent, so a query spanning executions could not filter by company without a
    // lookup per row — which is not something an index can do.
    companyId: v.optional(v.id("companies")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_execution", ["executionId", "nodeId"])
    .index("by_execution_started", ["executionId", "startedAt"])
    .index("by_execution_node_started", ["executionId", "nodeId", "startedAt"])
    .index("by_execution_node_status_started", ["executionId", "nodeId", "status", "startedAt"])
    .index("by_execution_status_started", ["executionId", "status", "startedAt"])
    // Every other index here is prefixed by `executionId`, so "all steps awaiting
    // approval" was not an answerable question — which is part of why a halted
    // workflow was invisible to every screen and every health signal.
    .index("by_status_started", ["status", "startedAt"]),

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
    // The receptionist screen: a widget must opt in to being a kiosk before
    // /kiosk/<id> will serve it (kiosk plan, phase A). The remaining fields
    // are the kiosk's own bookkeeping — a per-widget voice-session rate
    // window (there is no signed-in user to rate-limit by), and the health
    // heartbeat the admin screen reads so a dead tablet in reception is
    // noticed from a desk.
    kioskEnabled: v.optional(v.boolean()),
    kioskSessionWindowStart: v.optional(v.number()),
    kioskSessionCountInWindow: v.optional(v.number()),
    kioskLastSeenAt: v.optional(v.number()),
    kioskSessionCount: v.optional(v.number()),
    // Anonymous thread minting is rate-windowed per widget (2026-08 security
    // audit): the widget door and the kiosk door each keep their own hourly
    // count, in the same shape as the kiosk session window above.
    threadWindowStart: v.optional(v.number()),
    threadCountInWindow: v.optional(v.number()),
    kioskThreadWindowStart: v.optional(v.number()),
    kioskThreadCountInWindow: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
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
    startedBy: v.optional(v.id("users")),
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
    .index("by_createdBy_createdAt", ["createdBy", "createdAt"])
    .index("by_spineGoal_createdAt", ["spineGoal", "createdAt"])
    .index("by_createdBy_spineGoal_createdAt", ["createdBy", "spineGoal", "createdAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["createdBy", "spineGoal"],
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
    .index("by_createdBy_createdAt", ["createdBy", "createdAt"])
    .index("by_movement_createdAt", ["movementId", "createdAt"])
    .index("by_movement_createdBy_createdAt", ["movementId", "createdBy", "createdAt"]),
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
      v.literal("auditLogs"),
      v.literal("publicApiRequests"),
      v.literal("authEvents"),
      v.literal("aiActionRequests"),
      v.literal("analyticsSnapshots"),
      v.literal("webhookDeliveries"),
      v.literal("agentRunHistory"),
      v.literal("agentTransactions"),
      v.literal("phoneCalls"),
      v.literal("mailboxMessages"),
      v.literal("purgeHistory")
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
    // Patched every batch so the stall reaper can tell a slow run from a
    // dead one. A run whose transaction aborts at commit time cannot mark
    // itself FAILED (the patch rolls back with it); the reaper does.
    lastProgressAt: v.optional(v.number()),
    // Storage ids whose deletion failed during a chat purge. The owning
    // message row is gone, so this list is the only record that the blob
    // exists and needs manual recovery.
    leakedStorageIds: v.optional(v.array(v.string())),
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

  // template:remove:start salesData
  /**
   * A single run of the workbook importer.
   *
   * Every import replaces the workspace's data outright, so this row is the
   * only record of what the current contents came from — which file, which
   * worksheet was read as what, and which months the six revenue columns
   * covered. Without it the numbers in `salesDataRows` are six anonymous
   * figures.
   *
   * Failed imports are kept deliberately. A wipe-and-reload that dies halfway
   * needs a visible reason, not a silently empty table.
   */
  salesDataImports: defineTable({
    companyId: v.id("companies"),
    fileName: v.string(),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    /** Which worksheet the user mapped to each dataset, by zero-based index. */
    sheetMapping: v.object({
      sales: v.number(),
      categories: v.number(),
      areasOfInterest: v.number(),
      frequency: v.number(),
    }),
    /**
     * The six revenue column headings as they appeared in the file, in order.
     * The sales rows store six numbered periods; this is what those numbers
     * mean. A file headed `2026-01-01 … 2026-06-01` yields ISO month strings.
     */
    periodLabels: v.optional(v.array(v.string())),
    salesRowCount: v.optional(v.number()),
    categoryRowCount: v.optional(v.number()),
    areasOfInterestRowCount: v.optional(v.number()),
    frequencyRowCount: v.optional(v.number()),
    error: v.optional(v.string()),
    /**
     * When a later import replaced this one's rows.
     *
     * A completed import whose data has since been dropped is still worth
     * showing in the history, but it is not the data on screen, and the two
     * need telling apart.
     */
    supersededAt: v.optional(v.number()),
    importedBy: v.optional(v.id("users")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_company_started", ["companyId", "startedAt"]),

  /**
   * The sales worksheet: one row per customer account and product.
   *
   * Each source category and type is stored twice — as written for display,
   * and as a `*Key` with case, spacing and `AND`/`&` normalised for matching. The
   * source spells the same category differently across worksheets
   * (`DISPENSERS AND BRACKETS` against `DISPENSERS & BRACKETS`, trailing
   * spaces on several others), so a join on the raw text silently drops rows.
   */
  salesDataRows: defineTable({
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    /**
     * The row's line number in the source worksheet, header included — so row
     * 2 here is row 2 in Excel.
     *
     * Insertion order cannot stand in for it: rows are written in batches, and
     * every document in one Convex transaction shares a `_creationTime`, so
     * their relative order inside a batch is not the file's. Without this the
     * table cannot be put back into the order the spreadsheet has, and nothing
     * on screen can be traced to a line in the file.
     *
     * Optional only so that rows written before it existed still validate; the
     * next import populates it for everything.
     */
    sourceRow: v.optional(v.number()),
    parentAccount: v.string(),
    groupName: v.string(),
    accountName: v.string(),
    /**
     * The normalised account name, so one customer's rows can be read by index
     * rather than by scanning the import for a name match.
     *
     * Optional only so rows written before it existed still validate; the
     * backfill populates them and every import writes it.
     */
    accountNameKey: v.optional(v.string()),
    customerType: v.string(),
    productCode: v.string(),
    /** Account code + product code. Unique per row within an import. */
    uniqueId: v.string(),
    productDescription: v.string(),
    productCategory: v.string(),
    productType: v.string(),
    customerTypeKey: v.string(),
    productCategoryKey: v.string(),
    productTypeKey: v.string(),
    /**
     * The six revenue columns, in file order. Absent means the cell was blank,
     * which in this source means "no sale that month" — not zero revenue on a
     * recorded sale, and the two should stay distinguishable.
     */
    period1: v.optional(v.number()),
    period2: v.optional(v.number()),
    period3: v.optional(v.number()),
    period4: v.optional(v.number()),
    period5: v.optional(v.number()),
    period6: v.optional(v.number()),
    quantity: v.optional(v.number()),
    /** Sum of the six periods, stored so the table can sort without scanning. */
    totalRevenue: v.number(),
  })
    // `companyId` leads every index so a query can never be scoped by import
    // alone. The same index, queried on the company prefix, finds the rows
    // left behind by superseded imports.
    .index("by_company_import", ["companyId", "importId"])
    // File order — the default the table reads in, so it matches the source.
    .index("by_company_import_row", ["companyId", "importId", "sourceRow"])
    // Kept for sorting by value, which Phase 2 will offer as a choice.
    .index("by_company_import_total", ["companyId", "importId", "totalRevenue"])
    // One customer's rows, for their profile. Without it, showing what a single
    // account buys means reading all 4,568 rows to find its hundred.
    .index("by_company_import_account_name", ["companyId", "importId", "accountNameKey"])
    .searchIndex("search_product", {
      searchField: "productDescription",
      filterFields: [
        "companyId",
        "importId",
        "customerTypeKey",
        "productCategoryKey",
        "productTypeKey",
        "groupName",
      ],
    }),

  /**
   * The category worksheet: which product categories matter to a customer type.
   *
   * One field per source column — `CUSTOMER TYPE` and `CATEGORY` — plus the
   * matching keys. The source used to be a grid with two stacked blocks; it is
   * now a plain table, and the second block has its own worksheet and its own
   * table below.
   */
  salesDataCategoryLinks: defineTable({
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    customerType: v.string(),
    customerTypeKey: v.string(),
    category: v.string(),
    categoryKey: v.string(),
  }).index("by_company_import", ["companyId", "importId"]),

  /**
   * The areas-of-interest worksheet: product types a customer type especially
   * buys. Its own table because it is its own worksheet — one tab, one table.
   */
  salesDataAreasOfInterest: defineTable({
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    customerType: v.string(),
    customerTypeKey: v.string(),
    productType: v.string(),
    productTypeKey: v.string(),
  }).index("by_company_import", ["companyId", "importId"]),

  /** The frequency worksheet: whether a product type sells regularly. */
  salesDataFrequencies: defineTable({
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    productCategory: v.string(),
    productType: v.string(),
    /** Free text from the source — `Regular` and `Sporadic` in the file seen. */
    frequency: v.string(),
    productCategoryKey: v.string(),
    productTypeKey: v.string(),
  })
    .index("by_company_import", ["companyId", "importId"])
    .index("by_company_import_lookup", [
      "companyId",
      "importId",
      "productCategoryKey",
      "productTypeKey",
    ]),

  /**
   * One row per account in the current import — the customer directory.
   *
   * Derived from `salesDataRows` and written as they are inserted, rather than
   * worked out when the list is asked for. The alternative was reading every
   * sales row to find the distinct accounts, which is 4,568 rows to produce 39
   * names, on every page of the list. Written during the import, it is a
   * paginated table like any other.
   *
   * It carries `importId` and is replaced with everything else on re-import,
   * because it is derived: nothing here was typed by a person. What people type
   * lives in `salesDataCustomers`, which has no `importId` for that reason.
   */
  salesDataAccounts: defineTable({
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    /** The normalised account name. The customer's identity across imports. */
    accountNameKey: v.string(),
    accountName: v.string(),
    /**
     * How many rows carried each spelling of the account code.
     *
     * A single code cannot be trusted: eighteen rows of the file seen carry
     * `Product - C O L0` in the code column instead of a code, and they belong
     * to eight accounts that have a real code on their other rows. Taking the
     * first one seen would show the wrong code for those eight. The most
     * frequent one is right for all of them, and self-corrects when the
     * workbook does.
     */
    codeTally: v.record(v.string(), v.number()),
    groupName: v.string(),
    groupNameKey: v.string(),
    customerType: v.string(),
    customerTypeKey: v.string(),
    /** Sum of the account's rows, so the list can show spend without a scan. */
    totalRevenue: v.number(),
    /** How many product rows the account has, for the list. */
    productCount: v.number(),
  })
    .index("by_company_import", ["companyId", "importId"])
    // The order the list reads in: chain, then account name inside it.
    .index("by_company_import_group_name", [
      "companyId",
      "importId",
      "groupNameKey",
      "accountNameKey",
    ])
    .index("by_company_import_account", ["companyId", "importId", "accountNameKey"]),

  /**
   * What staff type in about a customer: how to reach them, and the one figure
   * their kind of business is measured by.
   *
   * Deliberately carries no `importId`. Re-importing the workbook deletes and
   * rewrites everything the import owns, so details kept beside the imported
   * rows would be destroyed by the next upload — somebody's week of phone calls
   * gone because a fresh sales file arrived. Keyed on the account name instead,
   * which is the only field clean across every row of the source.
   *
   * A row exists only once somebody has entered something. No row means nothing
   * has been filled in yet, not that the customer is unknown.
   */
  // template:remove:end
  // The wiki tables are base-module schema. They sat inside the salesData
  // fence above until 2026-08-19, when the first real strip build showed a
  // salesData-free template losing its entire wiki (24 files failing to
  // compile). The fence closes here and reopens after wikiPageRevisions.
  /**
   * The self-improving wiki: whole pages Sonae writes and tends itself, one
   * per subject, rewritten after conversations — never chunked, never
   * embedded (self-improving-wiki-plan.md, decisions 1-3). The machine's
   * text lives in `content`; pinned human corrections are a separate layer
   * the machine cannot touch, appended in code wherever the page is read —
   * survival by construction, not by prompt obedience.
   */
  wikiPages: defineTable({
    // Absent means the global brain (global-wiki-plan.md): the platform's
    // own shelf, readable by every company's answers, holding nothing
    // company-specific — the same convention knowledgeDocuments uses.
    companyId: v.optional(v.id("companies")),
    // CUSTOMER pages are keyed by the salesDataCustomers accountNameKey and
    // born from matched calls and emails. The topic kinds (phase 5) are
    // named by the model as conversations touch them: what the company
    // sells (PRODUCT), how it works (POLICY), what keeps coming up (ISSUE).
    kind: v.union(
      v.literal("CUSTOMER"),
      v.literal("PRODUCT"),
      v.literal("POLICY"),
      v.literal("ISSUE"),
      // Full-import-first (wiki-agents plan, phase 3): one full note per
      // ingested document, substantially intact — the layer the synthesis
      // pages stand on, mechanical and never model-shortened.
      v.literal("SOURCE"),
      // What the company is aiming at (personal-layer-and-goals-plan.md):
      // human-authored intent, never distilled from documents and never
      // model-tidied — the staff's only move on a stale goal is a question.
      v.literal("GOAL")
    ),
    subjectKey: v.string(),
    title: v.string(),
    content: v.string(),
    // Subject keys of pages this page mentions; the map is drawn from these.
    links: v.array(v.string()),
    // No user id on the pin itself: who pinned it lives in the audit trail
    // (WIKI_PAGE_PIN, retained as oversight evidence), so a person's erasure
    // never has to reach inside this array to be provably complete.
    pinnedCorrections: v.array(
      v.object({
        text: v.string(),
        pinnedAt: v.number(),
      })
    ),
    rewriteCount: v.number(),
    // How many DOCUMENT receipts this page holds (wikiPageSources is the
    // truth; this is the list screen's cheap copy of it).
    documentSourceCount: v.optional(v.number()),
    // What last changed the page: "PHONE_CALL:<id>", "EMAIL:<gmail id>",
    // "HUMAN:<user id>", "DOCUMENT:<id>", "TENDING".
    lastRewriteSource: v.string(),
    // When the nightly tending pass last considered this page, so a tidy
    // page is not re-tidied for nothing (wiki plan, phase 4).
    lastTendedAt: v.optional(v.number()),
    // How many answers this page has stood under, and when it last did
    // (closing-the-loop plan, phase 2). Denormalised at answer time the
    // way receipts are — never a scan at read time.
    usageCount: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    // When the Freshness Checker last verified this page against its kept
    // sources (wiki-agents plan, phase 2). Absent means never checked.
    lastVerifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Title, subject key and body in one field, kept in step on every write.
    // The list's search used to read five hundred pages into the browser and
    // sift them there, which silently hid page five hundred and one.
    searchText: v.optional(v.string()),
  })
    .index("by_company_kind_subject", ["companyId", "kind", "subjectKey"])
    .index("by_company_updated", ["companyId", "updatedAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["companyId", "kind"],
    }),

  /**
   * The receipts behind a page (wiki-replaces-knowledge plan, screen 3):
   * which documents and conversations taught it. One row per page-and-source
   * pair — a document that teaches the same page twice is still one receipt.
   * Document rows point at `knowledgeDocuments`, which this plan keeps as
   * stored originals precisely so these rows always have something to open.
   */
  wikiPageSources: defineTable({
    pageId: v.id("wikiPages"),
    companyId: v.optional(v.id("companies")),
    kind: v.union(
      v.literal("DOCUMENT"),
      v.literal("PHONE_CALL"),
      v.literal("EMAIL"),
      v.literal("HUMAN"),
      // A durable synthesis filed back from an answered question
      // (wiki-agents plan, phase 5).
      v.literal("CHAT")
    ),
    /** Document id, call id, mailbox message id, or user id — as text. */
    ref: v.string(),
    /** What a person sees on the page's source list. */
    label: v.string(),
    addedAt: v.number(),
  })
    .index("by_page", ["pageId", "addedAt"])
    .index("by_page_ref", ["pageId", "kind", "ref"])
    // Reverse lookup: which pages did this document teach — the source-note
    // backfill's road from a document to its synthesis pages.
    .index("by_company_ref", ["companyId", "kind", "ref"]),

  /**
   * One row per company: the distiller's progress, drawn on the Wiki
   * screen while an import (or the one-time catch-up) is being read.
   */
  wikiDistillState: defineTable({
    companyId: v.optional(v.id("companies")),
    documentsRead: v.number(),
    pagesWritten: v.number(),
    pagesImproved: v.number(),
    lastDocumentTitle: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  /**
   * What the staff flag but never settle (wiki-agents plan, phases 1-2):
   * two pages that disagree, or a claim a source no longer supports. Each
   * row is a question for a person; the machine's ceiling is raising it.
   * Deduplicated by key so the same disagreement is not raised nightly,
   * and auto-resolved when the pages change so the claim no longer stands.
   */
  wikiOpenQuestions: defineTable({
    companyId: v.optional(v.id("companies")),
    kind: v.union(
      v.literal("CONTRADICTION"),
      v.literal("FRESHNESS"),
      // A person's typed correction from chat, routed here once their
      // company's memories migrated (one-brain-plan.md, phase 3) — the
      // queue that used to live on the Memory screen.
      v.literal("CORRECTION")
    ),
    pageKeyA: v.string(),
    claimA: v.string(),
    pageKeyB: v.optional(v.string()),
    claimB: v.optional(v.string()),
    detail: v.optional(v.string()),
    dedupeKey: v.string(),
    status: v.union(v.literal("OPEN"), v.literal("RESOLVED"), v.literal("DISMISSED")),
    raisedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_company_status", ["companyId", "status", "raisedAt"])
    .index("by_company_dedupe", ["companyId", "dedupeKey"]),

  /**
   * What the wiki could not answer (closing-the-loop plan, phase 1): a
   * real question that ended with no pages under it, normalised and
   * counted when it repeats. Every row is demand — a customer naming
   * what to feed the brain next. Rows resolve themselves when a later
   * identical asking gets answered with pages; dismissal is a person's
   * call and attribution lives in the audit trail, as with pins.
   */
  wikiUnansweredQuestions: defineTable({
    // Absent means the platform's own gap list (Anthony's SaaS ruling,
    // 2026-08-17): when the global brain was in play and still had no
    // answer, the miss also lands here — visible to super admins alone,
    // who can already read every company's chat logs. Company rows name
    // their company; platform rows count companies, never name them.
    companyId: v.optional(v.id("companies")),
    /** The first asking's own words, for the panel. */
    question: v.string(),
    normalizedKey: v.string(),
    askCount: v.number(),
    /** Platform rows only: distinct company ids that asked, capped. */
    companiesJson: v.optional(v.string()),
    status: v.union(v.literal("OPEN"), v.literal("DISMISSED"), v.literal("RESOLVED")),
    firstAskedAt: v.number(),
    lastAskedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_company_status_asked", ["companyId", "status", "lastAskedAt"])
    .index("by_company_key", ["companyId", "normalizedKey"])
    .index("by_status_asked", ["status", "lastAskedAt"])
    .searchIndex("search_question", {
      searchField: "question",
      filterFields: ["status", "companyId"],
    }),

  /**
   * One row per company per UTC day (closing-the-loop plan, phase 3):
   * how many questions the wiki answered and how many it could not.
   * Written by the same after-answer mutation that keeps the usage
   * marks, so the weekly report counts real events, not estimates.
   */
  wikiAnswerTallies: defineTable({
    companyId: v.id("companies"),
    /** UTC day, "YYYY-MM-DD". */
    dayKey: v.string(),
    answered: v.number(),
    unanswered: v.number(),
  }).index("by_company_day", ["companyId", "dayKey"]),

  /**
   * A pre-ingest review (wiki-agents plan, phase 4): what a marked
   * document claims and the pages the Reviewer proposes, held for a
   * person's decision before the wiki learns anything from it.
   */
  wikiReviews: defineTable({
    companyId: v.optional(v.id("companies")),
    documentId: v.id("knowledgeDocuments"),
    title: v.string(),
    claimsJson: v.string(),
    status: v.union(v.literal("PENDING"), v.literal("APPROVED"), v.literal("REJECTED")),
    requestedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
  })
    .index("by_company_status", ["companyId", "status", "requestedAt"])
    .index("by_document", ["documentId"]),

  /**
   * The page's walkable history (wiki plan, acceptance 4): the text as it
   * stood BEFORE each rewrite, and what caused the rewrite. Reading the
   * revisions in order shows which conversation taught which change.
   */
  wikiPageRevisions: defineTable({
    pageId: v.id("wikiPages"),
    companyId: v.optional(v.id("companies")),
    content: v.string(),
    source: v.string(),
    createdAt: v.number(),
  }).index("by_page", ["pageId", "createdAt"]),

  // template:remove:start salesData
  salesDataCustomers: defineTable({
    companyId: v.id("companies"),
    accountNameKey: v.string(),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    town: v.optional(v.string()),
    postcode: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    email: v.optional(v.string()),
    accountsEmail: v.optional(v.string()),
    /**
     * The business's own site.
     *
     * Worth its own field rather than living in the notes: it is where every
     * other detail on this record came from or could be checked against, and
     * the research agent finds it first and for free on the way to everything
     * else.
     */
    website: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactRole: v.optional(v.string()),
    /** Care homes and hotels. */
    bedrooms: v.optional(v.number()),
    /** Education, residential and non-residential. */
    pupils: v.optional(v.number()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_company_account", ["companyId", "accountNameKey"]),

  /**
   * What the research agent found, one row per detail it reported.
   *
   * Two jobs in one table, deliberately. An `APPLIED` row is the provenance
   * behind a filled field — the page it came from and when — and a
   * `NEEDS_CHECK` row is a finding waiting for a person to accept or discard.
   * They are the same record at different stages, and splitting them would mean
   * keeping two tables honest with each other.
   *
   * Nothing is added to `salesDataCustomers` to mark a value as researched.
   * Whether a detail was found or typed is answered by whether an `APPLIED` row
   * exists for that field, which keeps the CRM's own table unchanged and leaves
   * a workspace that never runs the agent carrying no trace of it.
   *
   * Carries no `importId`. Like the typed-in details it survives a re-import,
   * because nothing in it came from the workbook.
   */
  salesDataCustomerResearch: defineTable({
    companyId: v.id("companies"),
    /**
     * Who this is about, keyed as the CRM keys them.
     *
     * Named `subjectKey` rather than `accountNameKey` because the prospecting
     * half of this feature files findings against businesses that are not
     * accounts in the workbook. `subjectType` says which.
     */
    subjectKey: v.string(),
    subjectType: v.union(v.literal("CUSTOMER"), v.literal("PROSPECT")),
    /** Which detail: `phone`, `postcode`, `bedrooms`, and so on. */
    field: v.string(),
    /** As found, kept as text; parsed on apply for the two numeric fields. */
    value: v.string(),
    /** The agent's own judgement. What is done with it is decided in code. */
    confidence: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
    status: v.union(
      v.literal("APPLIED"),
      v.literal("NEEDS_CHECK"),
      v.literal("REJECTED"),
      v.literal("SUPERSEDED"),
      v.literal("NOT_FOUND")
    ),
    /** Where it came from. A finding without one is refused, so both are set. */
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    /** One line: why the agent believes this is the right business. */
    reasoning: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    agentId: v.optional(v.id("agents")),
    foundAt: v.number(),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
  })
    // Serves the profile on its first two columns and the supersede lookup on
    // all three, so one index covers both reads.
    .index("by_company_subject_field", ["companyId", "subjectKey", "field"])
    .index("by_company_status_found", ["companyId", "status", "foundAt"])
    // The run screen leads with what a run actually recorded, which is this
    // table read by run rather than by subject.
    .index("by_run", ["runId"]),

  /**
   * A site in a group the workspace supplies, that it does not supply yet.
   *
   * The output of the prospecting half. The workbook holds six Colten Care
   * homes; Colten Care runs more than six, and the rest are businesses the
   * workspace is already a known supplier to the parent of. Nothing in the
   * platform surfaced them before this table.
   *
   * Carries no `importId`, for the same reason the typed-in details do not: an
   * import must not delete work the import did not create. This is the point
   * that would be lost by adding prospects to `salesDataAccounts`, which is
   * derived and is replaced wholesale on every upload.
   *
   * The contact details a prospect eventually gets live in
   * `salesDataCustomers`, keyed on `prospectKey` exactly as a customer's are on
   * their account key. One record shape, one save path, one set of provenance
   * rules — and conversion becomes a status change rather than a data move.
   */
  salesDataProspects: defineTable({
    companyId: v.id("companies"),
    /** The normalised site name, keyed as accounts are. The identity. */
    prospectKey: v.string(),
    /** As the register or the group's own site publishes it. */
    siteName: v.string(),
    groupName: v.string(),
    groupNameKey: v.string(),
    /** Inherited from the group's members, so the extra figure rule applies. */
    customerTypeKey: v.string(),
    customerType: v.string(),
    town: v.optional(v.string()),
    postcode: v.optional(v.string()),
    status: v.union(
      v.literal("NEW"),
      v.literal("DISMISSED"),
      /** The workbook now contains it: it became a customer. */
      v.literal("CONVERTED")
    ),
    /**
     * Recorded when the site matched an existing customer by name but disagreed
     * on postcode.
     *
     * Filed as a prospect rather than silently assumed to be the same business,
     * because the alternative is a rep telephoning an account the workspace has
     * supplied for a decade. The text names what it clashed with, so the person
     * deciding can see the clash rather than being told the answer.
     */
    conflictNote: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    /**
     * Where the prospect came from.
     *
     * Absent means the original warm-chain flow: a site inside a group the
     * workspace already supplies. Market discovery writes the explicit value so
     * cold prospects can be labelled and reported without pretending they carry
     * the same sales story.
     */
    origin: v.optional(v.union(v.literal("EXISTING_CHAIN"), v.literal("MARKET_DISCOVERY"))),
    marketDiscoveryGroupId: v.optional(v.id("salesDataMarketDiscoveryGroups")),
    marketDiscoveryJobId: v.optional(v.id("salesDataMarketDiscoveryJobs")),
    runId: v.optional(v.id("agentRuns")),
    agentId: v.optional(v.id("agents")),
    foundAt: v.number(),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
  })
    .index("by_company_prospect", ["companyId", "prospectKey"])
    // The group view, and the coverage line that counts against it.
    .index("by_company_group", ["companyId", "groupNameKey", "prospectKey"])
    .index("by_company_status", ["companyId", "status", "foundAt"])
    // The run screen leads with what a run actually recorded, which includes
    // the prospects it filed.
    .index("by_run", ["runId"]),

  /**
   * One press of "Find new groups".
   *
   * This is deliberately separate from `salesDataResearchJobs`. The research
   * job works warm leads inside known groups; this job searches outside the
   * import and therefore carries colder-proof counters: accepted parent groups,
   * skipped duplicates, filed locations and rows left for a person to check.
   */
  salesDataMarketDiscoveryJobs: defineTable({
    companyId: v.id("companies"),
    customerTypeKey: v.string(),
    customerType: v.string(),
    targetGroupCount: v.number(),
    customerTypes: v.optional(v.array(v.object({
      customerTypeKey: v.string(),
      customerType: v.string(),
      targetGroupCount: v.number(),
    }))),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETE"),
      v.literal("COMPLETE_WITH_EXCEPTIONS"),
      v.literal("STOPPED"),
      v.literal("FAILED")
    ),
    phase: v.union(
      v.literal("SETUP"),
      v.literal("FIND_GROUPS"),
      v.literal("VERIFY_GROUPS"),
      v.literal("FIND_LOCATIONS"),
      v.literal("DONE")
    ),
    agentId: v.id("agents"),
    runId: v.optional(v.id("agentRuns")),
    /**
     * How many runs this job has spent.
     *
     * A run is labour, the job is the work. A model that ends its turn with
     * queue left is not the job finishing — the first live run found five
     * parent groups, never asked for a single location task, and the job
     * closed itself as COMPLETE with nothing filed. The job now starts
     * another run instead, and this counts them so it cannot do that for
     * ever. Absent means one, which is every job written before this.
     */
    runsStarted: v.optional(v.number()),
    startedBy: v.optional(v.id("users")),
    groupsAccepted: v.number(),
    groupsRejected: v.number(),
    groupsDuplicate: v.number(),
    groupsNeedsCheck: v.number(),
    locationsFiled: v.number(),
    locationsDuplicate: v.number(),
    locationsNeedsCheck: v.number(),
    currentLabel: v.optional(v.string()),
    maxCostGBP: v.number(),
    spentGBP: v.number(),
    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    endedReason: v.optional(v.string()),
  })
    .index("by_company_status", ["companyId", "status"])
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_agent_started", ["agentId", "startedAt"])
    .index("by_run", ["runId"]),

  /**
   * Parent companies found by the market discovery job.
   *
   * Accepted rows become the location-finding queue. Duplicate, rejected and
   * needs-check rows are kept too because their counts are part of the visible
   * progress bar and proof trail.
   */
  salesDataMarketDiscoveryGroups: defineTable({
    companyId: v.id("companies"),
    jobId: v.id("salesDataMarketDiscoveryJobs"),
    groupName: v.string(),
    groupNameKey: v.string(),
    customerType: v.string(),
    customerTypeKey: v.string(),
    website: v.optional(v.string()),
    sourceUrl: v.string(),
    sourceName: v.optional(v.string()),
    reasoning: v.string(),
    status: v.union(
      v.literal("ACCEPTED"),
      v.literal("NEEDS_CHECK"),
      v.literal("DUPLICATE"),
      v.literal("REJECTED")
    ),
    locationsStatus: v.union(
      v.literal("PENDING"),
      v.literal("IN_PROGRESS"),
      v.literal("DONE")
    ),
    locationsAttemptedAt: v.optional(v.number()),
    /**
     * How many times this group has been handed out for location finding.
     *
     * A group only leaves the queue when the agent says it is done, and a
     * model that cannot find any locations often says nothing at all instead.
     * Pearson — a publisher with no sites to file — was handed to five
     * consecutive runs, each of which read the same page and gave up, while
     * four other groups behind it were never reached. Counting the handouts is
     * what lets the queue retire a group the agent will not.
     */
    locationsAttempts: v.optional(v.number()),
    locationsEndedReason: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    agentId: v.optional(v.id("agents")),
    foundAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_company_group", ["companyId", "groupNameKey"])
    .index("by_company_job_status", ["companyId", "jobId", "status"])
    .index("by_job_locations_status", ["jobId", "locationsStatus"])
    .index("by_job_status", ["jobId", "status"])
    .index("by_run", ["runId"]),

  /**
   * One press of "research everything", and how far through it is.
   *
   * The thing that was missing. Research used to be started as one agent run per
   * customer and one per chain — 141 runs on this workspace, a quarter of them
   * dying on their own ceilings — with nothing anywhere holding the sentence
   * "there are 39 customers and 12 are done". Nothing could say whether the work
   * had finished, nothing retried what died, and a sweep that had covered a
   * third of the list read on screen exactly like one that had covered all of
   * it.
   *
   * This row is that sentence. It owns the queue below, survives the runs it
   * starts, and is what the screen reads. A run is now a unit of work the job
   * hands out, not the job.
   */
  salesDataResearchJobs: defineTable({
    companyId: v.id("companies"),
    /** Researching is always against one import; a new upload starts a new job. */
    importId: v.id("salesDataImports"),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETE"),
      /** Finished the queue, but some items could not be done. */
      v.literal("COMPLETE_WITH_EXCEPTIONS"),
      /** A person pressed stop, or the job reached its spend ceiling. */
      v.literal("STOPPED"),
      v.literal("FAILED")
    ),
    /**
     * Which pass it is on. The order is fixed in code, not chosen by the model:
     * customers, then chains, then the prospects those chains produced. Phase
     * three cannot be a separate press because its work does not exist until
     * phase two has run.
     */
    phase: v.union(
      v.literal("CUSTOMERS"),
      v.literal("CHAINS"),
      v.literal("PROSPECTS"),
      v.literal("DONE")
    ),
    /**
     * The agent doing the work, fixed when the job starts.
     *
     * Held here rather than resolved again for each run: which agent has the
     * research tools switched on can change mid-job, and a job that swapped
     * agents halfway would produce findings from two different configurations
     * with nothing on screen to say so.
     */
    agentId: v.id("agents"),
    /** The run currently working the queue, if one is. */
    currentRunId: v.optional(v.id("agentRuns")),
    /** How many runs this job has started. Diagnostic, not a limit. */
    runsStarted: v.number(),
    /**
     * What the job may spend across every run it starts.
     *
     * The bound that matters for an autopilot. Per-run ceilings stop one run
     * going mad; only this stops a job quietly costing fifty pounds by starting
     * twenty runs that each stayed politely under their own limit.
     */
    maxCostGBP: v.number(),
    spentGBP: v.number(),
    /**
     * The second worker, when the workspace splits the job's two skills.
     *
     * `agentId` is the record filler (customers and prospects); this is the
     * prospect finder (chains). Absent, one agent does both — which is how a
     * fresh deployment behaves until somebody creates the second agent, and
     * how the template ships.
     */
    prospectAgentId: v.optional(v.id("agents")),
    /**
     * Which button this job answers to.
     *
     * DETAILS fills in customers and prospects already on the books;
     * PROSPECTS hunts the chains and files what it finds, without researching
     * it. Absent means the original everything job, which a workspace with a
     * single agent still gets.
     */
    mode: v.optional(v.union(v.literal("DETAILS"), v.literal("PROSPECTS"))),
    /** Spend split by skill, so the report can say what each worker cost. */
    findingSpentGBP: v.optional(v.number()),
    fillingSpentGBP: v.optional(v.number()),
    startedBy: v.optional(v.id("users")),
    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    /** Why it ended, in words, for the line the screen shows when it stops. */
    endedReason: v.optional(v.string()),
  })
    // At most one job per workspace is RUNNING; this is how that is checked.
    .index("by_company_status", ["companyId", "status"])
    .index("by_company_started", ["companyId", "startedAt"])
    // The observability screen asks by agent. A global agent belongs to no
    // workspace, so asking "which workspace is this agent's" returned nothing
    // and hid the job panel for exactly the agent it was built for. Two
    // indexes because either worker's screen must find the job.
    .index("by_agent_started", ["agentId", "startedAt"])
    .index("by_prospect_agent_started", ["prospectAgentId", "startedAt"]),

  /**
   * One row per thing the job has to research, and whether it has been.
   *
   * Materialised rather than recomputed each time because it carries state a
   * derived list cannot: how many attempts an item has had, and why it was given
   * up on. Without those, an item that fails deterministically is retried for
   * ever, and an item that was skipped leaves no trace of having been skipped.
   */
  salesDataResearchJobItems: defineTable({
    jobId: v.id("salesDataResearchJobs"),
    companyId: v.id("companies"),
    kind: v.union(
      v.literal("CUSTOMER"),
      v.literal("CHAIN"),
      /** Added while the job runs, as the chain phase turns them up. */
      v.literal("PROSPECT")
    ),
    /** The account, group or prospect key. Unique per job with `kind`. */
    key: v.string(),
    /** As a person would say it, for the progress line and the exception list. */
    label: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("IN_PROGRESS"),
      v.literal("DONE"),
      /** Attempted twice and still not done. The job carries on without it. */
      v.literal("FAILED")
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    /** The run that last worked this item, so a row can be traced to a run. */
    runId: v.optional(v.id("agentRuns")),
    updatedAt: v.number(),
  })
    // Handing out the next piece of work: the job's items of one kind, by state.
    .index("by_job_kind_status", ["jobId", "kind", "status"])
    .index("by_job_status", ["jobId", "status"])
    // Refusing to queue the same subject twice when the chain phase finds a
    // prospect the job already knows about.
    .index("by_job_kind_key", ["jobId", "kind", "key"]),

  /**
   * One press of the opportunity report, and everything it computed.
   *
   * The whole report lives in one row — headline, both sections, the agent's
   * summary — because the screen shows exactly one report at a time and the
   * workspace holds tens of accounts, not thousands. Every figure in it was
   * written by the deterministic pass in `salesOpportunityService.ts`; the
   * agent contributes only `summary` and `exceptions`, and the save path
   * refuses a summary naming a figure the sections do not hold.
   *
   * Keyed to an import because the estimates are sums over one workbook's six
   * months. A re-import does not delete old reports — they remain readable,
   * labelled with the import they describe — but the screen leads with the
   * newest, and a fresh press prices the new data.
   */
  salesOpportunityReports: defineTable({
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETE"),
      /** Finished, but something could not be priced. The list says what. */
      v.literal("COMPLETE_WITH_EXCEPTIONS"),
      v.literal("FAILED")
    ),
    /**
     * How far through the pass it is, for the progress bar. The order is
     * fixed in code: price the prospects, find the gaps, write the summary.
     */
    phase: v.union(
      v.literal("MATCHING"),
      v.literal("GAPS"),
      v.literal("SUMMARY"),
      v.literal("DONE")
    ),
    agentId: v.optional(v.id("agents")),
    /** The run doing the work, so the report can be traced to its run. */
    runId: v.optional(v.id("agentRuns")),
    requestedBy: v.optional(v.id("users")),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    /** Why a FAILED report failed, in words, for the line the screen shows. */
    failureReason: v.optional(v.string()),
    /** The hero boxes, computed once with the sections, never re-derived. */
    headline: v.optional(opportunityHeadlineValidator),
    /** Section one: what each prospect would be worth, with its working. */
    prospects: v.optional(
      v.array(
        v.object({
          prospectKey: v.string(),
          siteName: v.string(),
          groupName: v.string(),
          customerType: v.string(),
          origin: v.optional(v.union(v.literal("EXISTING_CHAIN"), v.literal("MARKET_DISCOVERY"))),
          sizeUnit: v.union(v.literal("bedrooms"), v.literal("pupils"), v.null()),
          size: v.union(v.number(), v.null()),
          estimateGBP: v.union(v.number(), v.null()),
          confidence: v.union(
            v.literal("GROUP_SIZED"),
            v.literal("TYPE_SIZED"),
            v.literal("GROUP_AVERAGE"),
            v.literal("TYPE_AVERAGE"),
            v.literal("NONE")
          ),
          ratePerUnitGBP: v.union(v.number(), v.null()),
          comparedTo: v.array(
            v.object({
              accountName: v.string(),
              totalRevenueGBP: v.number(),
              size: v.union(v.number(), v.null()),
            })
          ),
          basis: v.string(),
        })
      )
    ),
    /** Section two: what each chain member is not buying, with its working. */
    gaps: v.optional(
      v.array(
        v.object({
          accountNameKey: v.string(),
          accountName: v.string(),
          groupName: v.string(),
          categoryKey: v.string(),
          category: v.string(),
          buyersCount: v.number(),
          siblingCount: v.number(),
          estimateGBP: v.number(),
          scaledBySize: v.boolean(),
          comparedTo: v.array(
            v.object({ accountName: v.string(), spendGBP: v.number() })
          ),
          basis: v.string(),
        })
      )
    ),
    /**
     * A dead field from a superseded idea — three example products per
     * category, workbook-wide. Replaced within the hour by the per-gap
     * product lists in `salesOpportunityReportGapProducts`, but one dev
     * report row was stamped before the replacement, so the field must stay
     * validatable. Nothing writes or reads it.
     */
    categoryExamples: v.optional(
      v.array(
        v.object({
          categoryKey: v.string(),
          category: v.string(),
          examples: v.array(v.string()),
        })
      )
    ),
    /** The agent's reading of the sections, as markdown. Prose, not figures. */
    summary: v.optional(v.string()),
    /** What could not be done and why, shown on the report, not in logs. */
    exceptions: v.optional(v.array(v.string())),
  })
    // At most one report per workspace is RUNNING; this is how that is checked.
    .index("by_company_status", ["companyId", "status"])
    // The screen leads with the newest report.
    .index("by_company_started", ["companyId", "startedAt"])
    .index("by_run", ["runId"]),

  /**
   * The order sheet behind each gap: the products the buying sister accounts
   * actually purchase in the gapped category, and what they spend on each.
   *
   * One row per gap, keyed the way the report's gap rows are keyed, in a
   * table of its own because 200 gaps × their full product lists would crowd
   * the report document toward its size limit. The screen shows every line —
   * the report's job is to educate on where the opportunities are and for
   * what, so nothing here is sampled or capped.
   */
  salesOpportunityReportGapProducts: defineTable({
    companyId: v.id("companies"),
    reportId: v.id("salesOpportunityReports"),
    accountNameKey: v.string(),
    categoryKey: v.string(),
    products: v.array(
      v.object({
        description: v.string(),
        spendGBP: v.number(),
      })
    ),
  }).index("by_company_report", ["companyId", "reportId"]),

  /**
   * What a customer of each type actually buys, and in what proportion.
   *
   * An existing customer's gap arrives with an order sheet — the products its
   * sister accounts really purchase. A prospect got a single estimated pound
   * figure and nothing else, so four sites in one chain read as four identical
   * guesses with no size and no basket. Anthony, 2026-08-05: *"this feels lazy
   * when we do this in the other tabs."*
   *
   * This is that order sheet for a site nobody supplies yet: the category mix
   * of the customers the estimate was priced against, with the products inside
   * each category. Applying the mix to a site's own estimate is arithmetic the
   * reader can redo by hand, which is the rule the whole report is held to.
   */
  salesOpportunityReportTypeBaskets: defineTable({
    companyId: v.id("companies"),
    reportId: v.id("salesOpportunityReports"),
    customerTypeKey: v.string(),
    customerType: v.string(),
    /** Six-month spend of every customer of this type, the share denominator. */
    totalSpendGBP: v.number(),
    /** How many customers the mix is averaged over, so the reader can weigh it. */
    customerCount: v.number(),
    categories: v.array(
      v.object({
        categoryKey: v.string(),
        category: v.string(),
        spendGBP: v.number(),
        products: v.array(
          v.object({
            description: v.string(),
            spendGBP: v.number(),
          })
        ),
      })
    ),
  }).index("by_company_report", ["companyId", "reportId"]),
  // template:remove:end
});
