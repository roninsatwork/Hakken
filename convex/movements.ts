import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("movements")
      .order("desc")
      .collect();
  },
});

import { paginationOptsValidator } from "convex/server";

export const getPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("movements")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { id: v.id("movements") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    difficulty: v.string(),
    poseData: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("movements", {
      title: args.title,
      difficulty: args.difficulty,
      poseData: args.poseData,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("movements") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
