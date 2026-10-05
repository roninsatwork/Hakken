import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The bookkeeping of the Sites rebuilds (`siteRankings.ts`, `siteSummaries.ts`):
 * the requests that ask for a rebuild once a burst and give each its turn, and
 * the compact copies of the big Sites lists they write (`siteListCopies.ts`).
 * Kept apart from `siteSchema.ts`, which reached the module ceiling (2026-10-05).
 */
export const siteRebuildTables = {
  /**
   * A rebuild asked for and not yet run. Several filings in a minute ask once,
   * so a SERP page naming ten known sites does not start ten rebuilds of each.
   */
  siteSummaryRequests: defineTable({
    /**
     * `site:<websiteId>:<locationCode>`, `gap:<companyWebsiteId>`, `copy:<kind>:<key>` for a list's compact copy, or
     * `listAi:<companyWebsiteId>` / `listAiAll:<companyWebsiteId>` for a company list's AI summary (`siteListAi.ts`);
     * `aiLines:<websiteId>:<locationCode>` and `days:<websiteId>:<locationCode>` for the parts of a site rebuild an
     * AI answer and a site-wide figure change (dataforseo-cost-plan.md, A2).
     */
    key: v.string(),
    pending: v.boolean(),
    requestedAt: v.number(),
    /**
     * When the rebuild now running began: one at a time per key, because two
     * at once each deleted what the other wrote (collection reliability plan,
     * 2.3). Cleared when it ends; one that died frees it after `REBUILD_TURN_MS`.
     */
    runningSince: v.optional(v.number()),
    /**
     * When the data behind this key last changed: set when a rebuild is asked
     * for (`claimSchedule`), and where a source changes without asking for one
     * (`noteDataChanged`). Absent on a row written before 2026-10-05, when
     * `requestedAt` says it.
     */
    changedAt: v.optional(v.number()),
    /**
     * When the last rebuild under this key to finish began reading: what it
     * built is current to here. The nightly refresh rebuilds a list's copy
     * only when its data changed after this (`refreshListCopies`;
     * docs/plans/active/dataforseo-cost-plan.md, A1). Absent until one has
     * finished, or after one that failed.
     */
    builtFrom: v.optional(v.number()),
    /**
     * The collection a website rebuild asked for during it waits for: run
     * when it finishes (`finishSeoCycle`), or after `COLLECTION_REBUILD_EVERY_MS`
     * for one that runs long (dataforseo-cost-plan.md, B4). Absent when
     * nothing waits.
     */
    heldFor: v.optional(v.id("seoCollectionCycles")),
  })
    .index("by_key", ["key"])
    .index("by_held", ["heldFor"]),

  /**
   * A compact copy of one big Sites list (docs/plans/active/
   * sites-table-pages-plan.md §5.2): every row, holding only what the list
   * is searched, filtered and sorted by, so one request can count the whole
   * list and cut any page from it (`siteListCopies.ts`). This is the copy's
   * header; the rows are in `siteListCopyParts`, written beside the last copy
   * and switched to here in one step, so a reader never sees half of two.
   */
  siteListCopies: defineTable({
    /** Which list: "keywords", "pages", "links" or "gap". */
    kind: v.string(),
    /** Whose list: `<websiteId>:<locationCode>`, `<websiteId>` or `<companyWebsiteId>`, by kind. */
    key: v.string(),
    buildId: v.string(),
    /** The names of the values each row holds, in order. */
    fields: v.array(v.string()),
    /** Rows in the copy, and the parts they are split across. */
    rows: v.number(),
    parts: v.number(),
    /** What the list was held to when it was longer than a copy keeps, else null. */
    cut: v.union(v.number(), v.null()),
    /** Facts about the whole list at the time, by kind: the keywords' ranking day and latest check. */
    meta: v.record(v.string(), v.union(v.string(), v.number(), v.null())),
    builtAt: v.number(),
    /**
     * A fingerprint of everything the copy holds (`writeListCopy`): a rebuild
     * that would write the same is not written (dataforseo-cost-plan.md, A3).
     * Absent on a copy written before 2026-10-05.
     */
    hash: v.optional(v.string()),
  }).index("by_kind_key", ["kind", "key"]),

  /** A copy's rows, a part at a time: JSON, each part kept under a document's 1 MiB. */
  siteListCopyParts: defineTable({
    kind: v.string(),
    key: v.string(),
    buildId: v.string(),
    part: v.number(),
    data: v.string(),
  }).index("by_build", ["kind", "key", "buildId", "part"]),
};
