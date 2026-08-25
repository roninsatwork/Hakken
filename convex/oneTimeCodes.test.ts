import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { MAX_REQUESTS_PER_WINDOW, REQUEST_WINDOW_MS } from "./oneTimeCodeService";
import { SIGN_IN_MAX_REQUESTS_PER_HOUR } from "./signInThrottleService";

/**
 * The short window stops a burst. It does not stop somebody asking for a code
 * every twenty minutes all afternoon, which arrives in the same inbox and reads
 * the same way to the person receiving it.
 */
describe("a patient run that stays under the burst limit", () => {
  test("is stopped by the hourly cap", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const email = "someone@example.com";

    // Spaced far enough apart that the fifteen-minute limit never sees more
    // than one of them, and recent enough that the hour still counts them.
    await t.run(async (ctx) => {
      for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR - 1; index++) {
        await ctx.db.insert("authEvents", {
          email,
          eventType: "ONE_TIME_CODE_REQUESTED",
          timestamp: Date.now() - REQUEST_WINDOW_MS - 1_000,
        });
      }
    });

    // The one that reaches the allowance still goes out...
    await expect(t.mutation(api.oneTimeCodes.requestCode, { email })).resolves.toBe(true);
    // ...and the one past it does not.
    await expect(t.mutation(api.oneTimeCodes.requestCode, { email })).resolves.toBe(false);

    const throttled = await t.run(async (ctx) =>
      (await ctx.db.query("authEvents").collect()).filter(
        (event) => event.eventType === "ONE_TIME_CODE_THROTTLED"
      )
    );
    expect(throttled).toHaveLength(1);
  });

  test("leaves another address alone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      for (let index = 0; index < SIGN_IN_MAX_REQUESTS_PER_HOUR; index++) {
        await ctx.db.insert("authEvents", {
          email: "busy@example.com",
          eventType: "ONE_TIME_CODE_REQUESTED",
          timestamp: Date.now() - REQUEST_WINDOW_MS - 1_000,
        });
      }
    });

    await expect(t.mutation(api.oneTimeCodes.requestCode, { email: "busy@example.com" })).resolves.toBe(false);
    await expect(t.mutation(api.oneTimeCodes.requestCode, { email: "quiet@example.com" })).resolves.toBe(true);
  });
});

/**
 * Only successful sign-ins ever reached the audit trail, and only for
 * administrators — so a run of attempts against an account, which is the first
 * thing anybody reviewing a platform asks to see, left nothing behind at all.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
describe("a refused sign-in leaves a record", () => {
  test("records the attempt on both trails without naming an actor", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.mutation(api.oneTimeCodes.recordFailed, { email: "  Someone@Example.com " });

    const { events, logs } = await t.run(async (ctx) => ({
      events: await ctx.db.query("authEvents").collect(),
      logs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("ONE_TIME_CODE_FAILED");
    // Normalised, so attempts against one account group as one account.
    expect(events[0].email).toBe("someone@example.com");

    expect(logs).toHaveLength(1);
    expect(logs[0].actionType).toBe("SIGN_IN_FAILED");
    // Nobody is signed in. Naming the account holder as the actor would accuse
    // them of an attempt that may well have been made against them.
    expect(logs[0].actorId).toBeUndefined();
    expect(JSON.parse(logs[0].metadata ?? "{}")).toEqual({
      attemptedEmail: "someone@example.com",
      method: "one-time code",
    });
  });

  test("is recorded for an address with no account behind it", async () => {
    // An attempt against an account that does not exist is exactly what a
    // search for one looks like, so it is worth having.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.mutation(api.oneTimeCodes.recordFailed, { email: "nobody@example.com" });

    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(logs).toHaveLength(1);
  });

  test("past the throttle it stops writing to the audit trail and keeps writing to the auth trail", async () => {
    // This mutation is reachable by anybody. An unauthenticated caller who can
    // write unbounded rows into the audit trail can bury everything else in it.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const attempts = MAX_REQUESTS_PER_WINDOW + 3;
    for (let index = 0; index < attempts; index++) {
      await t.mutation(api.oneTimeCodes.recordFailed, { email: "someone@example.com" });
    }

    const { events, logs } = await t.run(async (ctx) => ({
      events: await ctx.db.query("authEvents").collect(),
      logs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(events).toHaveLength(attempts);
    expect(logs).toHaveLength(MAX_REQUESTS_PER_WINDOW);
  });

  test("an empty address records nothing at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.mutation(api.oneTimeCodes.recordFailed, { email: "   " });

    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(logs).toEqual([]);
  });
});
