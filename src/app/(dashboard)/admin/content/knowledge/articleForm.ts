import type { KnowledgeStatus } from "@/convex/knowledgeArticlesSchema";

/** What the article editor holds: both languages and whether it is published. */
export type ArticleForm = { titleEn: string; bodyEn: string; titleIt: string; bodyIt: string; status: KnowledgeStatus };

export const EMPTY_ARTICLE: ArticleForm = { titleEn: "", bodyEn: "", titleIt: "", bodyIt: "", status: "DRAFT" };
