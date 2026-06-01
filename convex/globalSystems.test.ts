import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Global Ecosystem Protection", () => {
  test("Standard Admin cannot invoke Vertex Model Sync", async () => {
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

    // The endpoint should correctly block this non-SuperAdmin request
    await expect(
      client.action(api.aiModelsActions.syncVertexModels)
    ).rejects.toThrowError(/Unauthorized/);
  });

  test("Super admins can sync the curated Vertex model catalogue", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const client = t.withIdentity({ subject: superAdminId });

    const syncedModels = await client.action(api.aiModelsActions.syncVertexModels);

    expect(syncedModels).toHaveLength(5);
    expect(syncedModels.every((model) => model.modelId.startsWith("g" + "emini-"))).toBe(true);
    const storedModels = await t.run(async (ctx) => ctx.db.query("aiModels").collect());
    expect(storedModels.map((model) => model.modelId)).toEqual(syncedModels.map((model) => model.modelId));
  });
});
