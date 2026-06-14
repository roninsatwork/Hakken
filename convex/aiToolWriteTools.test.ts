import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("AI Tool Write Tools", () => {
  test("updates company overview idempotently and records audit logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, actorId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Company",
        overview: "Old overview",
        createdAt: Date.now(),
      });
      const actorId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { companyId, actorId };
    });

    const firstResult = await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId,
      actorId,
      overview: "  New approved overview  ",
      idempotencyKey: "run-1:update-company-overview",
    });
    expect(firstResult).toMatchObject({
      companyId,
      changed: true,
      previousOverview: "Old overview",
      overview: "New approved overview",
    });

    const secondResult = await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId,
      actorId,
      overview: "New approved overview",
      idempotencyKey: "run-1:update-company-overview",
    });
    expect(secondResult).toMatchObject({
      companyId,
      changed: false,
      previousOverview: "New approved overview",
      overview: "New approved overview",
    });

    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      auditLogs: await ctx.db
        .query("auditLogs")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .order("asc")
        .collect(),
    }));

    expect(state.company?.overview).toBe("New approved overview");
    expect(state.auditLogs).toHaveLength(2);
    expect(state.auditLogs[0]).toMatchObject({
      actorId,
      actionType: "AGENT_UPDATE_COMPANY_OVERVIEW",
      entityId: companyId,
      entityType: "companies",
      companyId,
    });
    expect(JSON.parse(state.auditLogs[0].metadata || "{}")).toMatchObject({
      changed: true,
      previousOverviewLength: "Old overview".length,
      nextOverviewLength: "New approved overview".length,
      idempotencyKey: "run-1:update-company-overview",
    });
    expect(JSON.parse(state.auditLogs[1].metadata || "{}")).toMatchObject({
      changed: false,
      idempotencyKey: "run-1:update-company-overview",
    });
  });

  test("rejects empty and oversized company overview payloads", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, actorId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Company",
        createdAt: Date.now(),
      });
      const actorId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { companyId, actorId };
    });

    await expect(
      t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
        companyId,
        actorId,
        overview: "   ",
      })
    ).rejects.toThrow("Company overview cannot be empty.");

    await expect(
      t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
        companyId,
        actorId,
        overview: "x".repeat(5001),
      })
    ).rejects.toThrow("Company overview cannot exceed 5000 characters.");
  });
});
