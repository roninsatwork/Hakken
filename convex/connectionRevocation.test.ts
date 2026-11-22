import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

async function pendingConnections() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Owner", createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "owner.test", displayHost: "owner.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const adminId = await ctx.db.insert("users", { email: "admin@owner.test", role: "ADMIN", companyId });
    const consoleState = "search-console:dummy-state";
    const analyticsState = "google-analytics:dummy-state";
    const bingState = "bing-webmaster:dummy-state";
    const common = { companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTING" as const, pendingAt: now, pendingBy: adminId, createdAt: now, updatedAt: now };
    await ctx.db.insert("searchConsoleConnections", { ...common, pendingState: consoleState });
    await ctx.db.insert("googleAnalyticsConnections", { ...common, pendingState: analyticsState });
    await ctx.db.insert("bingConnections", { ...common, pendingState: bingState });
    const googleConnectionId = await ctx.db.insert("googleConnections", { companyId, companyWebsiteId: siteId, websiteId, scopes: [], createdAt: now, updatedAt: now });
    return { companyId, siteId, adminId, consoleState, analyticsState, bingState, googleConnectionId };
  });
  return { t, ...ids };
}

describe("pending site connections", () => {
  test("revocation between grant lookup and completion does not replace saved Google tokens", async () => {
    const { t, adminId, consoleState, siteId, googleConnectionId } = await pendingConnections();
    await t.mutation(internal.googleConnection.keepGrant, {
      state: consoleState, section: "SEARCH_CONSOLE", companyWebsiteId: siteId, scopes: ["read"],
      accessTokenCiphertext: "new-access", refreshTokenCiphertext: "new-refresh",
    });
    await t.run(async (ctx) => ctx.db.patch(adminId, { role: "USER" }));
    await expect(t.mutation(internal.searchConsoleConnect.completeSignIn, {
      state: consoleState, companyWebsiteId: siteId, googleConnectionId, choices: [], only: null,
    })).rejects.toThrow();
    expect(await t.run(async (ctx) => ctx.db.query("googleTokens").collect())).toHaveLength(0);
  });

  test("a downgraded admin's pending states cannot start or finish a connection", async () => {
    const { t, adminId, consoleState, analyticsState, bingState, siteId, googleConnectionId } = await pendingConnections();
    await t.run(async (ctx) => ctx.db.patch(adminId, { role: "USER" }));
    expect(await t.query(internal.searchConsoleConnect.pendingByState, { state: consoleState })).toBeNull();
    expect(await t.query(internal.googleAnalyticsConnect.pendingByState, { state: analyticsState })).toBeNull();
    expect(await t.query(internal.bingWebmasterConnect.pendingByState, { state: bingState })).toBeNull();
    await expect(t.mutation(internal.searchConsoleConnect.completeSignIn, {
      state: consoleState, companyWebsiteId: siteId, googleConnectionId, choices: [], only: null,
    })).rejects.toThrow();
    await expect(t.mutation(internal.googleAnalyticsConnect.completeSignIn, {
      state: analyticsState, companyWebsiteId: siteId, googleConnectionId, choices: [],
    })).rejects.toThrow();
    await expect(t.mutation(internal.bingWebmasterConnect.completeSignIn, {
      state: bingState, choices: [], only: null, accessTokenCiphertext: "dummy", refreshTokenCiphertext: "dummy",
    })).rejects.toThrow();
    expect(await t.run(async (ctx) => ctx.db.query("bingTokens").collect())).toHaveLength(0);
  });
});
