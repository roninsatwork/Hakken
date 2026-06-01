import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
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
    expect(page.totalCount).toBe(3);

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

    await expect(
      client.query(api.aiModels.getOffsetPaginatedModels, {
        searchTerm: "",
        statusFilter: "all" as "active",
        page: 1,
        pageSize: 15
      })
    ).rejects.toThrow(/Validator error|Value does not match validator/);
  });

  test("SUPER_ADMIN can set a default model, enable it, clear old defaults, and write an audit log", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, oldDefaultId, candidateId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
      const oldDefaultId = await ctx.db.insert("aiModels", {
        modelId: "old-default",
        displayName: "Old Default",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: Date.now()
      });
      const candidateId = await ctx.db.insert("aiModels", {
        modelId: "candidate-default",
        displayName: "Candidate Default",
        isEnabled: false,
        isDefault: false,
        lastSyncedAt: Date.now()
      });

      return { adminId, oldDefaultId, candidateId };
    });

    const client = t.withIdentity({ subject: adminId });

    await client.mutation(api.aiModels.setDefaultModel, { modelId: candidateId });

    const { oldDefault, candidate, auditLogs } = await t.run(async (ctx) => ({
      oldDefault: await ctx.db.get(oldDefaultId),
      candidate: await ctx.db.get(candidateId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(oldDefault?.isDefault).toBe(false);
    expect(candidate?.isDefault).toBe(true);
    expect(candidate?.isEnabled).toBe(true);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].actionType).toBe("SET_DEFAULT_AI_MODEL");
    expect(JSON.parse(auditLogs[0].metadata || "{}")).toEqual({ model: "candidate-default" });
  });

  test("SUPER_ADMIN disabling a default model clears default status and writes an audit log", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, modelId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
      const modelId = await ctx.db.insert("aiModels", {
        modelId: "default-to-disable",
        displayName: "Default To Disable",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: Date.now()
      });

      return { adminId, modelId };
    });

    const client = t.withIdentity({ subject: adminId });

    await client.mutation(api.aiModels.toggleModelEnforcement, {
      modelId,
      isEnabled: false
    });

    const { model, auditLogs } = await t.run(async (ctx) => ({
      model: await ctx.db.get(modelId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(model?.isEnabled).toBe(false);
    expect(model?.isDefault).toBe(false);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].actionType).toBe("TOGGLE_AI_MODEL");
    expect(JSON.parse(auditLogs[0].metadata || "{}")).toEqual({
      model: "default-to-disable",
      enabled: false,
    });
  });

  test("SUPER_ADMIN can update pricing configuration and audit changed fields", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, modelId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
      const modelId = await ctx.db.insert("aiModels", {
        modelId: "priced-model",
        displayName: "Priced Model",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now()
      });

      return { adminId, modelId };
    });

    const client = t.withIdentity({ subject: adminId });

    await client.mutation(api.aiModels.updatePricingConfig, {
      modelId,
      friendlyName: "Friendly Priced Model",
      standardInputCostBelow200k: 1.25,
      outputResponseCost: 2.5,
    });

    const { model, auditLogs } = await t.run(async (ctx) => ({
      model: await ctx.db.get(modelId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(model?.friendlyName).toBe("Friendly Priced Model");
    expect(model?.standardInputCostBelow200k).toBe(1.25);
    expect(model?.outputResponseCost).toBe(2.5);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].actionType).toBe("UPDATE_MODEL_PRICING");
    expect(JSON.parse(auditLogs[0].metadata || "{}")).toEqual({
      model: "priced-model",
      fields: {
        friendlyName: "Friendly Priced Model",
        standardInputCostBelow200k: 1.25,
        outputResponseCost: 2.5,
      },
    });
  });

  test("internalBatchUpsert inserts new models disabled and refreshes existing metadata", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const existingId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiModels", {
        modelId: "existing-model",
        displayName: "Old Name",
        description: "Old description",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: 1,
      });
    });

    await t.mutation(internal.aiModels.internalBatchUpsert, {
      models: [
        {
          modelId: "existing-model",
          displayName: "New Name",
          description: "New description",
        },
        {
          modelId: "new-model",
          displayName: "New Model",
          description: "Fresh model",
        },
      ],
    });

    const { existing, created } = await t.run(async (ctx) => ({
      existing: await ctx.db.get(existingId),
      created: await ctx.db
        .query("aiModels")
        .withIndex("by_model_id", (q) => q.eq("modelId", "new-model"))
        .first(),
    }));

    expect(existing?.displayName).toBe("New Name");
    expect(existing?.description).toBe("New description");
    expect(existing?.isEnabled).toBe(true);
    expect(existing?.isDefault).toBe(true);
    expect(existing?.lastSyncedAt).toBeGreaterThan(1);
    expect(created).toMatchObject({
      modelId: "new-model",
      displayName: "New Model",
      description: "Fresh model",
      isEnabled: false,
      isDefault: false,
    });
  });

  test("authenticated users can read models but unauthenticated clients cannot", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, modelId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "reader@test.com",
        role: "USER"
      });
      const modelId = await ctx.db.insert("aiModels", {
        modelId: "readable-model",
        displayName: "Readable Model",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now()
      });

      return { userId, modelId };
    });

    const client = t.withIdentity({ subject: userId });

    await expect(t.query(api.aiModels.getModels, {})).rejects.toThrow("Unauthenticated request");
    await expect(t.query(api.aiModels.getModel, { modelId })).rejects.toThrow("Unauthenticated request");

    const models = await client.query(api.aiModels.getModels, {});
    const model = await client.query(api.aiModels.getModel, { modelId });

    expect(models.map((entry) => entry.modelId)).toEqual(["readable-model"]);
    expect(model?.modelId).toBe("readable-model");
  });

  test("Standard USER cannot update model pricing configuration", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, modelId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER"
      });
      const modelId = await ctx.db.insert("aiModels", {
        modelId: "protected-pricing-model",
        displayName: "Protected Pricing Model",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now()
      });

      return { userId, modelId };
    });

    const client = t.withIdentity({ subject: userId });

    await expect(
      client.mutation(api.aiModels.updatePricingConfig, {
        modelId,
        outputResponseCost: 10,
      })
    ).rejects.toThrow("Unauthorized");
  });
});
