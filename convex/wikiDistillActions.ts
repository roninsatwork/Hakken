"use node";

import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  buildDocumentTopicInstruction,
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  linkKeyFor,
  parseDocumentTopicSuggestions,
  splitDocumentIntoSections,
  validateRewrittenPage,
} from "./wikiRewriteService";
import { WIKI_SOURCE_NOTE_MAX_CHARS } from "./wikiPages";

/**
 * The distiller (wiki-replaces-knowledge plan, stage one): a document in,
 * topic pages out, through the same audited rewrite landing as everything
 * else — so revisions, receipts, the pinned layer and the map all hold
 * without any machinery of their own. Two callers, no buttons: the on-ready
 * hook for every newly imported document, and the catch-up sweep that reads
 * what was imported before the wiki existed.
 */

type DistilResult = { pagesWritten: number; pagesImproved: number };

/** A failure in one short line, safe to show on the agent's run history. */
function errorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 200) || "no detail given";
}

/** What a person sees on a page's receipts: the address for a website
 * page, the title for a file or pasted text. */
function sourceLabelFor(args: { title: string; sourceUrl: string | null }): string {
  return args.sourceUrl
    ? `Website · ${args.sourceUrl.replace(/^https?:\/\//, "").slice(0, 80)}`
    : `Document · ${args.title.slice(0, 80)}`;
}

/**
 * One section of a document read into topic pages: the model names what the
 * section establishes, each topic page is rewritten from that section's own
 * words, and the topics are linked to each other and to the source note.
 */
async function distilSection(
  ctx: ActionCtx,
  args: {
    companyId: Id<"companies"> | undefined;
    documentId: string;
    title: string;
    sourceUrl: string | null;
    section: string;
    sectionIndex: number;
    sectionCount: number;
  }
): Promise<DistilResult> {
  const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    useCase: "fast-chat",
  });
  const part = args.sectionCount > 1 ? ` (part ${args.sectionIndex + 1} of ${args.sectionCount})` : "";
  const suggestionPrompt = `Document: ${args.title}${part}\n\n${args.section}`;
  const suggestionResponse = await generateTextWithResolvedModel({
    model,
    systemInstruction: buildDocumentTopicInstruction({ index: args.sectionIndex, count: args.sectionCount }),
    contents: [{ type: "text", text: suggestionPrompt }],
  });
  await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
    systemKey: "WIKI_DISTILLER",
    companyId: args.companyId,
    actionContext: `Wiki Distilling: choosing topics${part}`,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    inputTokens: suggestionResponse.inputTokens ?? 0,
    outputTokens: suggestionResponse.outputTokens ?? 0,
    promptContent: suggestionPrompt,
    responseContent: suggestionResponse.text ?? "",
  });
  // One page per subject, even when the model names it twice in a section.
  const seen = new Set<string>();
  const topics = parseDocumentTopicSuggestions(suggestionResponse.text ?? "").filter((topic) => {
    const key = linkKeyFor(topic.kind, topic.slug);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sourceLabel = sourceLabelFor(args);
  // The names the writing may [[reference]], for Obsidian-style density.
  const linkableNames = (
    await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
      companyId: args.companyId,
      includeCustomerPages: false,
    })
  )
    .map((entry) => entry.key.slice(entry.key.indexOf(":") + 1))
    .filter((name) => !name.endsWith("-index"));

  const result: DistilResult = { pagesWritten: 0, pagesImproved: 0 };
  const stillFiled = () =>
    ctx.runQuery(internal.wikiDistill.isDocumentStillFiledInternal, { documentId: args.documentId });
  for (const topic of topics) {
    // Deleted part-way through: nothing more is written for it.
    if (!(await stillFiled())) return result;
    const page = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
      companyId: args.companyId,
      kind: topic.kind,
      subjectKey: topic.slug,
    });
    const rewritePrompt = buildRewriteUserContent({
      title: topic.slug,
      currentContent: page?.content ?? "",
      pinnedCorrections: page?.pinnedCorrections ?? [],
      eventLabel: "company document",
      // The section the topic came from, not the document's opening: a
      // client named on page twelve is written from page twelve.
      eventText: `${topic.learned}\n\nFrom the document "${args.title}"${part}:\n${args.section}`,
      otherPages: linkableNames,
    });
    const rewriteResponse = await generateTextWithResolvedModel({
      model,
      systemInstruction: buildRewriteSystemInstruction(),
      contents: [{ type: "text", text: rewritePrompt }],
    });
    await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
      systemKey: "WIKI_DISTILLER",
      companyId: args.companyId,
      actionContext: `Wiki Distilling: writing "${topic.slug}"`,
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
      inputTokens: rewriteResponse.inputTokens ?? 0,
      outputTokens: rewriteResponse.outputTokens ?? 0,
      promptContent: rewritePrompt,
      responseContent: rewriteResponse.text ?? "",
    });
    const verdict = validateRewrittenPage(rewriteResponse.text ?? "");
    if (!verdict.ok) continue;
    await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
      companyId: args.companyId,
      kind: topic.kind,
      subjectKey: topic.slug,
      title: topic.slug,
      content: verdict.content,
      source: `DOCUMENT:${args.documentId}`,
      sourceLabel,
    });
    if (page) result.pagesImproved += 1;
    else result.pagesWritten += 1;
  }

  if (!(await stillFiled())) return result;
  // Topics established by the same section are related; both ends
  // recorded — and every topic links down to the source note it stands on,
  // the note up to each topic it taught (linking second, per the order).
  const sourceNoteKey = linkKeyFor("SOURCE", args.documentId);
  const topicKeys: string[] = [];
  for (const topic of topics) {
    const siblings = topics
      .filter((other) => other !== topic)
      .map((other) => linkKeyFor(other.kind, other.slug));
    topicKeys.push(linkKeyFor(topic.kind, topic.slug));
    await ctx.runMutation(internal.wikiPages.addLinksInternal, {
      companyId: args.companyId,
      kind: topic.kind,
      subjectKey: topic.slug,
      add: [...siblings, sourceNoteKey],
    });
  }
  if (topicKeys.length > 0) {
    await ctx.runMutation(internal.wikiPages.addLinksInternal, {
      companyId: args.companyId,
      kind: "SOURCE",
      subjectKey: args.documentId,
      add: topicKeys,
    });
  }
  return result;
}

