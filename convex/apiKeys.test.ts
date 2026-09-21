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

    expect(created.apiKey).toMatch(/^hakken_[a-f0-9]{12}_[a-f0-9]+$/);
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

    /*
     * The key coming alive and the two refusals now sit on the trail alongside
     * the administrator's own actions. A key being accepted is routine traffic
     * and stays in the API's own log; a key being refused, or used for the very
     * first time, is what somebody governing this platform wants to see.
     */
    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_API_KEY",
      "API_KEY_FIRST_USED",
      "API_REQUEST_REFUSED",
      "CREATE_API_KEY",
      "REVOKE_API_KEY",
      "API_REQUEST_REFUSED",
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

    // A rejected row must not displace a success from the quota window.
    for (let index = 0; index < 8; index++) {
      await expect(t.mutation(internal.apiKeys.authenticatePublicRequest, {
        apiKey: created.apiKey, requiredScope: "run:read", method: "GET",
        path: "/api/public/v1/ping", now: 10_300 + index,
      })).resolves.toMatchObject({ ok: false, statusCode: 429 });
    }
    const concurrentRefusals = await Promise.all(Array.from({ length: 4 }, () =>
      t.mutation(internal.apiKeys.authenticatePublicRequest, {
        apiKey: created.apiKey, requiredScope: "run:read", method: "GET",
        path: "/api/public/v1/ping", now: 11_000,
      })
    ));
    expect(concurrentRefusals.every((result) => !result.ok && result.statusCode === 429)).toBe(true);
    // At the exact boundary only the first success has expired.
    await expect(t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey, requiredScope: "run:read", method: "GET",
      path: "/api/public/v1/ping", now: 70_000,
    })).resolves.toMatchObject({ ok: true });
    await expect(t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey, requiredScope: "run:read", method: "GET",
      path: "/api/public/v1/ping", now: 70_001,
    })).resolves.toMatchObject({ ok: false, statusCode: 429 });
  });
});

