import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./authz";

export const DEFAULT_SETTINGS = {
  platformName: "Sonae",
  brandColorHex: "#E26D28", // Sonae brand default
  fontFamily: undefined as string | undefined, // Deprecated
  headingFontFamily: undefined as string | undefined,
  bodyFontFamily: undefined as string | undefined,
  fontSizeBase: undefined as string | undefined,
  headingSizeGlobal: undefined as string | undefined,
  subTextSizeGlobal: undefined as string | undefined,
  borderRadius: undefined as string | undefined,
  logoUrlLight: undefined as string | undefined,
  logoUrlDark: undefined as string | undefined,

  lightBg: undefined as string | undefined,
  lightFg: undefined as string | undefined,
  lightCardBg: undefined as string | undefined,
  lightCardFg: undefined as string | undefined,
  lightBorder: undefined as string | undefined,
  lightMuted: undefined as string | undefined,
  lightMutedFg: undefined as string | undefined,
  lightSuccess: undefined as string | undefined,
  lightDestructive: undefined as string | undefined,
  lightRing: undefined as string | undefined,

  darkBg: undefined as string | undefined,
  darkFg: undefined as string | undefined,
  darkCardBg: undefined as string | undefined,
  darkCardFg: undefined as string | undefined,
  darkBorder: undefined as string | undefined,
  darkMuted: undefined as string | undefined,
  darkMutedFg: undefined as string | undefined,
  darkSuccess: undefined as string | undefined,
  darkDestructive: undefined as string | undefined,
  darkRing: undefined as string | undefined,
  diagnosticRoutingEnabled: false as boolean,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("systemSettings").first();
    if (!settings) {
      return DEFAULT_SETTINGS;
    }
    
    // Auto-resolve storage URLs if IDs are stored
    let fullLogoLight = settings.logoUrlLight;
    if (fullLogoLight && !fullLogoLight.startsWith('http')) {
       fullLogoLight = await ctx.storage.getUrl(fullLogoLight as Id<"_storage">) || fullLogoLight;
    }
    
    let fullLogoDark = settings.logoUrlDark;
    if (fullLogoDark && !fullLogoDark.startsWith('http')) {
       fullLogoDark = await ctx.storage.getUrl(fullLogoDark as Id<"_storage">) || fullLogoDark;
    }
    
    return {
       ...DEFAULT_SETTINGS,
       ...settings,
       logoUrlLight: fullLogoLight,
       logoUrlDark: fullLogoDark,
    };
  },
});

export const update = mutation({
  args: {
    platformName: v.optional(v.string()),
    currencySymbol: v.optional(v.string()),
    monthlyBasePrice: v.optional(v.number()),
    monthlySeatPrice: v.optional(v.number()),
    logoUrlLight: v.optional(v.string()),
    logoUrlDark: v.optional(v.string()),
    brandColorHex: v.optional(v.string()),
    fontFamily: v.optional(v.string()), // Deprecated
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
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");

    const settings = await ctx.db.query("systemSettings").first();
    
    // Clean undefined args
    const patchObj = Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined),
    ) as Partial<typeof args>;

    if (settings) {
      await ctx.db.patch(settings._id, patchObj);
    } else {
      await ctx.db.insert("systemSettings", {
        ...DEFAULT_SETTINGS,
        ...patchObj,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      actorId: userId,
      entityType: "systemSettings",
      entityId: settings?._id || "global_settings",
      timestamp: Date.now(),
      metadata: JSON.stringify({ modifiedFields: Object.keys(patchObj) })
    });

    return true;
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");

    return await ctx.storage.generateUploadUrl();
  },
});
