import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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

  /**
   * The catalogue comes from Vertex, so with no Vertex to call it fails.
   *
   * These two tests used to assert that syncing returned exactly six models —
   * pinning in place the list of model ids that was typed into the source, and
   * turning the bug into a requirement. What matters now is that a failed sync
   * fails: seeding a fallback catalogue would leave the screen looking current
   * when nothing had been fetched, which is the fault being removed.
   */
  test("a sync that cannot reach Vertex fails rather than seeding a list", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const client = t.withIdentity({ subject: superAdminId });

    await expect(
      client.action(api.aiModelsActions.syncGoogleModels)
    ).rejects.toThrowError(/Failed to sync Google Vertex AI models/);

    // Nothing was written. A seeded catalogue here is exactly what a reader
    // would mistake for a working sync.
    const storedModels = await t.run(async (ctx) => await ctx.db.query("aiModels").collect());
    expect(storedModels).toEqual([]);
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

    await expect(
      client.action(api.aiModelsActions.syncVertexModels)
    ).rejects.toThrowError(/Failed to sync Vertex Models/);
  });
});
