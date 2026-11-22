import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("Clarity connection access", () => {
  test("a pending token cannot be saved after admin access or the feature is removed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const ids = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Dummy company", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", { email: "admin@test.invalid", role: "ADMIN", companyId });
      const websiteId = await ctx.db.insert("websites", { host: "dummy.test", displayHost: "dummy.test", firstSeenAt: 1 });
      const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      return { companyId, adminId, siteId };
    });
    const args = { siteId: ids.siteId, companyId: ids.companyId, connectedBy: ids.adminId, tokenCiphertext: "dummy-token" };
    expect(await t.mutation(internal.clarity.saveConnection, args)).toBe(true);
    await t.run(async (ctx) => ctx.db.patch(ids.adminId, { role: "USER" }));
    expect(await t.mutation(internal.clarity.saveConnection, { ...args, tokenCiphertext: "revoked-token" })).toBe(false);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.adminId, { role: "ADMIN" });
      await ctx.db.insert("featureSwitches", { companyId: ids.companyId, featuresOff: ["clarity"], updatedAt: Date.now() });
    });
    expect(await t.mutation(internal.clarity.saveConnection, { ...args, tokenCiphertext: "disabled-token" })).toBe(false);
    const row = await t.run(async (ctx) => ctx.db.query("clarityConnections").first());
    expect(row?.tokenCiphertext).toBe("dummy-token");
  });
});
