import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
});
