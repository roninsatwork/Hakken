import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  CHUNK_PRIOR_CAP,
  applyChunkPriors,
  chunkPrior,
  fuseRetrievalRankings,
} from "./knowledgeRetrievalService";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("chunkPrior maths", () => {
  test("bounded by the cap however lopsided the evidence", () => {
    const huge = chunkPrior({
      positiveEvidence: 10_000,
      negativeEvidence: 0,
      lastEvidenceAt: NOW,
      now: NOW,
    });
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeLessThanOrEqual(CHUNK_PRIOR_CAP);
    expect(CHUNK_PRIOR_CAP).toBeLessThan(1 / 61);
  });

  test("smoothing keeps two ratings from swinging like two hundred", () => {
    const two = chunkPrior({ positiveEvidence: 2, negativeEvidence: 0, lastEvidenceAt: NOW, now: NOW });
    const twoHundred = chunkPrior({ positiveEvidence: 200, negativeEvidence: 0, lastEvidenceAt: NOW, now: NOW });
    expect(two).toBeLessThan(twoHundred / 2);
  });

  test("no evidence, or evidence older than 90 days, is exactly zero", () => {
    expect(chunkPrior({ positiveEvidence: 0, negativeEvidence: 0, lastEvidenceAt: NOW, now: NOW })).toBe(0);
    expect(
      chunkPrior({ positiveEvidence: 50, negativeEvidence: 0, lastEvidenceAt: NOW - 91 * DAY_MS, now: NOW })
    ).toBe(0);
  });

  test("negative evidence pushes below zero, symmetrically", () => {
    const positive = chunkPrior({ positiveEvidence: 6, negativeEvidence: 0, lastEvidenceAt: NOW, now: NOW });
    const negative = chunkPrior({ positiveEvidence: 0, negativeEvidence: 6, lastEvidenceAt: NOW, now: NOW });
    expect(negative).toBeCloseTo(-positive, 10);
  });
});

describe("applyChunkPriors", () => {
  test("equal-relevance chunks order by prior; without priors the fusion stands", () => {
    const fused = fuseRetrievalRankings({
      vectorRanked: [{ _id: "a" }, { _id: "b" }],
      keywordRanked: [{ _id: "b" }, { _id: "a" }],
    });
    // a and b tie exactly; a small prior decides it.
    expect(fused[0]._score).toBeCloseTo(fused[1]._score, 10);

    const reordered = applyChunkPriors(fused, new Map([["b", 0.001]]));
    expect(reordered[0]._id).toBe("b");

    expect(applyChunkPriors(fused, undefined)).toEqual(fused);
    expect(applyChunkPriors(fused, new Map())).toEqual(fused);
  });

  test("a negative-only chunk is reordered, never removed", () => {
    const fused = fuseRetrievalRankings({
      vectorRanked: [{ _id: "only" }],
      keywordRanked: [],
    });
    const result = applyChunkPriors(fused, new Map([["only", -CHUNK_PRIOR_CAP]]));
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("only");
  });

  test("the cap keeps history inside a few positions of rank", () => {
    // Positions 1 and 8 in a single list: the gap is larger than the cap, so
    // even maximal evidence cannot vault a chunk over it — history is a
    // tiebreaker, not a takeover.
    const fused = fuseRetrievalRankings({
      vectorRanked: Array.from({ length: 10 }, (_, index) => ({ _id: `chunk${index}` })),
      keywordRanked: [],
    });
    const boosted = applyChunkPriors(fused, new Map([["chunk7", CHUNK_PRIOR_CAP]]));
    const position = boosted.findIndex((match) => match._id === "chunk7");
    expect(position).toBeGreaterThan(0);
    expect(position).toBeLessThan(7);
  });
});

