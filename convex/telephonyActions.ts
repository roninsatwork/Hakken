"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { maskPhoneNumber } from "./telephonyService";

/**
 * The hang-up-and-watch step.
 *
 * The provider has said the call is over; within seconds the transcript is
 * summarised, the caller is matched against the CRM, a follow-up task lands
 * with a named person, and their bell rings. Everything goes through the
 * existing doors — the task door validates, audits and notifies on its own —
 * and every piece degrades separately: a failed summary still files the
 * transcript, a failed task still keeps the summary.
 */
export const runAfterCallStep = internalAction({
  args: { callId: v.id("phoneCalls") },
  handler: async (ctx, args): Promise<void> => {
    const call = await ctx.runQuery(internal.telephony.getCallInternal, { callId: args.callId });
    if (!call) return;

    // A misdial that said nothing raises nobody: the record exists, and that
    // is the whole of what happened.
    if (call.turns.length === 0) return;

    const transcript = call.turns
      .map((turn) => `${turn.role === "CALLER" ? "Caller" : "Sonae"}: ${turn.text}`)
      .join("\n");

    // One model call, on the cheap fast tier — a call summary is two
    // sentences and a suggested action, not a report.
    let summary = "";
    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          "You summarise phone calls for a follow-up task. Reply with two plain sentences: what the caller wanted, and what should happen next. No preamble, no markdown.",
        contents: [{ type: "text", text: transcript.slice(0, 12_000) }],
      });
      summary = response.text?.trim() ?? "";
    } catch (error) {
      console.error("Call summary failed; the transcript still stands", error);
    }
    if (!summary) {
      summary = "The call transcript is attached. Read it and decide the follow-up.";
    }

    const matchedKey = await ctx.runMutation(internal.telephony.matchCallerToCustomer, {
      callId: args.callId,
    });

    const assignee = await ctx.runQuery(internal.telephony.findCallAssignee, {
      companyId: call.companyId,
    });

    let taskId: Id<"tasks"> | undefined;
    try {
      taskId = await ctx.runMutation(internal.tasks.createTaskInternal, {
        companyId: call.companyId,
        title: `Follow up: call from ${maskPhoneNumber(call.fromNumber)}${matchedKey ? ` (${matchedKey})` : ""}`,
        detail: `${summary}\n\nTranscript:\n${transcript.slice(0, 6000)}`,
        ...(assignee ? { assigneeUserId: assignee } : {}),
        createdBySource: "AGENT" as const,
        sourceUrl: `/app/calls/${args.callId}`,
      });
    } catch (error) {
      console.error("Call follow-up task could not be raised", error);
    }

    await ctx.runMutation(internal.telephony.attachCallSummary, {
      callId: args.callId,
      summary,
      ...(taskId ? { taskId } : {}),
    });

    // A matched caller's wiki page learns from the call (wiki plan, phase 1).
    // Scheduled, not awaited: a wiki failure never delays or breaks the
    // after-call step — the page just stays a rewrite behind.
    if (matchedKey && call.companyId) {
      await ctx.scheduler.runAfter(0, internal.wikiActions.rewriteCustomerPageAfterEvent, {
        companyId: call.companyId,
        subjectKey: matchedKey,
        eventLabel: "phone call",
        source: `PHONE_CALL:${args.callId}`,
        sourceLabel: `Phone call · ${matchedKey}`,
        eventText: `Summary: ${summary}\n\nTranscript:\n${transcript}`,
      });
    }
  },
});
