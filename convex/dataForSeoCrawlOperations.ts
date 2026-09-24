import type { SeoOperation } from "./dataForSeoRegistry";

/**
 * The site crawl for the Sites screens (docs/plans/active/user-sites-plan.md,
 * Phase 5): DataForSEO On-Page crawls up to a thousand of a website's pages
 * and reports its technical health — pages that do not work, missing or
 * duplicate titles, slow pages — which the Site audit page shows.
 *
 * Queued, not live: a crawl takes minutes. The task is set by the Collector,
 * and its summary collected when DataForSEO says it is done or the sweep asks
 * (`seoCollectionSweep.ts`); a summary collected while the crawl is still
 * running is left to be asked for again (`seoCollectionActions.ts`). Path and
 * fields read from DataForSEO's docs on 2026-09-23.
 *
 * Monthly: a site's build does not change daily. A thousand pages, not the
 * hundred it began with: the first test crawl (2026-09-23, $0.015) stopped at
 * exactly 100, so its audit covered only part of the site. The
 * price goes with the pages crawled, so a thousand is about $0.15 a site a
 * month — Anthony's choice, 2026-09-24 (`costBand` low; the real price is
 * recorded as each crawl is bought).
 */
export const CRAWL_OPERATIONS: readonly SeoOperation[] = [
  {
    id: "site_crawl",
    question: "How healthy is this website technically — broken pages, missing titles, slow pages?",
    family: "On-Page",
    mode: "QUEUED",
    path: "/v3/on_page/task_post",
    resultPath: "/v3/on_page/summary/$id",
    costBand: "low",
    refresh: { everyDays: 30 },
    params: {
      target: {
        kind: "host",
        required: true,
        description: "The website to crawl, as a domain — 'example.com'.",
      },
      max_crawl_pages: {
        kind: "number",
        required: false,
        description: "How many pages to crawl. Leave unset for 1,000.",
        default: 1000,
      },
    },
  },
];

/** Whether a collected crawl summary is still for a crawl in progress, and so not yet an answer. */
export function isCrawlUnfinished(operationId: string, result: unknown): boolean {
  if (operationId !== "site_crawl" || !Array.isArray(result)) return false;
  const first = result[0] as { crawl_progress?: unknown } | undefined;
  return first?.crawl_progress !== "finished";
}