/**
 * A document in, topic pages out. The full source note is filed first, then
 * the first section is read here and every later section in its own
 * scheduled step (`distilDocumentSection`), one after another — so a sixty-
 * page file is read to the end without any one step running long, and two
 * sections never rewrite the same page at once.
 */
async function distilOne(
  ctx: ActionCtx,
  args: {
    /** A company's brain, or (undefined) the global shelf. */
    companyId: Id<"companies"> | undefined;
    documentId: string;
    title: string;
    sourceUrl: string | null;
    text: string;
  }
): Promise<DistilResult & { sectionCount: number }> {
  // FULL IMPORT FIRST (the playbook's mandatory order, wiki-agents plan
  // phase 3): the document becomes its own wiki note, substantially
  // intact, before any synthesis happens. Linking and synthesis follow.
  if (!(await ctx.runQuery(internal.wikiDistill.isDocumentStillFiledInternal, { documentId: args.documentId }))) {
    return { pagesWritten: 0, pagesImproved: 0, sectionCount: 0 };
  }
  await ctx.runMutation(internal.wikiPages.upsertSourceNoteInternal, {
    companyId: args.companyId,
    documentId: args.documentId,
    title: args.title,
    text: args.text,
    sourceLabel: sourceLabelFor(args),
  });

  const sections = splitDocumentIntoSections(args.text);
  if (sections.length === 0) return { pagesWritten: 0, pagesImproved: 0, sectionCount: 0 };
  const result = await distilSection(ctx, {
    companyId: args.companyId,
    documentId: args.documentId,
    title: args.title,
    sourceUrl: args.sourceUrl,
    section: sections[0],
    sectionIndex: 0,
    sectionCount: sections.length,
  });
  if (sections.length > 1) {
    await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilDocumentSection, {
      documentId: args.documentId as Id<"knowledgeDocuments">,
      sectionIndex: 1,
      startedAt: Date.now(),
    });
  } else {
    // The list pages follow at once, not at the nightly check-up: a client
    // just learned is on the clients list the same minute. Mechanical.
    await ctx.runMutation(internal.wikiPages.refreshHubPagesInternal, { companyId: args.companyId });
    // What it now disagrees with is settled the same minute (wikiSettleOnArrival.ts).
    await ctx.scheduler.runAfter(0, internal.wikiSettleOnArrival.settleDocumentPagesInternal, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      documentId: args.documentId,
    });
  }
  // Deleted while it was being read: what was written after the delete goes.
  await ctx.runMutation(internal.wikiDistill.forgetIfDeletedInternal, {
    companyId: args.companyId,
    documentId: args.documentId,
    title: args.title,
  });
  return { ...result, sectionCount: sections.length };
}

