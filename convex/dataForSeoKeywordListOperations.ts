import type { SeoOperation } from "./dataForSeoRegistry";

/**
 * Every keyword a website ranks for, up to its limit — its own, else its
 * company's (`companyDataLimits.ts`) — refreshed weekly.
 *
 * Anthony, 2026-09-24: "I think we need to store whatever we can please, then
 * we can fully evaluate the screens to see what is useful and what we keep."
 * The everyday ranked-keywords call (`domain_ranked_keywords`) returns a
 * site's first hundred searches with the site's totals; the totals are
 * complete, the list is not, so "250 new keywords" could not be opened. This
 * is the list: DataForSEO's same endpoint, asked for a thousand rows a
 * request, the ones bringing the most visits first, in as many requests as
 * the website's limit allows (`listPages` in `sitePagedLists.ts`).
 *
 * **Every kind of row.** Besides the organic places, it asks for the site's
 * appearances in AI Overviews, featured snippets and map packs, which are
 * filed apart (`siteKeywordFeatures`) — never read as rankings. Adverts stay
 * with the everyday call, which files them.
 *
 * Priced by DataForSEO at $0.012 a request plus $0.00012 a row returned, read
 * from their pricing page on 2026-09-24 and matching what we were charged; a
 * site with fewer keywords than the limit costs only the rows it has.
 */

export const KEYWORD_LIST_OPERATION_ID = "domain_ranked_keywords_list";

/** The most rows DataForSEO returns in one ranked-keywords request. */
export const KEYWORD_LIST_PAGE = 1_000;

/** The row kinds asked for: every place the site can appear on a results page, except adverts. */
export const KEYWORD_LIST_ITEM_TYPES = ["organic", "featured_snippet", "local_pack", "ai_overview_reference"] as const;

export const KEYWORD_LIST_OPERATIONS: readonly SeoOperation[] = [
  {
    id: KEYWORD_LIST_OPERATION_ID,
    question: "Every search a website ranks for, up to its company's limit, the ones bringing most visits first.",
    family: "DataForSEO Labs",
    // Labs publishes no task_post. Live is the only way to ask it.
    mode: "LIVE",
    path: "/v3/dataforseo_labs/google/ranked_keywords/live",
    costBand: "medium",
    refresh: { everyDays: 7 },
    fixed: {
      item_types: [...KEYWORD_LIST_ITEM_TYPES],
      order_by: ["ranked_serp_element.serp_item.etv,desc"],
    },
    params: {
      target: {
        kind: "host",
        required: true,
        description: "The website to list, as a domain — 'example.com'.",
      },
      limit: {
        kind: "number",
        required: false,
        description: "Rows in this request, at most 1,000.",
        default: KEYWORD_LIST_PAGE,
      },
      offset: {
        kind: "number",
        required: false,
        description: "Where this request starts in the list.",
        default: 0,
      },
      location_code: {
        kind: "number",
        required: false,
        description: "Where to rank from. Leave unset for the United Kingdom.",
        default: 2826,
      },
      language_code: {
        kind: "keyword",
        required: false,
        description: "The language of the searches. Leave unset for English.",
        default: "en",
      },
    },
  },
];

export function isKeywordListOperation(operationId: string): boolean {
  return operationId === KEYWORD_LIST_OPERATION_ID;
}
