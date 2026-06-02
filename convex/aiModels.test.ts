import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  DEFAULT_MODEL_USE_CASES,
  GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
  GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
  GOOGLE_VERTEX_PROVIDER_KEY,
} from "./aiModelService";

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

    const modelIdSearchPage = await client.query(api.aiModels.getOffsetPaginatedModels, {
      searchTerm: "default-model",
      page: 1,
      pageSize: 15
    });

    expect(modelIdSearchPage.data.map((model) => model.modelId)).toEqual(["default-model"]);

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
      providerKey: "google",
      providerModelId: "new-model",
      displayName: "New Model",
      description: "Fresh model",
      isEnabled: false,
      isDefault: false,
      status: "available",
    });
  });

  test("provider sync seeds provider metadata and global use-case defaults", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const defaultId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiModels", {
        modelId: "existing-default",
        providerKey: "google",
        providerModelId: "existing-default",
        displayName: "Existing Default",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: 1,
      });
    });

    await t.mutation(internal.aiModels.internalBatchUpsert, {
      providerKey: "google",
      providerDisplayName: "Google Vertex AI",
      defaultUseCases: ["chat", "agent"],
      models: [
        {
          modelId: "existing-default",
          providerModelId: "existing-default",
          displayName: "Existing Default Refreshed",
          capabilities: ["text", "tool-calling"],
          supportedUseCases: ["chat", "agent"],
          contextWindowTokens: 1_000_000,
        },
      ],
    });

    const { provider, model, defaults } = await t.run(async (ctx) => ({
      provider: await ctx.db.query("aiProviders").withIndex("by_provider_key", (q) => q.eq("providerKey", "google")).first(),
      model: await ctx.db.get(defaultId),
      defaults: await ctx.db.query("aiModelDefaults").collect(),
    }));

    expect(provider).toMatchObject({
      providerKey: "google",
      displayName: "Google Vertex AI",
      isEnabled: true,
      status: "healthy",
      syncStatus: "synced",
    });
    expect(model).toMatchObject({
      displayName: "Existing Default Refreshed",
      providerKey: "google",
      providerModelId: "existing-default",
      capabilities: ["text", "tool-calling"],
      supportedUseCases: ["chat", "agent"],
      contextWindowTokens: 1_000_000,
      status: "available",
    });
    expect(defaults
      .map((entry) => ({ useCase: entry.useCase, modelId: entry.modelId, providerKey: entry.providerKey }))
      .sort((a, b) => a.useCase.localeCompare(b.useCase))
    ).toEqual([
      { useCase: "agent", modelId: "existing-default", providerKey: "google" },
      { useCase: "chat", modelId: "existing-default", providerKey: "google" },
    ]);
  });

  test("model pagination can filter by provider", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "google",
        displayName: "Google Vertex AI",
        isEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("aiModels", {
        modelId: "gemini-model",
        providerKey: "google",
        providerModelId: "gemini-model",
        displayName: "Gemini Model",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now(),
      });
      await ctx.db.insert("aiModels", {
        modelId: "openai:gpt-test",
        providerKey: "openai",
        providerModelId: "gpt-test",
        displayName: "GPT Test",
        isEnabled: true,
        isDefault: false,
        capabilities: ["text", "tool-calling"],
        supportedUseCases: ["chat", "agent"],
        lastSyncedAt: Date.now(),
      });
      await ctx.db.insert("aiModels", {
        modelId: "openai:vision-test",
        providerKey: "openai",
        providerModelId: "vision-test",
        displayName: "Vision Test",
        isEnabled: true,
        isDefault: false,
        capabilities: ["text", "vision"],
        supportedUseCases: ["chat", "vision"],
        lastSyncedAt: Date.now(),
      });
      return adminId;
    });

    const client = t.withIdentity({ subject: adminId });
    const page = await client.query(api.aiModels.getOffsetPaginatedModels, {
      providerFilter: "openai",
      statusFilter: "active",
      searchTerm: "",
      page: 1,
      pageSize: 15,
    });
    const providers = await client.query(api.aiModels.getProviders, {});

    expect(page.data.map((model) => model.modelId)).toEqual(["openai:gpt-test", "openai:vision-test"]);

    const filteredPage = await client.query(api.aiModels.getOffsetPaginatedModels, {
      providerFilter: "openai",
      statusFilter: "active",
      capabilityFilter: "tool-calling",
      useCaseFilter: "agent",
      searchTerm: "",
      page: 1,
      pageSize: 15,
    });

    expect(filteredPage.data.map((model) => model.modelId)).toEqual(["openai:gpt-test"]);
    expect(providers.map((provider) => provider.providerKey)).toEqual(["google", "openai", "anthropic"]);
  });

  test("provider catalogue returns platform providers and super-admins can disable providers", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
    });

    const client = t.withIdentity({ subject: adminId });
    const initialProviders = await client.query(api.aiModels.getProviders, {});

    expect(initialProviders.map((provider) => provider.providerKey)).toEqual(["google", "openai", "anthropic"]);
    expect(initialProviders.every((provider) => provider.authMode === "environment")).toBe(true);

    await client.mutation(api.aiModels.setProviderEnabled, {
      providerKey: "openai",
      isEnabled: false,
    });

    const providers = await client.query(api.aiModels.getProviders, {});
    const openAIProvider = providers.find((provider) => provider.providerKey === "openai");

    expect(openAIProvider).toMatchObject({
      providerKey: "openai",
      isEnabled: false,
      status: "disabled",
      syncStatus: "disabled",
    });
  });

  test("SUPER_ADMIN can set and clear platform model defaults by use case", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: true,
        status: "healthy",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("aiModels", {
        modelId: "openai:gpt-default",
        providerKey: "openai",
        providerModelId: "gpt-default",
        displayName: "GPT Default",
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["chat"],
        lastSyncedAt: Date.now(),
      });
      return adminId;
    });

    const client = t.withIdentity({ subject: adminId });
    await client.mutation(api.aiModels.setGlobalModelDefault, {
      useCase: "chat",
      modelId: "openai:gpt-default",
    });

    const defaults = await client.query(api.aiModels.getGlobalModelDefaults, {});
    const chatDefault = defaults.defaults.find((row) => row.useCase === "chat");

    expect(chatDefault?.default).toMatchObject({
      modelId: "openai:gpt-default",
      providerKey: "openai",
    });

    await client.mutation(api.aiModels.clearGlobalModelDefault, { useCase: "chat" });

    const clearedDefaults = await client.query(api.aiModels.getGlobalModelDefaults, {});
    expect(clearedDefaults.defaults.find((row) => row.useCase === "chat")?.default).toBeNull();
  });

  test("legacy Google model rows are inferred as Google Vertex AI, not legacy provider rows", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
      await ctx.db.insert("aiModels", {
        modelId: "gemini-3.1-flash-image",
        displayName: "Gemini 3.1 Flash Image",
        isEnabled: false,
        isDefault: false,
        lastSyncedAt: Date.now(),
      });
      await ctx.db.insert("aiModels", {
        modelId: "unclassified-model",
        displayName: "Unclassified Model",
        isEnabled: false,
        isDefault: false,
        lastSyncedAt: Date.now(),
      });
      return adminId;
    });

    const client = t.withIdentity({ subject: adminId });
    const inactiveGooglePage = await client.query(api.aiModels.getOffsetPaginatedModels, {
      providerFilter: "google",
      statusFilter: "inactive",
      searchTerm: "",
      page: 1,
      pageSize: 15,
    });
    const providers = await client.query(api.aiModels.getProviders, {});

    expect(inactiveGooglePage.data.map((model) => ({
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
    }))).toEqual([
      {
        modelId: "gemini-3.1-flash-image",
        providerKey: "google",
        providerModelId: "gemini-3.1-flash-image",
      },
    ]);
    expect(providers.map((provider) => provider.providerKey)).toContain("google");
  });

  test("Google Vertex backfill persists provider metadata on older Google model rows", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const modelId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiModels", {
        modelId: "gemini-3.5-flash",
        displayName: "Gemini 3.5 Flash",
        isEnabled: false,
        isDefault: false,
        lastSyncedAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.aiModels.backfillGoogleVertexModelProviders, {});
    const model = await t.run(async (ctx) => ctx.db.get(modelId));

    expect(result).toEqual({ updatedCount: 1 });
    expect(model).toMatchObject({
      providerKey: "google",
      providerModelId: "gemini-3.5-flash",
      status: "available",
    });
  });

  test("provider-aware resolver returns stable model and provider-native IDs for use-case defaults", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", {
        modelId: "google-default",
        providerKey: "google",
        providerModelId: "google-default",
        displayName: "Google Default",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModels", {
        modelId: "openai:gpt-test",
        providerKey: "openai",
        providerModelId: "gpt-test",
        displayName: "GPT Test",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModelDefaults", {
        scope: "global",
        useCase: "chat",
        providerKey: "openai",
        modelId: "openai:gpt-test",
        updatedAt: now,
      });
    });

    const resolvedConfig = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "chat",
      });
    });
    const resolvedLegacyString = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.aiModels.resolveModelForExecution, {
        useCase: "chat",
      });
    });

    expect(resolvedConfig).toEqual({
      modelId: "openai:gpt-test",
      providerKey: "openai",
      providerModelId: "gpt-test",
      source: "default",
    });
    expect(resolvedLegacyString).toBe("openai:gpt-test");
  });

  test("embedding resolver uses the stable Google Vertex embedding fallback when no embedding default exists", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const resolved = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {});
    });

    expect(resolved).toEqual({
      modelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
      providerModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      source: "failsafe",
      embeddingDimensions: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
    });
  });

  test("embedding resolver rejects non-Google defaults to protect the 768-dimension vector index", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", {
        modelId: "openai:text-embedding-3-small",
        providerKey: "openai",
        providerModelId: "text-embedding-3-small",
        displayName: "OpenAI Embedding",
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["embedding"],
        capabilities: ["embeddings"],
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModelDefaults", {
        scope: "global",
        useCase: "embedding",
        providerKey: "openai",
        modelId: "openai:text-embedding-3-small",
        updatedAt: now,
      });
    });

    await expect(t.run(async (ctx) => {
      return await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {});
    })).rejects.toThrow("Embedding generation currently requires a Google Vertex model");
  });

  test("super admins can set and clear company model defaults by use case", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { adminId, companyId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const companyId = await ctx.db.insert("companies", {
        name: "Company",
        createdAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("aiModels", {
        modelId: "global-chat-model",
        providerKey: "google",
        providerModelId: "global-chat-model",
        displayName: "Global Chat Model",
        isEnabled: true,
        isDefault: true,
        supportedUseCases: ["chat"],
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModels", {
        modelId: "openai:gpt-company",
        providerKey: "openai",
        providerModelId: "gpt-company",
        displayName: "Company GPT",
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["chat"],
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModelDefaults", {
        scope: "global",
        useCase: "chat",
        providerKey: "google",
        modelId: "global-chat-model",
        updatedAt: now,
      });

      return { adminId, companyId };
    });

    const client = t.withIdentity({ subject: adminId });

    const initialDefaults = await client.query(api.aiModels.getCompanyModelDefaults, { companyId });
    expect(initialDefaults.useCases).toEqual(DEFAULT_MODEL_USE_CASES);
    expect(initialDefaults.defaults.find((row) => row.useCase === "chat")).toMatchObject({
      companyDefault: null,
      globalDefault: {
        modelId: "global-chat-model",
        providerKey: "google",
      },
    });

    await expect(client.mutation(api.aiModels.setCompanyModelDefault, {
      companyId,
      useCase: "chat",
      modelId: "openai:gpt-company",
    })).resolves.toBe(true);

    const resolved = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        companyId,
        useCase: "chat",
      });
    });
    expect(resolved).toMatchObject({
      modelId: "openai:gpt-company",
      providerKey: "openai",
      providerModelId: "gpt-company",
      source: "default",
    });

    const companyDefaults = await client.query(api.aiModels.getCompanyModelDefaults, { companyId });
    expect(companyDefaults.defaults.find((row) => row.useCase === "chat")?.companyDefault).toMatchObject({
      modelId: "openai:gpt-company",
      providerKey: "openai",
    });

    await expect(client.mutation(api.aiModels.clearCompanyModelDefault, {
      companyId,
      useCase: "chat",
    })).resolves.toBe(true);

    const clearedDefaults = await client.query(api.aiModels.getCompanyModelDefaults, { companyId });
    expect(clearedDefaults.defaults.find((row) => row.useCase === "chat")?.companyDefault).toBeNull();
  });

  test("company model defaults reject unauthorized users and unsafe model choices", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { userId, adminId, companyId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
      });
      const adminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const companyId = await ctx.db.insert("companies", {
        name: "Company",
        createdAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "disabled-provider",
        displayName: "Disabled Provider",
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("aiModels", {
        modelId: "disabled-model",
        displayName: "Disabled Model",
        isEnabled: false,
        isDefault: false,
        supportedUseCases: ["chat"],
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModels", {
        modelId: "agent-only-model",
        displayName: "Agent Only",
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["agent"],
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModels", {
        modelId: "disabled-provider:model",
        providerKey: "disabled-provider",
        providerModelId: "model",
        displayName: "Disabled Provider Model",
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["chat"],
        lastSyncedAt: now,
      });

      return { userId, adminId, companyId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(userClient.query(api.aiModels.getCompanyModelDefaults, { companyId })).rejects.toThrow("Unauthorized");
    await expect(userClient.mutation(api.aiModels.setCompanyModelDefault, {
      companyId,
      useCase: "chat",
      modelId: "agent-only-model",
    })).rejects.toThrow("Unauthorized");

    await expect(adminClient.mutation(api.aiModels.setCompanyModelDefault, {
      companyId,
      useCase: "chat",
      modelId: "disabled-model",
    })).rejects.toThrow("Selected AI model is not enabled");

    await expect(adminClient.mutation(api.aiModels.setCompanyModelDefault, {
      companyId,
      useCase: "chat",
      modelId: "agent-only-model",
    })).rejects.toThrow("Selected AI model does not support the chat use case");

    await expect(adminClient.mutation(api.aiModels.setCompanyModelDefault, {
      companyId,
      useCase: "chat",
      modelId: "disabled-provider:model",
    })).rejects.toThrow("Selected AI model provider is disabled");
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
