import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { evaluateAssistantSafety, type AssistantSafetyDecision } from "./aiSafetyPolicy";
import { shouldFlushStreamedText } from "./streamingService";
import type { MessageEvidence } from "./utils/messageEvidence";

/**
 * The turn both assistants share.
 *
 * Ask Sonae (`convex/aiChat.ts`) and the agent runtime (`convex/agentRuntime.ts`)
 * grew up separately, and each wired the same per-turn plumbing by hand: check
 * the message against the safety policy and refuse it the same way, stream the
 * model's words into the conversation at a bounded rate, and close the reply so
 * no caret is left blinking against an answer that is never coming. Two copies
 * meant every change to that plumbing had to land twice — and the day one side
 * was forgotten, the two assistants would quietly disagree with nothing to say
 * so.
 *
 * This file is the single copy. The safety policy is reachable only through
 * `guardModelTurn`, the streaming discipline only through `runModelTurn`, and
 * the reply's closing write only through `finishAssistantReply`. Both runtimes
 * call these three and keep their own orchestration — retrieval, tools,
 * budgets, checkpoints — around them. A guard test pins the arrangement so
 * neither file can drift back to a private copy.
 *
 * What deliberately stays split, because it genuinely differs per surface:
 * retrieval policy (which scopes, which budget, the wiki cutover), prompt
 * assembly (assistant vs agent instruction), the provider call itself (a
 * single completion vs a tool-aware cached turn — it arrives here as the
 * `callModel` strategy), PII redaction of tool arguments (only the agent has
 * tools), and cost bookkeeping (the agent's run ledger vs tokens on the chat
 * message, both fed by the usage this turn returns).
 *
 * No Convex function declarations live here — this is a service file, and like
 * `agentObservabilityService.readAgentAnalytics` its functions take `ctx` as a
 * parameter instead.
 */

/**
 * The slice of an action's context the shared turn needs: the ability to write
 * messages. Narrow on purpose so a unit test can hand in a plain recording
 * stub instead of a whole Convex runtime.
 */
export type ModelTurnCtx = Pick<ActionCtx, "runMutation">;

/** Which model answered, written onto every message the turn produces. */
export type ModelAttribution = {
  modelId: string;
  providerKey: string;
  providerModelId: string;
};

/**
 * The reply being written token by token.
 *
 * Held in one mutable object owned by the caller — not by `runModelTurn` — so
 * every exit path, including the caller's own failure handler, can reach the
 * same row. A row left marked as streaming shows a caret against an answer
 * that is never coming.
 *
 * `text` holds only the current model turn. A turn that requests tools may
 * narrate first ("let me look that up"), and that narration is superseded by
 * the next turn rather than accumulating, so what the reader ends up with
 * matches the final answer.
 */
export type ModelTurnStream = {
  messageId: Id<"messages"> | undefined;
  text: string;
  flushedText: string;
  lastFlushAt: number;
};

export function createModelTurnStream(messageId?: Id<"messages">): ModelTurnStream {
  return { messageId, text: "", flushedText: "", lastFlushAt: 0 };
}

/**
 * The safety gate every model turn passes before anything else runs.
 *
 * One function on purpose: this is the door to `aiSafetyPolicy`, and the whole
 * reason this file exists is that each runtime used to hold its own copy of
 * "evaluate, then record the refusal". A policy-flow change lands here once
 * and every surface picks it up.
 *
 * When the turn came from a conversation, `refusal` says whose it is, and a
 * refused message is saved into the thread attributed to that runtime.
 * Triggered agent runs have no conversation to refuse into — they pass no
 * sink and record the decision on the run record themselves.
 */
export async function guardModelTurn(
  ctx: ModelTurnCtx,
  args: {
    content: string;
    refusal?: { threadId: Id<"threads">; source: "assistant" | "agent" };
    /** The deployment's configured name, so refusal copy names the platform the reader is using. */
    platformName?: string;
  }
): Promise<AssistantSafetyDecision> {
  const decision = evaluateAssistantSafety(args.content, { platformName: args.platformName });

  if (!decision.allowed && args.refusal) {
    await ctx.runMutation(internal.chat.saveAssistantSafetyRefusal, {
      threadId: args.refusal.threadId,
      content: decision.response,
      category: decision.category,
      source: args.refusal.source,
    });
  }

  return decision;
}

