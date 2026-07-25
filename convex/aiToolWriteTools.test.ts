import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { TOOL_IDEMPOTENCY_TTL_MS, normalizeIdempotencyKey } from "./aiToolIdempotencyService";

describe("AI Tool Write Tools", () => {
  test("updates company overview and records audit logs", async () => {
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

    // A second call under the same key is the same logical request, so it is
    // replayed rather than re-applied. This test previously asserted the
    // opposite — two audit entries for one request — under a name that claimed
    // idempotency the code did not have.
    const secondResult = await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId,
      actorId,
      overview: "New approved overview",
      idempotencyKey: "run-1:update-company-overview",
    });
    expect(secondResult).toMatchObject({
      companyId,
      changed: true,
      previousOverview: "Old overview",
      overview: "New approved overview",
      replayed: true,
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
    expect(state.auditLogs).toHaveLength(1);
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

/**
 * `idempotencyKey` was accepted, written into the audit log, and never read
 * back, so calling the tool twice with the same key applied the write twice.
 *
 * That became material once runs became resumable: a crash mid-run, or a tool
 * call held for human approval, means the same call really can be issued again.
 */
describe("write tool idempotency", () => {
  const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));
  type TestConvex = ReturnType<typeof makeTest>;

  async function seedCompany(t: TestConvex, name = "Acme", overview = "Original overview.") {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name, overview, createdAt: Date.now() });
      const actorId = await ctx.db.insert("users", {
        email: `operator@${name.toLowerCase()}.test`,
        role: "ADMIN",
        companyId,
      });
      return { companyId, actorId };
    });
  }

  test("a repeated key does not write a second time", async () => {
    const t = makeTest();
    const { companyId, actorId } = await seedCompany(t);

    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "A new overview.", idempotencyKey: "run-1-call-1",
    });
    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId,
      actorId,
      // A retry of the same logical call, whatever the arguments now say.
      overview: "A different overview.",
      idempotencyKey: "run-1-call-1",
    });

    const company = await t.run(async (ctx) => await ctx.db.get(companyId));
    expect(company?.overview).toBe("A new overview.");
  });

  test("different keys are different requests", async () => {
    const t = makeTest();
    const { companyId, actorId } = await seedCompany(t);

    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "First.", idempotencyKey: "a",
    });
    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "Second.", idempotencyKey: "b",
    });

    const company = await t.run(async (ctx) => await ctx.db.get(companyId));
    expect(company?.overview).toBe("Second.");
  });

  test("one tenant's key cannot suppress another tenant's write", async () => {
    // Keys are produced by a model, so two tenants colliding on one is entirely
    // possible. A collision that silently discarded a write would be a
    // cross-tenant data fault, not a performance quirk.
    const t = makeTest();
    const acme = await seedCompany(t, "Acme");
    const globex = await seedCompany(t, "Globex");

    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId: acme.companyId, actorId: acme.actorId, overview: "Acme updated.", idempotencyKey: "shared",
    });
    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId: globex.companyId, actorId: globex.actorId, overview: "Globex updated.", idempotencyKey: "shared",
    });

    const companies = await t.run(async (ctx) => ({
      acme: await ctx.db.get(acme.companyId),
      globex: await ctx.db.get(globex.companyId),
    }));
    expect(companies.acme?.overview).toBe("Acme updated.");
    expect(companies.globex?.overview).toBe("Globex updated.");
  });

  test("no key means no deduplication", async () => {
    const t = makeTest();
    const { companyId, actorId } = await seedCompany(t);

    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "First.",
    });
    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "Second.",
    });

    const company = await t.run(async (ctx) => await ctx.db.get(companyId));
    expect(company?.overview).toBe("Second.");
  });

  test("a key past its window is treated as a new request", async () => {
    const t = makeTest();
    const { companyId, actorId } = await seedCompany(t);

    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "First.", idempotencyKey: "aged",
    });
    await t.run(async (ctx) => {
      const record = (await ctx.db.query("agentToolIdempotency").collect())[0];
      await ctx.db.patch(record._id, { expiresAt: Date.now() - 1000 });
    });
    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "Second.", idempotencyKey: "aged",
    });

    const company = await t.run(async (ctx) => await ctx.db.get(companyId));
    expect(company?.overview).toBe("Second.");
  });

  test("purges records past their window and leaves live ones", async () => {
    // Every keyed call adds a row, so without a purge the table grows for ever.
    const t = makeTest();
    const { companyId, actorId } = await seedCompany(t);

    await t.mutation(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId, actorId, overview: "Live.", idempotencyKey: "live",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("agentToolIdempotency", {
        companyId,
        handlerMapping: "company.overview.update",
        idempotencyKey: "stale",
        resultJson: "{}",
        createdAt: Date.now() - TOOL_IDEMPOTENCY_TTL_MS * 2,
        expiresAt: Date.now() - 1000,
      });
    });

    const result = await t.mutation(internal.aiToolWriteTools.purgeExpiredToolIdempotency, {});
    expect(result.deleted).toBe(1);

    const remaining = await t.run(async (ctx) => await ctx.db.query("agentToolIdempotency").collect());
    expect(remaining).toHaveLength(1);
    expect(remaining[0].idempotencyKey).toBe("live");
  });

  test("an unusable key is ignored rather than failing the write", () => {
    // An absent or malformed key means "no deduplication requested". Refusing
    // the whole write because a model produced an odd key would turn a safety
    // feature into an outage.
    expect(normalizeIdempotencyKey(undefined)).toBeUndefined();
    expect(normalizeIdempotencyKey("   ")).toBeUndefined();
    expect(normalizeIdempotencyKey("x".repeat(5000))).toBeUndefined();
    expect(normalizeIdempotencyKey("  run-1  ")).toBe("run-1");
  });
});
