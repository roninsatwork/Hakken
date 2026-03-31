import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Public authenticated query for the Admin UI editor
export const getSystemPrompt = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "SYSTEM_PROMPT"))
      .first();

    return config?.value || "";
  },
});

// Internal unauthenticated query for the LLM Engine Action
export const getInternalSystemPrompt = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "SYSTEM_PROMPT"))
      .first();

    return config?.value || null;
  },
});

export const updateSystemPrompt = mutation({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Target identity unauthenticated or session expired");
    }

    // Role verification: Ensure only ADMIN can edit core system protocols
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized: System Protocol modifications require Super Administrator clearance.");
    }

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "SYSTEM_PROMPT"))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: args.prompt,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      return existingConfig._id;
    } else {
      return await ctx.db.insert("systemConfig", {
        key: "SYSTEM_PROMPT",
        value: args.prompt,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    }
  },
});
