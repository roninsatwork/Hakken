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

  /**
   * A colon in a model id no longer means "already provider-qualified".
   *
   * That rule held while every provider's own ids were colon-free. OpenRouter
   * publishes ids shaped `vendor/model:variant`, which the old rule would have
   * stored unqualified — colliding in `by_model_id` with any other provider
   * using the same string, and doing so silently, four hundred rows at a time.
   */
  test("provider-qualified ids survive a provider whose own ids contain a colon", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openrouter",
        providerDisplayName: "OpenRouter",
        models: [
          { modelId: "vendor/some-model:beta", displayName: "Some Model Beta" },
          { modelId: "vendor/some-model", displayName: "Some Model" },
        ],
      });
      // A different provider publishing the same-looking id must not collide.
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: [{ modelId: "vendor/some-model:beta", displayName: "Different Provider" }],
      });
    });

    const stored = await t.run(async (ctx) => await ctx.db.query("aiModels").collect());

    expect(stored.map((model) => model.modelId).sort()).toEqual([
      "openai:vendor/some-model:beta",
      "openrouter:vendor/some-model",
      "openrouter:vendor/some-model:beta",
    ]);
    // Three distinct rows, not two rows and a silent overwrite.
    expect(new Set(stored.map((model) => model.modelId)).size).toBe(3);
  });

  test("prices reported by a provider are stored, and absent ones leave typed-in rates alone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openrouter",
        providerDisplayName: "OpenRouter",
        models: [{
          modelId: "vendor/priced",
          displayName: "Priced",
          standardInputCostBelow200k: 3,
          standardInputCostAbove200k: 3,
          outputResponseCost: 15,
        }],
      });
    });

    const priced = await t.run(async (ctx) =>
      await ctx.db.query("aiModels").withIndex("by_model_id", (q) => q.eq("modelId", "openrouter:vendor/priced")).first()
    );
    expect(priced).toMatchObject({ standardInputCostBelow200k: 3, outputResponseCost: 15 });

    // A provider that reports no prices must not wipe what is already stored —
    // for every provider but OpenRouter, those rates were typed in by hand.
    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openrouter",
        providerDisplayName: "OpenRouter",
        models: [{ modelId: "vendor/priced", displayName: "Priced Renamed" }],
      });
    });

    const afterResync = await t.run(async (ctx) =>
      await ctx.db.query("aiModels").withIndex("by_model_id", (q) => q.eq("modelId", "openrouter:vendor/priced")).first()
    );
    expect(afterResync).toMatchObject({
      displayName: "Priced Renamed",
      standardInputCostBelow200k: 3,
      outputResponseCost: 15,
    });
  });

  /**
   * A job can only be given to a model whose provider can do it.
   *
   * Phase O made most of this platform provider-neutral but not all of it, and
   * the remainder is what this guards. Checked on the server as well as in the
   * picker, because a screen that offers only valid choices and a runtime that
   * accepts anything is one API call away from the failure it was meant to
   * prevent — and the failure is silent until the work does not happen.
   */
  test("a job that only Google can do refuses a model from another provider", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
      await ctx.db.insert("aiModels", {
        modelId: "openrouter:vendor/embedder",
        providerKey: "openrouter",
        providerModelId: "vendor/embedder",
        displayName: "Vendor Embedder",
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["embedding"],
        lastSyncedAt: Date.now(),
      });
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    await expect(
      client.mutation(api.aiModels.setGlobalModelDefault, {
        useCase: "embedding",
        modelId: "openrouter:vendor/embedder",
      })
    ).rejects.toThrow(/cannot handle the embedding job/);
  });

  test("a job needing tools refuses a provider with no agent adapter", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
      // OpenAI has a text adapter but no agent adapter, so it cannot run agents.
      await ctx.db.insert("aiModels", {
        modelId: "openai:text-only",
        providerKey: "openai",
        providerModelId: "text-only",
        displayName: "Text Only",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now(),
      });
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    await expect(
      client.mutation(api.aiModels.setGlobalModelDefault, { useCase: "agent", modelId: "openai:text-only" })
    ).rejects.toThrow(/cannot handle the agent job/);

    // The same model is perfectly fine for a job that is only text.
    await client.mutation(api.aiModels.setGlobalModelDefault, { useCase: "chat", modelId: "openai:text-only" });
    const stored = await t.run(async (ctx) =>
      await ctx.db.query("aiModelDefaults").withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", "chat")).first()
    );
    expect(stored?.modelId).toBe("openai:text-only");
  });

  test("an OpenRouter model can run agents, because it has an agent adapter", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
      await ctx.db.insert("aiModels", {
        modelId: "openrouter:vendor/tool-user",
        providerKey: "openrouter",
        providerModelId: "vendor/tool-user",
        displayName: "Tool User",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: Date.now(),
      });
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    await client.mutation(api.aiModels.setGlobalModelDefault, {
      useCase: "agent",
      modelId: "openrouter:vendor/tool-user",
    });

    const stored = await t.run(async (ctx) =>
      await ctx.db.query("aiModelDefaults").withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", "agent")).first()
    );
    expect(stored?.modelId).toBe("openrouter:vendor/tool-user");
  });

  test("the catalogue pages and filters in the database", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: [
          { modelId: "alpha-model", displayName: "Alpha Model" },
          { modelId: "beta-model", displayName: "Beta Model" },
        ],
      });
    });

    const client = t.withIdentity({ subject: adminId });

    // Synced models arrive switched off, so the inactive view holds both.
    const inactive = await client.query(api.aiModels.getPaginatedModels, {
      statusFilter: "inactive",
      paginationOpts: { numItems: 15, cursor: null },
    });
    expect(inactive.page.map((model) => model.displayName).sort()).toEqual(["Alpha Model", "Beta Model"]);

    const active = await client.query(api.aiModels.getPaginatedModels, {
      statusFilter: "active",
      paginationOpts: { numItems: 15, cursor: null },
    });
    expect(active.page).toEqual([]);

    // Real paging: one item, then a cursor that yields the other.
    const firstPage = await client.query(api.aiModels.getPaginatedModels, {
      statusFilter: "inactive",
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await client.query(api.aiModels.getPaginatedModels, {
      statusFilter: "inactive",
      paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
    });
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.page[0].modelId).not.toBe(firstPage.page[0].modelId);
  });

  /**
   * Search and filter have to narrow together, inside the index.
   *
   * The Skill Center shipped this bug: the status was applied to a page *after*
   * it had been paginated, so a search whose first page happened to be entirely
   * the wrong status returned nothing at all — a catalogue with matching rows
   * answering "no results". The model catalogue had the same shape, with no
   * filter fields on its search indexes.
   *
   * The fixture is built to reproduce exactly that: twenty inactive models all
   * matching the search word, and one active model matching it too.
   */
  test("searching while filtered finds the matches, not the first page of non-matches", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: Array.from({ length: 20 }, (_, index) => ({
          modelId: `swift-runner-${index}`,
          displayName: `Swift Runner ${index}`,
        })),
      });
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: [{ modelId: "swift-champion", displayName: "Swift Champion" }],
      });
    });

    const championId = await t.run(async (ctx) => {
      const champion = await ctx.db
        .query("aiModels")
        .withIndex("by_model_id", (q) => q.eq("modelId", "openai:swift-champion"))
        .first();
      await ctx.db.patch(champion!._id, { isEnabled: true });
      return champion!._id;
    });
    expect(championId).toBeDefined();

    const client = t.withIdentity({ subject: adminId });

    const result = await client.query(api.aiModels.getPaginatedModels, {
      searchTerm: "swift",
      statusFilter: "active",
      paginationOpts: { numItems: 5, cursor: null },
    });

    expect(result.page.map((model) => model.modelId)).toEqual(["openai:swift-champion"]);
  });

  test("catalogue search finds a model by its id as well as its name", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: [{ modelId: "quiet-otter", displayName: "Friendly Name Only" }],
      });
    });

    const client = t.withIdentity({ subject: adminId });

    // One search field, so the stable id and the display name both reach it.
    const byId = await client.query(api.aiModels.getPaginatedModels, {
      searchTerm: "otter",
      paginationOpts: { numItems: 5, cursor: null },
    });
    const byName = await client.query(api.aiModels.getPaginatedModels, {
      searchTerm: "friendly",
      paginationOpts: { numItems: 5, cursor: null },
    });

    expect(byId.page.map((model) => model.modelId)).toEqual(["openai:quiet-otter"]);
    expect(byName.page.map((model) => model.modelId)).toEqual(["openai:quiet-otter"]);
  });

  /**
   * Counts come from a rollup, and the rollup is recomputed on write.
   *
   * Counting cannot be indexed away, and counting on every page load is the
   * fan-out removed from the Skill Center. Recomputing on write rather than
   * keeping deltas means drift is impossible across the four paths that can
   * change the answer.
   */
  test("model counts are maintained by the writes that change them", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: adminId });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: [
          { modelId: "one", displayName: "One" },
          { modelId: "two", displayName: "Two" },
        ],
      });
    });

    const afterSync = await client.query(api.aiModels.getModelCounts, {});
    expect(afterSync).toMatchObject({ totalModels: 2, enabledModels: 0 });
    expect(afterSync.byProvider).toEqual([{ providerKey: "openai", total: 2, enabled: 0 }]);
    expect(afterSync.computedAt).not.toBeNull();

    const oneId = await t.run(async (ctx) => {
      const model = await ctx.db
        .query("aiModels")
        .withIndex("by_model_id", (q) => q.eq("modelId", "openai:one"))
        .first();
      return model!._id;
    });

    await client.mutation(api.aiModels.toggleModelEnforcement, { modelId: oneId, isEnabled: true });
    expect(await client.query(api.aiModels.getModelCounts, {})).toMatchObject({
      totalModels: 2,
      enabledModels: 1,
    });

    // Toggling back moves it between the counts rather than double-counting.
    await client.mutation(api.aiModels.toggleModelEnforcement, { modelId: oneId, isEnabled: false });
    expect(await client.query(api.aiModels.getModelCounts, {})).toMatchObject({
      totalModels: 2,
      enabledModels: 0,
    });

    // A re-sync that updates existing rows must not inflate the total.
    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        providerKey: "openai",
        providerDisplayName: "OpenAI",
        models: [
          { modelId: "one", displayName: "One Renamed" },
          { modelId: "three", displayName: "Three" },
        ],
      });
    });
    expect(await client.query(api.aiModels.getModelCounts, {})).toMatchObject({
      totalModels: 3,
      enabledModels: 0,
    });
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
    // The bulk action now records which jobs it could not apply, because it
    // skips them rather than writing a model into a job it cannot do.
    expect(JSON.parse(auditLogs[0].metadata || "{}")).toMatchObject({ model: "candidate-default" });
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
    const page = await client.query(api.aiModels.getPaginatedModels, {
      providerFilter: "openai",
      statusFilter: "active",
      searchTerm: "",
      paginationOpts: { numItems: 15, cursor: null },
    });
    const providers = await client.query(api.aiModels.getProviders, {});

    expect(page.page.map((model) => model.modelId)).toEqual(["openai:gpt-test", "openai:vision-test"]);

    // The capability and use-case filters were removed with the two columns
    // they narrowed: provider metadata nobody could act on from the catalogue.
    // Provider and status are the two that remain, and the search index is what
    // finds a named model.
    // These rows were inserted directly, so they predate `searchText` exactly as
    // rows in an existing deployment do. The backfill is what makes them
    // findable, and running it here keeps the test honest about that ordering.
    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.backfillModelSearchText, {});
    });

    const searchedPage = await client.query(api.aiModels.getPaginatedModels, {
      providerFilter: "openai",
      statusFilter: "active",
      searchTerm: "gpt",
      paginationOpts: { numItems: 15, cursor: null },
    });

    expect(searchedPage.page.map((model) => model.modelId)).toEqual(["openai:gpt-test"]);
    expect(providers.map((provider) => provider.providerKey)).toEqual(["google", "openai", "anthropic", "openrouter"]);
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

    expect(initialProviders.map((provider) => provider.providerKey)).toEqual(["google", "openai", "anthropic", "openrouter"]);
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

    // The provider filter is now an index lookup rather than a scan of the whole
    // catalogue with a Google-shaped special case bolted on. Legacy rows carrying
    // no provider key are given one by the backfill that exists for the purpose,
    // rather than being found by reading every row on every query.
    await t.run(async (ctx) => {
      await ctx.runMutation(internal.aiModels.backfillGoogleVertexModelProviders, {});
    });

    const client = t.withIdentity({ subject: adminId });
    const inactiveGooglePage = await client.query(api.aiModels.getPaginatedModels, {
      providerFilter: "google",
      statusFilter: "inactive",
      searchTerm: "",
      paginationOpts: { numItems: 15, cursor: null },
    });
    const providers = await client.query(api.aiModels.getProviders, {});

    expect(inactiveGooglePage.page.map((model) => ({
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

  /**
   * Switching a provider off has to stop it serving.
   *
   * It used to hide the provider's models from every picker and block new
   * defaults, while `resolveModelConfig` — the query the runtime actually calls
   * — never looked at providers at all. So a default already pointing at a
   * disabled provider kept running, and the button stated an outcome the system
   * did not deliver.
   */
  test("a disabled provider stops serving, and the next tier takes over", async () => {
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
        modelId: "openai:chat-test",
        providerKey: "openai",
        providerModelId: "chat-test",
        displayName: "Chat Test",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModelDefaults", {
        scope: "global",
        useCase: "chat",
        providerKey: "openai",
        modelId: "openai:chat-test",
        updatedAt: now,
      });
    });

    const resolveChat = async () =>
      await t.run(async (ctx) =>
        await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "chat" })
      );

    // While the provider is on, the chat default serves.
    expect(await resolveChat()).toMatchObject({ modelId: "openai:chat-test", providerKey: "openai" });

    await t.run(async (ctx) => {
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    // The model itself is still enabled — only its provider is off — and the
    // resolution falls through to the next tier rather than running on it.
    const afterDisable = await resolveChat();
    expect(afterDisable.providerKey).not.toBe("openai");
    expect(afterDisable).toMatchObject({ modelId: "google-default", providerKey: "google" });
  });

  test("a company override on a disabled provider falls through too", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const companyId = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", {
        name: "Test Co",
        createdAt: now,
      });
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
        modelId: "openai:company-choice",
        providerKey: "openai",
        providerModelId: "company-choice",
        displayName: "Company Choice",
        isEnabled: true,
        isDefault: false,
        lastSyncedAt: now,
      });
      await ctx.db.insert("aiModelDefaults", {
        scope: "company",
        companyId: company,
        useCase: "chat",
        providerKey: "openai",
        modelId: "openai:company-choice",
        updatedAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
      return company;
    });

    const resolved = await t.run(async (ctx) =>
      await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "chat",
        companyId,
      })
    );

    expect(resolved).toMatchObject({ modelId: "google-default", providerKey: "google" });
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

    await expect(t.query(api.aiModels.getModels, {})).rejects.toThrow("Unauthenticated");
    await expect(t.query(api.aiModels.getModel, { modelId })).rejects.toThrow("Unauthenticated");

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
