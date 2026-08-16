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
    // The staff exist before they work; a stood-down Tidier spends nothing
    // (wiki-agents plan, phase 0).
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_TIDIER" }))) {
      return { companies: 0 };
    }
    const companies = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    let visited = 0;
    for (const scope of companies) {
      // Only gardens with weeds get a visit: a brain whose pages are all
      // tidy and correctly linked costs nothing tonight — and a scheduler
      // asked to drain (as the tests do) genuinely drains. `null` is the
      // global shelf's round (global-wiki-plan.md, phase 4).
      const companyId = scope ?? undefined;
      const candidates = await ctx.runQuery(internal.wikiTending.getTendingCandidatesInternal, {
        companyId,
      });
      if (candidates.linkRepairs.length === 0 && candidates.overgrown.length === 0) continue;
      await ctx.scheduler.runAfter(0, internal.wikiTendingActions.tendCompany, { companyId });
      visited += 1;
    }
    return { companies: visited };
  },
});

/**
 * The catch-up linker (Anthony's Obsidian steer, 2026-08-15): pages with
 * fewer than three connections get read against the index, and the model
 * names their genuinely related pages — metadata both ways, no text churn.
 * Future prose weaves its own [[references]]; this pass exists so the graph
 * is dense today rather than in a month. Chains itself until nothing is
 * sparse, then refreshes the hub index pages.
 */
export const crossLinkSweep = internalAction({
  args: { companyId: v.optional(v.id("companies")), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ linked: number }> => {
    const passStartedAt = Date.now();
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_LINKER" }))) {
      return { linked: 0 };
    }
    const sparse = await ctx.runQuery(internal.wikiPages.listSparselyLinkedTopicsInternal, {
      companyId: args.companyId,
      limit: args.limit ?? 20,
    });
    if (sparse.length === 0) {
      await ctx.runMutation(internal.wikiPages.refreshHubPagesInternal, { companyId: args.companyId });
      return { linked: 0 };
    }
    const index = await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
      companyId: args.companyId,
      includeCustomerPages: false,
    });
    const names = index
      .map((entry) => entry.key.slice(entry.key.indexOf(":") + 1))
      .filter((name) => !name.endsWith("-index"));

    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
    });
    let linked = 0;
    for (const page of sparse) {
      try {
        const response = await generateTextWithResolvedModel({
          model,
          systemInstruction:
            'You connect one wiki page to its genuinely related pages. Reply with strict JSON, nothing else: {"related": [string]} — two to five names exactly as they appear in the list, best first. Related means a reader of this page would plausibly open that one next.',
          contents: [
            {
              type: "text",
              text:
                `Page "${page.subjectKey}":\n${page.excerpt}\n\n` +
                `All page names:\n${names.join(", ")}`,
            },
          ],
        });
        const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { related?: unknown }) : {};
        const related = (Array.isArray(parsed.related) ? parsed.related : [])
          .filter((name): name is string => typeof name === "string" && names.includes(name))
          .filter((name) => name !== page.subjectKey)
          .slice(0, 5);
        for (const name of related) {
          const target = index.find(
            (entry) => entry.key.slice(entry.key.indexOf(":") + 1) === name
          );
          if (!target) continue;
          await ctx.runMutation(internal.wikiPages.addLinksInternal, {
            companyId: args.companyId,
            kind: page.kind as "PRODUCT" | "POLICY" | "ISSUE",
            subjectKey: page.subjectKey,
            add: [target.key],
          });
          const targetKind = target.key.slice(0, target.key.indexOf(":"));
          await ctx.runMutation(internal.wikiPages.addLinksInternal, {
            companyId: args.companyId,
            kind: targetKind as "PRODUCT" | "POLICY" | "ISSUE",
            subjectKey: name,
            add: [`${page.kind}:${page.subjectKey}`],
          });
          linked += 1;
        }
      } catch (error) {
        console.error("Cross-linking could not read a page; moving on", error);
      }
    }
    if (linked > 0) {
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_LINKER",
        companyId: args.companyId,
        trigger: "SCHEDULE",
        objective: "Connect sparsely linked pages to their related pages.",
        summary: `Added ${linked} connections between related pages.`,
        startedAt: passStartedAt,
      });
      // More sparse pages may remain past the limit; keep going while the
      // passes make progress. A pass that linked nothing stops the chain —
      // a page the model cannot relate to anything must not loop forever.
      await ctx.scheduler.runAfter(0, internal.wikiTendingActions.crossLinkSweep, {
        companyId: args.companyId,
        limit: args.limit,
      });
    } else {
      await ctx.runMutation(internal.wikiPages.refreshHubPagesInternal, { companyId: args.companyId });
    }
    return { linked };
  },
});

export const tendCompany = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<{ repairedLinks: number; tidiedPages: number }> => {
    const visitStartedAt = Date.now();
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

    if (repairedLinks > 0 || tidiedPages > 0) {
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_TIDIER",
        companyId: args.companyId,
        trigger: "SCHEDULE",
        objective: "Nightly tending: tidy overgrown pages and repair links.",
        summary: `Repaired ${repairedLinks} pages' links; tidied ${tidiedPages} overgrown pages.`,
        startedAt: visitStartedAt,
      });
    }
    return { repairedLinks, tidiedPages };
  },
});
