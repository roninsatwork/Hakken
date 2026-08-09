/**
 * The knowledge-evidence sweep (self-improvement plan, Phase 4).
 *
 * Rating a message is O(1); this is where the aggregation happens instead.
 * An hourly pass walks feedback rows changed since its watermark, reads each
 * rated message's evidence trail — the chunk ids retrieval admitted when the
 * answer was written — and folds the rating into `knowledgeChunkStats`.
 * Retrieval then reads those counts back as a bounded prior on its fused
 * ranking.
 *
 * Idempotency and changed minds are both handled by `lastCountedRating` on
 * the feedback row: the sweep only acts on the difference between what it
 * counted last time and what the row says now, so re-running is safe and a
 * flipped rating moves the count across rather than stacking both sides.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { chunkPrior } from "./knowledgeRetrievalService";
import { getSelfImprovementConfig } from "./selfImprovementConfig";

export const KNOWLEDGE_EVIDENCE_WATERMARK_KEY = "KNOWLEDGE_EVIDENCE_SWEEP_WATERMARK";
const SWEEP_BATCH = 200;
const EVIDENCE_ROLLUP_LIMIT = 500;

/** The chunk ids behind a rated answer, from the message's evidence trail. */
function parseEvidenceChunkIds(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { sourceIds?: unknown };
    if (!Array.isArray(parsed?.sourceIds)) return [];
    return parsed.sourceIds.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export const sweepEvidenceInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const watermarkRow = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", KNOWLEDGE_EVIDENCE_WATERMARK_KEY))
      .first();
    const watermark = Number(watermarkRow?.value ?? 0) || 0;

    const rows = await ctx.db
      .query("messageFeedback")
      .withIndex("by_updated", (q) => q.gt("updatedAt", watermark))
      .order("asc")
      .take(SWEEP_BATCH);
    if (rows.length === 0) return { processed: 0, counted: 0, skipped: 0 };

    const now = Date.now();
    let counted = 0;
    let skipped = 0;

    for (const row of rows) {
      // Capped-out rows and unchanged rows teach nothing new.
      if (!row.countsTowardLearning || row.lastCountedRating === row.rating) {
        skipped += 1;
        continue;
      }
      if (!row.companyId) {
        skipped += 1;
        continue;
      }

      const message = await ctx.db.get(row.messageId);
      const chunkIds = parseEvidenceChunkIds(message?.companyRuntimeEvidenceJson);
      if (chunkIds.length === 0) {
        // Nothing grounded this answer (or the evidence is malformed) — mark
        // the row counted so the sweep does not re-read it every hour.
        await ctx.db.patch(row._id, { lastCountedRating: row.rating });
        skipped += 1;
        continue;
      }

      for (const rawChunkId of chunkIds) {
        const chunkId = ctx.db.normalizeId("knowledgeChunks", rawChunkId);
        if (!chunkId) continue;

        const stats = await ctx.db
          .query("knowledgeChunkStats")
          .withIndex("by_company_chunk", (q) =>
            q.eq("companyId", row.companyId as Id<"companies">).eq("chunkId", chunkId)
          )
          .unique();

        let positive = stats?.positiveEvidence ?? 0;
        let negative = stats?.negativeEvidence ?? 0;
        if (row.lastCountedRating === "POSITIVE") positive = Math.max(0, positive - 1);
        if (row.lastCountedRating === "NEGATIVE") negative = Math.max(0, negative - 1);
        if (row.rating === "POSITIVE") positive += 1;
        else negative += 1;

        if (stats) {
          await ctx.db.patch(stats._id, {
            positiveEvidence: positive,
            negativeEvidence: negative,
            lastEvidenceAt: now,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("knowledgeChunkStats", {
            companyId: row.companyId,
            chunkId,
            positiveEvidence: positive,
            negativeEvidence: negative,
            lastEvidenceAt: now,
            updatedAt: now,
          });
        }
      }

      await ctx.db.patch(row._id, { lastCountedRating: row.rating });
      counted += 1;
    }

    // The watermark is the last examined row's own updatedAt, so the next
    // pass resumes exactly where this one stopped — including mid-backlog.
    const nextWatermark = rows[rows.length - 1].updatedAt;
    if (watermarkRow) {
      await ctx.db.patch(watermarkRow._id, { value: String(nextWatermark), updatedAt: now });
    } else {
      await ctx.db.insert("systemConfig", {
        key: KNOWLEDGE_EVIDENCE_WATERMARK_KEY,
        value: String(nextWatermark),
        updatedAt: now,
      });
    }

    return { processed: rows.length, counted, skipped };
  },
});

/**
 * The priors for one retrieval's candidate chunks. Empty when the switch is
 * off, which makes the fused ranking byte-identical to the pre-prior
 * behaviour without the call site knowing why.
 */
export const getChunkPriorsInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    chunkIds: v.array(v.id("knowledgeChunks")),
  },
  handler: async (ctx, args) => {
    const config = await getSelfImprovementConfig(ctx.db);
    if (!config.retrievalPriors) return [];

    const now = Date.now();
    const priors: Array<{ chunkId: Id<"knowledgeChunks">; prior: number }> = [];
    for (const chunkId of args.chunkIds) {
      const stats = await ctx.db
        .query("knowledgeChunkStats")
        .withIndex("by_company_chunk", (q) =>
          q.eq("companyId", args.companyId).eq("chunkId", chunkId)
        )
        .unique();
      if (!stats) continue;
      const prior = chunkPrior({
        positiveEvidence: stats.positiveEvidence,
        negativeEvidence: stats.negativeEvidence,
        lastEvidenceAt: stats.lastEvidenceAt,
        now,
      });
      if (prior !== 0) priors.push({ chunkId, prior });
    }
    return priors;
  },
});

/**
 * Per-document evidence rollups for the knowledge screens: which documents
 * keep producing well-rated answers, and which keep appearing under
 * complaints. Read-only observability — the ranking consequences live in
 * the retrieval path.
 */
export const getDocumentEvidenceForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    assertAdminCanAccessCompany(user, args.companyId);

    const stats = await ctx.db
      .query("knowledgeChunkStats")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(EVIDENCE_ROLLUP_LIMIT);

    const byDocument = new Map<string, {
      documentId: Id<"knowledgeDocuments">;
      positiveEvidence: number;
      negativeEvidence: number;
      lastEvidenceAt: number;
    }>();

    for (const entry of stats) {
      const chunk: Doc<"knowledgeChunks"> | null = await ctx.db.get(entry.chunkId);
      if (!chunk) continue;
      const documentId = chunk.documentId;
      const rollup = byDocument.get(documentId) ?? {
        documentId,
        positiveEvidence: 0,
        negativeEvidence: 0,
        lastEvidenceAt: 0,
      };
      rollup.positiveEvidence += entry.positiveEvidence;
      rollup.negativeEvidence += entry.negativeEvidence;
      rollup.lastEvidenceAt = Math.max(rollup.lastEvidenceAt, entry.lastEvidenceAt);
      byDocument.set(documentId, rollup);
    }

    return [...byDocument.values()].sort((a, b) => b.lastEvidenceAt - a.lastEvidenceAt);
  },
});
