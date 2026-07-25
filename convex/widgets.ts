import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  assertAdminCanAccessCompany,
  canAccessCompany,
  getCurrentUser,
  requireAdmin,
  requireSuperAdmin,
} from "./authz";
import { digestWidgetAccessToken } from "./chatService";
import { allowsAnyDomain, isHostAllowed, parseHostFromUrl } from "./utils/widgetOriginPolicy";
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
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    if (user.role !== "SUPER_ADMIN") {
      if (args.isGlobal || !args.companyId) {
        throw new Error("Unauthorized: Only Super Admins can manage global widgets.");
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
      if (!existing) throw new Error("Widget not found");
      if (user.role !== "SUPER_ADMIN" && (!existing.companyId || !canAccessCompany(user, existing.companyId))) {
        throw new Error("Widget not found");
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
    
    if (!widget) throw new Error("Widget not found");

    if (user.role !== "SUPER_ADMIN") {
      if (widget.isGlobal || widget.companyId !== user.companyId || args.companyId !== user.companyId) {
        throw new Error("Unauthorized");
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
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== args.widgetId) {
      throw new Error("Invalid thread mapping for target widget");
    }
    if (!thread.widgetAccessTokenHash || (await digestWidgetAccessToken(args.widgetAccessToken.trim())) !== thread.widgetAccessTokenHash) {
      throw new Error("Unauthorized: Invalid widget session");
    }

    // Rate limiting: Count the number of messages with attachments in this thread
    const threadMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    const totalUploads = threadMessages.filter((m) => m.attachments && m.attachments.length > 0).length;
    if (totalUploads >= 10) {
      throw new Error("Upload quota exceeded for this conversation thread");
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
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== args.widgetId) {
      throw new Error("Invalid thread mapping for target widget");
    }
    if (!thread.widgetAccessTokenHash || (await digestWidgetAccessToken(args.widgetAccessToken.trim())) !== thread.widgetAccessTokenHash) {
      throw new Error("Unauthorized: Invalid widget session");
    }

    await validateStoredUpload(ctx, args.storageId, validateWidgetAttachmentMetadata);

    return { success: true, storageId: args.storageId };
  },
});

// Specialized thread creator for anonymous widget interactions
export const createWidgetThread = publicMutation({
  reason: "Anonymous site visitors start widget conversations; embedding is enforced by the per-widget frame-ancestors header in src/proxy.ts.",
  args: {
    widgetId: v.id("widgets"),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // For anonymous widget interactions, the user might not be authenticated.
    const userId = (await getCurrentUser(ctx))?.userId;
    
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    // `sourceUrl` is reported by code running inside the widget iframe, which
    // means it is attacker-controlled: anyone can call this mutation directly
    // with an approved-looking value. It is NOT the security boundary, despite
    // what earlier comments here claimed.
    //
    // Embedding is actually enforced by the per-widget `frame-ancestors`
    // header emitted in `src/proxy.ts`, which the browser evaluates against the
    // real embedding page. The check below is a secondary sanity filter that
    // rejects obvious misuse and produces audit signal; it shares
    // `widgetOriginPolicy` with the middleware so the two cannot drift apart.
    const reportedHost = parseHostFromUrl(args.sourceUrl);
    const passesReportedOriginCheck = allowsAnyDomain(widget.allowedDomains)
      ? true
      : reportedHost !== null && isHostAllowed(reportedHost, widget.allowedDomains);

    if (!passesReportedOriginCheck) {
        await ctx.db.insert("auditLogs", {
          actorId: widget.createdBy,
          actionType: "BLOCKED_WIDGET_ACCESS",
          entityId: args.widgetId.toString(),
          entityType: "widgets",
          companyId: widget.companyId,
          timestamp: Date.now(),
          metadata: JSON.stringify({
            sourceUrl: args.sourceUrl,
            reason: reportedHost === null
              ? "Reported source URL was not an absolute http(s) URL without credentials"
              : "Reported source host is not in the widget allowlist",
            note: "Reported by the client and therefore untrusted; frame-ancestors is the enforced control.",
          })
        });
        throw new Error("Unauthorized: Source origin is not authorized for this widget.");
    }

    const now = Date.now();
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
