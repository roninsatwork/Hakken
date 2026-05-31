import { mutation, query, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import {
  canAccessCompany,
  getCurrentUser,
  requireAdmin,
  requireSuperAdmin,
} from "./authz";

const BASE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// --- QUERIES & MUTATIONS ---

// Get active email template for invites
export const getActiveTemplate = query({
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const template = await ctx.db
      .query("emailTemplates")
      .withIndex("by_type", (q) => q.eq("templateType", "INVITE"))
      .first();

    if (!template) {
      return {
        subject: "You have been invited to Sonae Workspace",
        headline: "Welcome to the Team",
        body: "We are actively thrilled to have you onboard. Use the secure portal button below to synchronize your verified Google credentials and join the workspace.",
        ctaText: "Accept Invitation",
      };
    }

    return template;
  },
});

// Let admins save their live WYSIWYG/Text edits
export const saveTemplate = mutation({
  args: {
    subject: v.string(),
    headline: v.string(),
    body: v.string(),
    ctaText: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const template = await ctx.db
      .query("emailTemplates")
      .withIndex("by_type", (q) => q.eq("templateType", "INVITE"))
      .first();

    if (template) {
      await ctx.db.patch(template._id, {
        ...args,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("emailTemplates", {
        templateType: "INVITE",
        ...args,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_EMAIL_TEMPLATE",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "INVITE_TEMPLATE",
      timestamp: Date.now(),
      metadata: JSON.stringify({ subject: args.subject, headline: args.headline })
    });
  },
});

// Fetch all active/pending invites for the Admin Dashboard Left-Column
export const getPendingInvites = query({
  handler: async (ctx) => {
    const { user } = await requireAdmin(ctx);

    if (user.role === "SUPER_ADMIN") {
      return await ctx.db
        .query("invitations")
        .filter(q => q.eq(q.field("status"), "PENDING"))
        .order("desc")
        .take(50);
    }
    
    return await ctx.db
      .query("invitations")
      .withIndex("by_company_status", q => q.eq("companyId", user.companyId).eq("status", "PENDING"))
      .order("desc")
      .take(50);
  },
});

export const getInvitesByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);

    if (!canAccessCompany(user, args.companyId)) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("invitations")
      .withIndex("by_company_status", q => q.eq("companyId", args.companyId).eq("status", "PENDING"))
      .order("desc")
      .take(10000);
  },
});

// Revoke/Delete a pending invitation
export const revokeInvite = mutation({
  args: { id: v.id("invitations") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);

    const invite = await ctx.db.get(args.id);
    if (!invite) throw new Error("Invite not found");

    if (user.role !== "SUPER_ADMIN" && invite.companyId !== user.companyId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      actionType: "REVOKE_INVITE",
      actorId: userId,
      entityType: "invitations",
      entityId: invite._id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ email: invite.email, role: invite.role })
    });
  },
});

// Internal mutation strictly called by the Action once the email fires
export const createInviteRecord = internalMutation({
  args: {
    email: v.string(),
    companyId: v.optional(v.id("companies")),
    role: v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    token: v.string(),
    callerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();

    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      // Overwrite existing invite if they haven't accepted
      if (existing.status !== "ACCEPTED") {
        await ctx.db.patch(existing._id, {
          token: args.token,
          status: "PENDING",
          invitedAt: Date.now(),
        });
      }
      return;
    }

    const newInviteId = await ctx.db.insert("invitations", {
      email,
      companyId: args.companyId,
      role: args.role,
      status: "PENDING",
      token: args.token,
      invitedAt: Date.now(),
    });

    if (args.callerId) {
      await ctx.db.insert("auditLogs", {
        actionType: "CREATE_INVITE",
        actorId: args.callerId,
        entityType: "invitations",
        entityId: newInviteId,
        timestamp: Date.now(),
        metadata: JSON.stringify({ email: args.email, role: args.role })
      });
    }
  },
});


// --- ACTIONS (External API Hooks) ---

// Dispatches the Resend hook natively without breaking Edge boundaries via Internal Fetch.
export const dispatchInviteEmail = action({
  args: {
    email: v.string(),
    companyId: v.optional(v.id("companies")),
    role: v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    template: v.object({
      subject: v.string(),
      headline: v.string(),
      body: v.string(),
      ctaText: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated request");

    const caller = await ctx.runQuery(internal.users.getUserInternal, { userId: callerId });
    if (!caller || !caller.role) throw new Error("Unauthorized");

    if (caller.role !== "SUPER_ADMIN") {
      if (caller.role !== "ADMIN" || caller.companyId !== args.companyId) {
        throw new Error("Unauthorized: Insufficient privileges to dispatch invites");
      }
      if (args.role === "SUPER_ADMIN" || (args.companyId && args.companyId !== caller.companyId)) {
        throw new Error("Unauthorized: Cannot invite external or elevated roles");
      }
    }

    // 1. Generate secure arbitrary tracking token
    const token = crypto.randomUUID();
    
    const inviteLink = `${BASE_URL}/login`; // They just log in directly via Google matching their invite email.

    // 2. Map Sonae Premium HTML (Raw Injector to ensure style compatibility across clients)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0A0A0A; margin: 0; padding: 40px 20px; color: #E5E5E5; }
            .container { max-width: 600px; margin: 0 auto; background-color: #121212; border: 1px solid #1A1A1A; border-radius: 24px; padding: 40px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .logo { width: 40px; height: 40px; margin-bottom: 30px; }
            .headline { font-size: 24px; font-weight: 600; color: #FFFFFF; margin: 0 0 16px 0; letter-spacing: -0.02em; }
            .body-text { font-size: 15px; line-height: 1.6; color: #A3A3A3; margin: 0 0 32px 0; }
            .button { display: inline-block; background-color: #FFFFFF; color: #000000; font-weight: 500; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-size: 14px; text-align: center; }
            .footer { margin-top: 40px; border-top: 1px solid #1A1A1A; padding-top: 20px; font-size: 12px; color: #666666; font-family: monospace; letter-spacing: 0.1em; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="container">
            <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
               <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
               <circle cx="12" cy="12" r="3" />
            </svg>
            <h1 class="headline">${args.template.headline}</h1>
            <p class="body-text">${args.template.body.replace(/\n/g, '<br/>')}</p>
            <a href="${inviteLink}" class="button">${args.template.ctaText}</a>
            <div class="footer">Sonae - to be prepared</div>
          </div>
        </body>
      </html>
    `;

    // 3. Dispatch through Resend
    // Skip if API key missing (dev environment graceful degradation)
    if (!process.env.RESEND_API_KEY) {
       console.warn("No RESEND_API_KEY found. Mocking email dispatch successfully.", emailHtml);
       await ctx.runMutation(internal.invites.createInviteRecord, { email: args.email, companyId: args.companyId, role: args.role, token, callerId });
       return { success: true, simulated: true };
    }

    try {
      const fromAddress = process.env.RESEND_FROM_EMAIL || "Sonae Team <noreply@ronins.co.uk>";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromAddress,
          to: args.email,
          subject: args.template.subject,
          html: emailHtml
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Resend API Rejection:", errorText);
        throw new Error("Failed to dispatch raw email.");
      }

      const data = await response.json();

      // 4. Record DB mapping on successful dispatch
      await ctx.runMutation(internal.invites.createInviteRecord, { email: args.email, companyId: args.companyId, role: args.role, token, callerId });

      return { success: true, id: data?.id };
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Unknown error";
      throw new Error(`System exception during dispatch: ${message}`);
    }
  }
});
