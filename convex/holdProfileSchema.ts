import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * What one company says about a website it holds — its own or a competitor
 * it watches: the names the business goes by, and for its own websites what
 * the business is (docs/plans/active/company-level-website-facts-plan.md).
 * Until 2026-09-28 these lived on the shared `websites` row, set once for
 * every company watching the host; Anthony, that day: "i think these need to
 * be set at the company level".
 *
 * Read only through the hold (`by_hold`), but once: when an AI answer is
 * filed, it is read against every name any company holds for any website
 * (`by_has_brand_names`, `listNamedWebsitesInternal`), bought once for all of
 * them, and each company then counts only the mentions of its own names — no
 * company ever sees another's. `websiteTenancyGuard.test.ts` holds both.
 */

export const holdBrandNameValidator = v.object({
  name: v.string(),
  /** Exactly one is primary — a screen needs a name to print. */
  isPrimary: v.boolean(),
  /** A misspelling is kept apart: "mentioned 40 times, 6 under the wrong name". */
  kind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
});

export const holdProfileTables = {
  holdProfiles: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    websiteId: v.id("websites"),
    brandNames: v.array(holdBrandNameValidator),
    /** Whether it names any, so the answer parser finds every named website through an index, not a scan. */
    hasBrandNames: v.boolean(),
    /** What the business does and where it sells: the company's own websites only. */
    sector: v.optional(v.string()),
    marketLabel: v.optional(v.string()),
    businessDescription: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    // The answer parser's one read across companies: every name held for any website.
    .index("by_has_brand_names", ["hasBrandNames"]),
};
