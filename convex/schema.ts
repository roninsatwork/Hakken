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
    costGBP: v.number(), // Processed cost for this transaction
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_company_created", ["companyId", "createdAt"]),

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
    .index("by_agent_role_created", ["agentId", "role", "createdAt"]),

  // Agent Orchestration Engine
  agents: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()), // Optional icon/avatar
    modelId: v.string(), // Provider model identifier
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
    isActive: v.boolean(),
    // Inline Sandbox Configuration
    isGlobal: v.optional(v.boolean()),
    workflowId: v.optional(v.id("workflows")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"])
    .index("by_workflow", ["workflowId", "isGlobal"])
    .index("by_workflow_created", ["workflowId", "createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  // Global Tool Library
  aiTools: defineTable({
    name: v.string(), // "search_web", "query_database"
    description: v.string(), // Provide clear instructions on what the tool does
    handlerMapping: v.string(), // Points to internal mutation/action route (e.g., "internalActions.executeDatabaseQuery")
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_name", ["name"])
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
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_agent", ["agentId"])
    .index("by_createdAt", ["createdAt"])
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
    displayName: v.string(),
    description: v.optional(v.string()), // A short description 
    isEnabled: v.boolean(),
    isDefault: v.boolean(),
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
    .index("by_enabled", ["isEnabled"])
    .index("by_default", ["isDefault"])
    .searchIndex("search_display_name", { searchField: "displayName" })
    .searchIndex("search_model_id", { searchField: "modelId" }),

  workflowExecutionSteps: defineTable({
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    agentId: v.optional(v.id("agents")),
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
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

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
});
