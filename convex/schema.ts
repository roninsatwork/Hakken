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
    createdAt: v.number(),
  }).index("by_name", ["name"]),
  
  systemSettings: defineTable({
    platformName: v.string(),
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

    currencySymbol: v.optional(v.string()),
    monthlySeatPrice: v.number(),
    monthlyBasePrice: v.number()
  }),
  
  companyMetrics: defineTable({
    companyId: v.id("companies"),
    date: v.string(),
    activeUsers: v.number(),
    totalMessages: v.number(),
    totalTokens: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costGBP: v.number(),
  }).index("by_company_date", ["companyId", "date"]),
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
    role: v.optional(v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN"))),
    createdAt: v.optional(v.number()),
    tokenIdentifier: v.optional(v.string()),
  }).index("email", ["email"]).index("by_token", ["tokenIdentifier"]),
  
  logins: defineTable({
    userId: v.id("users"),
    ip: v.string(),
    device: v.string(),
    location: v.string(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    timestamp: v.number(),
  })
    .index("by_user", ["userId", "timestamp"])
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

  // AI Agent Usage Billing & Activity Logs
  agentTransactions: defineTable({
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    userId: v.id("users"), // The user who triggered the agent
    companyId: v.optional(v.id("companies")), // Tenant context
    actionContext: v.string(), // e.g. "Chat Completion", "Email Draft", "Summarization"
    inputTokens: v.number(),
    outputTokens: v.number(),
    modelUsed: v.string(),
    costGBP: v.number(), // Processed cost for this transaction
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    createdAt: v.number(),
  }).index("by_agent", ["agentId", "createdAt"]),

  // Agent Raw Debug Logs (Execution Payload Storage)
  agentLogs: defineTable({
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    interactionType: v.string(), // "Tool Execution", "Generation", "Error"
    promptContent: v.string(), // What the Agent was sent
    responseContent: v.string(), // What the Agent replied or did
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "createdAt"])
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
    .index("by_agent", ["agentId", "createdAt"]),

  // Knowledge Base Vector Engine & Document Storage
  knowledgeDocuments: defineTable({
    title: v.string(),
    fileId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    textContent: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("ready"), v.literal("failed")),
    format: v.string(), // "application/pdf", "text/plain", "url"
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_company", ["companyId", "createdAt"])
    .index("by_agent", ["agentId", "createdAt"]),

  // Knowledge Base Vector Store
  knowledgeChunks: defineTable({
    documentId: v.id("knowledgeDocuments"),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    isGlobal: v.boolean(),
    text: v.string(),
    embedding: v.array(v.number()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768, // Gemini text-embedding-004 uses 768 length vectors
    filterFields: ["companyId", "agentId", "documentId", "isGlobal"],
  }).index("by_document", ["documentId"]),

  // Sonae Assistant Tables
  threads: defineTable({
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")), // Sandbox tracking
    title: v.optional(v.string()), // Generated lazily after first exchange
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    // Sonae AI Logistics
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    modelUsed: v.optional(v.string())
  }).index("by_thread", ["threadId", "createdAt"]),

  // Agent Orchestration Engine
  agents: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()), // Optional icon/avatar
    modelId: v.string(), // e.g. "gemini-3.1-pro-preview"
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
    .index("by_workflow", ["workflowId", "isGlobal"]),

  // Global Tool Library
  aiTools: defineTable({
    name: v.string(), // "search_web", "query_database"
    description: v.string(), // Provide clear instructions on what the tool does
    handlerMapping: v.string(), // Points to internal mutation/action route (e.g., "internalActions.executeDatabaseQuery")
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }).index("by_name", ["name"]),

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
  }).index("by_name", ["name"]),

  workflowExecutions: defineTable({
    workflowId: v.id("workflows"),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    triggerType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    startedBy: v.id("users"),
    state: v.optional(v.string()), // JSON representation of final execution state for debugging
  }).index("by_workflow", ["workflowId", "startedAt"]),
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
    .index("by_agent", ["agentId"]),

  swarmLogs: defineTable({
    threadId: v.id("threads"),
    message: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
    order: v.number(),
    isHeading: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_thread", ["threadId", "order"]),

  aiModels: defineTable({
    modelId: v.string(), // e.g. "gemini-3.1-pro-preview"
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
    .index("by_default", ["isDefault"]),

  workflowExecutionSteps: defineTable({
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    agentId: v.optional(v.id("agents")),
    input: v.string(), // JSON stringified
    output: v.optional(v.string()), // JSON stringified
    status: v.union(v.literal("PENDING"), v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_execution", ["executionId", "nodeId"]),
});
