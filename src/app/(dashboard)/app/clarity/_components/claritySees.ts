/**
 * The own screens of the pages the eye may name (ask-hakken-every-chart-page-plan-2026-11-03.md, checklist 3): where
 * "Do first" looks into one page, before the section's other pages. Each once, by its address. What each screen hands
 * its eye is built in `convex/utils/sees/eyeData/clarity.ts`, the same for a chat app's question.
 */
export function pageLinks(pages: ReadonlyArray<string | null | undefined>, href: (page: string) => string): Array<{ label: string; href: string }> {
  return [...new Set(pages.filter((page): page is string => Boolean(page)))].map((page) => ({ label: page, href: href(page) }));
}
