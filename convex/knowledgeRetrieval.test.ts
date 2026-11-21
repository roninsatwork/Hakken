import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { searchKnowledgeScope } from "./knowledgeRetrieval";

/**
 * A shared agent reads its platform knowledge and the asking company's only (Sonae `20f34fa6`, brought over on 21 November
 * 2026; wiki-sonae-catch-up-plan-2026-11-21.md, 0.2). Before this, Ask Hakken's agent search (`assistantKnowledge.ts`) asked
 * by agent alone, so a shared agent could read what another company had filed with it.
 */

async function seedSharedAgent(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: 1 });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Company B", createdAt: 1 });
    const agentFields = { modelId: "test-model", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 };
    const agentId = await ctx.db.insert("agents", { ...agentFields, name: "Shared reporter" });
    const otherAgentId = await ctx.db.insert("agents", { ...agentFields, name: "Another agent" });
    const chunks = [];
    for (const scope of [
      { agentId, companyId },
      { agentId, companyId: otherCompanyId },
      { agentId },
      { agentId: otherAgentId, companyId },
    ]) {
      const documentId = await ctx.db.insert("knowledgeDocuments", {
        ...scope, title: "Pipeline", textContent: "pipeline", format: "text/plain", status: "ready", createdAt: 1,
      });
      chunks.push(await ctx.db.insert("knowledgeChunks", {
        ...scope, documentId, text: "pipeline", isGlobal: false, embedding: new Array(768).fill(0),
      }));
    }
    return { companyId, otherCompanyId, agentId, own: chunks[0], foreign: chunks[1], platform: chunks[2], otherAgent: chunks[3] };
  });
}

describe("shared-agent knowledge isolation", () => {
  test("keyword retrieval includes own and platform knowledge, excluding other companies and agents", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, agentId, own, platform } = await seedSharedAgent(t);
    const matches = await t.query(internal.knowledge.searchChunksByTextInternal, {
      query: "pipeline", limit: 100, scope: { kind: "agent", agentId, companyId },
    });
    expect(matches.map((match) => match._id).sort()).toEqual([own, platform].sort());
  });

  test("an agent search without a company retrieves platform knowledge only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { agentId, platform } = await seedSharedAgent(t);
    const matches = await t.query(internal.knowledge.searchChunksByTextInternal, {
      query: "pipeline", limit: 100, scope: { kind: "agent", agentId },
    });
    expect(matches.map((match) => match._id)).toEqual([platform]);
  });

  test("vector-only foreign matches cannot enter the fused prompt candidates", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { agentId, companyId, otherCompanyId, own, foreign, platform, otherAgent } = await seedSharedAgent(t);
    // Convex's vector index is unavailable in convex-test. Supply its ranked
    // candidates, keeping the real database ownership gate and fusion.
    const vectorSearch = vi.fn().mockResolvedValue([
      { _id: foreign, _score: 1 }, { _id: otherAgent, _score: 0.9 },
      { _id: own, _score: 0.8 }, { _id: platform, _score: 0.7 },
    ]);
    const matches = await t.action(async (ctx) => await searchKnowledgeScope({ ...ctx, vectorSearch }, {
      queryVector: [1], queryText: "no-keyword-matches", limit: 100,
      scope: { kind: "agent", agentId, companyId },
      // Ranking evidence must never decide the authorization scope.
      priorCompanyId: otherCompanyId,
    }));
    expect(matches.map((match) => match._id)).toEqual([own, platform]);
  });

  test("vector retrieval without a company excludes every tenant's knowledge", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { agentId, own, foreign, platform } = await seedSharedAgent(t);
    const vectorSearch = vi.fn().mockResolvedValue([own, foreign, platform].map((_id) => ({ _id, _score: 1 })));
    const matches = await t.action(async (ctx) => await searchKnowledgeScope({ ...ctx, vectorSearch }, {
      queryVector: [1], queryText: "no-keyword-matches", limit: 100,
      scope: { kind: "agent", agentId, companyId: undefined },
    }));
    expect(matches.map((match) => match._id)).toEqual([platform]);
  });
});
