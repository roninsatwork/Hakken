import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  assertAdminCanAccessCompany,
  canAccessCompany,
  getCurrentUser,
  } from "./authz";
import { digestWidgetAccessToken } from "./chatService";
import { allowsAnyDomain, isHostAllowed } from "./utils/widgetOriginPolicy";
import { verifyWidgetEmbedPass } from "./utils/widgetEmbedPass";
import { appError } from "./utils/appError";
import {
  validateAdminImageMetadata,
  validateStoredUpload,
  validateWidgetAttachmentMetadata,
} from "./utils/uploadPolicy";
import { DEFAULT_SETTINGS, isStorageLogoReference } from "./settingsService";
import type { QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery, publicMutation, publicQuery, superAdminQuery } from "./tenantFunctions";

async function getSystemWidgetBranding(ctx: QueryCtx) {
  const settings = await ctx.db.query("systemSettings").first();
  const platformName = settings?.platformName || DEFAULT_SETTINGS.platformName;
  const themePrimaryColor = settings?.brandColorHex || DEFAULT_SETTINGS.brandColorHex;
  let themeLogoUrl = settings?.logoUrlLight || settings?.logoUrlDark;

  if (isStorageLogoReference(themeLogoUrl)) {
    themeLogoUrl = await ctx.storage.getUrl(themeLogoUrl as Id<"_storage">) || themeLogoUrl;
  }

  return {
    platformName,
    themePrimaryColor,
    themeLogoUrl,
  };
}

export const getWidgetsByCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    assertAdminCanAccessCompany(user, args.companyId, "Unauthorized Access");

    return await ctx.db
      .query("widgets")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(100);
  },
});

export const getPrimaryWidgetByCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    assertAdminCanAccessCompany(user, args.companyId, "Unauthorized Access");

    return await ctx.db
      .query("widgets")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .first();
  },
});

export const getGlobalWidgets = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("widgets")
      .withIndex("by_global", (q) => q.eq("isGlobal", true))
      .take(100);
  },
});

export const getPrimaryGlobalWidget = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("widgets")
      .withIndex("by_global_created", (q) => q.eq("isGlobal", true))
      .order("desc")
      .first();
  },
});

export const getWidgetById = publicQuery({
  reason: "Widget iframes load their own theme and config before any visitor signs in.",
  args: { widgetId: v.id("widgets") },
  handler: async (ctx, args) => {
    // PUBLIC endpoint for the iframe (no auth required here to load config, but we omit sensitive data)
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) return null;

    // Load agent info for avatar
    let agentAvatar = null;
    if (widget.agentId) {
       const agent = await ctx.db.get(widget.agentId);
       if (agent) agentAvatar = agent.avatar; 
    }
    const systemBranding = await getSystemWidgetBranding(ctx);

    return {
      _id: widget._id,
      name: widget.name || systemBranding.platformName,
      companyId: widget.companyId,
      agentId: widget.agentId,
      allowedDomains: widget.allowedDomains,
      themePrimaryColor: widget.themePrimaryColor || systemBranding.themePrimaryColor,
      themeGreeting: widget.themeGreeting || `Hi! How can ${systemBranding.platformName} help you today?`,
      themeLogoUrl: widget.themeLogoUrl || systemBranding.themeLogoUrl,
      themePlaceholder: widget.themePlaceholder || `Message ${systemBranding.platformName}...`,
      enableSounds: widget.enableSounds,
      showPopupPreview: widget.showPopupPreview,
      requireName: widget.requireName,
      requireEmail: widget.requireEmail,
      enableGreeting: widget.enableGreeting,
      conversationStarters: widget.conversationStarters,
      agentAvatar: agentAvatar,
    };
  },
});