/**
 * A later section of a long document (client-work pages, 2026-11-12). Reads
 * its own section, counts what it wrote on the progress panel, then hands on
 * to the next. A section that fails is recorded and skipped rather than
 * stopping the rest of the document; the last section records the run.
 */
export const distilDocumentSection = internalAction({
  args: {
    documentId: v.id("knowledgeDocuments"),
    sectionIndex: v.number(),
    /** When the later sections began, for the run the last one records. */
    startedAt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_DISTILLER" }))) {
      return;
    }
    const found = await ctx.runQuery(internal.wikiDistill.getDocumentSectionInternal, {
      documentId: args.documentId,
      sectionIndex: args.sectionIndex,
    });
    if (!found) return;
    const companyId = found.companyId ?? undefined;
    let result: DistilResult = { pagesWritten: 0, pagesImproved: 0 };
    let failure: string | null = null;
    try {
      result = await distilSection(ctx, {
        companyId,
        documentId: args.documentId,
        title: found.title,
        sourceUrl: found.sourceUrl,
        section: found.section,
        sectionIndex: args.sectionIndex,
        sectionCount: found.sectionCount,
      });
    } catch (error) {
      console.error("The wiki could not read one part of a document; moving on to the next", error);
      failure = errorSummary(error);
    }
    await ctx.runMutation(internal.wikiDistill.forgetIfDeletedInternal, {
      companyId,
      documentId: args.documentId,
      title: found.title,
    });
    await ctx.runMutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId,
      documentsRead: 0,
      pagesWritten: result.pagesWritten,
      pagesImproved: result.pagesImproved,
      lastDocumentTitle: found.title,
    });
    const isLast = args.sectionIndex + 1 >= found.sectionCount;
    if (isLast) {
      await ctx.runMutation(internal.wikiPages.refreshHubPagesInternal, { companyId });
      // The whole document read: what it now disagrees with is settled (wikiSettleOnArrival.ts).
      await ctx.scheduler.runAfter(0, internal.wikiSettleOnArrival.settleDocumentPagesInternal, {
        ...(companyId ? { companyId } : {}),
        documentId: args.documentId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilDocumentSection, {
        documentId: args.documentId,
        sectionIndex: args.sectionIndex + 1,
        startedAt: args.startedAt,
      });
    }
    if (failure || isLast) {
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_DISTILLER",
        companyId,
        trigger: "EVENT",
        objective: `Reading the rest of a long document: ${found.title.slice(0, 120)}`,
        summary: failure
          ? `Part ${args.sectionIndex + 1} of ${found.sectionCount} failed — ${failure}. The other parts are still read.`
          : `Finished all ${found.sectionCount} parts.`,
        startedAt: args.startedAt,
      });
    }
  },
});

/**
 * The one-time catch-up for phase 3: documents distilled before the
 * source-note layer existed get their full notes retroactively, linked to
 * the synthesis pages their receipts already name. Mechanical — no model
 * calls — and idempotent, so re-running costs nothing.
 */
