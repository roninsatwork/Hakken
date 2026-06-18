import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./authz";
import {
  buildWhiteLabelCustomDomainChecklist,
  buildWhiteLabelHandoffSummary,
  buildWhiteLabelPackagingChecklist,
  buildSettingsAuditMetadata,
  buildSettingsInsertRecord,
  buildSettingsPatch,
  buildWhiteLabelReadiness,
  DEFAULT_SETTINGS,
  getWhiteLabelModulePresets as getWhiteLabelModulePresetCatalog,
  getWhiteLabelNavigationProfiles as getWhiteLabelNavigationProfileCatalog,
  isStorageLogoReference,
  mergeSettingsWithDefaults,
} from "./settingsService";
import { buildEmailBranding } from "./emailBrandingService";
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("systemSettings").first();
    if (!settings) {
      return DEFAULT_SETTINGS;
    }
    
    // Auto-resolve storage URLs if IDs are stored
    let fullLogoLight = settings.logoUrlLight;
    if (isStorageLogoReference(fullLogoLight)) {
       fullLogoLight = await ctx.storage.getUrl(fullLogoLight as Id<"_storage">) || fullLogoLight;
    }
    
    let fullLogoDark = settings.logoUrlDark;
    if (isStorageLogoReference(fullLogoDark)) {
       fullLogoDark = await ctx.storage.getUrl(fullLogoDark as Id<"_storage">) || fullLogoDark;
    }
    
    return mergeSettingsWithDefaults({
       settings,
       logoUrlLight: fullLogoLight,
       logoUrlDark: fullLogoDark,
    });
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
    emailSenderName: v.optional(v.string()),
    emailSenderAddress: v.optional(v.string()),
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
    const patchObj = buildSettingsPatch(args);

    if (patchObj.logoUrlLight && isStorageLogoReference(patchObj.logoUrlLight)) {
      await validateStoredUpload(ctx, patchObj.logoUrlLight as Id<"_storage">, validateAdminImageMetadata);
    }
    if (patchObj.logoUrlDark && isStorageLogoReference(patchObj.logoUrlDark)) {
      await validateStoredUpload(ctx, patchObj.logoUrlDark as Id<"_storage">, validateAdminImageMetadata);
    }

    if (settings) {
      await ctx.db.patch(settings._id, patchObj);
    } else {
      await ctx.db.insert("systemSettings", buildSettingsInsertRecord(patchObj));
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      actorId: userId,
      entityType: "systemSettings",
      entityId: settings?._id || "global_settings",
      timestamp: Date.now(),
      metadata: buildSettingsAuditMetadata(patchObj)
    });

    return true;
  },
});

export const getEmailBranding = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("systemSettings").first();
    return {
      platformName: settings?.platformName || DEFAULT_SETTINGS.platformName,
      emailSenderName: settings?.emailSenderName,
      emailSenderAddress: settings?.emailSenderAddress,
    };
  },
});

export const getWhiteLabelReadiness = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const settings = await ctx.db.query("systemSettings").first();
    const activeWidgets = await ctx.db.query("widgets").withIndex("by_global_created", (q) => q.eq("isGlobal", true)).take(20);
    const activeWidget = activeWidgets.find((widget) => widget.isActive) ??
      (await ctx.db.query("widgets").withIndex("by_company_created").order("desc").take(50))
        .find((widget) => widget.isActive);

    return buildWhiteLabelReadiness({ settings, activeWidget });
  },
});

export const getWhiteLabelModulePresets = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    return getWhiteLabelModulePresetCatalog();
  },
});

export const getWhiteLabelNavigationProfiles = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    return getWhiteLabelNavigationProfileCatalog();
  },
});

export const getWhiteLabelCustomDomainChecklist = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const settings = await ctx.db.query("systemSettings").first();
    const activeWidgets = await ctx.db.query("widgets").withIndex("by_global_created", (q) => q.eq("isGlobal", true)).take(20);
    const activeWidget = activeWidgets.find((widget) => widget.isActive) ??
      (await ctx.db.query("widgets").withIndex("by_company_created").order("desc").take(50))
        .find((widget) => widget.isActive);

    return buildWhiteLabelCustomDomainChecklist({ settings, activeWidget });
  },
});

export const getWhiteLabelHandoffSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const settings = await ctx.db.query("systemSettings").first();
    const activeWidgets = await ctx.db.query("widgets").withIndex("by_global_created", (q) => q.eq("isGlobal", true)).take(20);
    const activeWidget = activeWidgets.find((widget) => widget.isActive) ??
      (await ctx.db.query("widgets").withIndex("by_company_created").order("desc").take(50))
        .find((widget) => widget.isActive);
    const readiness = buildWhiteLabelReadiness({ settings, activeWidget });
    const modulePresets = getWhiteLabelModulePresetCatalog();
    const emailBranding = buildEmailBranding(settings);

    return buildWhiteLabelHandoffSummary({
      settings,
      activeWidget,
      readiness,
      presets: modulePresets,
      emailFromAddress: emailBranding.fromAddress,
    });
  },
});

export const getWhiteLabelPackagingChecklist = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const settings = await ctx.db.query("systemSettings").first();
    const activeWidgets = await ctx.db.query("widgets").withIndex("by_global_created", (q) => q.eq("isGlobal", true)).take(20);
    const activeWidget = activeWidgets.find((widget) => widget.isActive) ??
      (await ctx.db.query("widgets").withIndex("by_company_created").order("desc").take(50))
        .find((widget) => widget.isActive);
    const readiness = buildWhiteLabelReadiness({ settings, activeWidget });
    const modulePresets = getWhiteLabelModulePresetCatalog();
    const navigationProfiles = getWhiteLabelNavigationProfileCatalog();
    const customDomainChecklist = buildWhiteLabelCustomDomainChecklist({ settings, activeWidget });
    const emailBranding = buildEmailBranding(settings);
    const handoffSummary = buildWhiteLabelHandoffSummary({
      settings,
      activeWidget,
      readiness,
      presets: modulePresets,
      emailFromAddress: emailBranding.fromAddress,
    });

    return buildWhiteLabelPackagingChecklist({
      handoffSummary,
      readiness,
      modulePresets,
      navigationProfiles,
      customDomainChecklist,
    });
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");

    return await ctx.storage.generateUploadUrl();
  },
});
