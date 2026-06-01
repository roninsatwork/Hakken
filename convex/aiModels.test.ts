import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - AI Models", () => {
  test("Standard USER cannot selectively enable or disable expensive AI models", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const modelId = await t.run(async (ctx) => {
       return await ctx.db.insert("aiModels", {
         modelId: "expensive-model",
         displayName: "Expensive Model",
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
         modelId: "candidate-model",
         displayName: "Candidate Model",
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
        modelId: "inactive-model",
        displayName: "Inactive Model",
        isEnabled: false,
        isDefault: false,
        lastSyncedAt: Date.now()
      });
      // Active but not default
      await ctx.db.insert("aiModels", {
        modelId: "active-model",
        displayName: "Active Model",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now()
      });
      // Default
      await ctx.db.insert("aiModels", {
        modelId: "default-model",
        displayName: "Default Model",
        isEnabled: true,
        isDefault: true, // Should float to top
        lastSyncedAt: Date.now()
      });
    });

    const client = t.withIdentity({ subject: adminId });

    const page = await client.query(api.aiModels.getOffsetPaginatedModels, {
      searchTerm: "",
      page: 1,
      pageSize: 15
    });
    
    // Sort logic validation: Default -> Active -> Disabled
    expect(page.data.length).toBe(3);
    expect(page.data[0].modelId).toBe("default-model"); // Default MUST be 0th
    expect(page.data[1].modelId).toBe("active-model"); // Enabled must be 1st
    expect(page.data[2].modelId).toBe("inactive-model"); // Disabled must be 2nd

    const activePage = await client.query(api.aiModels.getOffsetPaginatedModels, {
      searchTerm: "",
      statusFilter: "active",
      page: 1,
      pageSize: 15
    });

    expect(activePage.data.map((model) => model.modelId)).toEqual([
      "default-model",
      "active-model",
    ]);

    const inactivePage = await client.query(api.aiModels.getOffsetPaginatedModels, {
      searchTerm: "",
      statusFilter: "inactive",
      page: 1,
      pageSize: 15
    });

    expect(inactivePage.data.map((model) => model.modelId)).toEqual(["inactive-model"]);
  });
});
