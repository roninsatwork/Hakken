import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Sonae Custom Fields
    role: v.optional(v.union(v.literal("USER"), v.literal("ADMIN"))),
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
    role: v.union(v.literal("USER"), v.literal("ADMIN")),
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
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_active", ["isActive", "createdAt"]),

  // Sonae Assistant Tables
  threads: defineTable({
    userId: v.id("users"),
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
