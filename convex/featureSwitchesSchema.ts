import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * What's switched off in the menu (docs/plans/active/features-switches-plan-2026-11-21.md):
 * one row for the platform, off for every company, and one for each company with
 * something off on its own Features tab. No row means every section is on.
 *
 * Kept apart from the company and the platform's settings because every server
 * call a section's pages make checks it (phase 2). Here that check reads one
 * small row, and nothing at all for a company with every section on, rather
 * than the whole company and the platform's settings each time.
 */
export const featureSwitchesTables = {
  featureSwitches: defineTable({
    /** The company the list is for. None is the platform's own list, off for everyone. */
    companyId: v.optional(v.id("companies")),
    /** Menu features off, as `MENU_FEATURES` keys, in menu order. */
    featuresOff: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),
};
