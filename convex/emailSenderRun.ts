"use node";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { outboxFromAddress } from "./emailBrandingService";
import { pictureAttachments } from "./emailPictureEncoder";
import { sendResendEmail } from "./resendEmailService";
import { appError, appErrorMessage } from "./utils/appError";

/**
 * The Outbox Queue Processing Agent's job (docs/plans/active/outbox-and-
 * preferences-plan.md, A2; first built as the Email Sender's,
 * knowledge-news-and-digest-plan.md, phase 7): send what waits in the
 * outbox, oldest first, on its hourly run. It calls no model and costs
 * nothing on its run (A12).
 *
 * Each row is claimed, rendered with its type's template in its reader's
 * language, marked as posting, sent through Resend with its idempotency key —
 * so however often something retries, nobody gets it twice — and settled:
 * sent with Resend's receipt, failed and tried again later until its tries
 * are spent, or skipped with the reason. It sends under Resend's rate limit,
 * takes nothing new after seven minutes, and gives back what it claimed and
 * did not reach. Every row is sent from the one Outbox address; with none
 * set, nothing is sent from the unconfigured fallback, and the run says so.
 */
/** Between sends: under Resend's rate limit, about two a second on its default plan. */
export const SEND_GAP_MS = 600;

/** No new email is started after this, well inside an action's ten minutes. */
const SEND_WORK_MS = 7 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export async function sendOutbox(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const started = Date.now();
  const reclaimed: { returned: number; failed: number } = await ctx.runMutation(internal.outbox.reclaimOutbox, {});
  if (reclaimed.returned + reclaimed.failed > 0) {
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId,
      heading: "Took back what an earlier run left",
      detail: `${plural(reclaimed.returned, "email", "emails")} back to waiting; ${reclaimed.failed} failed, because their send had started and may have gone.`,
      failed: false,
    });
  }
  const waiting: { count: number; more: boolean } = await ctx.runQuery(internal.outbox.countWaitingOutbox, {});
  if (waiting.count === 0) return "Nothing is waiting in the outbox.";
  const waitingText = `${waiting.count}${waiting.more ? "+" : ""} ${waiting.count === 1 && !waiting.more ? "email waits" : "emails wait"}`;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw appError("NOT_CONFIGURED", `RESEND_API_KEY is not set on this deployment, so nothing was sent. ${waitingText}.`);
  // One address for every Outbox email (outbox-and-preferences-plan.md, A1).
  const branding = await ctx.runQuery(internal.settings.getEmailBranding, {});
  const address = outboxFromAddress(process.env, branding);
  if (!address) {
    throw appError("NOT_CONFIGURED", `OUTBOX_FROM_EMAIL is not set, and neither is a general sender address, so nothing was sent. ${waitingText}.`);
  }
  await ctx.runMutation(internal.roleRuns.recordObservation, { runId, text: `${waitingText} in the outbox.` });

  let sent = 0;
  let failed = 0;
  let retrying = 0;
  let skipped = 0;
  let stoppedBecause: string | null = null;

  for (;;) {
    if (Date.now() - started > SEND_WORK_MS) {
      stoppedBecause = "its time ran out; the rest are sent next run";
      break;
    }
    const batch = await ctx.runMutation(internal.outbox.claimOutboxBatch, { runId });
    if (batch.length === 0) break;
    let tried = 0;
    const batchSent = sent;
    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index];
      if (Date.now() - started > SEND_WORK_MS) {
        await ctx.runMutation(internal.outbox.releaseOutboxClaims, { runId, messageIds: batch.slice(index).map((entry) => entry._id) });
        stoppedBecause = "its time ran out; the rest are sent next run";
        break;
      }
      tried += 1;
      const rendered = await ctx.runQuery(internal.outboxTemplates.renderOutboxMessage, { messageId: row._id });
      if ("skip" in rendered) {
        await ctx.runMutation(internal.outbox.settleOutboxMessage, { messageId: row._id, runId, outcome: "SKIPPED", error: rendered.skip });
        skipped += 1;
        continue;
      }
      if (!(await ctx.runMutation(internal.outbox.markOutboxPosting, { messageId: row._id, runId }))) continue;
      try {
        const receipt = await sendResendEmail({
          apiKey,
          operation: `outbox:${row.messageType}`,
          idempotencyKey: row.idempotencyKey,
          payload: {
            from: address,
            to: row.email,
            subject: rendered.email.subject,
            html: rendered.email.html,
            text: rendered.email.text,
            ...(Object.keys(rendered.email.headers).length > 0 ? { headers: rendered.email.headers } : {}),
            // A chart it carries, drawn here, where Node can encode it, and shown inline by its content id.
            ...(rendered.email.pictures.length > 0 ? { attachments: pictureAttachments(rendered.email.pictures) } : {}),
          },
        });
        await ctx.runMutation(internal.outbox.settleOutboxMessage, {
          messageId: row._id, runId, outcome: "SENT", ...(receipt?.id ? { resendId: receipt.id } : {}),
        });
        sent += 1;
      } catch (error: unknown) {
        const now = await ctx.runMutation(internal.outbox.settleOutboxMessage, {
          messageId: row._id, runId, outcome: "FAILED", error: appErrorMessage(error, "Resend did not say why.").slice(0, 500),
        });
        if (now === "FAILED") failed += 1;
        else retrying += 1;
      }
      await sleep(SEND_GAP_MS);
    }
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId,
      heading: `Sent a batch of ${batch.length}`,
      detail: `${sent - batchSent} sent of ${tried} tried.`,
      failed: false,
    });
    if (stoppedBecause || tried === 0) break;
  }

  const parts = [
    `Sent ${plural(sent, "email", "emails")}`,
    ...(retrying > 0 ? [`${retrying} failed and will be tried again later`] : []),
    ...(failed > 0 ? [`${failed} failed for good`] : []),
    ...(skipped > 0 ? [`${skipped} skipped`] : []),
  ];
  return `${parts.join("; ")}.${stoppedBecause ? ` Stopped because ${stoppedBecause}.` : ""}`;
}
