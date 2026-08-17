import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { canAccessCompany, getActiveCompanyId, getCurrentUser, userRoleValidator } from "./authz";
import { requireActionUser } from "./actionAuth";
import { buildEmailBranding, buildEmailFromAddress } from "./emailBrandingService";
import { renderEmail } from "./emailLayoutService";
import { sendResendEmail } from "./resendEmailService";
import { adminAction, adminMutation, adminQuery, publicQuery, superAdminMutation } from "./tenantFunctions";

const BASE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const COMPANY_INVITE_LIST_LIMIT = 100;

/**
 * What a dispatch actually did to the invitation table.
 *
 * Declared, and applied as an explicit handler return type below, because
 * `dispatchInviteEmail` reads this value back through `internal.invites` from
 * the same module. Without the annotation TypeScript cannot resolve the cycle,
 * infers `any`, and the failure propagates out through the generated `internal`
 * types into unrelated files.
 */
type InviteRecordOutcome = {
  outcome: "created" | "reissued" | "alreadyActive";
  previousStatus?: "PENDING" | "ACCEPTED" | "REVOKED";
};

/** Annotated for the same reason as {@link InviteRecordOutcome}. */
type InviteDispatchResult = {
  success: true;
  id?: string;
  simulated?: boolean;
  outcome: InviteRecordOutcome["outcome"];
};

// --- QUERIES & MUTATIONS ---

// Get active email template for invites
export const getActiveTemplate = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const template = await ctx.db
      .query("emailTemplates")
      .withIndex("by_type", (q) => q.eq("templateType", "INVITE"))
      .first();

    if (!template) {
      // What a customer's staff read the first time they hear of us, until an
      // admin edits it. It must not name a single way of signing in: the login
      // page offers a one-time code, an emailed link, and Google, and the old
      // wording sent everyone looking for Google credentials to "synchronize".
      // Voice matches the invite sample in src/app/api/email-preview.
      return {
        subject: "You have been invited to Sonae Workspace",
        headline: "Welcome to the Team",
        body: "You have been added to the Sonae workspace. Use the button below and sign in with this email address — it will pick you up automatically, and there is no password to set.",
        ctaText: "Accept Invitation",
      };
    }

    return template;
  },
});

