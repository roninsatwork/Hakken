"use node";

import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { superAdminAction } from "./tenantFunctions";
import { parseTranslation } from "./utils/contentTranslator";
import { LIBRARY_MAX_MEANING_LENGTH, LIBRARY_MAX_SUMMARY_LENGTH } from "./utils/libraryPage";

/**
 * What readers see of a Helpful content article (docs/plans/active/insights-
 * helpful-content-plan.md, IH1, IH2): Hakken's own summary and what it means
 * for someone who runs a website, written by a model from the article's words
 * — never a copy of them. The admin's editor asks for it once a page is read,
 * and again on Write again; nothing is stored here, the admin saves it. On
 * Node, because the model's provider signs in only there.
 *
 * The model is the News Collector agent's (`writerModelInternal`), and each
 * call's cost goes on that agent, as its News summaries' do.
 */

/** The article's opening the model reads: enough for any article to be summed up, with a ceiling on cost. */
const WORDS_READ = 30_000;
/** The agent whose model and cost ledger the writer shares. */
const COLLECTOR_ROLE = "NEWS_COLLECTOR";

const WRITER_INSTRUCTIONS = [
  "You write for the readers of an SEO and AI search platform for people who run websites.",
  "You are given an article from another website: its title, its publication and its words.",
  `Write, in your own words and plain English: "summary" — two or three sentences on what the article says, at most ${LIBRARY_MAX_SUMMARY_LENGTH} characters;`,
  `and "meaning" — one or two sentences on what it means for someone who runs a website, what to do or watch, at most ${LIBRARY_MAX_MEANING_LENGTH} characters, or "" when there is nothing for them.`,
  "Never copy or quote the article's sentences: it is someone else's writing, and readers open the original to read it.",
  'Reply with only a JSON object with the two string keys "summary" and "meaning", and nothing else.',
].join(" ");

const writtenValidator = v.union(
  v.object({ status: v.literal("written"), summary: v.string(), meaning: v.string() }),
  /** No words to write from, or the model gave nothing usable. */
  v.object({ status: v.literal("failed"), why: v.union(v.literal("no_words"), v.literal("model")) }),
);
type Written = Infer<typeof writtenValidator>;

async function write(ctx: ActionCtx, article: { title: string; publication: string; body: string }): Promise<Written> {
  const body = article.body.trim();
  if (!body) return { status: "failed", why: "no_words" };
  const { requestedModelId } = await ctx.runQuery(internal.libraryArticles.writerModelInternal, {});
  const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    ...(requestedModelId ? { requestedModelId } : {}),
    useCase: "agent",
  });
  const prompt = JSON.stringify({ title: article.title, publication: article.publication, words: body.slice(0, WORDS_READ) });
  const response = await generateTextWithResolvedModel({ model, systemInstruction: WRITER_INSTRUCTIONS, contents: [{ type: "text", text: prompt }] });
  await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
    systemKey: COLLECTOR_ROLE,
    actionContext: `Writing what readers see of "${article.title.slice(0, 80)}" (Helpful content)`,
    modelId: model.modelId,
    ...(model.providerKey ? { providerKey: model.providerKey } : {}),
    ...(model.providerModelId ? { providerModelId: model.providerModelId } : {}),
    inputTokens: response.inputTokens ?? 0,
    outputTokens: response.outputTokens ?? 0,
    promptContent: prompt.slice(0, 2000),
    responseContent: response.text ?? "",
  });
  const written = parseTranslation(response.text ?? "", ["summary", "meaning"]);
  const summary = written?.summary.trim().slice(0, LIBRARY_MAX_SUMMARY_LENGTH) ?? "";
  if (!summary) return { status: "failed", why: "model" };
  return { status: "written", summary, meaning: (written?.meaning ?? "").trim().slice(0, LIBRARY_MAX_MEANING_LENGTH) };
}

/** For the admin's editor: once a page is read, and on Write again. Nothing is stored until the article is saved. */
export const writeForReaders = superAdminAction({
  args: { title: v.string(), publication: v.string(), body: v.string() },
  returns: writtenValidator,
  handler: async (ctx, args): Promise<Written> => await write(ctx, args),
});

/** Catches up published articles that have no summary yet — the one already on dev when this arrived. Run by hand. */
export const writeMissingInternal = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ written: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const missing = await ctx.runQuery(internal.libraryArticles.missingReaderWordsInternal, { limit: args.limit ?? 20 });
    let written = 0;
    let failed = 0;
    for (const article of missing) {
      const result = await write(ctx, article);
      if (result.status === "written"
        && (await ctx.runMutation(internal.libraryArticles.saveReaderWordsInternal, { articleId: article.articleId, summaryEn: result.summary, meaningEn: result.meaning }))) {
        written += 1;
      } else {
        failed += 1;
      }
    }
    return { written, failed };
  },
});
