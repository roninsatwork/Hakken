import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - AI Models", () => {
  test("Standard USER cannot selectively enable or disable expensive AI models", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const modelId = await t.run(async (ctx) => {
       return await ctx.db.insert("aiModels", {
         modelId: "gemini-1.5-pro",
         displayName: "Gemini 1.5 Pro",
         isEnabled: false,
         isDefault: false,
         lastSyncedAt: Date.now()
       });
    });

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.aiModels.toggleModelEnforcement, { 
        modelId: modelId, 
        isEnabled: true 
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot alter the default platform AI model", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const modelId = await t.run(async (ctx) => {
       return await ctx.db.insert("aiModels", {
         modelId: "gemini-1.5-pro",
         displayName: "Gemini 1.5 Pro",
         isEnabled: false,
         isDefault: false,
         lastSyncedAt: Date.now()
       });
    });

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.aiModels.setDefaultModel, { 
        modelId: modelId 
      })
    ).rejects.toThrow("Unauthorized");
  });
});
