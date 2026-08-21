/**
 * Turning a bad health report into an email somebody reads:
 * `dispatchPlatformAlerts` runs on the weekly cron, asks `systemHealth.ts`
 * for the report, and mails the configured recipients through the shared
 * email shell when the decision rules say the state is worth a bell. Split
 * out of the old `convex/analyticsCron.ts` on 2026-08-21 (foundation-quality
 * plan, phase 3).
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { buildEmailFromAddress, resolveEnvFromAddress } from "./emailBrandingService";
import { sendResendEmail } from "./resendEmailService";
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

    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not found. Simulating platform alert dispatch.", {
        recipients,
        subject: email.subject,
      });
      return {
        alerted: true,
        alertType: decision.alertType,
        recipients,
        simulated: true,
        signals: decision.signals,
        summary: decision.summary,
      };
    }

    const fromAddress = buildEmailFromAddress({
      envFromAddress: resolveEnvFromAddress(process.env),
      fallbackName: `${emailBranding.platformName} Operations`,
      settings: emailBranding,
    });
    const data = await sendResendEmail({
      apiKey: process.env.RESEND_API_KEY,
      operation: "platformSystemHealthAlert",
      idempotencyKey: `platform-alert:${decision.alertType}:${report.windowStartDate}:${report.checkedDate}`,
      payload: {
        from: fromAddress,
        to: recipients,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    });

    return {
      alerted: true,
      alertType: decision.alertType,
      id: data?.id,
      recipients,
      simulated: false,
      signals: decision.signals,
      summary: decision.summary,
    };
  },
});

