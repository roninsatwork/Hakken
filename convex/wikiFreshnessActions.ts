"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";

/**
 * The Freshness Checker (wiki-agents plan, phase 2): aging pages get read
 * against the kept source documents their receipts point at. A supported
 * page gets its check stamped and nothing else; a claim the sources no
 * longer support becomes an open question, quoted exactly — never a silent
 * rewrite. Bounded per company per night; a stood-down checker spends
 * nothing.
 */

export const freshnessSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (
      !(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, {
        systemKey: "WIKI_FRESHNESS_CHECKER",
      }))
    ) {
      return { companies: 0 };
    }
    const companies = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    for (const scope of companies) {
      // `null` is the global shelf's round (global-wiki-plan.md, phase 4).
      await ctx.scheduler.runAfter(0, internal.wikiFreshnessActions.checkCompanyFreshness, {
        companyId: scope ?? undefined,
      });
    }
    return { companies: companies.length };
  },
});

export const checkCompanyFreshness = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<{ verified: number; raised: number }> => {
    const startedAt = Date.now();
    let verified = 0;
    let raised = 0;

    // Goals first, and without a model: a goal has no source documents to
    // read against, so its only freshness signal is time. A stale one gets
    // asked about — "is this still the aim?" — and editing the page (which
    // changes content and updatedAt) both resolves the question and starts
    // the clock again. A dismissed question stays dismissed for that
    // cycle's dedupe key.
    const staleGoals = await ctx.runQuery(internal.wikiFreshness.getStaleGoalsInternal, {
      companyId: args.companyId,
    });
    for (const goal of staleGoals) {
      const wasNew = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
        companyId: args.companyId,
        kind: "FRESHNESS",
        pageKeyA: goal.pageKey,
        claimA: goal.content,
        detail: "This goal has not been touched in a while. Is it still the aim? Edit the page to confirm or change it, or dismiss this if it stands as written.",
        dedupeKey: `GOAL-STALE::${goal.pageKey}::${goal.updatedAt}`,
      });
      if (wasNew) raised += 1;
    }

    const candidates = await ctx.runQuery(internal.wikiFreshness.getFreshnessCandidatesInternal, {
      companyId: args.companyId,
    });
    if (candidates.length === 0) {
      if (raised > 0) {
        await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
          systemKey: "WIKI_FRESHNESS_CHECKER",
          companyId: args.companyId,
          trigger: "SCHEDULE",
          objective: "Re-check aging pages against their kept source documents.",
          summary: `Raised ${raised} stale-goal questions; no pages were due a source check.`,
          startedAt,
        });
      }
      return { verified: 0, raised };
    }

    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
    });
    for (const page of candidates) {
      const sources = await ctx.runQuery(internal.wikiFreshness.getSourceTextsForPageInternal, {
        pageId: page.pageId,
      });
      // A page whose sources are gone cannot be verified at all — that is
      // itself the finding.
      if (sources.texts.length === 0) {
        const wasNew = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
          companyId: args.companyId,
          kind: "FRESHNESS",
          pageKeyA: page.pageKey,
          claimA: page.content.slice(0, 200),
          detail: "The documents this page was written from are no longer available to check against.",
          dedupeKey: `FRESHNESS::${page.pageKey}::sources-missing`,
        });
        if (wasNew) raised += 1;
        await ctx.runMutation(internal.wikiFreshness.markVerifiedInternal, { pageId: page.pageId });
        continue;
      }
      try {
        const prompt =
          `The page (${page.pageKey}):\n${page.content}\n\n` +
          `The kept sources:\n${sources.texts.join("\n\n---\n\n")}`;
        const response = await generateTextWithResolvedModel({
          model,
          systemInstruction:
            "You check whether a wiki page's claims are still supported by the source documents it was written from. " +
            'Reply with strict JSON, nothing else: {"supported": boolean, "unsupportedClaim": string} — supported=true when the sources still back the page (unsupportedClaim then empty); when false, unsupportedClaim quotes the page\'s own sentence the sources no longer support. Claims from conversations rather than documents do not count against the page.',
          contents: [{ type: "text", text: prompt }],
        });
        await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
          systemKey: "WIKI_FRESHNESS_CHECKER",
          companyId: args.companyId,
          actionContext: "Wiki Freshness Round",
          modelId: model.modelId,
          providerKey: model.providerKey,
          providerModelId: model.providerModelId,
          inputTokens: response.inputTokens ?? 0,
          outputTokens: response.outputTokens ?? 0,
          promptContent: prompt,
          responseContent: response.text ?? "",
        });
        const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
        const parsed = jsonMatch
          ? (JSON.parse(jsonMatch[0]) as { supported?: unknown; unsupportedClaim?: unknown })
          : {};
        if (parsed.supported === false && typeof parsed.unsupportedClaim === "string" && parsed.unsupportedClaim.trim()) {
          const claim = parsed.unsupportedClaim.trim();
          const wasNew = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
            companyId: args.companyId,
            kind: "FRESHNESS",
            pageKeyA: page.pageKey,
            claimA: claim,
            detail: "The kept sources no longer support this claim. Check it, then edit or pin the page.",
            dedupeKey: `FRESHNESS::${page.pageKey}::${claim.toLowerCase().replace(/\s+/g, " ").slice(0, 60)}`,
          });
          if (wasNew) raised += 1;
        } else {
          verified += 1;
        }
        await ctx.runMutation(internal.wikiFreshness.markVerifiedInternal, { pageId: page.pageId });
      } catch (error) {
        console.error("The Freshness Checker could not read a page; moving on", error);
      }
    }

    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_FRESHNESS_CHECKER",
      companyId: args.companyId,
      trigger: "SCHEDULE",
      objective: "Re-check aging pages against their kept source documents.",
      summary: `Verified ${verified} pages; raised ${raised} freshness questions.`,
      startedAt,
    });
    return { verified, raised };
  },
});
