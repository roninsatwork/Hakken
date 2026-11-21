import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Imports go straight into the wiki, the platform shelf included (Anthony, 2026-11-09, in Sonae: "these need to go into the
 * wiki automatically"; brought over on 2026-11-21, wiki-sonae-catch-up-plan-2026-11-21.md, 0.4). Only an import whose
 * "Review before it writes" box is ticked waits for approval. A website import does the same: Sonae left that one waiting.
 */
// A held clock: the reading each import books stays booked, never running after the test (the test rules in AGENTS.md).
beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

describe("wiki imports", () => {
  test("a platform import goes straight in unless review is asked for", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Platform owner", email: "owner@example.test", role: "SUPER_ADMIN" }),
    );
    const asOwner = t.withIdentity({ subject: ownerId });

    const straightIn = await asOwner.mutation(api.knowledge.saveManualText, {
      title: "How billing works",
      textContent: "Billing runs monthly. Every workspace gets one shared inbox.",
    });
    const checkedFirst = await asOwner.mutation(api.knowledge.saveManualText, {
      title: "Pricing",
      textContent: "Plans are priced per workspace.",
      wikiReview: true,
    });
    const [website] = await asOwner.mutation(api.knowledge.queueWebsiteUrls, { urls: ["https://example.com/guide"] });

    const documents = await t.run(async (ctx) => ({
      straightIn: await ctx.db.get(straightIn),
      checkedFirst: await ctx.db.get(checkedFirst),
      website: website ? await ctx.db.get(website) : null,
    }));

    // All three sit on the platform shelf: no company on any.
    expect(documents.straightIn?.companyId).toBeUndefined();
    expect(documents.checkedFirst?.companyId).toBeUndefined();
    expect(documents.website?.companyId).toBeUndefined();
    // Only the ticked one waits for a review.
    expect(documents.straightIn?.wikiReviewRequested).not.toBe(true);
    expect(documents.website?.wikiReviewRequested).not.toBe(true);
    expect(documents.checkedFirst?.wikiReviewRequested).toBe(true);
  });
});
