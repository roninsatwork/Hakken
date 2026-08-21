import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * The Reviewer at the door (wiki-agents plan, phase 4), with the model
 * stubbed at its boundary. What is under test is the checkpoint's
 * discipline: a marked document stays blocked while a review is prepared —
 * even when the model call fails — and a stood-down Reviewer waves
 * documents straight through, because a checkpoint nobody staffs must not
 * silently block imports.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

type Tester = ReturnType<typeof makeTest>;

beforeEach(() => {
  generateMock.mockReset();
});

async function seedMarkedDocument(t: Tester, overrides: Record<string, unknown> = {}) {
  const companyId = await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() })
  );
  const documentId = await t.run(async (ctx) =>
    ctx.db.insert("knowledgeDocuments", {
      companyId,
      title: "The sensitive contract",
      status: "ready",
      format: "text/plain",
      textContent: "We agreed the county office pays all invoices.",
      wikiReviewRequested: true,
      createdAt: Date.now(),
      ...overrides,
    })
  );
  return { companyId, documentId };
}

describe("the Reviewer's checkpoint", () => {
  test("a stood-down Reviewer waves the document through instead of silently blocking imports", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const { documentId } = await seedMarkedDocument(t);
      await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
      await t.run(async (ctx) => {
        const reviewer = (await ctx.db.query("agents").collect()).find(
          (agent) => agent.systemKey === "WIKI_REVIEWER"
        )!;
        await ctx.db.patch(reviewer._id, { isActive: false });
      });

      await t.action(internal.wikiReviewActions.prepareReview, { documentId });

      const { document, reviews } = await t.run(async (ctx) => ({
        document: await ctx.db.get(documentId),
        reviews: await ctx.db.query("wikiReviews").collect(),
      }));
      // The flag cleared and nothing was filed: the distiller may claim it now.
      expect(document?.wikiReviewRequested).toBe(false);
      expect(reviews).toHaveLength(0);
      const claim = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, {
        documentId,
      });
      expect(claim?.title).toBe("The sensitive contract");
      // Waving through spends nothing on a model.
      expect(generateMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("an active Reviewer files at most six claims and keeps the document blocked", async () => {
    const t = makeTest();
    const { companyId, documentId } = await seedMarkedDocument(t);
    // Eight claims plus junk: only six clean ones may reach the person.
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        claims: [
          "Claim one.",
          "Claim two.",
          "Claim three.",
          "Claim four.",
          "Claim five.",
          "Claim six.",
          "Claim seven.",
          "   ",
          123,
        ],
      }),
      inputTokens: 40,
      outputTokens: 20,
    });

    await t.action(internal.wikiReviewActions.prepareReview, { documentId });

    const { document, reviews, runs, transactions } = await t.run(async (ctx) => ({
      document: await ctx.db.get(documentId),
      reviews: await ctx.db.query("wikiReviews").collect(),
      runs: await ctx.db.query("agentRuns").collect(),
      transactions: await ctx.db.query("agentTransactions").collect(),
    }));
    expect(reviews).toHaveLength(1);
    expect(JSON.parse(reviews[0].claimsJson)).toEqual([
      "Claim one.",
      "Claim two.",
      "Claim three.",
      "Claim four.",
      "Claim five.",
      "Claim six.",
    ]);
    expect(reviews[0].companyId).toBe(companyId);
    // Still blocked: the checkpoint holds until a person decides.
    expect(document?.wikiReviewRequested).toBe(true);
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId })
    ).resolves.toBeNull();
    // The work is on the record: a Reviewer run, and the call on the meter.
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ title: "The Reviewer", triggerType: "EVENT", status: "SUCCESS" });
    expect(runs[0].finalOutput).toContain("Prepared 6 claims");
    expect(transactions).toHaveLength(1);
    expect(transactions[0].companyId).toBe(companyId);

    // Filing is idempotent: a second pass never doubles the review.
    await t.action(internal.wikiReviewActions.prepareReview, { documentId });
    const reviewsAfter = await t.run(async (ctx) => ctx.db.query("wikiReviews").collect());
    expect(reviewsAfter).toHaveLength(1);
  });

  test("a failed model call still files the review — the checkpoint fails closed, not open", async () => {
    const t = makeTest();
    const { documentId } = await seedMarkedDocument(t);
    generateMock.mockRejectedValue(new Error("model down"));

    await t.action(internal.wikiReviewActions.prepareReview, { documentId });

    const { document, reviews, runs } = await t.run(async (ctx) => ({
      document: await ctx.db.get(documentId),
      reviews: await ctx.db.query("wikiReviews").collect(),
      runs: await ctx.db.query("agentRuns").collect(),
    }));
    // Filed with no claims rather than dropped: the document still waits for
    // a person, and never slips into the wiki because a model call failed.
    expect(reviews).toHaveLength(1);
    expect(JSON.parse(reviews[0].claimsJson)).toEqual([]);
    expect(document?.wikiReviewRequested).toBe(true);
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Prepared 0 claims");
  });

  test("an unmarked or unready document is left alone and costs nothing", async () => {
    const t = makeTest();
    const { documentId: unmarked } = await seedMarkedDocument(t, { wikiReviewRequested: false });
    const { documentId: stillUploading } = await seedMarkedDocument(t, { status: "processing" });

    await t.action(internal.wikiReviewActions.prepareReview, { documentId: unmarked });
    await t.action(internal.wikiReviewActions.prepareReview, { documentId: stillUploading });

    const { reviews, runs } = await t.run(async (ctx) => ({
      reviews: await ctx.db.query("wikiReviews").collect(),
      runs: await ctx.db.query("agentRuns").collect(),
    }));
    expect(reviews).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect(generateMock).not.toHaveBeenCalled();
  });
});
