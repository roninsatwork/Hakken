import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { GOOGLE_VERTEX_EMBEDDING_DIMENSIONS, GOOGLE_VERTEX_EMBEDDING_MODEL_ID } from "./aiModelService";

const { embedVertexContentWithRetryMock } = vi.hoisted(() => ({
  embedVertexContentWithRetryMock: vi.fn(),
}));

vi.mock("./vertexProviderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vertexProviderService")>();
  return {
    ...actual,
    createVertexEmbeddingClient: vi.fn(() => ({})),
    embedVertexContentWithRetry: embedVertexContentWithRetryMock,
  };
});

/** Every piece and the question share one vector, so the search finds them all. */
const VECTOR = Array.from({ length: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS }, () => 0.25);

beforeEach(() => {
  embedVertexContentWithRetryMock.mockReset();
  embedVertexContentWithRetryMock.mockResolvedValue({ embeddings: [{ values: VECTOR }] });
});

/**
 * "Test retrieval" runs the AI's own search and reading
 * (docs/plans/active/knowledge-relevance-cutoff-plan.md, gap 2), over the
 * shelf being managed, for whoever may see that shelf.
 */
describe("Test retrieval", () => {
  async function seed() {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
      const adminAId = await ctx.db.insert("users", { email: "admin-a@test.com", role: "ADMIN", companyId: companyAId, createdAt: now });
      const sharedAgentId = await ctx.db.insert("agents", {
        name: "Support", description: "", systemPrompt: "", standingObjective: "", modelId: "m", thinkingMode: false,
        isActive: true, isGlobal: true, createdAt: now, updatedAt: now,
      });
      const companyBAgentId = await ctx.db.insert("agents", {
        name: "B's own", description: "", systemPrompt: "", standingObjective: "", modelId: "m", thinkingMode: false,
        isActive: true, companyId: companyBId, createdAt: now, updatedAt: now,
      });

      const addPiece = async (
        title: string,
        text: string,
        scope: { companyId?: Id<"companies">; agentId?: Id<"agents"> },
        embeddingModelId = GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      ) => {
        const documentId = await ctx.db.insert("knowledgeDocuments", {
          title, textContent: text, ...scope, status: "ready", format: "text/plain", createdBy: adminAId, createdAt: now,
        });
        await ctx.db.insert("knowledgeChunks", {
          documentId, ...scope, isGlobal: false, text, embedding: VECTOR, embeddingModelId, embeddingDimensions: VECTOR.length,
        });
      };
      await addPiece("Escalation Runbook", "Escalation summaries must include owner, blocker, next action and due date.", { companyId: companyAId });
      await addPiece("Old Runbook", "Escalations go to the duty manager.", { companyId: companyAId }, "text-embedding-004");
      await addPiece("Private Finance Runbook", "Finance summaries include private margin assumptions.", { companyId: companyBId });
      await addPiece("Support Basics", "Greet every customer by name.", { agentId: sharedAgentId });
      await addPiece("A's Support Notes", "Company A offers next-day delivery.", { agentId: sharedAgentId, companyId: companyAId });
      await addPiece("B's Support Notes", "Company B's discount code is SECRET50.", { agentId: sharedAgentId, companyId: companyBId });
      return { companyAId, companyBId, adminAId, sharedAgentId, companyBAgentId };
    });
    return { t, ...ids, adminA: t.withIdentity({ subject: ids.adminAId }) };
  }

  test("shows what the AI would read from the company's shelf, and nothing on another model", async () => {
    const { adminA, companyAId } = await seed();

    const result = await adminA.action(api.knowledgeActions.testRetrieval, { companyId: companyAId, query: "  owner blocker  " });

    expect(result.query).toBe("owner blocker");
    // The search meets three of the company's pieces; one is on an older
    // model and one belongs to an agent, so neither is read.
    expect(result.found).toBe(3);
    expect(result.matches).toEqual([
      expect.objectContaining({
        title: "Escalation Runbook",
        preview: "Escalation summaries must include owner, blocker, next action and due date.",
      }),
    ]);
    expect(result.leftOut).toEqual([]);
    expect(result.safetyNotice).toContain("untrusted reference material");
  });

  test("an agent's shelf reads as that agent's runs in the viewer's company do", async () => {
    const { adminA, sharedAgentId } = await seed();

    const result = await adminA.action(api.knowledgeActions.testRetrieval, { agentId: sharedAgentId, query: "delivery" });

    expect(result.matches.map((passage) => passage.title).sort()).toEqual(["A's Support Notes", "Support Basics"]);
  });

  test("nobody tests a shelf they may not see", async () => {
    const { adminA, companyBId, companyBAgentId, t } = await seed();

    await expect(adminA.action(api.knowledgeActions.testRetrieval, { companyId: companyBId, query: "margin" })).rejects.toThrow("Unauthorized");
    await expect(adminA.action(api.knowledgeActions.testRetrieval, { query: "margin" })).rejects.toThrow("Unauthorized");
    await expect(adminA.action(api.knowledgeActions.testRetrieval, { agentId: companyBAgentId, query: "margin" })).rejects.toThrow("Unauthorized");
    await expect(t.action(api.knowledgeActions.testRetrieval, { companyId: companyBId, query: "margin" })).rejects.toThrow();
    expect(embedVertexContentWithRetryMock).not.toHaveBeenCalled();
  });
});
