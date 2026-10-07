/**
 * Turning a bad health report into an email somebody reads:
 * `dispatchPlatformAlerts` runs on the weekly cron, asks `systemHealth.ts`
 * for the report, and queues an email to the configured recipients in the
 * Outbox (outbox-and-preferences-plan.md, A3) when the decision rules say the
 * state is worth a bell. Split
 * out of the old `convex/analyticsCron.ts` on 2026-08-21 (foundation-quality
 * plan, phase 3).
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  buildSystemHealthPlatformAlertDecision,
  buildSystemHealthAlertEmail,
  parsePlatformAlertRecipients,
} from "./platformAlertService";

export const dispatchPlatformAlerts = internalAction({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const report = await ctx.runQuery(internal.systemHealth.getSystemHealth, { daysBack: args.daysBack ?? 7 });
    // Branding first: the decision's own subject line carries the platform
    // name too, and must not fall back to a hardcoded one.
    const emailBranding = await ctx.runQuery(internal.settings.getEmailBranding, {});
    const decision = buildSystemHealthPlatformAlertDecision(report, {
      platformName: emailBranding?.platformName,
    });

    if (!decision.shouldAlert) {
      return {
        alerted: false,
        alertType: decision.alertType,
        reason: "healthy",
        summary: decision.summary,
      };
    }

    const configuredRecipients = parsePlatformAlertRecipients(
      process.env.PLATFORM_ALERT_EMAILS ||
        process.env.PLATFORM_ALERT_EMAIL ||
        process.env.ANALYTICS_ALERT_EMAILS ||
        process.env.ANALYTICS_ALERT_EMAIL ||
        process.env.INITIAL_SUPER_ADMIN_EMAIL
    );
    // Falls back to the people who can actually act on it, rather than giving up.
    //
    // Annotated, and awaited on its own line, because an un-annotated
    // `ctx.runQuery` inside this action resolves its type through the generated
    // api and back into this module. That cycle silently widens every
    // `ctx.db.get` in the codebase to a union of every table.
    const fallbackRecipients: string[] = configuredRecipients.length > 0
      ? []
      : await ctx.runQuery(internal.platformAlertRecipients.getPlatformAlertFallbackRecipients, {});
    const recipients = configuredRecipients.length > 0 ? configuredRecipients : fallbackRecipients;

    if (recipients.length === 0) {
      console.warn("Platform alert triggered but no alert recipients are configured.", decision.summary);
      return {
        alerted: false,
        alertType: decision.alertType,
        reason: "missing_recipients",
        signals: decision.signals,
        summary: decision.summary,
      };
    }

    const email = buildSystemHealthAlertEmail(report, decision, {
      platformName: emailBranding?.platformName,
      baseUrl: process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL,
    });

    // Through the Outbox, sent on its next hourly run (outbox-and-preferences-plan.md, A3).
    const queued: { queued: number } = await ctx.runMutation(internal.outbox.queueWrittenEmailInternal, {
      messageType: "SYSTEM_HEALTH",
      to: recipients,
      email: { subject: email.subject, html: email.html, text: email.text },
      idempotencyKey: `platform-alert:${decision.alertType}:${report.windowStartDate}:${report.checkedDate}`,
    });

    return {
      alerted: true,
      alertType: decision.alertType,
      queued: queued.queued,
      recipients,
      signals: decision.signals,
      summary: decision.summary,
    };
  },
});

