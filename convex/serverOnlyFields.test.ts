import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Two fields exist on the server and must never reach a browser.
 *
 * `users.tokenIdentifier` is the auth identity string, and `getAllUsers` and
 * `getUserById` were handing whole user rows out with it attached — the second
 * to any colleague in the same company. `workflows.webhookSecret` is what a
 * caller signs a trigger with, and both workflow read surfaces carried it too.
 *
 * Neither was a declared shape away from being safe. A Convex return validator
 * refuses an unexpected field rather than dropping it, so the fix is to narrow
 * the row on the way out; the validator is what turns forgetting to narrow it
 * into a failure instead of a leak. These pin the behaviour through the real
 * endpoints, because that is the only place the two halves meet.
 */

describe("server-only fields never leave the server", () => {
  test("a colleague reading a user does not receive the auth token", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { colleague, subject } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
      const colleagueId = await ctx.db.insert("users", {
        email: "colleague@comax.com", name: "Colleague", role: "USER", companyId,
        tokenIdentifier: "https://issuer|secret-subject-value",
      });
      const readerId = await ctx.db.insert("users", {
        email: "reader@comax.com", name: "Reader", role: "USER", companyId,
        tokenIdentifier: "https://issuer|reader",
      });
      return { colleague: colleagueId, subject: readerId };
    });

    const seen = await t
      .withIdentity({ subject })
      .query(api.users.getUserById, { id: colleague });

    expect(seen?.name).toBe("Colleague");
    expect(seen).not.toHaveProperty("tokenIdentifier");
    expect(JSON.stringify(seen)).not.toContain("secret-subject-value");
  });

  test("listing users does not carry auth tokens with it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const subject = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
      await ctx.db.insert("users", {
        email: "someone@comax.com", name: "Someone", role: "USER", companyId,
        tokenIdentifier: "https://issuer|secret-subject-value",
      });
      return await ctx.db.insert("users", {
        email: "admin@comax.com", name: "Admin", role: "ADMIN", companyId,
        tokenIdentifier: "https://issuer|admin",
      });
    });

    const everyone = await t.withIdentity({ subject }).query(api.users.getAllUsers, {});

    expect(everyone.length).toBeGreaterThan(1);
    for (const person of everyone) expect(person).not.toHaveProperty("tokenIdentifier");
    expect(JSON.stringify(everyone)).not.toContain("secret-subject-value");
  });

  test("reading a workflow does not carry its webhook secret", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { workflowId, subject } = await t.run(async (ctx) => {
      const id = await ctx.db.insert("workflows", {
        name: "Nightly sync", isActive: true, triggerType: "WEBHOOK",
        createdAt: now, updatedAt: now, webhookSecret: "replayable-secret-value",
      });
      const superAdmin = await ctx.db.insert("users", {
        email: "anthony@ronins.co.uk", name: "Anthony", role: "SUPER_ADMIN",
      });
      return { workflowId: id, subject: superAdmin };
    });

    const client = t.withIdentity({ subject });
    const one = await client.query(api.workflows.get, { id: workflowId });
    const all = await client.query(api.workflows.list, {});

    expect(one.name).toBe("Nightly sync");
    expect(one).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(all)).not.toContain("replayable-secret-value");
  });
});
