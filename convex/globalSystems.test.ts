import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { GOOGLE_VERTEX_EMBEDDING_MODEL_ID } from "./aiModelService";

describe("OWASP: Global Ecosystem Protection", () => {
  test("Standard Admin cannot invoke provider model sync", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyId
      });
    });

    const client = t.withIdentity({ subject: adminId });

    await expect(
      client.action(api.aiModelsActions.syncGoogleModels)
    ).rejects.toThrowError(/Unauthorized/);
  });

  test("Super admins can sync the curated Google Vertex AI model catalogue", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const client = t.withIdentity({ subject: superAdminId });

    const syncedModels = await client.action(api.aiModelsActions.syncGoogleModels);

    expect(syncedModels).toHaveLength(6);
    expect(syncedModels.filter((model) => model.modelId.startsWith("g" + "emini-"))).toHaveLength(5);
    expect(syncedModels).toContainEqual(expect.objectContaining({
      modelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      supportedUseCases: ["embedding"],
      capabilities: ["embeddings"],
    }));
    const { storedModels, provider } = await t.run(async (ctx) => ({
      storedModels: await ctx.db.query("aiModels").collect(),
      provider: await ctx.db.query("aiProviders").withIndex("by_provider_key", (q) => q.eq("providerKey", "google")).first(),
    }));
    expect(storedModels.map((model) => model.modelId)).toEqual(syncedModels.map((model) => model.modelId));
    expect(storedModels.every((model) => model.providerKey === "google")).toBe(true);
    expect(provider).toMatchObject({ displayName: "Google Vertex AI", isEnabled: true });
  });

  test("legacy Vertex sync action remains available as a compatibility alias", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const client = t.withIdentity({ subject: superAdminId });

    const syncedModels = await client.action(api.aiModelsActions.syncVertexModels);
    expect(syncedModels).toHaveLength(6);
    expect(syncedModels.map((model) => model.modelId)).toContain(GOOGLE_VERTEX_EMBEDDING_MODEL_ID);
  });
});