// Let admins save their live WYSIWYG/Text edits
export const saveTemplate = superAdminMutation({
  args: {
    subject: v.string(),
    headline: v.string(),
    body: v.string(),
    ctaText: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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
export const getPendingInvites = adminQuery({
  handler: async (ctx) => {
    const { user } = ctx;

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

export const getInvitesByCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const { user } = ctx;

    if (!canAccessCompany(user, args.companyId)) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("invitations")
      .withIndex("by_company_status", q => q.eq("companyId", args.companyId).eq("status", "PENDING"))
      .order("desc")
      .take(COMPANY_INVITE_LIST_LIMIT);
  },
});

// Revoke/Delete a pending invitation
export const revokeInvite = adminMutation({
  args: { id: v.id("invitations") },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

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
    role: userRoleValidator,
    token: v.string(),
    callerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<InviteRecordOutcome> => {
    const email = args.email.toLowerCase();
    const now = Date.now();

    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    /*
     * An accepted invitation means one of two very different things, and the
     * previous version treated them the same — it returned without writing
     * anything, for both.
     *
     * If the account still exists, that was right: the person does not need an
     * invitation, they need to sign in. The only thing wrong was staying quiet
     * about it, so this now reports `alreadyActive` instead of a bare success.
     *
     * If the account does not exist, the invitation is a leftover from a
     * deleted user, and doing nothing was the bug. The email is sent before
     * this mutation runs, so the admin got a delivered invite, a success
     * message, and no database change — the address became permanently
     * un-invitable and the directory showed nothing pending. `deleteUser` now
     * clears the invitation as well, so this branch only catches rows orphaned
     * before that fix.
     */
    if (existing?.status === "ACCEPTED") {
      const activeUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();

      if (activeUser) {
        return { outcome: "alreadyActive", previousStatus: existing.status };
      }
    }

    /*
     * Otherwise a dispatched invite always leaves a PENDING row.
     *
     * `companyId` and `role` are refreshed, not just the token. The lookup is
     * by email across every workspace, so without the refresh, inviting an
     * existing invitee into a second workspace silently left them attached to
     * the first one.
     *
     * One row per email is an invariant the sign-in path depends on:
     * `authUserProvisioning` reads `by_email` with `.first()` and no tie-break.
     * So this patches rather than inserting a second row.
     */
    if (existing) {
      await ctx.db.patch(existing._id, {
        companyId: args.companyId,
        role: args.role,
        token: args.token,
        status: "PENDING",
        invitedAt: now,
        // Passing `undefined` removes the field, so a reissued invite does not
        // carry the acceptance date of the account that was deleted.
        acceptedAt: undefined,
      });

      if (args.callerId) {
        await ctx.db.insert("auditLogs", {
          actionType: "CREATE_INVITE",
          actorId: args.callerId,
          entityType: "invitations",
          entityId: existing._id,
          timestamp: now,
          metadata: JSON.stringify({
            email,
            role: args.role,
            reissued: true,
            previousStatus: existing.status,
          }),
        });
      }

      return { outcome: "reissued" as const, previousStatus: existing.status };
    }

    const newInviteId = await ctx.db.insert("invitations", {
      email,
      companyId: args.companyId,
      role: args.role,
      status: "PENDING",
      token: args.token,
      invitedAt: now,
    });

    if (args.callerId) {
      await ctx.db.insert("auditLogs", {
        actionType: "CREATE_INVITE",
        actorId: args.callerId,
        entityType: "invitations",
        entityId: newInviteId,
        timestamp: now,
        metadata: JSON.stringify({ email, role: args.role })
      });
    }

    return { outcome: "created" as const };
  },
});


// --- ACTIONS (External API Hooks) ---

// Dispatches the Resend hook natively without breaking Edge boundaries via Internal Fetch.
export const dispatchInviteEmail = adminAction({
  args: {
    email: v.string(),
    companyId: v.optional(v.id("companies")),
    role: userRoleValidator,
    template: v.object({
      subject: v.string(),
      headline: v.string(),
      body: v.string(),
      ctaText: v.string(),
    }),
  },
  handler: async (ctx, args): Promise<InviteDispatchResult> => {
    const { userId: callerId, user: caller } = await requireActionUser(ctx);
    if (!caller.role) throw new Error("Unauthorized");

    if (caller.role !== "SUPER_ADMIN") {
      const activeCompanyId = getActiveCompanyId(caller);
      if (caller.role !== "ADMIN" || activeCompanyId !== args.companyId) {
        throw new Error("Unauthorized: Insufficient privileges to dispatch invites");
      }
      if (args.role === "SUPER_ADMIN" || (args.companyId && args.companyId !== activeCompanyId)) {
        throw new Error("Unauthorized: Cannot invite external or elevated roles");
      }
    }

    // 1. Generate secure arbitrary tracking token
    const token = crypto.randomUUID();
    const storedEmailBranding = await ctx.runQuery(internal.settings.getEmailBranding, {});
    const emailBranding = buildEmailBranding(storedEmailBranding);
    
    const inviteLink = `${BASE_URL}/login`; // They just log in directly via Google matching their invite email.

    // 2. Render through the shared shell.
    //
    // The previous version pasted `template.headline` and `template.body`
    // straight into an inline HTML document. Both come from an editable record,
    // so that was an injection hole as well as a second design to maintain.
    // `renderEmail` escapes at the boundary because callers pass content only.
    const email = renderEmail(
      {
        kind: "Invitation",
        verdict: args.template.headline,
        paragraphs: args.template.body.split(/\n{2,}/).filter((part) => part.trim().length > 0),
        actions: [{ label: args.template.ctaText, url: inviteLink }],
        footer: {
          lines: ["Not expecting this? Ignore it — nothing happens until you sign in."],
        },
      },
      { platformName: emailBranding.platformName }
    );

    // 3. Dispatch through Resend
    // Skip if API key missing (dev environment graceful degradation)
    if (!process.env.RESEND_API_KEY) {
       console.warn("No RESEND_API_KEY found. Mocking email dispatch successfully.", email.text);
       const simulated: InviteRecordOutcome = await ctx.runMutation(internal.invites.createInviteRecord, { email: args.email, companyId: args.companyId, role: args.role, token, callerId });
       return { success: true, simulated: true, outcome: simulated.outcome };
    }

    try {
      const fromAddress = buildEmailFromAddress({
        envFromAddress: process.env.RESEND_FROM_EMAIL,
        fallbackName: "Sonae Team",
        settings: storedEmailBranding,
      });

      const data = await sendResendEmail({
        apiKey: process.env.RESEND_API_KEY,
        operation: "dispatchInviteEmail",
        idempotencyKey: `invite:${token}`,
        payload: {
          from: fromAddress,
          to: args.email,
          subject: args.template.subject,
          html: email.html,
          text: email.text,
        },
      });

      // 4. Record DB mapping on successful dispatch
      const record: InviteRecordOutcome = await ctx.runMutation(internal.invites.createInviteRecord, { email: args.email, companyId: args.companyId, role: args.role, token, callerId });

      return { success: true, id: data?.id, outcome: record.outcome };
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Unknown error";
      throw new Error(`System exception during dispatch: ${message}`);
    }
  }
});
