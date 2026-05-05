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
});
