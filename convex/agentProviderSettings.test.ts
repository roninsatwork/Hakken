import { describe, expect, it } from "vitest";

import { buildGoogleAgentConfig } from "./googleAgentProvider";
import { appendAnthropicResponseShape, buildAnthropicTurnOptions } from "./anthropicAgentProvider";
import { buildOpenRouterTurnOptions } from "./openrouterAgentProvider";

/**
 * The two agent settings that reached no model.
 *
 * Reasoning effort was stored, versioned and offered on screen as Low, Medium
 * and High with a note about depth, latency and cost — and read by nothing, so
 * every agent ran at whatever its model does by default. Web access was read
 * only by the workflow-node path, so the same agent searched as a workflow step
 * and did not search when launched from its own page.
 *
 * These assert the request each provider is actually handed, because that is
 * the thing that was wrong: not the storage, not the screen, but what was sent.
 */
describe("agent provider settings reach the model", () => {
  const base = {
    systemInstruction: "You are an agent.",
    temperature: 0.1,
    usingCache: false,
  };

  describe("Google", () => {
    it("asks for thinking at the level the agent is set to", () => {
      const config = buildGoogleAgentConfig({ ...base, reasoningEffort: "HIGH" });

      expect(config.thinkingConfig).toEqual({ thinkingLevel: "HIGH" });
    });

    it("sends no thinking config when the agent has no setting", () => {
      const config = buildGoogleAgentConfig(base);

      expect(config.thinkingConfig).toBeUndefined();
    });

    it("offers search alongside the agent's own tools rather than instead of them", () => {
      const config = buildGoogleAgentConfig({
        ...base,
        tools: [{ functionDeclarations: [{ name: "search_knowledge" }] }],
        webSearch: true,
      });

      expect(config.tools).toEqual([
        { functionDeclarations: [{ name: "search_knowledge" }] },
        { googleSearch: {} },
      ]);
    });

    it("does not offer search when the agent is set offline", () => {
      const config = buildGoogleAgentConfig({ ...base, webSearch: false });

      expect(config.tools).toBeUndefined();
    });

    /**
     * A cached prefix holds the instruction and the tools, and repeating them
     * beside `cachedContent` is rejected. Thinking is per request, so it is the
     * one setting that still has to travel.
     */
    it("keeps thinking on a cached turn, and does not repeat the cached prefix", () => {
      const config = buildGoogleAgentConfig({
        ...base,
        usingCache: true,
        cacheName: "cachedContents/abc",
        reasoningEffort: "LOW",
        tools: [{ functionDeclarations: [{ name: "search_knowledge" }] }],
      });

      expect(config.cachedContent).toBe("cachedContents/abc");
      expect(config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
      expect(config.systemInstruction).toBeUndefined();
      expect(config.tools).toBeUndefined();
    });
  });

  describe("Anthropic", () => {
    it("turns each level into a thinking budget inside the output ceiling", () => {
      const low = buildAnthropicTurnOptions({ reasoningEffort: "LOW" });
      const high = buildAnthropicTurnOptions({ reasoningEffort: "HIGH" });

      // Anthropic's own floor is 1024, so Low is the floor rather than less.
      expect(low.thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
      expect(high.thinking).toEqual({ type: "enabled", budget_tokens: 4096 });
      // Every budget has to leave room for the answer within max_tokens (8192).
      expect(high.thinking!.budget_tokens).toBeLessThan(8192);
    });

    it("sends no thinking block when the agent has no setting", () => {
      expect(buildAnthropicTurnOptions({}).thinking).toBeUndefined();
    });

    it("adds the hosted search tool only when the agent is allowed the web", () => {
      expect(buildAnthropicTurnOptions({ webSearch: true }).extraTools).toEqual([
        { type: "web_search_20250305", name: "web_search" },
      ]);
      expect(buildAnthropicTurnOptions({ webSearch: false }).extraTools).toEqual([]);
    });
  });

  describe("OpenRouter", () => {
    it("passes the agent's level through in OpenRouter's own terms", () => {
      expect(buildOpenRouterTurnOptions({ reasoningEffort: "MEDIUM" })).toMatchObject({
        reasoning: { effort: "medium" },
      });
    });

    it("sends no reasoning field when the agent has no setting", () => {
      expect(buildOpenRouterTurnOptions({})).not.toHaveProperty("reasoning");
    });

    it("enables the web plugin only when the agent is allowed the web", () => {
      expect(buildOpenRouterTurnOptions({ webSearch: true })).toMatchObject({
        plugins: [{ id: "web" }],
      });
      expect(buildOpenRouterTurnOptions({ webSearch: false })).not.toHaveProperty("plugins");
    });
  });

  /**
   * The answer shape.
   *
   * Set on the agent and, like web access, honoured only when it ran as a
   * workflow node — so the screen's warning that the agent "will exclusively
   * reply in raw JSON" was untrue everywhere Launch Run could be pressed. And in
   * the one path that did read it, the builder wrote types in capitals while
   * this field takes standard JSON Schema, which is lowercase.
   */
  describe("the answer shape", () => {
    const shape = {
      type: "object",
      properties: { total: { type: "number" } },
      required: ["total"],
    };

    it("Google is asked for JSON matching the shape", () => {
      const config = buildGoogleAgentConfig({ ...base, responseJsonSchema: shape });

      expect(config.responseMimeType).toBe("application/json");
      expect(config.responseJsonSchema).toEqual(shape);
    });

    it("Google is left conversational when no shape is set", () => {
      const config = buildGoogleAgentConfig(base);

      expect(config.responseMimeType).toBeUndefined();
      expect(config.responseJsonSchema).toBeUndefined();
    });

    it("OpenRouter is given the shape as a strict schema", () => {
      expect(buildOpenRouterTurnOptions({ responseJsonSchema: shape })).toMatchObject({
        response_format: {
          type: "json_schema",
          json_schema: { name: "agent_response", strict: true, schema: shape },
        },
      });
    });

    it("OpenRouter is left conversational when no shape is set", () => {
      expect(buildOpenRouterTurnOptions({})).not.toHaveProperty("response_format");
    });

    /**
     * Anthropic has no response-format field, so the shape is asked for in
     * words. A weaker guarantee than the other two, and better than silently
     * ignoring the setting.
     */
    it("Anthropic is told the shape in its instruction", () => {
      const instruction = appendAnthropicResponseShape("You are an agent.", shape);

      expect(instruction).toContain("You are an agent.");
      expect(instruction).toContain("Reply with JSON only");
      expect(instruction).toContain(JSON.stringify(shape));
    });

    it("Anthropic's instruction is untouched when no shape is set", () => {
      expect(appendAnthropicResponseShape("You are an agent.", undefined))
        .toBe("You are an agent.");
    });
  });

});
