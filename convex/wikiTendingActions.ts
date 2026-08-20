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
    const tidierActive = await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, {
      systemKey: "WIKI_TIDIER",
    });
    // The Linker's round covers every wiki on the platform, each one its own
    // separate brain (Anthony, 2026-08-20: *"the wikis are all separate and
    // independent"*). Kept beside the Tidier's round rather than inside it,
    // so pressing Run on the Linker does exactly what the night does.
    await ctx.scheduler.runAfter(0, internal.wikiTendingActions.linkDispatcher, {});

    const companies = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    let visited = 0;
    for (const scope of companies) {
      const companyId = scope ?? undefined;

      // Only gardens with weeds get a visit: a brain whose pages are all
      // tidy and correctly linked costs nothing tonight — and a scheduler
      // asked to drain (as the tests do) genuinely drains. `null` is the
      // global shelf's round (global-wiki-plan.md, phase 4).
      if (!tidierActive) continue;
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
 * One linking round over every wiki on the platform.
 *
 * `crossLinkSweep` had no caller at all — the only reference to it anywhere
 * was its own chaining line — so after the single manual run that seeded the
 * graph on 2026-08-15 it never ran again. Every link on the map since then
 * came from the Distiller, which only ever joins a document to the topics it
 * taught. That is why the map is pairs and small islands with nothing
 * between them: nothing was building bridges (Anthony, 2026-08-20).
 *
 * Each company's wiki is its own separate brain, so the round visits them
 * one at a time. Cheap for a quiet wiki — the sweep reads its two candidate
 * lists and returns before touching a model when both are empty — and the
 * sweep checks the Linker's own switch, so a stood-down Linker spends
 * nothing anywhere.
 */
export const linkDispatcher = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_LINKER" }))) {
      return { companies: 0 };
    }
    const companies = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    for (const scope of companies) {
      await ctx.scheduler.runAfter(0, internal.wikiTendingActions.crossLinkSweep, {
        companyId: scope ?? undefined,
      });
    }
    return { companies: companies.length };
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
    // Orphan source documents join the round (Anthony's steer, 2026-08-16:
    // "we should not have any orphans"): a page that taught no topics still
    // gets read against the index and connected where a genuine relative
    // exists. One that relates to nothing stays honestly alone — and rests
    // a week before being asked again.
    const orphans = await ctx.runQuery(internal.wikiPages.listOrphanSourceNotesInternal, {
      companyId: args.companyId,
      limit: 10,
    });
    if (sparse.length === 0 && orphans.length === 0) {
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
    for (const page of [...sparse, ...orphans]) {
      try {
        const prompt =
          `Page "${page.subjectKey}":\n${page.excerpt}\n\n` +
          `All page names:\n${names.join(", ")}`;
        const response = await generateTextWithResolvedModel({
          model,
          systemInstruction:
            'You connect one wiki page to its genuinely related pages. Reply with strict JSON, nothing else: {"related": [string]} — up to five names exactly as they appear in the list, best first. Related means a reader of this page would plausibly open that one next. Never force a connection: if nothing in the list is genuinely related, reply {"related": []}.',
          contents: [{ type: "text", text: prompt }],
        });
        await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
          systemKey: "WIKI_LINKER",
          companyId: args.companyId,
          actionContext: "Wiki Linking Round",
          modelId: model.modelId,
          providerKey: model.providerKey,
          providerModelId: model.providerModelId,
          inputTokens: response.inputTokens ?? 0,
          outputTokens: response.outputTokens ?? 0,
          promptContent: prompt,
          responseContent: response.text ?? "",
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
            kind: page.kind as "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE",
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
        // Visited, whatever the outcome: an unrelatable page rests a week
        // instead of costing a model call every night for ever. Every kind
        // rests, not only the orphan notes — topic pages are now re-read
        // until they have real bridges, and without a rest a page nothing
        // relates to would be asked about nightly for ever.
        const visited = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
          companyId: args.companyId,
          kind: page.kind as "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE",
          subjectKey: page.subjectKey,
        });
        if (visited) {
          await ctx.runMutation(internal.wikiTending.markTendedInternal, {
            pageId: visited._id,
          });
        }
      } catch (error) {
        console.error("Cross-linking could not read a page; moving on", error);
      }
    }
    // Recorded whatever happened. A pass that read pages and connected none
    // of them is a real result — and recording only the productive passes is
    // why a Linker that had never once succeeded showed an empty history and
    // read as an agent that never ran.
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_LINKER",
      companyId: args.companyId,
      trigger: "SCHEDULE",
      objective: "Connect sparsely linked pages to their related pages.",
      summary:
        linked > 0
          ? `Added ${linked} connections between related pages.`
          : `Read ${sparse.length + orphans.length} pages and found nothing genuinely related to connect.`,
      startedAt: passStartedAt,
    });
    if (linked > 0) {
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
        const prompt =
          `Customer: ${page.title}\n\n` +
          (page.pinnedCorrections.length
            ? `Pinned corrections from staff (ground truth, do not contradict, do not repeat):\n${page.pinnedCorrections
                .map((correction) => `- ${correction.text}`)
                .join("\n")}\n\n`
            : "") +
          `The page as it stands:\n${page.content}`;
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
          contents: [{ type: "text", text: prompt }],
        });
        await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
          systemKey: "WIKI_TIDIER",
          companyId: args.companyId,
          actionContext: "Wiki Tidying Round",
          modelId: model.modelId,
          providerKey: model.providerKey,
          providerModelId: model.providerModelId,
          inputTokens: response.inputTokens ?? 0,
          outputTokens: response.outputTokens ?? 0,
          promptContent: prompt,
          responseContent: response.text ?? "",
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

    // Recorded whatever happened: a quiet night is a result, and silence
    // was indistinguishable from an agent that had never run.
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_TIDIER",
      companyId: args.companyId,
      trigger: "SCHEDULE",
      objective: "Nightly tending: tidy overgrown pages and repair links.",
      summary:
        repairedLinks > 0 || tidiedPages > 0
          ? `Repaired ${repairedLinks} pages' links; tidied ${tidiedPages} overgrown pages.`
          : "Nothing needed tidying and no links were broken.",
      startedAt: visitStartedAt,
    });
    return { repairedLinks, tidiedPages };
  },
});
