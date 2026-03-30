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
});
