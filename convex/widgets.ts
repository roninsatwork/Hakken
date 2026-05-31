import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

export const getWidgetsByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    
    // Verify user belongs to this company
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN" && user?.companyId !== args.companyId) {
      throw new Error("Unauthorized Access");
    }

    return await ctx.db
      .query("widgets")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(10000);
  },
});

export const getGlobalWidgets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized Access");
    }

    return await ctx.db
      .query("widgets")
      .withIndex("by_global", (q) => q.eq("isGlobal", true))
      .take(10000);
  },
});

export const getWidgetById = query({
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

    return {
      _id: widget._id,
      name: widget.name,
      companyId: widget.companyId,
      agentId: widget.agentId,
      allowedDomains: widget.allowedDomains,
      themePrimaryColor: widget.themePrimaryColor,
      themeGreeting: widget.themeGreeting,
      themeLogoUrl: widget.themeLogoUrl,
      themePlaceholder: widget.themePlaceholder,
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

export const saveWidget = mutation({
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    
    if (user?.role !== "SUPER_ADMIN") {
      if (args.isGlobal || !args.companyId) {
        throw new Error("Unauthorized: Only Super Admins can manage global widgets.");
      }
      if (user?.companyId !== args.companyId) {
        throw new Error("Unauthorized");
      }
    }

    const now = Date.now();

    let finalLogoUrl = args.themeLogoUrl;
    if (finalLogoUrl && !finalLogoUrl.startsWith("http")) {
       const url = await ctx.storage.getUrl(finalLogoUrl as Id<"_storage">);
       if (url) {
           finalLogoUrl = url;
       }
    }

    if (args.widgetId) {
      // Update
      const existing = await ctx.db.get(args.widgetId);
      if (!existing) throw new Error("Widget not found");
      if (user?.role !== "SUPER_ADMIN" && existing.companyId !== args.companyId) throw new Error("Widget not found");
      
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

export const deleteWidget = mutation({
  args: {
    widgetId: v.id("widgets"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    const widget = await ctx.db.get(args.widgetId);
    
    if (!widget) throw new Error("Widget not found");

    if (user?.role !== "SUPER_ADMIN") {
      if (widget.isGlobal || widget.companyId !== user?.companyId || args.companyId !== user?.companyId) {
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

export const generateWidgetUploadUrl = mutation({
  args: { 
    widgetId: v.id("widgets"),
    threadId: v.id("threads")
  },
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== args.widgetId) {
      throw new Error("Invalid thread mapping for target widget");
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

export const finalizeWidgetUpload = mutation({
  args: {
    widgetId: v.id("widgets"),
    threadId: v.id("threads"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== args.widgetId) {
      throw new Error("Invalid thread mapping for target widget");
    }

    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file not found");
    }

    // Enforce 1MB limit (1024 * 1024 bytes)
    const maxBytes = 1024 * 1024;
    if (metadata.size > maxBytes) {
      await ctx.storage.delete(args.storageId);
      throw new Error("File exceeds the maximum size limit of 1MB");
    }

    // Enforce MIME type limit: strictly images only
    if (!metadata.contentType || !metadata.contentType.startsWith("image/")) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Invalid file type: strictly images only are allowed");
    }

    return { success: true, storageId: args.storageId };
  },
});

// Specialized thread creator for anonymous widget interactions
export const createWidgetThread = mutation({
  args: {
    widgetId: v.id("widgets"),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // For anonymous widget interactions, the user might not be authenticated.
    const userId = await getAuthUserId(ctx) || undefined;
    
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    // Zero-Trust Enforcer: Validate origin against allowed domains
    let isAllowed = false;
    
    if (widget.allowedDomains && widget.allowedDomains.includes("*")) {
        isAllowed = true;
    } else if (widget.allowedDomains && widget.allowedDomains.length > 0) {
        // Enforce strict absolute URL syntax (prevent tricks or path traversal)
        if (!args.sourceUrl.startsWith("http://") && !args.sourceUrl.startsWith("https://")) {
            await ctx.db.insert("auditLogs", {
              actorId: widget.createdBy,
              actionType: "BLOCKED_WIDGET_ACCESS",
              entityId: args.widgetId.toString(),
              entityType: "widgets",
              companyId: widget.companyId,
              timestamp: Date.now(),
              metadata: JSON.stringify({ sourceUrl: args.sourceUrl, reason: "URL protocol must be http:// or https://" })
            });
            throw new Error("Unauthorized: Invalid source URL format. Protocol must be http:// or https://");
        }

        let parsedOrigin;
        try {
            const urlObj = new URL(args.sourceUrl);
            if (urlObj.username || urlObj.password) {
                throw new Error("URL contains credentials");
            }
            parsedOrigin = urlObj.hostname.toLowerCase();
        } catch {
            await ctx.db.insert("auditLogs", {
              actorId: widget.createdBy,
              actionType: "BLOCKED_WIDGET_ACCESS",
              entityId: args.widgetId.toString(),
              entityType: "widgets",
              companyId: widget.companyId,
              timestamp: Date.now(),
              metadata: JSON.stringify({ sourceUrl: args.sourceUrl, reason: "URL contains credentials or invalid syntax" })
            });
            throw new Error("Unauthorized: Invalid source URL.");
        }

        isAllowed = widget.allowedDomains.some(domain => {
            const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            return parsedOrigin === normalizedDomain || parsedOrigin.endsWith("." + normalizedDomain);
        });
    }

    if (!isAllowed) {
        await ctx.db.insert("auditLogs", {
          actorId: widget.createdBy,
          actionType: "BLOCKED_WIDGET_ACCESS",
          entityId: args.widgetId.toString(),
          entityType: "widgets",
          companyId: widget.companyId,
          timestamp: Date.now(),
          metadata: JSON.stringify({ sourceUrl: args.sourceUrl, reason: "Domain origin is not whitelisted" })
        });
        throw new Error("Unauthorized: Source origin is not authorized for this widget.");
    }

    const now = Date.now();
    
    const threadId = await ctx.db.insert("threads", {
      userId,
      companyId: widget.companyId,
      agentId: widget.agentId,
      widgetId: args.widgetId,
      sourceUrl: args.sourceUrl,
      title: "Widget Interaction",
      createdAt: now,
      updatedAt: now,
    });

    return threadId;
  },
});
