import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Auth event diagnostics access controls", () => {
  test("super admins can read all recent auth events", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });

      await ctx.db.insert("authEvents", {
        email: "a@test.com",
        eventType: "MAGIC_LINK_REQUESTED",
        timestamp: 100,
        companyId: companyAId,
      });
      await ctx.db.insert("authEvents", {
        email: "b@test.com",
        eventType: "INVITE_MISSING",
        timestamp: 200,
        companyId: companyBId,
      });
      await ctx.db.insert("authEvents", {
        email: "global@test.com",
        eventType: "INVITE_MISSING",
        timestamp: 300,
      });

      return { superAdminId };
    });

    const events = await t.withIdentity({ subject: superAdminId }).query(api.authEvents.getRecentAuthEvents);

    expect(events.map((event) => event.email)).toEqual(["global@test.com", "b@test.com", "a@test.com"]);
    expect(events.find((event) => event.email === "a@test.com")?.companyName).toBe("Company A");
  });

  test("company admins can read only auth events scoped to their company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId: companyAId,
      });

      await ctx.db.insert("authEvents", {
        email: "same-company@test.com",
        eventType: "MAGIC_LINK_STARTED",
        timestamp: 100,
        companyId: companyAId,
      });
      await ctx.db.insert("authEvents", {
        email: "other-company@test.com",
        eventType: "MAGIC_LINK_STARTED",
        timestamp: 200,
        companyId: companyBId,
      });
      await ctx.db.insert("authEvents", {
        email: "unscoped@test.com",
        eventType: "INVITE_MISSING",
        timestamp: 300,
      });

      return { adminId };
    });

    const events = await t.withIdentity({ subject: adminId }).query(api.authEvents.getRecentAuthEvents);

    expect(events).toHaveLength(1);
    expect(events[0].email).toBe("same-company@test.com");
    expect(events[0].companyName).toBe("Company A");
  });

  test("standard users cannot read auth diagnostics", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
      });
    });

    await expect(t.withIdentity({ subject: userId }).query(api.authEvents.getRecentAuthEvents)).rejects.toThrow(
      "Unauthorized"
    );
  });
});
