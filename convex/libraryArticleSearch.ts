import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

/**
 * What Ask Hakken reads from Helpful content for a question, typed or spoken
 * (docs/plans/active/insights-helpful-content-plan.md, IH9): sections found by
 * meaning — the question's embedding against each section's — and by words,
 * at most three, each headed with its article (`searchLibraryInternal`). The
 * question is embedded once, by the caller, for every search of the turn.
 */

/** Sections read from the search by meaning before the closest are kept. */
const SEARCHED_BY_MEANING = 8;
/**
 * How close a section must be to count as about the question, on the
 * embedding's own scale (cosine, 1 is the same meaning). Below it, a section
 * is a neighbour in topic only; the search by words still finds it if it
 * names the question's own terms.
 */
export const LIBRARY_MIN_SIMILARITY = 0.65;

export async function searchHelpfulContent(
  ctx: ActionCtx,
  args: { question: string; embedded: { vector: number[]; modelId: string } | null },
): Promise<Array<{ articleId: Id<"libraryArticles">; text: string }>> {
  let byMeaning: Id<"libraryArticleSections">[] = [];
  if (args.embedded) {
    const matches = await ctx.vectorSearch("libraryArticleSections", "by_embedding", { vector: args.embedded.vector, limit: SEARCHED_BY_MEANING });
    byMeaning = matches.filter((match) => match._score >= LIBRARY_MIN_SIMILARITY).map((match) => match._id);
  }
  return await ctx.runQuery(internal.libraryArticles.searchLibraryInternal, {
    question: args.question.slice(0, 500),
    byMeaning,
    ...(args.embedded ? { embeddingModelId: args.embedded.modelId } : {}),
  });
}
