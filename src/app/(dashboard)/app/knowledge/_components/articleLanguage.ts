/**
 * An article in the reader's language (docs/plans/active/
 * knowledge-news-and-digest-plan.md, A7): Italian for an Italian reader, and
 * English otherwise — or wherever the Italian is missing, so nobody is shown a
 * blank title.
 */
export function inLanguage<Article extends { titleEn: string; titleIt: string; bodyEn?: string; bodyIt?: string }>(
  article: Article,
  locale: string,
): { title: string; body: string } {
  const italian = locale === "it";
  return {
    title: (italian && article.titleIt) || article.titleEn,
    body: (italian && article.bodyIt) || article.bodyEn || "",
  };
}
