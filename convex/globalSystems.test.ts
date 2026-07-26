import { convexTest } from "convex-test";
import { afterEach, expect, test, describe, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Global Ecosystem Protection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

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

  /**
   * Testing a connection must not change what the platform runs.
   *
   * A successful test used to write `isEnabled: true`, so a button that reads as
   * a read-only check quietly switched the provider on — and now that a disabled
   * provider genuinely stops serving, that switch has real consequences in both
   * directions. Enabling is the toggle's job.
   *
   * The provider's HTTP call is stubbed rather than skipped, because the point of
   * the test is the *success* path: the failure path never enabled anything.
   */
  test("a successful connection test reports health without switching the provider on", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ data: [{ id: "some-text-model" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const superAdminId = await t.run(async (ctx) => {
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
      return ctx.db.insert("users", { email: "super@test.com", role: "SUPER_ADMIN" });
    });
    const client = t.withIdentity({ subject: superAdminId });

    const result = await client.action(api.aiModelsActions.testProviderConnection, {
      providerKey: "openai",
    });

    expect(result.ok).toBe(true);

    const provider = await t.run(async (ctx) =>
      await ctx.db
        .query("aiProviders")
        .withIndex("by_provider_key", (q) => q.eq("providerKey", "openai"))
        .first()
    );

    // Health was recorded; the switch was not touched.
    expect(provider?.status).toBe("healthy");
    expect(provider?.isEnabled).toBe(false);
  });
});
