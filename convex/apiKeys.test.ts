import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Public API key governance", () => {
  test("admins create, list, and revoke tenant-scoped API keys without storing raw secrets", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, superAdminId, adminAId, adminBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
        createdAt: Date.now(),
      });

      return { companyAId, companyBId, superAdminId, adminAId, adminBId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(superAdminClient.mutation(api.apiKeys.create, {
      name: "Missing company",
      scopes: ["agent:run"],
    })).rejects.toThrow("Company is required");

    const created = await superAdminClient.mutation(api.apiKeys.create, {
      companyId: companyAId,
      name: "Agent run trigger",
      scopes: ["agent:run", "run:read", "agent:run"],
      rateLimitPerMinute: 120,
    });

    expect(created.apiKey).toMatch(/^sonae_[a-f0-9]{12}_[a-f0-9]+$/);
    expect(created.record).toMatchObject({
      companyId: companyAId,
      companyName: "Company A",
      name: "Agent run trigger",
      keyPrefix: created.apiKey.split("_").slice(0, 2).join("_"),
      scopes: ["agent:run", "run:read"],
      status: "ACTIVE",
      rateLimitPerMinute: 120,
      createdByEmail: "super@example.com",
    });

    const stored = await t.run(async (ctx) => ctx.db.get(created.record._id));
    expect(stored?.keyDigest).toHaveLength(64);
    expect(stored?.keyDigest).not.toContain(created.apiKey);
    expect(JSON.stringify(stored)).not.toContain(created.apiKey);

    const authorized = await t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "agent:run",
      method: "POST",
      path: "/api/public/v1/agent-runs",
      now: 1_000,
    });
    expect(authorized).toMatchObject({
      ok: true,
      statusCode: 200,
      companyId: companyAId,
      apiKeyId: created.record._id,
    });

    const forbidden = await t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "workflow:run",
      method: "POST",
      path: "/api/public/v1/workflow-runs",
      now: 1_001,
    });
    expect(forbidden).toMatchObject({
      ok: false,
      statusCode: 403,
      error: "API key is missing required scope: workflow:run.",
    });

    const adminScoped = await adminAClient.query(api.apiKeys.list, { paginationOpts });
    expect(adminScoped.page).toHaveLength(1);
    expect(adminScoped.page[0]).toMatchObject({
      name: "Agent run trigger",
      companyName: "Company A",
      status: "ACTIVE",
      lastUsedAt: 1_000,
    });

    await expect(adminBClient.query(api.apiKeys.list, { companyId: companyAId, paginationOpts })).rejects.toThrow("Unauthorized");

    const adminCreated = await adminAClient.mutation(api.apiKeys.create, {
      name: "Workflow trigger",
      scopes: ["workflow:run"],
    });
    expect(adminCreated.record.companyId).toBe(companyAId);

    await expect(adminAClient.mutation(api.apiKeys.create, {
      companyId: companyBId,
      name: "Cross tenant",
      scopes: ["agent:run"],
    })).rejects.toThrow("Unauthorized");

    const revoked = await adminAClient.mutation(api.apiKeys.revoke, {
      apiKeyId: created.record._id,
      reason: "Rotated after setup.",
    });
    expect(revoked).toMatchObject({
      status: "REVOKED",
      revokedByEmail: "admin-a@example.com",
      revocationReason: "Rotated after setup.",
    });
    await expect(adminBClient.mutation(api.apiKeys.revoke, { apiKeyId: created.record._id })).rejects.toThrow("Unauthorized");

    const revokedRequest = await t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "agent:run",
      method: "POST",
      path: "/api/public/v1/agent-runs",
      now: 1_002,
    });
    expect(revokedRequest).toMatchObject({
      ok: false,
      statusCode: 401,
      error: "API key has been revoked.",
    });

    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_API_KEY",
      "CREATE_API_KEY",
      "REVOKE_API_KEY",
    ]);
    expect(auditLogs.every((log) => log.companyId === companyAId)).toBe(true);

    const requestLogs = await t.run(async (ctx) => ctx.db.query("publicApiRequests").collect());
    expect(requestLogs.map((log) => log.status)).toEqual(["AUTHORIZED", "FORBIDDEN", "UNAUTHORIZED"]);
    expect(requestLogs.map((log) => log.statusCode)).toEqual([200, 403, 401]);
    expect(requestLogs.every((log) => log.companyId === companyAId)).toBe(true);
  });

  test("public API authentication enforces per-key rate limits", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      return { companyId, adminId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const created = await adminClient.mutation(api.apiKeys.create, {
      name: "Low limit",
      scopes: ["run:read"],
      rateLimitPerMinute: 2,
    });

    await expect(t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "run:read",
      method: "GET",
      path: "/api/public/v1/runs/run_1",
      now: 10_000,
    })).resolves.toMatchObject({ ok: true });
    await expect(t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "run:read",
      method: "GET",
      path: "/api/public/v1/runs/run_2",
      now: 10_100,
    })).resolves.toMatchObject({ ok: true });
    await expect(t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "run:read",
      method: "GET",
      path: "/api/public/v1/runs/run_3",
      now: 10_200,
    })).resolves.toMatchObject({
      ok: false,
      statusCode: 429,
      error: "API key rate limit exceeded.",
    });

    const requestLogs = await t.run(async (ctx) => ctx.db.query("publicApiRequests").collect());
    expect(requestLogs.map((log) => log.status)).toEqual(["AUTHORIZED", "AUTHORIZED", "RATE_LIMITED"]);
    expect(requestLogs.every((log) => log.companyId === companyId)).toBe(true);
  });
});
