"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { isNoReplyAddress, parseAddress } from "./gmailConnector";

/**
 * The mailbox that answers itself: Phase C of the Gmail plan.
 *
 * Once a minute, every connected mailbox is polled. Each new message id is
 * recorded before anything acts on it (commitment 7), so double delivery or
 * an overlapping poll can never answer twice. Then the answer-versus-task
 * decision runs through the brain: an answer grounded in company knowledge
 * goes out through `gmail.reply` — inside the same rails as any other send —
 * and everything else becomes a task, a bell, and a short holding reply so
 * the sender knows a person is coming.
 *
 * Skip rules are fail-closed: bulk and no-reply senders, Gmail's own spam
 * and promotions categories, and anything the mailbox itself sent are
 * recorded as SKIPPED and never answered.
 */

/** What a human sees in Gmail on mail the agent handled. */
export const PROCESSED_LABEL_NAME = "Sonae";

/**
 * Sent only when the model call itself failed and no written reply exists —
 * the sender must still hear something rather than silence.
 */
const FALLBACK_HOLDING_REPLY =
  "Thanks for your email. A colleague will come back to you on this — " +
  "we've made sure it's in front of the right person.";

/** The once-a-minute entry point (crons.ts). */
export const pollMailboxes = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.runQuery(internal.gmailWatcherStore.listConnectedMailboxes, {});
    for (const connector of connectors) {
      try {
        await processMailbox(ctx, connector);
      } catch (error) {
        // One broken mailbox must not stop the others; the connection's own
        // error state (connectorOAuth) reports the cause honestly.
        console.error("Mailbox poll failed", connector._id, error);
      }
    }
  },
});

type MessageSummary = {
  id: string;
  threadId: string;
  labels: string[];
  from: string;
  subject: string;
  listUnsubscribe?: string;
};

function skipReason(summary: MessageSummary): string | null {
  if (summary.labels.includes("SENT")) return "Sent by the mailbox itself.";
  if (summary.labels.includes("SPAM")) return "Gmail marked it as spam.";
  if (summary.labels.includes("CATEGORY_PROMOTIONS")) return "Promotional mail.";
  if (summary.labels.includes("DRAFT")) return "A draft, not a received message.";
  if (summary.listUnsubscribe) return "Bulk mail (carries an unsubscribe header).";
  if (isNoReplyAddress(parseAddress(summary.from))) return "No-reply sender.";
  return null;
}

async function processMailbox(ctx: ActionCtx, connector: Doc<"toolConnectors">) {
  const listing = (await ctx.runAction(internal.gmailConnector.readMailbox, {
    connectorId: connector._id,
    query: "in:inbox",
  })) as { ok: boolean; error?: string; messages?: MessageSummary[] };
  if (!listing.ok || !listing.messages) return;

  for (const summary of listing.messages) {
    const verdict = await ctx.runMutation(internal.gmailWatcherStore.recordSeenMessage, {
      connectorId: connector._id,
      companyId: connector.companyId,
      gmailMessageId: summary.id,
      gmailThreadId: summary.threadId,
      sender: parseAddress(summary.from),
      subject: summary.subject || "(no subject)",
    });
    if (verdict !== "PROCESS") continue;

    try {
      await processMessage(ctx, connector, summary);
    } catch (error) {
      console.error("Mailbox message processing failed", summary.id, error);
      // The row stays PENDING; the next poll retries it.
    }
  }
}

