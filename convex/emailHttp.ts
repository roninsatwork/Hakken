import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verifyWebhookSignature } from "./utils/webhookSignature";

/**
 * The two ways an email reaches back into the platform (docs/plans/active/
 * knowledge-news-and-digest-plan.md, phase 8), routed in `http.ts`.
 */

/**
 * The one-click unsubscribe a mail client sends from the `List-Unsubscribe`
 * header (RFC 8058) — a POST, which a mail scanner opening links does not
 * send. Answers 200 whatever the token, so a guess learns nothing.
 */
export const handleOneClickUnsubscribe = httpAction(async (ctx, request) => {
  const params = new URL(request.url).searchParams;
  const token = params.get("token") ?? "";
  // Which type of email to stop (outbox-and-preferences-plan.md, B1); a link from before the types stops the digest.
  const kind = params.get("kind")?.slice(0, 40) || undefined;
  await ctx.runMutation(internal.readerPreferences.unsubscribeWithTokenInternal, { token, ...(kind ? { kind } : {}) });
  return new Response(null, { status: 200 });
});

type ResendEvent = { type?: string; data?: { email_id?: string; to?: unknown } };

const SUPPRESSING_EVENTS: Record<string, "BOUNCED" | "COMPLAINED"> = {
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

/**
 * Resend's webhook: a bounce or a complaint stops every later email to that
 * address — the Email Sender skips it. Signed with `RESEND_WEBHOOK_SECRET`;
 * anything unsigned or old is refused.
 */
export const handleResendWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const genuine = await verifyWebhookSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
    nowMs: Date.now(),
  });
  if (!genuine) return new Response("Signature not recognised.", { status: 401 });
  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  const reason = event.type ? SUPPRESSING_EVENTS[event.type] : undefined;
  const to = Array.isArray(event.data?.to) ? event.data.to.filter((address): address is string => typeof address === "string") : [];
  if (reason && to.length > 0) {
    await ctx.runMutation(internal.emailSuppressions.recordSuppression, {
      emails: to,
      reason,
      ...(event.data?.email_id ? { resendEmailId: event.data.email_id } : {}),
    });
  }
  return new Response(null, { status: 200 });
});