/**
 * A key being accepted is routine traffic. A key being refused, and a key being
 * used for the very first time, are the two moments somebody governing this
 * platform would want to know about — and neither reached the audit trail.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
describe("what the audit trail learns about API keys", () => {
  const makeKey = async (t: ReturnType<typeof convexTest>) => {
    const { companyId, superAdminId } = await t.run(async (ctx) => ({
      companyId: await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() }),
      superAdminId: await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      }),
    }));

    const created = await t.withIdentity({ subject: superAdminId }).mutation(api.apiKeys.create, {
      companyId,
      name: "Agent run trigger",
      scopes: ["agent:run"],
    });

    return { companyId, created };
  };

  const trailFor = async (t: ReturnType<typeof convexTest>, actionType: string) =>
    (await t.run(async (ctx) => await ctx.db.query("auditLogs").collect()))
      .filter((log) => log.actionType === actionType);

  test("records a key coming alive, once and only once", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, created } = await makeKey(t);

    const call = {
      apiKey: created.apiKey,
      requiredScope: "agent:run" as const,
      method: "POST",
      path: "/api/public/v1/agent-runs",
    };

    await t.mutation(internal.apiKeys.authenticatePublicRequest, { ...call, now: 1_000 });
    await t.mutation(internal.apiKeys.authenticatePublicRequest, { ...call, now: 2_000 });

    // Every accepted call after the first is routine traffic, and belongs in the
    // API's own log rather than here.
    const firstUse = await trailFor(t, "API_KEY_FIRST_USED");
    expect(firstUse).toHaveLength(1);
    expect(firstUse[0].companyId).toBe(companyId);
    expect(JSON.parse(firstUse[0].metadata ?? "{}")).toMatchObject({
      name: "Agent run trigger",
      path: "/api/public/v1/agent-runs",
    });
  });

  test("records a refusal, and names no actor for it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { created } = await makeKey(t);

    await t.mutation(internal.apiKeys.authenticatePublicRequest, {
      apiKey: created.apiKey,
      requiredScope: "workflow:run",
      method: "POST",
      path: "/api/public/v1/workflow-runs",
      now: 1_000,
    });

    const refusals = await trailFor(t, "API_REQUEST_REFUSED");
    expect(refusals).toHaveLength(1);
    // A refused request has not proved who it is, which is why it was refused.
    expect(refusals[0].actorId).toBeUndefined();
    expect(JSON.parse(refusals[0].metadata ?? "{}")).toMatchObject({
      refusedBecause: "API key is missing required scope: workflow:run.",
      requiredScope: "workflow:run",
    });
  });

  test("a caller hammering a bad key cannot bury the rest of the trail", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { created } = await makeKey(t);

    for (let index = 0; index < 12; index++) {
      await t.mutation(internal.apiKeys.authenticatePublicRequest, {
        apiKey: created.apiKey,
        requiredScope: "workflow:run",
        method: "POST",
        path: "/api/public/v1/workflow-runs",
        now: 1_000 + index,
      });
    }

    // Throttled on the trail. The API's own log still holds every one of them,
    // which is what that log is for.
    expect(await trailFor(t, "API_REQUEST_REFUSED")).toHaveLength(5);

    const apiLog = (await t.run(async (ctx) => await ctx.db.query("publicApiRequests").collect()))
      .filter((request) => request.status === "FORBIDDEN");
    expect(apiLog).toHaveLength(12);
  });

  test("a request with no usable key at all is still recorded", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.mutation(internal.apiKeys.authenticatePublicRequest, {
      requiredScope: "agent:run",
      method: "POST",
      path: "/api/public/v1/agent-runs",
      now: 1_000,
    });

    const refusals = await trailFor(t, "API_REQUEST_REFUSED");
    expect(refusals).toHaveLength(1);
    expect(JSON.parse(refusals[0].metadata ?? "{}")).toMatchObject({ keyPrefix: "none given" });
  });

  test("missing and malformed keys cannot grow request or audit logs without bound", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    for (let index = 0; index < 30; index += 1) {
      const result = await t.mutation(internal.apiKeys.authenticatePublicRequest, {
        apiKey: index % 2 === 0 ? undefined : "not-an-api-key",
        requiredScope: "agent:run",
        method: "POST",
        path: "/api/public/v1/agent-runs",
        now: 1_000 + index,
      });
      expect(result).toMatchObject({ ok: false, statusCode: 401 });
    }

    const state = await t.run(async (ctx) => ({
      requests: await ctx.db.query("publicApiRequests").collect(),
      refusals: (await ctx.db.query("auditLogs").collect())
        .filter((log) => log.actionType === "API_REQUEST_REFUSED"),
    }));
    expect(state.requests).toHaveLength(20);
    expect(state.refusals).toHaveLength(5);
  });

  test("a leaked key prefix cannot restore unbounded refusal logging", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { created } = await makeKey(t);
    const keyPrefix = created.apiKey.split("_").slice(0, 2).join("_");

    for (let index = 0; index < 30; index += 1) {
      const result = await t.mutation(internal.apiKeys.authenticatePublicRequest, {
        apiKey: `${keyPrefix}_${String(index).padStart(64, "0")}`,
        requiredScope: "agent:run",
        method: "POST",
        path: "/api/public/v1/agent-runs",
        now: 1_000 + index,
      });
      expect(result).toMatchObject({ ok: false, statusCode: 401 });
    }

    const state = await t.run(async (ctx) => ({
      requests: (await ctx.db.query("publicApiRequests").collect())
        .filter((request) => request.status === "UNAUTHORIZED"),
      refusals: (await ctx.db.query("auditLogs").collect())
        .filter((log) => log.actionType === "API_REQUEST_REFUSED"),
    }));
    expect(state.requests).toHaveLength(20);
    expect(state.refusals).toHaveLength(5);
  });
});
