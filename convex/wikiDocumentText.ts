import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { stitchChunks } from "./wikiRewriteService";

/**
 * How much of one document the wiki reads — the whole of any real document
 * (about sixty pages). It was 8,000 characters (2026-11-12): a long
 * credentials file taught the wiki its opening and nothing else, so most of
 * the clients it named could never be answered.
 */
export const WIKI_DISTILL_TEXT_MAX_CHARS = 120_000;

/**
 * A stored chunk holds about 1,000 characters and repeats the last ~200 of
 * the one before (knowledgeActionsService.chunkKnowledgeText), so this many
 * chunks always covers `maxChars` of text.
 */
function chunksFor(maxChars: number): number {
  return Math.ceil(maxChars / 750) + 1;
}

/**
 * One document's text, as the wiki reads it everywhere — the reader, the
 * check-up's fact check and a delete's tidy-up alike (2026-11-12): its own
 * content, or its stored pieces joined back together without their repeats.
 */
export async function documentFullText(
  ctx: { db: QueryCtx["db"] },
  document: Doc<"knowledgeDocuments">,
  maxChars = WIKI_DISTILL_TEXT_MAX_CHARS
): Promise<string> {
  if (document.textContent?.trim()) return document.textContent.slice(0, maxChars);
  const chunks = await ctx.db
    .query("knowledgeChunks")
    .withIndex("by_document", (q) => q.eq("documentId", document._id))
    .take(chunksFor(maxChars));
  return stitchChunks(chunks.map((chunk) => chunk.text)).slice(0, maxChars);
}
