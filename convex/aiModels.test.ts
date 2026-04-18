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

  test("getOffsetPaginatedModels sorts Default -> Active -> Inactive correctly", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Set up Super Admin map
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
    });

    await t.run(async (ctx) => {
      // Inactive
      await ctx.db.insert("aiModels", {
        modelId: "gemini-1.0-pro",
        displayName: "Gemini 1",
        isEnabled: false,
        isDefault: false,
        lastSyncedAt: Date.now()
      });
      // Active but not default
      await ctx.db.insert("aiModels", {
        modelId: "gemini-1.5-pro",
        displayName: "Gemini 1.5",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now()
      });
      // Default
      await ctx.db.insert("aiModels", {
        modelId: "gemini-2.0-pro",
        displayName: "Gemini 2.0",
        isEnabled: true,
        isDefault: true, // Should float to top
        lastSyncedAt: Date.now()
      });
    });

    const client = t.withIdentity({ subject: adminId });

    const page = await client.query(api.aiModels.getOffsetPaginatedModels, {
      searchTerm: "",
      page: 1
    });
    
    // Sort logic validation: Default -> Active -> Disabled
    expect(page.data.length).toBe(3);
    expect(page.data[0].modelId).toBe("gemini-2.0-pro"); // Default MUST be 0th
    expect(page.data[1].modelId).toBe("gemini-1.5-pro"); // Enabled must be 1st
    expect(page.data[2].modelId).toBe("gemini-1.0-pro"); // Disabled must be 2nd
  });
});