export const backfillSourceNotes = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<{ notes: number }> => {
    const batch = await ctx.runQuery(internal.wikiDistill.getDistilledDocumentsInternal, {
      companyId: args.companyId,
    });
    let notes = 0;
    for (const document of batch) {
      if (!document.text.trim()) continue;
      await ctx.runMutation(internal.wikiPages.upsertSourceNoteInternal, {
        companyId: args.companyId,
        documentId: document.documentId,
        title: document.title,
        text: document.text,
        sourceLabel: document.sourceUrl
          ? `Website · ${document.sourceUrl.replace(/^https?:\/\//, "").slice(0, 80)}`
          : `Document · ${document.title.slice(0, 80)}`,
      });
      await ctx.runMutation(internal.wikiPages.linkSourceNoteToTaughtPagesInternal, {
        companyId: args.companyId,
        documentId: document.documentId,
      });
      notes += 1;
    }
    return { notes };
  },
});

/**
 * A re-ingested document the wiki has already read refreshes its SOURCE
 * page (watch-it-think plan, phase 2): new text filed as a revision
 * through the existing mechanical door, links re-synced, no model
 * anywhere. The Distiller's read-once claim stays untouched — synthesis
 * ran once; the full-import layer simply follows its original.
 */
export const refreshSourceNote = internalAction({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<void> => {
    const document = await ctx.runQuery(internal.wikiDistill.getRefreshableDocumentInternal, {
      documentId: args.documentId,
    });
    if (!document) return;
    // The words before the refresh, so the pages this document taught can be
    // brought in line with what changed (wiki-daily-checkup-plan.md, "a file
    // changed"). Synthesis is no longer read-once: a changed source changes
    // the topic pages it fed, the same night.
    const before = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
      companyId: document.companyId ?? undefined,
      kind: "SOURCE",
      subjectKey: args.documentId,
    });
    await ctx.runMutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId: document.companyId ?? undefined,
      documentId: args.documentId,
      title: document.title,
      text: document.text,
      sourceLabel: document.sourceUrl
        ? `Website · ${document.sourceUrl.replace(/^https?:\/\//, "").slice(0, 80)}`
        : `Document · ${document.title.slice(0, 80)}`,
    });
    await ctx.runMutation(internal.wikiPages.linkSourceNoteToTaughtPagesInternal, {
      companyId: document.companyId ?? undefined,
      documentId: args.documentId,
    });
    const after = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
      companyId: document.companyId ?? undefined,
      kind: "SOURCE",
      subjectKey: args.documentId,
    });
    // Longer than the note holds: what changed past it is reached by
    // reading the whole document again (2026-11-12).
    const changed = !before || !after || before.content.trim() !== after.content.trim();
    if (changed && document.text.length > WIKI_SOURCE_NOTE_MAX_CHARS) {
      await ctx.runMutation(internal.wikiDistill.rereadChangedDocumentInternal, { documentId: args.documentId });
    }
    if (before && after && before.content.trim() !== after.content.trim()) {
      await ctx.runMutation(internal.wikiCheckupPages.recordSourceChangeInternal, {
        companyId: document.companyId ?? undefined,
        documentId: args.documentId,
        kind: "CHANGED",
        title: document.title,
        oldContent: before.content,
        newContent: after.content,
      });
    }
  },
});

/** The on-ready hook: a document that just finished importing teaches the
 * wiki by itself. Scheduled from the ingestion landing in knowledge.ts. */
