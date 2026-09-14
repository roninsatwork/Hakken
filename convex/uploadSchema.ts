import { defineTable } from "convex/server";
import { v } from "convex/values";

export const uploadPurpose = v.union(v.literal("chat"), v.literal("image"), v.literal("knowledge"), v.literal("workbook"), v.literal("recording"), v.literal("widget"));
export const uploadMetadataArgs = { sizeBytes: v.optional(v.number()), contentType: v.optional(v.string()) };
export const uploadTables = {
  uploadReservations: defineTable({
    tokenDigest: v.string(), purpose: uploadPurpose,
    userId: v.optional(v.id("users")), companyId: v.optional(v.id("companies")), threadId: v.optional(v.id("threads")),
    maxBytes: v.number(), exactBytes: v.optional(v.number()), contentType: v.optional(v.string()),
    state: v.union(v.literal("ISSUED"), v.literal("UPLOADING"), v.literal("READY"), v.literal("ATTACHED")),
    storageId: v.optional(v.id("_storage")), createdAt: v.number(), expiresAt: v.number(),
  }).index("by_token", ["tokenDigest"]).index("by_storage", ["storageId"])
    .index("by_state_expiry", ["state", "expiresAt"]).index("by_user", ["userId"]),
  uploadQuotas: defineTable({ key: v.string(), count: v.number(), bytes: v.number(), expiresAt: v.number() })
    .index("by_key", ["key"]).index("by_expiry", ["expiresAt"]),
  uploadControl: defineTable({
    key: v.literal("gateway"), enforcedSince: v.number(),
    storageCursor: v.optional(v.string()), storageScanBefore: v.optional(v.number()),
  })
    .index("by_key", ["key"]),
};
