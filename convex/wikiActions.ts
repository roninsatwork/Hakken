"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  buildTopicSuggestionInstruction,
  linkKeyFor,
  parseTopicSuggestions,
  validateRewrittenPage,
} from "./wikiRewriteService";

/**
 * How a question chooses its pages (wiki-replaces-knowledge, stage two):
 * the model reads the index — every page's name and first line — and names
 * the pages that answer, which are then opened whole with one hop. This is
 * Karpathy's navigation, not similarity search: the chooser sees names and
 * purposes, never fragments. The mechanical word-match is the fallback when
 * the model call dies, so a provider outage degrades rather than silences.
 */
export const selectWikiContextForQuery = internalAction({
  args: {
    companyId: v.id("companies"),
    query: v.string(),
    includeCustomerPages: v.boolean(),
    maxChars: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ context: string; pageKeys: string[] }> => {
    const index = await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
      companyId: args.companyId,
      includeCustomerPages: args.includeCustomerPages,
      // Synthesis first (the playbook's query order): the chooser picks
      // from the tended pages. Fine print arrives through the hop — chosen
      // pages link down to their source notes, and the reader follows.
      // Offering all the source notes here was tried and measurably
      // diluted the choosing (exam 16→14, 2026-08-15); do not repeat it.
      includeSourceNotes: false,
    });
    if (index.length === 0) return { context: "", pageKeys: [] };

    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          'You are the index reader of a company wiki. Given a question and the index, name the pages that would answer it. Reply with strict JSON, nothing else: {"pages": [string]} — up to 4 page keys exactly as written in the index, best first. An empty list means the wiki does not cover it.',
        contents: [
          {
            type: "text",
            text:
              `Question: ${args.query.slice(0, 400)}\n\nIndex:\n` +
              index.map((entry) => `${entry.key} — ${entry.hint}`).join("\n"),
          },
        ],
      });
      const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { pages?: unknown }) : {};
      const valid = new Set(index.map((entry) => entry.key));
      const keys = (Array.isArray(parsed.pages) ? parsed.pages : [])
        .filter((key): key is string => typeof key === "string" && valid.has(key))
        .slice(0, 4);
      if (keys.length > 0) {
        return await ctx.runQuery(internal.wikiPages.getPagesByKeysInternal, {
          companyId: args.companyId,
          keys,
          includeCustomerPages: args.includeCustomerPages,
          ...(args.maxChars !== undefined ? { maxChars: args.maxChars } : {}),
        });
      }
      // The model read the index and found nothing: believe it.
      return { context: "", pageKeys: [] };
    } catch (error) {
      console.error("Wiki index reading failed; falling back to word match", error);
      return await ctx.runQuery(internal.wikiPages.getWikiAnswerContextInternal, {
        companyId: args.companyId,
        query: args.query,
        includeCustomerPages: args.includeCustomerPages,
        ...(args.maxChars !== undefined ? { maxChars: args.maxChars } : {}),
      });
    }
  },
});

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
    /** What the page's source list shows for this event. */
    sourceLabel: v.optional(v.string()),
    eventText: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const page = await ctx.runQuery(internal.wikiPages.getCustomerPageInternal, {
      companyId: args.companyId,
      subjectKey: args.subjectKey,
    });

    const title = page?.title ?? args.subjectKey;
    // The names the writing may [[reference]] — how the graph gets its
    // Obsidian density (topic pages only; customers are never woven).
    const linkableNames = (
      await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
        companyId: args.companyId,
        includeCustomerPages: false,
      })
    )
      .map((entry) => entry.key.slice(entry.key.indexOf(":") + 1))
      .filter((name) => !name.endsWith("-index"));
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
              otherPages: linkableNames,
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
      ...(args.sourceLabel ? { sourceLabel: args.sourceLabel } : {}),
    });

    // What the conversation taught about the COMPANY, beyond the customer
    // (wiki plan, phase 5): the model may name up to two topics — a product,
    // a policy, a recurring issue. Each topic page learns, and both ends of
    // the link are recorded so the map can draw them. Fail-open throughout.
    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const suggestionResponse = await generateTextWithResolvedModel({
        model,
        systemInstruction: buildTopicSuggestionInstruction(),
        contents: [{ type: "text", text: args.eventText.slice(0, 8000) }],
      });
      const topics = parseTopicSuggestions(suggestionResponse.text ?? "");

      for (const topic of topics) {
        const topicPage = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
          companyId: args.companyId,
          kind: topic.kind,
          subjectKey: topic.slug,
        });
        const topicResponse = await generateTextWithResolvedModel({
          model,
          systemInstruction: buildRewriteSystemInstruction(),
          contents: [
            {
              type: "text",
              text: buildRewriteUserContent({
                title: topic.slug,
                currentContent: topicPage?.content ?? "",
                pinnedCorrections: topicPage?.pinnedCorrections ?? [],
                eventLabel: args.eventLabel,
                eventText: `${topic.learned}\n\n${args.eventText.slice(0, 4000)}`,
                otherPages: linkableNames,
              }),
            },
          ],
        });
        const topicVerdict = validateRewrittenPage(topicResponse.text ?? "");
        if (!topicVerdict.ok) continue;
        await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
          companyId: args.companyId,
          kind: topic.kind,
          subjectKey: topic.slug,
          title: topic.slug,
          content: topicVerdict.content,
          source: args.source,
          ...(args.sourceLabel ? { sourceLabel: args.sourceLabel } : {}),
        });
        await ctx.runMutation(internal.wikiPages.addLinksInternal, {
          companyId: args.companyId,
          kind: "CUSTOMER",
          subjectKey: args.subjectKey,
          add: [linkKeyFor(topic.kind, topic.slug)],
        });
        await ctx.runMutation(internal.wikiPages.addLinksInternal, {
          companyId: args.companyId,
          kind: topic.kind,
          subjectKey: topic.slug,
          add: [linkKeyFor("CUSTOMER", args.subjectKey)],
        });
      }
    } catch (error) {
      console.error("Wiki topic learning failed; the customer page still stands", error);
    }
  },
});