export const saveWidget = adminMutation({
  args: {
    widgetId: v.optional(v.id("widgets")),
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    agentId: v.optional(v.id("agents")),
    allowedDomains: v.array(v.string()),
    themePrimaryColor: v.optional(v.string()),
    themeGreeting: v.optional(v.string()),
    themeLogoUrl: v.optional(v.string()),
    themePlaceholder: v.optional(v.string()),
    enableSounds: v.optional(v.boolean()),
    showPopupPreview: v.optional(v.boolean()),
    requireName: v.optional(v.boolean()),
    requireEmail: v.optional(v.boolean()),
    conversationStarters: v.optional(v.array(v.string())),
    enableGreeting: v.optional(v.boolean()),
    isActive: v.boolean(),
    isGlobal: v.optional(v.boolean()),
    // The receptionist screen opt-in: /kiosk/<id> serves nothing without it.
    kioskEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    if (user.role !== "SUPER_ADMIN") {
      if (args.isGlobal || !args.companyId) {
        throw appError("UNAUTHORIZED", "Unauthorized: Only Super Admins can manage global widgets.");
      }
      assertAdminCanAccessCompany(user, args.companyId);
    }

    const now = Date.now();

    let finalLogoUrl = args.themeLogoUrl;
    if (finalLogoUrl && !finalLogoUrl.startsWith("http")) {
       await validateStoredUpload(ctx, finalLogoUrl as Id<"_storage">, validateAdminImageMetadata);
       const url = await ctx.storage.getUrl(finalLogoUrl as Id<"_storage">);
       if (url) {
           finalLogoUrl = url;
       }
    }

    if (args.widgetId) {
      // Update
      const existing = await ctx.db.get(args.widgetId);
      if (!existing) throw appError("NOT_FOUND", "Widget not found");
      if (user.role !== "SUPER_ADMIN" && (!existing.companyId || !canAccessCompany(user, existing.companyId))) {
        throw appError("NOT_FOUND", "Widget not found");
      }
      
      await ctx.db.patch(args.widgetId, {
        name: args.name,
        agentId: args.agentId,
        allowedDomains: args.allowedDomains,
        themePrimaryColor: args.themePrimaryColor,
        themeGreeting: args.themeGreeting,
        themeLogoUrl: finalLogoUrl,
        themePlaceholder: args.themePlaceholder,
        enableSounds: args.enableSounds,
        showPopupPreview: args.showPopupPreview,
        requireName: args.requireName,
        requireEmail: args.requireEmail,
        conversationStarters: args.conversationStarters,
        enableGreeting: args.enableGreeting,
        isActive: args.isActive,
        isGlobal: args.isGlobal,
        ...(args.kioskEnabled !== undefined ? { kioskEnabled: args.kioskEnabled } : {}),
      });

      // Audit Log
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "UPDATE_WIDGET",
        entityId: args.widgetId,
        entityType: "widgets",
        companyId: args.companyId,
        timestamp: now,
      });

      return args.widgetId;
    } else {
      // Create
      const newId = await ctx.db.insert("widgets", {
        companyId: args.companyId,
        name: args.name,
        agentId: args.agentId,
        allowedDomains: args.allowedDomains,
        themePrimaryColor: args.themePrimaryColor,
        themeGreeting: args.themeGreeting,
        themeLogoUrl: finalLogoUrl,
        themePlaceholder: args.themePlaceholder,
        enableSounds: args.enableSounds,
        showPopupPreview: args.showPopupPreview,
        requireName: args.requireName,
        requireEmail: args.requireEmail,
        conversationStarters: args.conversationStarters,
        enableGreeting: args.enableGreeting,
        isActive: args.isActive,
        isGlobal: args.isGlobal,
        ...(args.kioskEnabled !== undefined ? { kioskEnabled: args.kioskEnabled } : {}),
        createdBy: userId,
        createdAt: now,
      });

      // Audit Log
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "CREATE_WIDGET",
        entityId: newId,
        entityType: "widgets",
        companyId: args.companyId,
        timestamp: now,
      });

      return newId;
    }
  },
});

export const deleteWidget = adminMutation({
  args: {
    widgetId: v.id("widgets"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    const widget = await ctx.db.get(args.widgetId);
    
    if (!widget) throw appError("NOT_FOUND", "Widget not found");

    if (user.role !== "SUPER_ADMIN") {
      if (widget.isGlobal || widget.companyId !== user.companyId || args.companyId !== user.companyId) {
        throw appError("UNAUTHORIZED", "Unauthorized");
      }
    }

    await ctx.db.delete(args.widgetId);

    // Audit Log
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "DELETE_WIDGET",
      entityId: args.widgetId,
      entityType: "widgets",
      companyId: args.companyId,
      timestamp: Date.now(),
    });

    return true;
  },
});

