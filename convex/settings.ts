import { internalQuery } from "./_generated/server";
import schema from "./schema";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  publicQuery,
  superAdminMutation,
} from "./tenantFunctions";
import {
  buildSettingsAuditMetadata,
  buildSettingsInsertRecord,
  buildSettingsPatch,
  DEFAULT_SETTINGS,
  isStorageLogoReference,
  mergeSettingsWithDefaults,
  resolvePlatformName,
} from "./settingsService";

/**
 * The configured platform name, for queries and mutations that have `ctx.db`.
 *
 * Actions have no database handle; they read the same value through
 * `internal.settings.getEmailBranding` instead. Both paths resolve through
 * `resolvePlatformName`, so the fallback cannot drift.
 */
export async function getPlatformName(ctx: Pick<QueryCtx, "db">): Promise<string> {
  const settings = await ctx.db.query("systemSettings").first();
  return resolvePlatformName(settings?.platformName);
}
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";

export const get = publicQuery({
  reason: "Branding and theme load on the login screen, before anyone is signed in.",
  args: {},
  returns: v.object({ _id: v.optional(v.id("systemSettings")), _creationTime: v.optional(v.number()), ...schema.tables.systemSettings.validator.fields }),
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

export const update = superAdminMutation({
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
    // fontFamily / fontSizeBase / subTextSizeGlobal / borderRadius retired
    // 2026-08-10 — no longer writable; see the schema comment.
    headingFontFamily: v.optional(v.string()),
    bodyFontFamily: v.optional(v.string()),
    headingSizeGlobal: v.optional(v.string()),

    lightBg: v.optional(v.string()),
    lightFg: v.optional(v.string()),
    lightCardBg: v.optional(v.string()),
    lightCardFg: v.optional(v.string()),
    lightBorder: v.optional(v.string()),
    lightMuted: v.optional(v.string()),
    lightMutedFg: v.optional(v.string()),
    lightSuccess: v.optional(v.string()),
    lightDestructive: v.optional(v.string()),
    lightWarning: v.optional(v.string()),
    lightInfo: v.optional(v.string()),
    lightRing: v.optional(v.string()),
    lightSidebarBg: v.optional(v.string()),

    darkBg: v.optional(v.string()),
    darkFg: v.optional(v.string()),
    darkCardBg: v.optional(v.string()),
    darkCardFg: v.optional(v.string()),
    darkBorder: v.optional(v.string()),
    darkMuted: v.optional(v.string()),
    darkMutedFg: v.optional(v.string()),
    darkSuccess: v.optional(v.string()),
    darkDestructive: v.optional(v.string()),
    darkWarning: v.optional(v.string()),
    darkInfo: v.optional(v.string()),
    darkRing: v.optional(v.string()),
    darkSidebarBg: v.optional(v.string()),
    diagnosticRoutingEnabled: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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
      // Read before the patch is applied above, so the record holds what the
      // setting actually moved from.
      metadata: buildSettingsAuditMetadata(patchObj, settings)
    });

    return true;
  },
});

/**
 * Take a logo back off the platform.
 *
 * A wrong logo could be replaced but never removed: the save path drops fields
 * that arrive undefined, so no value the form could send meant "there is no
 * logo now". This clears the field outright, and drops the uploaded file with
 * it when the setting still points at one of ours.
 */
export const clearLogo = superAdminMutation({
  args: {
    mode: v.union(v.literal("light"), v.literal("dark")),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const settings = await ctx.db.query("systemSettings").first();
    if (!settings) return false;

    const field = args.mode === "light" ? "logoUrlLight" : "logoUrlDark";
    const current = settings[field];
    if (!current) return false;

    await ctx.db.patch(settings._id, { [field]: undefined });

    // Only an uploaded logo has a file behind it. One pointing at an external
    // URL is not ours to delete.
    if (isStorageLogoReference(current)) {
      await ctx.storage.delete(current as Id<"_storage">).catch(() => {});
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      actorId: userId,
      entityType: "systemSettings",
      entityId: settings._id,
      timestamp: Date.now(),
      metadata: buildSettingsAuditMetadata({ [field]: undefined }, settings),
    });

    return true;
  },
});

export const getEmailBranding = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("systemSettings").first();
    return {
      platformName: resolvePlatformName(settings?.platformName),
      emailSenderName: settings?.emailSenderName,
      emailSenderAddress: settings?.emailSenderAddress,
    };
  },
});

export const generateUploadUrl = superAdminMutation({
  handler: async (ctx) => {

    return await ctx.storage.generateUploadUrl();
  },
});