describe("knowledge evidence sweep", () => {
  async function seedRatedAnswer(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
      });
      const documentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Depot guide",
        companyId,
        format: "text/plain",
        status: "ready",
        createdAt: now,
      });
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        documentId,
        companyId,
        isGlobal: false,
        text: "The depot closes at 4pm on Fridays.",
        embedding: Array.from({ length: 768 }, () => 0),
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        createdAt: now,
        updatedAt: now,
      });
      const messageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "The depot closes at 4pm.",
        createdAt: now,
        companyId,
        companyRuntimeEvidenceJson: JSON.stringify({ version: 1, skillIds: [], sourceIds: [chunkId] }),
      });
      const feedbackId = await ctx.db.insert("messageFeedback", {
        messageId,
        threadId,
        companyId,
        userId,
        rating: "POSITIVE",
        labels: ["GREAT_ANSWER"],
        countsTowardLearning: true,
        createdAt: now,
        updatedAt: now,
      });
      return { companyId, userId, chunkId, messageId, feedbackId };
    });
  }

  test("ratings become chunk evidence once, flips move the count, re-runs are no-ops", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedRatedAnswer(t);

    let result = await t.mutation(internal.knowledgeEvidence.sweepEvidenceInternal, {});
    expect(result.counted).toBe(1);

    const statsAfterFirst = await t.run(async (ctx) =>
      await ctx.db.query("knowledgeChunkStats").collect()
    );
    expect(statsAfterFirst).toHaveLength(1);
    expect(statsAfterFirst[0]).toMatchObject({
      companyId: seed.companyId,
      chunkId: seed.chunkId,
      positiveEvidence: 1,
      negativeEvidence: 0,
    });

    // Nothing changed: the watermark keeps the sweep from re-counting.
    result = await t.mutation(internal.knowledgeEvidence.sweepEvidenceInternal, {});
    expect(result.processed).toBe(0);

    // A changed mind moves the count across.
    await t.run(async (ctx) => {
      await ctx.db.patch(seed.feedbackId, { rating: "NEGATIVE", updatedAt: Date.now() + 5 });
    });
    result = await t.mutation(internal.knowledgeEvidence.sweepEvidenceInternal, {});
    expect(result.counted).toBe(1);
    const statsAfterFlip = await t.run(async (ctx) =>
      await ctx.db.query("knowledgeChunkStats").collect()
    );
    expect(statsAfterFlip[0]).toMatchObject({ positiveEvidence: 0, negativeEvidence: 1 });
  });

  test("capped-out rows and evidence-free messages are skipped, not lost forever", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedRatedAnswer(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(seed.feedbackId, { countsTowardLearning: false });
    });

    const result = await t.mutation(internal.knowledgeEvidence.sweepEvidenceInternal, {});
    expect(result.skipped).toBe(1);
    const stats = await t.run(async (ctx) => await ctx.db.query("knowledgeChunkStats").collect());
    expect(stats).toHaveLength(0);
  });

  test("the priors query answers only when the switch is on", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedRatedAnswer(t);
    await t.mutation(internal.knowledgeEvidence.sweepEvidenceInternal, {});

    const priors = await t.query(internal.knowledgeEvidence.getChunkPriorsInternal, {
      companyId: seed.companyId,
      chunkIds: [seed.chunkId],
    });
    expect(priors).toHaveLength(1);
    expect(priors[0].prior).toBeGreaterThan(0);

    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: "SELF_IMPROVEMENT_CONFIG",
        value: JSON.stringify({ retrievalPriors: false }),
        updatedAt: Date.now(),
      });
    });
    const disabled = await t.query(internal.knowledgeEvidence.getChunkPriorsInternal, {
      companyId: seed.companyId,
      chunkIds: [seed.chunkId],
    });
    expect(disabled).toHaveLength(0);
  });

  test("another tenant's evidence is invisible", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedRatedAnswer(t);
    await t.mutation(internal.knowledgeEvidence.sweepEvidenceInternal, {});

    const otherCompanyId = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() })
    );
    const foreign = await t.query(internal.knowledgeEvidence.getChunkPriorsInternal, {
      companyId: otherCompanyId as Id<"companies">,
      chunkIds: [seed.chunkId],
    });
    expect(foreign).toHaveLength(0);
  });
});
