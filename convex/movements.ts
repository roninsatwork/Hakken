import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";

const movementDifficultyValidator = v.union(
  v.literal("Beginner"),
  v.literal("Intermediate"),
  v.literal("Advanced")
);

const movementDataFormatValidator = v.union(
  v.literal("legacy-inline-json"),
  v.literal("legacy-storage-json"),
  v.literal("storage-json-v1")
);

function isInlinePoseData(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{");
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db
      .query("movements")
      .order("desc")
      .take(100);
  },
});

export const getPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const searchTerm = args.searchTerm?.trim();

    return searchTerm
      ? await ctx.db
        .query("movements")
        .withSearchIndex("search_title", (q) => q.search("title", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("movements")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { id: v.id("movements") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    difficulty: movementDifficultyValidator,
    poseData: v.string(),
    poseDataFormat: v.optional(movementDataFormatValidator),
    poseStorageId: v.optional(v.id("_storage")),
    frameCount: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    captureFps: v.optional(v.number()),
    schemaVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.insert("movements", {
      title: args.title,
      difficulty: args.difficulty,
      poseData: args.poseData,
      poseDataFormat: args.poseDataFormat ?? (isInlinePoseData(args.poseData) ? "legacy-inline-json" : "legacy-storage-json"),
      poseStorageId: args.poseStorageId,
      frameCount: args.frameCount,
      durationMs: args.durationMs,
      captureFps: args.captureFps,
      schemaVersion: args.schemaVersion,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("movements") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const movement = await ctx.db.get(args.id);
    const storageId: Id<"_storage"> | null = movement?.poseStorageId ?? (
      movement?.poseData && !isInlinePoseData(movement.poseData)
        ? movement.poseData as Id<"_storage">
        : null
    );

    if (storageId) {
      await ctx.storage.delete(storageId).catch(() => {});
    }

    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.storage.getUrl(args.storageId);
  },
});