export const generateWidgetUploadUrl = publicMutation({
  reason: "Anonymous widget visitors attach files; validated against the widget upload policy.",
  args: { 
    widgetId: v.id("widgets"),
    threadId: v.id("threads"),
    widgetAccessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw appError("NOT_FOUND", "Invalid or inactive Widget");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== args.widgetId) {
      throw appError("NOT_FOUND", "Invalid thread mapping for target widget");
    }
    if (!thread.widgetAccessTokenHash || (await digestWidgetAccessToken(args.widgetAccessToken.trim())) !== thread.widgetAccessTokenHash) {
      throw appError("UNAUTHORIZED", "Unauthorized: Invalid widget session");
    }

    // Rate limiting: Count the number of messages with attachments in this thread
    const threadMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    const totalUploads = threadMessages.filter((m) => m.attachments && m.attachments.length > 0).length;
    if (totalUploads >= 10) {
      throw appError("INVALID_INPUT", "Upload quota exceeded for this conversation thread");
    }

    // Generate an upload URL for widget file attachments (supports anonymous visitors)
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeWidgetUpload = publicMutation({
  reason: "Completes an anonymous widget visitor's upload; validated against the widget upload policy.",
  args: {
    widgetId: v.id("widgets"),
    threadId: v.id("threads"),
    storageId: v.id("_storage"),
    widgetAccessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw appError("NOT_FOUND", "Invalid or inactive Widget");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== args.widgetId) {
      throw appError("NOT_FOUND", "Invalid thread mapping for target widget");
    }
    if (!thread.widgetAccessTokenHash || (await digestWidgetAccessToken(args.widgetAccessToken.trim())) !== thread.widgetAccessTokenHash) {
      throw appError("UNAUTHORIZED", "Unauthorized: Invalid widget session");
    }

    await validateStoredUpload(ctx, args.storageId, validateWidgetAttachmentMetadata);

    return { success: true, storageId: args.storageId };
  },
});

/** How many anonymous conversations one widget will open per hour. Well above
 * any real site's peak (the plan quota prices each message anyway); the point
 * is that a script cannot mint threads without ceiling (2026-08 audit). */
export const WIDGET_THREADS_PER_HOUR = 120;

// Specialized thread creator for anonymous widget interactions
export const createWidgetThread = publicMutation({
  reason: "Anonymous site visitors start widget conversations; gated on a server-minted embed pass, and embedding is enforced by the per-widget frame-ancestors header in src/proxy.ts.",
  args: {
    widgetId: v.id("widgets"),
    sourceUrl: v.string(),
    embedPass: v.string(),
  },
  handler: async (ctx, args) => {
    // For anonymous widget interactions, the user might not be authenticated.
    const userId = (await getCurrentUser(ctx))?.userId;

    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw appError("NOT_FOUND", "Invalid or inactive Widget");

    // The embed pass replaces the old caller-reported `sourceUrl` check, which
    // anyone could satisfy by inventing an approved-looking value (2026-08
    // audit). The pass is minted by our own server when it serves the widget
    // page, over the referer host the server actually observed — see
    // `utils/widgetEmbedPass.ts` for what it does and does not prove.
    // `sourceUrl` is still stored on the thread as context, but it authorises
    // nothing.
    const secret = process.env.WIDGET_EMBED_SIGNING_SECRET?.trim();
    if (!secret) {
      // Fail closed. The env var's name stays in the server log only; the
      // caller gets a deliberately generic sentence plus the NOT_CONFIGURED
      // code (which survives production redaction), so an embedding site's
      // own error handling can tell "operator setup incomplete" apart from a
      // transient failure without learning which secret is missing.
      console.error("WIDGET_EMBED_SIGNING_SECRET is not configured; refusing widget sessions.");
      throw appError("NOT_CONFIGURED", "Widget sessions are not available right now.");
    }

    const verdict = await verifyWidgetEmbedPass({
      pass: args.embedPass,
      widgetId: args.widgetId,
      secret,
    });
    const embedHost = verdict.ok ? verdict.embedHost : null;
    const refusalReason = !verdict.ok
      ? verdict.reason
      : allowsAnyDomain(widget.allowedDomains)
        ? null
        : embedHost !== null && isHostAllowed(embedHost, widget.allowedDomains)
          ? null
          // A direct open (no referer) carries no host to authorise, which is
          // only acceptable for a widget that allows every domain.
          : "host_not_allowed";

    // Refusals RETURN rather than throw: a thrown mutation rolls back its own
    // writes, so the audit rows below would never survive (which is exactly
    // what happened to the previous blocked-access logging — the tests proved
    // an empty trail without noticing the irony).
    if (refusalReason) {
        await ctx.db.insert("auditLogs", {
          // No actor: an anonymous request from the internet has no human
          // behind it (see the auditLogs schema note).
          actionType: "BLOCKED_WIDGET_ACCESS",
          entityId: args.widgetId.toString(),
          entityType: "widgets",
          companyId: widget.companyId,
          timestamp: Date.now(),
          metadata: JSON.stringify({
            reason: refusalReason,
            sourceUrl: args.sourceUrl,
            embedHost,
          })
        });
        return { refused: "unauthorized" as const };
    }

    const now = Date.now();

    // Hourly minting ceiling, in the same window shape as the kiosk's session
    // reservation. The threshold crossing is audit-logged exactly once per
    // window so an attack leaves a mark without flooding the trail.
    const windowStart = widget.threadWindowStart ?? 0;
    const inWindow = now - windowStart < 60 * 60 * 1000 ? widget.threadCountInWindow ?? 0 : 0;
    if (inWindow >= WIDGET_THREADS_PER_HOUR) {
      if (inWindow === WIDGET_THREADS_PER_HOUR) {
        await ctx.db.insert("auditLogs", {
          actionType: "RATE_LIMITED_WIDGET_THREADS",
          entityId: args.widgetId.toString(),
          entityType: "widgets",
          companyId: widget.companyId,
          timestamp: now,
          metadata: JSON.stringify({ perHour: WIDGET_THREADS_PER_HOUR }),
        });
        await ctx.db.patch(widget._id, { threadCountInWindow: inWindow + 1 });
      }
      return { refused: "busy" as const };
    }
    await ctx.db.patch(widget._id, {
      threadWindowStart: inWindow === 0 ? now : windowStart,
      threadCountInWindow: inWindow + 1,
    });
    const accessToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    
    const threadId = await ctx.db.insert("threads", {
      userId,
      companyId: widget.companyId,
      agentId: widget.agentId,
      widgetId: args.widgetId,
      widgetAccessTokenHash: await digestWidgetAccessToken(accessToken),
      sourceUrl: args.sourceUrl,
      title: "Widget Interaction",
      createdAt: now,
      updatedAt: now,
    });

    return { threadId, accessToken };
  },
});
