"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  validateRewrittenPage,
} from "./wikiRewriteService";

/**
 * The heart of the self-improving wiki: one event, one page, one rewrite
 * (self-improving-wiki-plan.md, phase 1). Scheduled from the door that saw
 * the event — hang-up, or a mailbox reply — so a wiki failure can never
 * break a call or an email; the page just stays a rewrite behind.
 */
export const rewriteCustomerPageAfterEvent = internalAction({
  args: {
    companyId: v.id("companies"),
    subjectKey: v.string(),
    /** e.g. "phone call" / "email exchange" — read by the model. */
    eventLabel: v.string(),
    /** e.g. "PHONE_CALL:<id>" — recorded on the page and its trail. */
    source: v.string(),
    eventText: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const page = await ctx.runQuery(internal.wikiPages.getCustomerPageInternal, {
      companyId: args.companyId,
      subjectKey: args.subjectKey,
    });

    const title = page?.title ?? args.subjectKey;
    let rewritten = "";
    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction: buildRewriteSystemInstruction(),
        contents: [
          {
            type: "text",
            text: buildRewriteUserContent({
              title,
              currentContent: page?.content ?? "",
              pinnedCorrections: page?.pinnedCorrections ?? [],
              eventLabel: args.eventLabel,
              eventText: args.eventText,
            }),
          },
        ],
      });
      rewritten = response.text ?? "";
    } catch (error) {
      console.error("Wiki rewrite model call failed; the page stands as it was", error);
      return;
    }

    const verdict = validateRewrittenPage(rewritten);
    if (!verdict.ok) {
      console.error(`Wiki rewrite refused (${verdict.reason}); the page stands as it was`);
      return;
    }

    await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
      companyId: args.companyId,
      subjectKey: args.subjectKey,
      title,
      content: verdict.content,
      source: args.source,
    });
  },
});
