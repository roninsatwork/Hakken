import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * A workflow agent that may search the web goes straight to Vertex, the one
 * provider with a search tool, and counts its own tokens. Kept apart from
 * agentRuntime.test.ts so the Vertex stand-in here reaches no other test.
 */
const generateVertexContentWithRetry = vi.hoisted(() => vi.fn());

vi.mock("./vertexProviderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vertexProviderService")>();
  return {
    ...actual,
    createVertexGenAIClient: vi.fn(() => ({})),
    generateVertexContentWithRetry,
  };
});

describe("a workflow agent that searches the web", () => {
  test("counts its thinking as output, as Google bills it", async () => {
    // Thinking is reported apart from the answer. Counting the answer alone
    // made such a step read as a fraction of what it cost.
    generateVertexContentWithRetry.mockResolvedValueOnce({
      text: "{\"found\":true}",
      usageMetadata: { promptTokenCount: 1_200, candidatesTokenCount: 40, thoughtsTokenCount: 900 },
    });
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const agentId = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", {
        modelId: "test-model",
        providerKey: "google",
        // Provider-neutral: the drift guard keeps real model ids in the catalogue.
        providerModelId: "test-provider-model",
        displayName: "Test Model",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: Date.now(),
      });
      return await ctx.db.insert("agents", {
        name: "Researcher",
        avatar: "agent.png",
        systemPrompt: "Find it.",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        allowInternetAccess: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.action(internal.agentRuntime.executeAgentNode, { agentId, input: "Who sells brass handles?" });

    expect(generateVertexContentWithRetry).toHaveBeenCalledOnce();
    expect(result).toEqual({ output: "{\"found\":true}", usage: { inputTokens: 1_200, outputTokens: 940 } });
  });
});