async function processMessage(
  ctx: ActionCtx,
  connector: Doc<"toolConnectors">,
  summary: MessageSummary
) {
  const reasonToSkip = skipReason(summary);
  if (reasonToSkip) {
    await ctx.runMutation(internal.gmailWatcherStore.markDecision, {
      connectorId: connector._id,
      gmailMessageId: summary.id,
      decision: "SKIPPED",
      reason: reasonToSkip,
    });
    return;
  }

  // Read the whole conversation, not just the newest message. A follow-up
  // like "that wasn't helpful" says nothing about the topic — the first live
  // test searched the knowledge with exactly those words, found nothing, and
  // answered a pricing thread with a brush-off while the published prices
  // sat in the knowledge base. The conversation is the question.
  const threadResult = (await ctx.runAction(internal.gmailConnector.readMailbox, {
    connectorId: connector._id,
    threadId: summary.threadId,
  })) as {
    ok: boolean;
    messages?: Array<{ id: string; from: string; fromMailbox: boolean; body: string }>;
  };
  if (!threadResult.ok || !threadResult.messages?.length) {
    throw new Error("Conversation could not be read.");
  }

  const senderTexts = threadResult.messages
    .filter((message) => !message.fromMailbox)
    .map((message) => message.body.trim())
    .filter(Boolean);
  const newestBody = senderTexts.at(-1) ?? "";

  // The knowledge search hears everything the sender has said in the thread,
  // so the topic survives however the latest message is phrased.
  const retrievalQuery = `${summary.subject}\n\n${senderTexts.join("\n\n")}`.slice(0, 6000);

  const transcript = threadResult.messages
    .map((message) => `${message.fromMailbox ? "Sonae" : "Customer"}: ${message.body.trim()}`)
    .filter((line) => line.length > "Customer: ".length)
    .join("\n\n")
    .slice(-8000);

  const knowledge = (await ctx.runAction(internal.ai.searchKnowledgeForVoiceInternal, {
    query: retrievalQuery,
    fallbackCompanyId: connector.companyId,
  })) as { context: string };

  const decision = await decideReply(ctx, {
    conversation: transcript,
    knowledgeContext: knowledge.context ?? "",
    companyId: connector.companyId,
  });

  // The reply always goes out (through the rails): either the written answer
  // — which uses published facts and figures exactly as the knowledge states
  // them — or, if the model call itself died, the plain fallback so the
  // sender never gets silence.
  const replyBody = decision.reply?.trim() || FALLBACK_HOLDING_REPLY;
  const sent = await ctx.runAction(internal.gmailConnector.replyToMessage, {
    connectorId: connector._id,
    messageId: summary.id,
    body: replyBody,
  });

  if (sent.ok && !decision.needsHuman) {
    await labelProcessed(ctx, connector, summary.id);
    // recordReply set REPLIED; nothing more to mark.
    return;
  }

  // A person is needed — because the question goes beyond the knowledge, or
  // because a rail refused the send (that path already filed its own task).
  let taskId: Id<"tasks"> | undefined;
  if (sent.ok && connector.companyId) {
    const assignee = await ctx.runQuery(internal.telephony.findCallAssignee, {
      companyId: connector.companyId,
    });
    taskId = await ctx.runMutation(internal.tasks.createTaskInternal, {
      companyId: connector.companyId,
      title: `Answer ${parseAddress(summary.from)}: "${(summary.subject || "(no subject)").slice(0, 120)}"`,
      detail:
        `Sonae replied with what the company knowledge covers and told the sender a ` +
        `colleague will follow up with the specifics.\n\nFrom: ${summary.from}\n` +
        `Their message:\n${newestBody.slice(0, 2000)}\n\n` +
        `What Sonae sent:\n${replyBody.slice(0, 1500)}`,
      ...(assignee ? { assigneeUserId: assignee } : {}),
      createdBySource: "AGENT" as const,
    });
  }

  await ctx.runMutation(internal.gmailWatcherStore.markDecision, {
    connectorId: connector._id,
    gmailMessageId: summary.id,
    decision: "TASK",
    reason: sent.ok ? "A person follows up with the specifics." : sent.error,
    ...(taskId ? { taskId } : {}),
  });
  await labelProcessed(ctx, connector, summary.id);
}

/**
 * What goes back to the sender, and whether a person follows up — one model
 * call, structured. The reply must use the company's published facts and
 * figures exactly as the knowledge states them: the first live quote request
 * was answered with a canned brush-off while the published price range sat
 * in the retrieved knowledge, which is the failure this wording exists to
 * prevent. Fail-closed: a call that dies yields no reply text, and the
 * caller sends the plain fallback and files the task.
 */
async function decideReply(
  ctx: ActionCtx,
  args: {
    conversation: string;
    knowledgeContext: string;
    companyId?: Id<"companies">;
  }
): Promise<{ reply?: string; needsHuman: boolean }> {
  try {
    // The cheap fast tier, resolved through the same catalogue door every
    // other headless caller uses (the phone's summary does exactly this).
    const config = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
      ...(args.companyId ? { companyId: args.companyId } : {}),
    });
    const response = await generateTextWithResolvedModel({
      model: config,
      systemInstruction:
        "You write the next reply in a customer email conversation for a company, using ONLY the company " +
        'knowledge provided. Answer with strict JSON, nothing else: {"reply": string, "needsHuman": boolean}. ' +
        "reply is a courteous, complete email answer to the customer's LATEST message, read in the light of " +
        "the whole conversation — in the sender's own language, plain text, no signature, no markdown. " +
        "Use the knowledge fully: published facts, price ranges, and how the company works may be stated " +
        "exactly as the knowledge states them. Never invent a fact or figure, and never commit to a specific " +
        "bespoke price or delivery date — those are a colleague's to give. Never repeat what an earlier Sonae " +
        "message in the conversation already said; move the conversation forward. " +
        "needsHuman is true when the sender needs something beyond what the knowledge settles (a bespoke " +
        "quote, a complaint, anything account-specific); the reply must then still give whatever the knowledge " +
        "does cover and say a colleague will follow up with the specifics. " +
        "If the knowledge offers nothing useful at all, reply is a short, warm acknowledgement that names what " +
        "they asked about and says a colleague will come back to them; needsHuman is true.",
      contents: [
        {
          type: "text",
          text:
            `Company knowledge:\n${args.knowledgeContext || "(none found)"}\n\n` +
            `The email conversation so far (oldest first):\n${args.conversation}`,
        },
      ],
    });
    const text = response.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { needsHuman: true };
    const parsed = JSON.parse(jsonMatch[0]) as { reply?: string; needsHuman?: boolean };
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : undefined;
    return { reply, needsHuman: parsed.needsHuman !== false || !reply };
  } catch (error) {
    console.error("Mailbox decision failed; routing to a person", error);
    return { needsHuman: true };
  }
}

/**
 * Label handled mail so a human opening Gmail sees at a glance what the
 * agent dealt with. Failure to label is never worth failing the message.
 */
async function labelProcessed(ctx: ActionCtx, connector: Doc<"toolConnectors">, messageId: string) {
  try {
    await ctx.runAction(internal.gmailConnector.applyProcessedLabel, {
      connectorId: connector._id,
      messageId,
      labelName: PROCESSED_LABEL_NAME,
    });
  } catch (error) {
    console.error("Mailbox labelling failed", messageId, error);
  }
}
