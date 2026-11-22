import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock("./aiProviderRegistry", () => ({ generateTextWithResolvedModel: generateTextMock }));

beforeEach(() => generateTextMock.mockReset());

describe("agent intent orchestrator", () => {
  test("routing requires a user and returns no match when no company agents are available", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      return await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
      });
    });

    await expect(t.action(api.orchestrator.routeAgentIntent, { prompt: "Help me" })).rejects.toThrow(
      "Unauthenticated request"
    );
    await expect(
      t.withIdentity({ subject: userId }).action(api.orchestrator.routeAgentIntent, { prompt: "Help me" })
    ).resolves.toEqual({ matchedAgentId: null, confidence: 0 });
  });

  test("direct router calls reserve a small per-user budget before the model", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { email: "user@example.com", role: "USER", companyId });
      await ctx.db.insert("agents", {
        name: "Specialist", modelId: "router-test", thinkingMode: false,
        isActive: true, isGlobal: true, createdAt: Date.now(), updatedAt: Date.now(),
      });
      await ctx.db.insert("aiModels", {
        modelId: "router-test", displayName: "Router Test", providerKey: "google",
        providerModelId: "router-test", isEnabled: true, isDefault: true, lastSyncedAt: Date.now(),
      });
      return userId;
    });
    generateTextMock.mockResolvedValue({ text: '{"matchedAgentId":"","confidence":0}', inputTokens: 10, outputTokens: 2 });
    const user = t.withIdentity({ subject: userId });
    const route = () => user.action(api.orchestrator.routeAgentIntent, { prompt: "Help me" });

    for (let i = 0; i < 10; i += 1) expect(await route()).toEqual({ matchedAgentId: null, confidence: 0 });
    expect(generateTextMock).toHaveBeenCalledTimes(10);
    expect(await route()).toEqual({ matchedAgentId: null, confidence: 0 });
    expect(generateTextMock).toHaveBeenCalledTimes(10);
    const requests = await t.run(async (ctx) => ctx.db.query("aiActionRequests").collect());
    expect(requests).toHaveLength(10);
  });

  test("an oversized direct router prompt never reaches the model", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      return ctx.db.insert("users", { email: "user@example.com", role: "USER", companyId });
    });
    await expect(t.withIdentity({ subject: userId }).action(api.orchestrator.routeAgentIntent, {
      prompt: "a".repeat(10_001),
    })).rejects.toThrow("10,000");
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
