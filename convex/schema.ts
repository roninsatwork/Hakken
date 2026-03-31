import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  
  companies: defineTable({
    name: v.string(),
    logo: v.optional(v.string()),
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
  }).index("email", ["email"]),
  
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

  // AI Rule Engine (Triggers & Logic Processing)
  aiRules: defineTable({
    companyId: v.optional(v.id("companies")),
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_active", ["isActive", "createdAt"])
    .index("by_company_active", ["companyId", "isActive"]),

  // Knowledge Base Vector Engine & Document Storage
  knowledgeDocuments: defineTable({
    title: v.string(),
    fileId: v.id("_storage"),
    companyId: v.optional(v.id("companies")),
    status: v.union(v.literal("processing"), v.literal("ready"), v.literal("failed")),
    format: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_company", ["companyId", "createdAt"]),

  // Knowledge Base Vector Store
  knowledgeChunks: defineTable({
    documentId: v.id("knowledgeDocuments"),
    companyId: v.optional(v.id("companies")),
    text: v.string(),
    embedding: v.array(v.number()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768, // Gemini text-embedding-004 uses 768 length vectors
    filterFields: ["companyId", "documentId"],
  }),

  // Sonae Assistant Tables
  threads: defineTable({
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
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
});
