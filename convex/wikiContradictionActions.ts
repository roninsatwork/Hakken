"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";

/**
 * The Contradiction Finder (wiki-agents plan, phase 1): reads one kind's
 * synthesis pages together and reports claims that genuinely disagree —
 * two pages, two quoted sentences, side by side. It NEVER settles which
 * side is right: every finding is an open question for a person, raised
 * once per disagreement, and closed by the sweep itself only when the
 * pages have changed so a quoted claim no longer stands.
 */

export const contradictionSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (
      !(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, {
        systemKey: "WIKI_CONTRADICTION_FINDER",
      }))
    ) {
      return { companies: 0 };
    }
    const companies = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    for (const scope of companies) {
      // `null` is the global shelf's round (global-wiki-plan.md, phase 4).
      await ctx.scheduler.runAfter(0, internal.wikiContradictionActions.findContradictionsForCompany, {
        companyId: scope ?? undefined,
      });
    }
    return { companies: companies.length };
  },
});

export const findContradictionsForCompany = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<{ raised: number; autoResolved: number }> => {
    const startedAt = Date.now();
    // Questions the pages have already answered close first, so the list a
    // person sees is never stale.
    const autoResolved = await ctx.runMutation(
      internal.wikiQuestions.autoResolveStaleQuestionsInternal,
      { companyId: args.companyId }
    );

    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
    });
    let raised = 0;
    for (const kind of ["PRODUCT", "POLICY", "ISSUE"] as const) {
      const cluster = await ctx.runQuery(internal.wikiQuestions.getContradictionClusterInternal, {
        companyId: args.companyId,
        kind,
      });
      if (cluster.length < 2) continue;
      try {
        const prompt = cluster
          .map((page) => `=== ${page.pageKey} ===\n${page.excerpt}`)
          .join("\n\n");
        const response = await generateTextWithResolvedModel({
          model,
          systemInstruction:
            "You read a set of related wiki pages together and report claims that GENUINELY disagree — the same fact stated two incompatible ways. Different emphasis or different level of detail is NOT a contradiction. " +
            'Reply with strict JSON, nothing else: {"contradictions": [{"pageA": string, "claimA": string, "pageB": string, "claimB": string}]} — pageA/pageB exactly as named, claimA/claimB quoting each page\'s own sentence. An empty list is the right answer for most healthy wikis.',
          contents: [{ type: "text", text: prompt }],
        });
        await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
          systemKey: "WIKI_CONTRADICTION_FINDER",
          companyId: args.companyId,
          actionContext: "Wiki Contradiction Round",
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
          ? (JSON.parse(jsonMatch[0]) as { contradictions?: unknown })
          : {};
        const validKeys = new Set(cluster.map((page) => page.pageKey));
        const findings = (Array.isArray(parsed.contradictions) ? parsed.contradictions : [])
          .filter(
            (entry): entry is { pageA: string; claimA: string; pageB: string; claimB: string } =>
              !!entry &&
              typeof entry === "object" &&
              typeof (entry as { pageA?: unknown }).pageA === "string" &&
              typeof (entry as { claimA?: unknown }).claimA === "string" &&
              typeof (entry as { pageB?: unknown }).pageB === "string" &&
              typeof (entry as { claimB?: unknown }).claimB === "string"
          )
          .filter(
            (entry) =>
              validKeys.has(entry.pageA) && validKeys.has(entry.pageB) && entry.pageA !== entry.pageB
          )
          .slice(0, 5);
        for (const finding of findings) {
          const normalise = (value: string) =>
            value.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
          const dedupeKey = [
            "CONTRADICTION",
            [finding.pageA, finding.pageB].sort().join("|"),
            [normalise(finding.claimA), normalise(finding.claimB)].sort().join("|"),
          ].join("::");
          const wasNew = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
            companyId: args.companyId,
            kind: "CONTRADICTION",
            pageKeyA: finding.pageA,
            claimA: finding.claimA,
            pageKeyB: finding.pageB,
            claimB: finding.claimB,
            dedupeKey,
          });
          if (wasNew) raised += 1;
        }
      } catch (error) {
        console.error("The Contradiction Finder could not read a cluster; moving on", error);
      }
    }

    // Recorded whatever happened. A round that found nothing used to write
    // nothing, so an agent doing its job nightly and an agent that had never
    // once run looked identical on screen — both simply "Active".
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_CONTRADICTION_FINDER",
      companyId: args.companyId,
      trigger: "SCHEDULE",
      objective: "Read related pages together and flag claims that disagree.",
      summary:
        raised > 0 || autoResolved > 0
          ? `Raised ${raised} open questions; ${autoResolved} closed because the pages changed.`
          : "Read the related pages and found nothing that disagrees.",
      startedAt,
    });
    return { raised, autoResolved };
  },
});
