import type { SeoOperation } from "./dataForSeoRegistry";

/**
 * The calls added for the Sites screens (docs/plans/active/user-sites-plan.md,
 * "Collecting more", D10): the link lists behind All backlinks, Referring
 * domains, Anchors, Referring IPs and Broken backlinks, and links gained and
 * lost over time.
 *
 * **No backfilling.** The plan first had two history calls, bought once per
 * site, to give the two-year charts data on day one. The owner withdrew them
 * on 2026-09-23 — "we are not backfilling the data as part of this plan, we
 * are coding as if we have the data … so we don't spend a fortune backdating
 * all the data" — so they are not in the registry and nothing collects them.
 * The few bought in testing that night are still filed (`siteLinkFiling.ts`
 * reads them), and the charts fill from our own collection from now on.
 *
 * Every path, field and default here was read from DataForSEO's own docs on
 * 2026-09-23 (docs.dataforseo.com/v3/backlinks/…, …/dataforseo_labs/google/
 * historical_rank_overview/live) — a wrong one is a charged request that
 * returns nothing.
 *
 * **Each has its own cadence** (`refresh`), because link lists do not change
 * daily: a weekly list is held for seven days whatever the cycle's own
 * cadence, and a monthly one for thirty.
 *
 * **Row caps.** A list returns at most a thousand rows, one link per linking
 * website unless a page needs every link, and the answer is trimmed to the
 * fields we read before it is stored (`dataForSeoSlim.ts`) — a full answer is
 * bigger than the raw copy a pull may keep, and the copy would be dropped.
 */

const TARGET = {
  kind: "host" as const,
  required: true,
  description: "The website to look up, as a domain — 'example.com'.",
};

const LIMIT = {
  kind: "number" as const,
  required: false,
  description: "How many rows to return, at most 1,000. Leave unset for 1,000.",
  default: 1000,
};

export const SITE_LINK_OPERATIONS: readonly SeoOperation[] = [
  {
    id: "backlinks_list",
    question: "Which pages link to this website, with what words, and are the links followed?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/backlinks/live",
    costBand: "medium",
    refresh: { everyDays: 7 },
    // One link per linking website: the strongest thousand websites, each
    // once, rather than a thousand links from the three sites with most.
    // Lost links too, so the page can say which went.
    fixed: { mode: "one_per_domain", backlinks_status_type: "all", order_by: ["domain_from_rank,desc"] },
    params: { target: TARGET, limit: LIMIT },
  },
  {
    id: "backlinks_broken",
    question: "Which links to this website point at pages that no longer work?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/backlinks/live",
    costBand: "medium",
    refresh: { everyDays: 7 },
    // Every broken link, not one per website: each is a page worth mending.
    fixed: { mode: "as_is", filters: ["is_broken", "=", true], order_by: ["domain_from_rank,desc"] },
    params: { target: TARGET, limit: LIMIT },
  },
  {
    id: "referring_domains_list",
    question: "Which websites link to this one, and how strong is each?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/referring_domains/live",
    costBand: "medium",
    refresh: { everyDays: 7 },
    fixed: { backlinks_status_type: "all", order_by: ["rank,desc"], internal_list_limit: 1 },
    params: { target: TARGET, limit: LIMIT },
  },
  {
    id: "anchors_list",
    question: "Which words do other websites use when they link to this one?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/anchors/live",
    costBand: "medium",
    refresh: { everyDays: 30 },
    fixed: { order_by: ["backlinks,desc"], internal_list_limit: 1 },
    params: { target: TARGET, limit: LIMIT },
  },
  {
    id: "referring_ips_list",
    question: "Which servers do the links to this website come from?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/referring_networks/live",
    costBand: "medium",
    refresh: { everyDays: 30 },
    fixed: { network_address_type: "ip", order_by: ["backlinks,desc"], internal_list_limit: 1 },
    params: { target: TARGET, limit: LIMIT },
  },
  {
    id: "backlinks_new_lost",
    question: "How many links did this website gain and lose, day by day?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/timeseries_new_lost_summary/live",
    costBand: "low",
    refresh: { everyDays: 7 },
    // By week, and with no start date. The docs offer `date_from`, but on
    // 2026-09-23 DataForSEO refused every request that sent one ("Invalid
    // Field: 'date_from'", uncharged) and answered without it with every
    // week since 2019 for about four cents. Each answer overlaps the last, so
    // no week is missed; weeks are filed under their Monday (`siteLinkFiling.ts`).
    fixed: { group_range: "week" },
    params: { target: TARGET },
  },
];
