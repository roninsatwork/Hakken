"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { WIKI_PAGE_MAX_CHARS, validateRewrittenPage } from "./wikiRewriteService";

/**
 * The nightly gardener (wiki plan, phase 4), on the same dispatcher idiom as
 * the memory-suggestion sweep: one cheap pass per company with a living
 * wiki, and a quiet company costs nothing. Mechanical link repair is free;
 * at most a handful of overgrown pages per company see a model, and every
 * change lands through the same audited door as any other rewrite — so
 * revisions, the audit trail, and the untouchable pinned layer all hold
 * here without any extra machinery.
 */

export const tendDispatcher = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    const companies = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    for (const companyId of companies) {
      await ctx.scheduler.runAfter(0, internal.wikiTendingActions.tendCompany, { companyId });
    }
    return { companies: companies.length };
  },
});

export const tendCompany = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ repairedLinks: number; tidiedPages: number }> => {
    const candidates = await ctx.runQuery(internal.wikiTending.getTendingCandidatesInternal, {
      companyId: args.companyId,
    });

    const repairedLinks =
      candidates.linkRepairs.length > 0
        ? await ctx.runMutation(internal.wikiTending.repairLinksInternal, {
            companyId: args.companyId,
            repairs: candidates.linkRepairs,
          })
        : 0;

    let tidiedPages = 0;
    for (const page of candidates.overgrown) {
      try {
        const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
          useCase: "fast-chat",
        });
        const response = await generateTextWithResolvedModel({
          model,
          systemInstruction: [
            "You tidy one page of a company's customer wiki. The page has grown; make it a better briefing note.",
            "- Keep every fact still worth keeping. Never invent anything.",
            "- Merge repetition; remove what is stale or no longer matters.",
            "- Never contradict a pinned correction; do not repeat them in the page.",
            `- At most ${WIKI_PAGE_MAX_CHARS} characters, and shorter than the old page.`,
            "Reply with the complete tidied page text and nothing else.",
          ].join("\n"),
          contents: [
            {
              type: "text",
              text:
                `Customer: ${page.title}\n\n` +
                (page.pinnedCorrections.length
                  ? `Pinned corrections from staff (ground truth, do not contradict, do not repeat):\n${page.pinnedCorrections
                      .map((correction) => `- ${correction.text}`)
                      .join("\n")}\n\n`
                  : "") +
                `The page as it stands:\n${page.content}`,
            },
          ],
        });
        const verdict = validateRewrittenPage(response.text ?? "");
        // A tidy that grew the page is not a tidy; the page stands.
        if (verdict.ok && verdict.content.length < page.content.length) {
          await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
            companyId: args.companyId,
            subjectKey: page.subjectKey,
            title: page.title,
            content: verdict.content,
            source: "TENDING",
          });
          tidiedPages += 1;
        }
      } catch (error) {
        console.error("Wiki tending model call failed; the page stands as it was", error);
      }
      // Seen tonight either way — a page the model could not improve is not
      // offered again for a week.
      await ctx.runMutation(internal.wikiTending.markTendedInternal, { pageId: page.pageId });
    }

    return { repairedLinks, tidiedPages };
  },
});
