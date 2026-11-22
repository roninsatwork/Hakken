import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const EMAIL = "owner@external.test";

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const now = Date.now();
  const { userId, otherUserId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: EMAIL, role: "USER" });
    const otherUserId = await ctx.db.insert("users", { email: "other@external.test", role: "USER" });
    const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: now + 60_000 });
    await ctx.db.insert("authVerifiers", { sessionId, signature: "dummy-signature" });
    return { userId, otherUserId, sessionId };
  });
  const google = () => t.mutation(internal.auth.store, { args: {
    type: "userOAuth", provider: "google", providerAccountId: "google-sub-123",
    profile: { id: "google-sub-123", email: EMAIL, emailVerified: true },
    signature: "dummy-signature",
  } });
  return { t, now, userId, otherUserId, sessionId, google };
}

describe("Google account linking", () => {
  test("a Google account at an external address cannot attach without email proof", async () => {
    const { t, google, userId } = await setup();
    await expect(google()).rejects.toThrow("Sign in by email");
    const accounts = await t.run(async (ctx) => ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "google")).collect());
    expect(accounts).toHaveLength(0);
  });

  test("recent email proof in the same signed-in account permits linking", async () => {
    const { t, now, google, userId } = await setup();
    await t.run(async (ctx) => ctx.db.insert("authEvents", {
      email: EMAIL, eventType: "ONE_TIME_CODE_VERIFIED", timestamp: now, userId,
    }));
    await expect(google()).resolves.toBeDefined();
    const accounts = await t.run(async (ctx) => ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "google")).collect());
    expect(accounts).toHaveLength(1);
  });

  test("email proof for another account cannot authorize the link", async () => {
    const { t, now, google, otherUserId } = await setup();
    await t.run(async (ctx) => ctx.db.insert("authEvents", {
      email: EMAIL, eventType: "MAGIC_LINK_VERIFIED", timestamp: now, userId: otherUserId,
    }));
    await expect(google()).rejects.toThrow("Sign in by email");
  });
});
