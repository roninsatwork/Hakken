"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { TRANSLATOR, parseTranslation } from "./utils/contentTranslator";
import { translatedOwnerValidator, type TranslatedOwner } from "./contentTranslationSchema";
import { LANGUAGE_NAMES, TRANSLATED_LANGUAGES, type AppLanguage } from "./utils/contentLanguages";

/**
 * The Translator's model calls (`contentTranslation.ts`), on Node as the wiki
 * staff's are: Vertex signs in with the service account only there.
 */

/** Things translated in one Run, so a backlog is worked through over several rather than in one long call. */
const RUN_LIMIT = 50;

function instructionFor(language: AppLanguage): string {
  return `Translate the values of the JSON object you are given from English into ${LANGUAGE_NAMES[language]}, for the readers of an SEO and AI search platform. Keep the meaning and the plain, friendly tone. Keep Markdown formatting, links, numbers and names (Google, YouTube, X and every product or company name) exactly as they are. An empty value stays empty. Reply with only a JSON object with exactly the same keys, and nothing else.`;
}

/** Translates one row into every language it is missing; returns how many it wrote. */
async function translateOne(ctx: ActionCtx, owner: TranslatedOwner, ownerId: string): Promise<number> {
  const source = await ctx.runQuery(internal.contentTranslation.sourceForInternal, { owner, ownerId });
  if (!source || source.missing.length === 0) return 0;
  const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "fast-chat" });
  const prompt = JSON.stringify(source.fields);
  let written = 0;
  for (const language of source.missing) {
    const response = await generateTextWithResolvedModel({
      model,
      systemInstruction: instructionFor(language),
      contents: [{ type: "text", text: prompt }],
    });
    await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
      systemKey: TRANSLATOR.systemKey,
      actionContext: `Translating ${owner} into ${LANGUAGE_NAMES[language]}`,
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? 0,
      promptContent: prompt,
      responseContent: response.text ?? "",
    });
    const fields = parseTranslation(response.text ?? "", Object.keys(source.fields));
    if (!fields) continue;
    if (await ctx.runMutation(internal.contentTranslation.saveTranslationInternal, { owner, ownerId, language, fields, sourceHash: source.hash })) written += 1;
  }
  return written;
}

/** One row, right after its English was written. Does nothing while the Translator is switched off. */
export const translateNow = internalAction({
  args: { owner: translatedOwnerValidator, ownerId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.contentTranslation.ensureTranslatorInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: TRANSLATOR.systemKey }))) return;
    await translateOne(ctx, args.owner, args.ownerId);
  },
});

/** The Run button (and a schedule): translates whatever is still missing, `RUN_LIMIT` rows at most. */
export const runTranslatorNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  handler: async (ctx, args): Promise<void> => {
    const startedAt = Date.now();
    const finish = async (status: "SUCCESS" | "FAILED", summary: string) => {
      await ctx.runMutation(internal.wikiStaff.finishStaffRunInternal, {
        runId: args.runId,
        ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
        status,
        summary,
        startedAt,
      });
    };
    try {
      const missing = await ctx.runQuery(internal.contentTranslation.missingTranslationsInternal, { limit: RUN_LIMIT });
      let written = 0;
      for (const entry of missing) written += await translateOne(ctx, entry.owner, entry.ownerId);
      await finish("SUCCESS", missing.length === 0 ? "Everything is translated." : `Translated ${written} of ${missing.length * TRANSLATED_LANGUAGES.length} missing translations.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await finish("FAILED", message.replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.");
    }
  },
});
