import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * Phase 4's ground rules (wiki-agents plan): a review-marked document is
 * untouchable to the distiller until approved; approval clears the
 * checkpoint and lets it learn; rejection parks it permanently; both leave
 * audit rows; and decisions are walled to the company.
 */

describe("the reviewer's checkpoint", () => {
  test("marked documents wait; approval releases them; rejection parks them", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() })
    );
    const makeDoc = (title: string) =>
      t.run(async (ctx) =>
        ctx.db.insert("knowledgeDocuments", {
          companyId,
          title,
          status: "ready",
          format: "text/plain",
          textContent: "Sensitive claims live here.",
          wikiReviewRequested: true,
          createdAt: Date.now(),
        })
      );
    const approvedDocId = await makeDoc("To approve");
    const rejectedDocId = await makeDoc("To reject");

    // The distiller's claim refuses both while the checkpoint stands.
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId: approvedDocId })
    ).resolves.toBeNull();

    for (const [docId, title] of [
      [approvedDocId, "To approve"],
      [rejectedDocId, "To reject"],
    ] as const) {
      await t.mutation(internal.wikiReviews.fileReviewInternal, {
        companyId,
        documentId: docId,
        title,
        claimsJson: JSON.stringify(["It claims a thing."]),
      });
    }

    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId })
    );
    const reviews = await t
      .withIdentity({ subject: adminId })
      .query(api.wikiReviews.listPendingReviewsForCompany, { companyId });
    expect(reviews).toHaveLength(2);
    expect(reviews.every((review) => review.claims.length === 1)).toBe(true);

    const reviewFor = (title: string) => reviews.find((review) => review.title === title)!;
    await t.withIdentity({ subject: adminId }).mutation(api.wikiReviews.decideReviewForCompany, {
      companyId,
      reviewId: reviewFor("To approve").reviewId,
      approve: true,
    });
    await t.withIdentity({ subject: adminId }).mutation(api.wikiReviews.decideReviewForCompany, {
      companyId,
      reviewId: reviewFor("To reject").reviewId,
      approve: false,
    });

    const { approvedDoc, rejectedDoc, auditTypes } = await t.run(async (ctx) => ({
      approvedDoc: await ctx.db.get(approvedDocId),
      rejectedDoc: await ctx.db.get(rejectedDocId),
      auditTypes: (await ctx.db.query("auditLogs").collect()).map((entry) => entry.actionType),
    }));
    // Approved: the checkpoint cleared, the distiller may now claim it.
    expect(approvedDoc?.wikiReviewRequested).toBe(false);
    const claim = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId: approvedDocId,
    });
    expect(claim?.title).toBe("To approve");
    // Rejected: parked for good — stamped so no sweep ever reads it.
    expect(rejectedDoc?.wikiDistilledAt).toBeGreaterThan(0);
    expect(auditTypes).toContain("WIKI_REVIEW_APPROVED");
    expect(auditTypes).toContain("WIKI_REVIEW_REJECTED");

    // Pending list is now empty; nothing lingers.
    await expect(
      t.withIdentity({ subject: adminId }).query(api.wikiReviews.listPendingReviewsForCompany, {
        companyId,
      })
    ).resolves.toEqual([]);
  });
});
