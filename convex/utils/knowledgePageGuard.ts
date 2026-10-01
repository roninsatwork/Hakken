import type { Doc } from "../_generated/dataModel";
import { appError } from "./appError";

/**
 * A wiki page that is a Knowledge article's copy (`knowledgeArticleWiki.ts`):
 * a person's writing, changed only in Admin → Content → Knowledge. The wiki
 * staff leave it alone and the Platform Wiki screen does not change it
 * (docs/plans/active/knowledge-news-and-digest-plan.md, phase 2).
 */

/** What the Platform Wiki screen says when asked to change a Knowledge page. */
export const KNOWLEDGE_PAGE_REFUSAL = "This page is a Knowledge article. Change it in Admin → Content → Knowledge.";

/** Whether a wiki page is a Knowledge article's copy. */
export function isKnowledgeArticlePage(page: Pick<Doc<"wikiPages">, "knowledgeArticleId">): boolean {
  return page.knowledgeArticleId !== undefined;
}

/** Refuses an edit, pin or delete made on the wiki rather than on the article. */
export function assertNotKnowledgeArticlePage(page: Pick<Doc<"wikiPages">, "knowledgeArticleId">): void {
  if (isKnowledgeArticlePage(page)) throw appError("INVALID_INPUT", KNOWLEDGE_PAGE_REFUSAL);
}
