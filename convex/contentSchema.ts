import { knowledgeArticleTables } from "./knowledgeArticlesSchema";
import { newsTables } from "./newsSchema";
import { contentTranslationTables } from "./contentTranslationSchema";
import { outboxTables } from "./outboxSchema";
import { libraryArticleTables } from "./libraryArticlesSchema";

/**
 * The tables behind Admin → Content (docs/plans/active/
 * knowledge-news-and-digest-plan.md): Knowledge, News and their machine
 * translations, and the outbox and digest as they arrive — spread into
 * `schema.ts` once, so each phase adds its tables here rather than to the
 * schema itself.
 */
export const contentTables = {
  ...knowledgeArticleTables,
  ...newsTables,
  ...contentTranslationTables,
  ...outboxTables,
  // The Library (docs/plans/active/content-library-plan.md).
  ...libraryArticleTables,
};
