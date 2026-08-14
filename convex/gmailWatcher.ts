import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
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

const HOLDING_REPLY =
  "Thanks for your email. A colleague will come back to you on this — " +
  "we've made sure it's in front of the right person.";

export const listConnectedMailboxes = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Bounded: one mailbox per workspace, installed by hand.
    const connectors = await ctx.db
      .query("toolConnectors")
      .withIndex("by_key", (q) => q.eq("key", "google-gmail"))
      .take(100);
    return connectors.filter(
      (connector) =>
        connector.installStatus === "INSTALLED" &&
        connector.isActive &&
        connector.authConnectionStatus === "CONNECTED" &&
        connector.companyId !== undefined
    );
  },
});

/**
 * Record a message id the moment it is seen (commitment 7). Answers with
 * what the watcher should do: process it, or leave it alone.
 */
export const recordSeenMessage = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    companyId: v.optional(v.id("companies")),
    gmailMessageId: v.string(),
    gmailThreadId: v.string(),
    sender: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args): Promise<"PROCESS" | "ALREADY_HANDLED"> => {
    const existing = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_connector_message", (q) =>
        q.eq("connectorId", args.connectorId).eq("gmailMessageId", args.gmailMessageId)
      )
      .first();
    if (existing) {
      // A PENDING row is a message whose processing died mid-way — the next
      // poll picks it up again. Anything decided stays decided.
      return existing.decision === "PENDING" ? "PROCESS" : "ALREADY_HANDLED";
    }
    const now = Date.now();
    await ctx.db.insert("mailboxMessages", {
      companyId: args.companyId,
      connectorId: args.connectorId,
      gmailMessageId: args.gmailMessageId,
      gmailThreadId: args.gmailThreadId,
      sender: args.sender,
      subject: args.subject,
      decision: "PENDING",
      createdAt: now,
      updatedAt: now,
    });
    return "PROCESS";
  },
});

export const markDecision = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    gmailMessageId: v.string(),
    decision: v.union(v.literal("REPLIED"), v.literal("TASK"), v.literal("SKIPPED")),
    reason: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_connector_message", (q) =>
        q.eq("connectorId", args.connectorId).eq("gmailMessageId", args.gmailMessageId)
      )
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      decision: args.decision,
      decisionReason: args.reason,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** The once-a-minute entry point (crons.ts). */
export const pollMailboxes = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.runQuery(internal.gmailWatcher.listConnectedMailboxes, {});
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
    const verdict = await ctx.runMutation(internal.gmailWatcher.recordSeenMessage, {
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
    await ctx.runMutation(internal.gmailWatcher.markDecision, {
      connectorId: connector._id,
      gmailMessageId: summary.id,
      decision: "SKIPPED",
      reason: reasonToSkip,
    });
    return;
  }

  // Read the mail in full, then ask the brain: answer, or hand to a person?
  const fullResult = (await ctx.runAction(internal.gmailConnector.readMailbox, {
    connectorId: connector._id,
    messageId: summary.id,
  })) as { ok: boolean; message?: { body: string; from: string; subject: string } };
  if (!fullResult.ok || !fullResult.message) throw new Error("Message could not be read.");

  const question = `${summary.subject}\n\n${fullResult.message.body}`.slice(0, 6000);

  const knowledge = (await ctx.runAction(internal.ai.searchKnowledgeForVoiceInternal, {
    query: question,
    fallbackCompanyId: connector.companyId,
  })) as { context: string };

  const decision = await decideReply(ctx, {
    question,
    knowledgeContext: knowledge.context ?? "",
    companyId: connector.companyId,
  });

  if (decision.grounded && decision.reply) {
    const sent = await ctx.runAction(internal.gmailConnector.replyToMessage, {
      connectorId: connector._id,
      messageId: summary.id,
      body: decision.reply,
    });
    if (sent.ok) {
      await labelProcessed(ctx, connector, summary.id);
      // recordReply set REPLIED; nothing more to mark.
      return;
    }
    // A rail refused the send and already filed the task; record that truth.
    await ctx.runMutation(internal.gmailWatcher.markDecision, {
      connectorId: connector._id,
      gmailMessageId: summary.id,
      decision: "TASK",
      reason: sent.error,
    });
    return;
  }

  // Not grounded: a person answers. Holding reply first (through the same
  // rails), then the task and bell for the shared per-company owner.
  await ctx.runAction(internal.gmailConnector.replyToMessage, {
    connectorId: connector._id,
    messageId: summary.id,
    body: HOLDING_REPLY,
  });

  let taskId: Id<"tasks"> | undefined;
  if (connector.companyId) {
    const assignee = await ctx.runQuery(internal.telephony.findCallAssignee, {
      companyId: connector.companyId,
    });
    taskId = await ctx.runMutation(internal.tasks.createTaskInternal, {
      companyId: connector.companyId,
      title: `Answer ${parseAddress(summary.from)}: "${(summary.subject || "(no subject)").slice(0, 120)}"`,
      detail:
        `Sonae could not answer this from company knowledge, told the sender a person will ` +
        `follow up, and left the mail in the inbox.\n\nFrom: ${summary.from}\n` +
        `Their message:\n${fullResult.message.body.slice(0, 2000)}`,
      ...(assignee ? { assigneeUserId: assignee } : {}),
      createdBySource: "AGENT" as const,
    });
  }

  await ctx.runMutation(internal.gmailWatcher.markDecision, {
    connectorId: connector._id,
    gmailMessageId: summary.id,
    decision: "TASK",
    reason: "Not answerable from company knowledge.",
    ...(taskId ? { taskId } : {}),
  });
  await labelProcessed(ctx, connector, summary.id);
}

/**
 * The answer-versus-task decision, structured. Fail-closed: anything that
 * does not parse as a grounded answer becomes a task for a person.
 */
async function decideReply(
  ctx: ActionCtx,
  args: {
    question: string;
    knowledgeContext: string;
    companyId?: Id<"companies">;
  }
): Promise<{ grounded: boolean; reply?: string }> {
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
        "You answer a customer email for a company, using ONLY the company knowledge provided. " +
        'Reply with strict JSON, nothing else: {"grounded": boolean, "reply": string}. ' +
        "grounded is true only when the knowledge genuinely answers the question — then reply is a " +
        "short, complete, courteous email answer in the sender's language, plain text, no signature. " +
        "If the knowledge does not answer it, grounded is false and reply is an empty string. " +
        "Never invent facts, prices, or commitments.",
      contents: [
        {
          type: "text",
          text: `Company knowledge:\n${args.knowledgeContext || "(none found)"}\n\nCustomer email:\n${args.question}`,
        },
      ],
    });
    const text = response.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { grounded: false };
    const parsed = JSON.parse(jsonMatch[0]) as { grounded?: boolean; reply?: string };
    if (parsed.grounded === true && typeof parsed.reply === "string" && parsed.reply.trim()) {
      return { grounded: true, reply: parsed.reply.trim() };
    }
    return { grounded: false };
  } catch (error) {
    console.error("Mailbox decision failed; routing to a person", error);
    return { grounded: false };
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
