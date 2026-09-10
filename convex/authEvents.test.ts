import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { AUTH_EVENT_TYPES } from "./utils/authEventTypes";
import { SIGN_IN_MAX_REQUESTS_PER_HOUR, SIGN_IN_REQUEST_WINDOW_MS } from "./signInThrottleService";

/**
 * The sign-in form posts mail to whatever address is in the box, and nobody is
 * signed in when it does. Without a limit it is a way to bury someone in email.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
describe("how often one address may ask for a magic link", () => {
  const request = (t: ReturnType<typeof convexTest>, email = "someone@example.com") =>
    t.mutation(api.authEvents.recordMagicLinkRequestAttempt, { email, provider: "resend" });

  test("allows an address its allowance and refuses the next one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR; index++) {
      await expect(request(t)).resolves.toMatchObject({ allowed: true });
    }

    await expect(request(t)).resolves.toMatchObject({ allowed: false });
  });

  test("repeated refusals produce only one log per address and window", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR + 20; index++) {
      await request(t);
    }

    const events = await t.run(async (ctx) => await ctx.db.query("authEvents").collect());
    const requested = events.filter((event) => event.eventType === "MAGIC_LINK_REQUESTED");
    const throttled = events.filter((event) => event.eventType === "MAGIC_LINK_THROTTLED");

    // The requests stop being recorded as requests once the limit is reached,
    // so the count cannot climb its own way past the throttle.
    expect(requested).toHaveLength(SIGN_IN_MAX_REQUESTS_PER_HOUR);
    expect(throttled).toHaveLength(1);
    await expect(request(t)).resolves.toMatchObject({ logged: false, allowed: false });
    expect(throttled[0].reasonCode).toBe("too_many_requests");
  });

  test("records a fresh refusal after the previous sampling window expires", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.run(async (ctx) => {
      await ctx.db.insert("authEvents", {
        email: "someone@example.com", eventType: "MAGIC_LINK_THROTTLED",
        timestamp: Date.now() - SIGN_IN_REQUEST_WINDOW_MS - 1000,
      });
    });
    for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR; index++) await request(t);
    await expect(request(t)).resolves.toMatchObject({ allowed: false, logged: true });
    await expect(request(t)).resolves.toMatchObject({ allowed: false, logged: false });
    const rows = await t.run(async (ctx) => await ctx.db.query("authEvents")
      .withIndex("by_type", q => q.eq("eventType", "MAGIC_LINK_THROTTLED")).collect());
    expect(rows).toHaveLength(2);
  });

  test("counts one address at a time", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR; index++) {
      await request(t, "busy@example.com");
    }

    await expect(request(t, "busy@example.com")).resolves.toMatchObject({ allowed: false });
    await expect(request(t, "quiet@example.com")).resolves.toMatchObject({ allowed: true });
  });

  test("normalises the address, so casing and spacing are not a way around it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR; index++) {
      await request(t, "someone@example.com");
    }

    await expect(request(t, "  SomeOne@Example.com ")).resolves.toMatchObject({ allowed: false });
  });

  test("forgets a run older than the hour, so nobody is locked out for good", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR; index++) {
        await ctx.db.insert("authEvents", {
          email: "someone@example.com",
          eventType: "MAGIC_LINK_REQUESTED",
          timestamp: Date.now() - SIGN_IN_REQUEST_WINDOW_MS - 1_000,
        });
      }
    });

    await expect(request(t)).resolves.toMatchObject({ allowed: true });
  });
});

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

/**
 * The schema decides what may be written; the shared list decides what the
 * diagnostics screen can name. They drifted once already — the typed-code
 * events were writable for weeks and unfilterable the whole time.
 */
describe("every kind of sign-in event the screen offers", () => {
  test("is one the database will actually accept", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      for (const eventType of AUTH_EVENT_TYPES) {
        await ctx.db.insert("authEvents", {
          email: "someone@example.com",
          eventType,
          timestamp: Date.now(),
        });
      }
    });

    const stored = await t.run(async (ctx) => await ctx.db.query("authEvents").collect());
    expect(stored.map((event) => event.eventType).sort()).toEqual([...AUTH_EVENT_TYPES].sort());
  });
});
