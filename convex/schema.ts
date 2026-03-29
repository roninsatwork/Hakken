import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
    role: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  }).index("by_token", ["tokenIdentifier"]),
});