/**
 * One streamed model turn: the shared discipline around a provider call.
 *
 * The provider call itself is the one genuinely divergent step — chat asks the
 * text registry for a single completion, the agent asks its adapter for a
 * tool-aware turn with prompt caching and its own retry — so it arrives as the
 * `callModel` strategy and this function owns everything around it: each
 * turn's text replaces the last (so tool-call narration never accumulates in
 * front of the answer), and fragments are written to the thread at a bounded
 * rate. Convex queries are reactive, so each write is a real transaction
 * fanned out to every subscribed client; `shouldFlushStreamedText` decides
 * when a chunk is worth that rather than writing per token.
 *
 * The row is created on the first flushed fragment, not up front: the chat
 * surfaces infer "thinking" from the last message being the user's, so an
 * empty row would swap the thinking indicator for a blank bubble while the
 * model warms up. A provider that never calls `onText` therefore creates no
 * row at all, and the reply lands in one write via `finishAssistantReply`.
 *
 * With no `threadId` there is nowhere to stream to and nothing is written —
 * a scheduled run's reply is recorded on the run itself — but the stream
 * state still advances so the accounting reads the same either way.
 */
export async function runModelTurn<TResponse>(
  ctx: ModelTurnCtx,
  params: {
    /** The conversation the reply streams into; absent for unattended runs. */
    threadId?: Id<"threads">;
    /** Caller-owned so its failure handler can close a half-written row. */
    stream: ModelTurnStream;
    model: ModelAttribution;
    /** The provider call, handed the shared `onText` to stream through. */
    callModel: (handlers: { onText: (fragment: string) => Promise<void> }) => Promise<TResponse>;
  }
): Promise<TResponse> {
  const { threadId, stream, model } = params;

  // `flushedText` resets with `text`: it records how much of *this* turn has
  // been written, and leaving the previous turn's value behind would make the
  // pending-character count negative and suppress every write.
  stream.text = "";
  stream.flushedText = "";

  const onText = async (fragment: string) => {
    stream.text += fragment;

    const pendingChars = stream.text.length - stream.flushedText.length;
    const now = Date.now();
    if (
      !shouldFlushStreamedText({
        pendingChars,
        msSinceLastFlush: now - stream.lastFlushAt,
        isFinal: false,
      })
    ) {
      return;
    }

    if (threadId === undefined) {
      // Nowhere to stream to, and nothing to create.
    } else if (stream.messageId === undefined) {
      stream.messageId = await ctx.runMutation(internal.chat.startStreamingAssistantMessage, {
        threadId,
        content: stream.text,
        modelUsed: model.modelId,
        providerKey: model.providerKey,
        providerModelId: model.providerModelId,
      });
    } else {
      await ctx.runMutation(internal.chat.appendStreamingAssistantMessage, {
        messageId: stream.messageId,
        content: stream.text,
      });
    }

    stream.flushedText = stream.text;
    stream.lastFlushAt = now;
  };

  return await params.callModel({ onText });
}

/**
 * Close the reply, wherever it got to.
 *
 * If text was streamed the row already exists, so it is finished rather than
 * duplicated — the final content is authoritative, replacing whatever partial
 * text the reader saw. If nothing streamed and there is a conversation, the
 * reply lands in one write. With neither, there is nothing to close and the
 * caller's own record (the run row) is the reply's home.
 *
 * Every terminal path goes through here — success, budget stop, cancellation,
 * park on an approval, provider failure — because each used to hand-roll this
 * branch and the one that forgot would leave a caret blinking forever. The
 * stream's `messageId` is cleared once closed so no later path can close the
 * same row twice.
 *
 * Returns the id of the message that now holds the reply, for bookkeeping
 * that hangs off it (memory usage records), or undefined when no conversation
 * exists.
 */
export async function finishAssistantReply(
  ctx: ModelTurnCtx,
  args: {
    threadId?: Id<"threads">;
    stream: ModelTurnStream;
    content: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    model?: ModelAttribution;
    evidence?: MessageEvidence;
    photoTurn?: boolean;
  }
): Promise<Id<"messages"> | undefined> {
  const shared = {
    content: args.content,
    inputTokens: args.usage?.inputTokens,
    outputTokens: args.usage?.outputTokens,
    modelUsed: args.model?.modelId,
    providerKey: args.model?.providerKey,
    providerModelId: args.model?.providerModelId,
    companyMemoryEvidenceJson: args.evidence?.companyMemoryEvidenceJson,
    companyRuntimeEvidenceJson: args.evidence?.companyRuntimeEvidenceJson,
    photoTurn: args.photoTurn,
  };

  if (args.stream.messageId !== undefined) {
    const messageId = args.stream.messageId;
    args.stream.messageId = undefined;
    await ctx.runMutation(internal.chat.finishStreamingAssistantMessage, {
      messageId,
      ...shared,
    });
    return messageId;
  }

  if (args.threadId !== undefined) {
    return await ctx.runMutation(internal.chat.saveAssistantMessage, {
      threadId: args.threadId,
      ...shared,
    });
  }

  return undefined;
}
