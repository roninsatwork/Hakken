"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  normaliseTopicSlug,
  validateRewrittenPage,
  WIKI_TOPIC_KINDS,
  type WikiTopicKind,
} from "./wikiRewriteService";

/**
 * The Filing Clerk (wiki-agents plan, phase 5 — the playbook's query rules
 * 8–9): when an answered question produced durable NEW synthesis, it is
 * filed into the wiki instead of dying in chat. The filter is strict and
 * the playbook's own: routine answers, transient status, speculation and
 * duplicates are never filed — for most answers the correct decision is
 * no. Considered only for staff conversations whose answer drew on more
 * than one wiki page, which is where cross-page synthesis can exist at all.
 */

export const considerAnswer = internalAction({
  args: {
    companyId: v.id("companies"),
    threadId: v.string(),
    question: v.string(),
    answer: v.string(),
    pageKeys: v.array(v.string()),
    /** A person pressed "Save to wiki" (one-brain-plan.md, phase 3): the
     * worthiness question is already answered, so the Clerk's filter and
     * its switch are both bypassed — the model only chooses the page and
     * writes the prose, through the same audited door. */
    vouchedByHuman: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const startedAt = Date.now();
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (
      !args.vouchedByHuman &&
      !(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_FILING_CLERK" }))
    ) {
      return;
    }

    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const decisionResponse = await generateTextWithResolvedModel({
        model,
        systemInstruction: args.vouchedByHuman
          ? "A person decided this answer must be kept in their company wiki — your job is only WHERE and WHAT, never whether. " +
            'Reply with strict JSON, nothing else: {"file": true, "kind": "PRODUCT"|"POLICY"|"ISSUE", "slug": string, "note": string} — slug names the page it belongs to (kebab-case, an existing page name where one fits), and note states what the answer establishes in two or three plain sentences, personal detail left out.'
          : "You decide whether an answered question produced durable NEW knowledge worth filing into a company wiki: a cross-page synthesis, a resolved comparison, or a durable relationship not already on the pages it used. " +
            "NEVER file routine answers, restatements of what the pages already say, transient status, speculation, or personal/customer-specific detail. For most answers the correct decision is no. " +
            'Reply with strict JSON, nothing else: {"file": boolean, "kind": "PRODUCT"|"POLICY"|"ISSUE", "slug": string, "note": string} — when file is true, slug names the page (kebab-case) and note states the durable insight in two or three plain sentences.',
        contents: [
          {
            type: "text",
            text:
              `Question: ${args.question.slice(0, 500)}\n\n` +
              `Answer given:\n${args.answer.slice(0, 3000)}\n\n` +
              `Pages the answer drew on: ${args.pageKeys.join(", ")}`,
          },
        ],
      });
      await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
        systemKey: "WIKI_FILING_CLERK",
        companyId: args.companyId,
        actionContext: "Wiki Filing: deciding whether to file",
        modelId: model.modelId,
        providerKey: model.providerKey,
        providerModelId: model.providerModelId,
        inputTokens: decisionResponse.inputTokens ?? 0,
        outputTokens: decisionResponse.outputTokens ?? 0,
        promptContent:
          `Question: ${args.question.slice(0, 500)}\n\n` +
          `Answer given:\n${args.answer.slice(0, 3000)}\n\n` +
          `Pages the answer drew on: ${args.pageKeys.join(", ")}`,
        responseContent: decisionResponse.text ?? "",
      });
      const jsonMatch = (decisionResponse.text ?? "").match(/\{[\s\S]*\}/);
      const parsed = jsonMatch
        ? (JSON.parse(jsonMatch[0]) as { file?: unknown; kind?: unknown; slug?: unknown; note?: unknown })
        : {};
      if (parsed.file !== true && !args.vouchedByHuman) return;
      if (!WIKI_TOPIC_KINDS.includes(parsed.kind as WikiTopicKind)) return;
      if (typeof parsed.slug !== "string" || typeof parsed.note !== "string") return;
      const slug = normaliseTopicSlug(parsed.slug);
      const note = parsed.note.trim();
      if (!slug || !note) return;

      const page = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
        companyId: args.companyId,
        kind: parsed.kind as WikiTopicKind,
        subjectKey: slug,
      });
      const linkableNames = (
        await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
          companyId: args.companyId,
          includeCustomerPages: false,
        })
      )
        .map((entry) => entry.key.slice(entry.key.indexOf(":") + 1))
        .filter((name) => !name.endsWith("-index"));
      const rewritePrompt = buildRewriteUserContent({
        title: slug,
        currentContent: page?.content ?? "",
        pinnedCorrections: page?.pinnedCorrections ?? [],
        eventLabel: "a durable insight from an answered question",
        eventText: note,
        otherPages: linkableNames,
      });
      const rewriteResponse = await generateTextWithResolvedModel({
        model,
        systemInstruction: buildRewriteSystemInstruction(),
        contents: [{ type: "text", text: rewritePrompt }],
      });
      await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
        systemKey: "WIKI_FILING_CLERK",
        companyId: args.companyId,
        actionContext: `Wiki Filing: writing "${slug}"`,
        modelId: model.modelId,
        providerKey: model.providerKey,
        providerModelId: model.providerModelId,
        inputTokens: rewriteResponse.inputTokens ?? 0,
        outputTokens: rewriteResponse.outputTokens ?? 0,
        promptContent: rewritePrompt,
        responseContent: rewriteResponse.text ?? "",
      });
      const verdict = validateRewrittenPage(rewriteResponse.text ?? "");
      if (!verdict.ok) return;
      await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
        companyId: args.companyId,
        kind: parsed.kind as WikiTopicKind,
        subjectKey: slug,
        title: slug,
        content: verdict.content,
        source: `CHAT:${args.threadId}`,
        sourceLabel: `Chat answer · ${args.question.slice(0, 70)}`,
      });
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_FILING_CLERK",
        companyId: args.companyId,
        trigger: "EVENT",
        objective: args.vouchedByHuman
          ? `A person saved an answer into the wiki: ${args.question.slice(0, 100)}`
          : `An answered question produced durable synthesis: ${args.question.slice(0, 100)}`,
        summary: `Filed into ${parsed.kind}:${slug} — ${note.slice(0, 140)}`,
        startedAt,
      });
    } catch (error) {
      console.error("The Filing Clerk could not consider an answer; nothing was filed", error);
    }
  },
});
