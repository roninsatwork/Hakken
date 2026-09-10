import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  GLOBAL_REQUEST_WINDOW_MS,
  MAX_GLOBAL_REQUESTS_PER_MINUTE,
  REQUEST_WINDOW_MS,
} from "./oneTimeCodeService";
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

describe("public request telemetry bounds", () => {
  test("stops writes when callers rotate through invented addresses", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      for (let index = 0; index < MAX_GLOBAL_REQUESTS_PER_MINUTE; index++) {
        await ctx.db.insert("authEvents", {
          email: `seed-${index}@example.com`,
          eventType: "ONE_TIME_CODE_REQUESTED",
          timestamp: Date.now() - GLOBAL_REQUEST_WINDOW_MS + 1_000,
        });
      }
    });

    await expect(t.mutation(api.oneTimeCodes.requestCode, { email: "new-address@example.com" }))
      .resolves.toBe(false);

    const events = await t.run(async (ctx) => await ctx.db.query("authEvents").collect());
    expect(events).toHaveLength(MAX_GLOBAL_REQUESTS_PER_MINUTE);
  });

  test("rejects an overlong address without writing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await expect(t.mutation(api.oneTimeCodes.requestCode, { email: `${"a".repeat(321)}@example.com` }))
      .resolves.toBe(false);

    const events = await t.run(async (ctx) => await ctx.db.query("authEvents").collect());
    expect(events).toEqual([]);
  });
});