export const distilNewDocument = internalAction({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<void> => {
    const hookStartedAt = Date.now();
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_DISTILLER" }))) {
      return;
    }
    // Claimed before read: the sweep and this hook can never double-spend.
    const document = await ctx.runMutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId: args.documentId,
    });
    if (!document) return;
    let result: DistilResult & { sectionCount: number } = { pagesWritten: 0, pagesImproved: 0, sectionCount: 0 };
    try {
      result = await distilOne(ctx, {
        companyId: document.companyId ?? undefined,
        documentId: args.documentId,
        title: document.title,
        sourceUrl: document.sourceUrl,
        text: document.text,
      });
    } catch (error) {
      console.error("The wiki could not learn from a new document; the library still has it", error);
      // The claim goes back, so the catch-up sweep tries this document
      // again rather than leaving it filed and permanently unanswerable.
      const { released, attempts } = await ctx.runMutation(
        internal.wikiDistill.releaseDistillClaimInternal,
        { documentId: args.documentId }
      );
      // Recorded as a run either way. A failing Distiller used to write
      // nothing anywhere, so an agent that had never once succeeded still
      // showed "Active" with an empty history and looked merely idle.
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_DISTILLER",
        companyId: document.companyId ?? undefined,
        trigger: "EVENT",
        objective: `A document finished importing: ${document.title.slice(0, 120)}`,
        summary: released
          ? `Failed on attempt ${attempts} — ${errorSummary(error)}. The document goes back in the queue.`
          : `Failed on attempt ${attempts} — ${errorSummary(error)}. Given up on; it will not be read again.`,
        startedAt: hookStartedAt,
      });
      return;
    }
    await ctx.runMutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId: document.companyId ?? undefined,
      documentsRead: 1,
      pagesWritten: result.pagesWritten,
      pagesImproved: result.pagesImproved,
      lastDocumentTitle: document.title,
    });
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_DISTILLER",
      companyId: document.companyId ?? undefined,
      trigger: "EVENT",
      objective: `A document finished importing: ${document.title.slice(0, 120)}`,
      summary:
        result.sectionCount > 1
          ? `Read part 1 of ${result.sectionCount}: wrote ${result.pagesWritten} pages, improved ${result.pagesImproved}, plus the full source note. The other parts follow.`
          : `Wrote ${result.pagesWritten} pages, improved ${result.pagesImproved}, plus the full source note.`,
      startedAt: hookStartedAt,
    });
  },
});

/** The catch-up sweep: reads what was imported before the wiki existed, a
 * few documents per company per tick, until nothing is left behind. */
export const distilSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    // The staff exist before they work, and a stood-down Distiller spends
    // nothing (wiki-agents plan, phase 0).
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_DISTILLER" }))) {
      return { companies: 0 };
    }
    const companies = await ctx.runQuery(internal.wikiDistill.listCompaniesWithUndistilledInternal, {});
    for (const companyId of companies) {
      await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilCompanyBatch, { companyId });
    }
    // The global shelf's round (global-wiki-plan.md, phase 4): same batch
    // worker, no company on it. An empty shelf schedules nothing.
    const globalRound = await ctx.runQuery(internal.wikiDistill.hasGlobalUndistilledInternal, {});
    if (globalRound) {
      await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilCompanyBatch, {});
    }
    return { companies: companies.length + (globalRound ? 1 : 0) };
  },
});

export const distilCompanyBatch = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<void> => {
    const batchStartedAt = Date.now();
    const batch = await ctx.runMutation(internal.wikiDistill.claimNextDistillBatchInternal, {
      companyId: args.companyId,
    });
    if (batch.length === 0) return;

    let documentsRead = 0;
    let pagesWritten = 0;
    let pagesImproved = 0;
    let lastDocumentTitle: string | undefined;
    for (const document of batch) {
      if (!document.text.trim()) continue; // marked below; nothing to read
      documentsRead += 1;
      lastDocumentTitle = document.title;
      try {
        const result = await distilOne(ctx, {
          companyId: args.companyId,
          documentId: document.documentId,
          title: document.title,
          sourceUrl: document.sourceUrl,
          text: document.text,
        });
        pagesWritten += result.pagesWritten;
        pagesImproved += result.pagesImproved;
      } catch (error) {
        console.error("The wiki could not learn from a document; moving on", error);
      }
    }

    await ctx.runMutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId: args.companyId,
      documentsRead,
      pagesWritten,
      pagesImproved,
      ...(lastDocumentTitle ? { lastDocumentTitle } : {}),
    });
    // Recorded whatever happened, so an empty backlog reads as an empty
    // backlog rather than as an agent that never ran.
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_DISTILLER",
      companyId: args.companyId,
      trigger: "SCHEDULE",
      objective: "Catch-up: read imported documents the wiki has not learned from yet.",
      summary:
        documentsRead > 0
          ? `Read ${documentsRead} documents; wrote ${pagesWritten} pages, improved ${pagesImproved}.`
          : "No documents were waiting to be read.",
      startedAt: batchStartedAt,
    });

    // More to do? The next batch schedules itself, so an import of any size
    // finishes without anyone watching it.
    await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilCompanyBatch, {
      companyId: args.companyId,
    });
  },
});
