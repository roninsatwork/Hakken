import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Tracking health's bell alerts (docs/plans/active/google-analytics-plan.md
 * §6, GA12): a check that starts failing tells the platform's super admins
 * once — not again while it stays failing, and not again while the same alert
 * waits unread, even when two runs read the same old results (§16: Ronins'
 * alerts reached the bell twice on 2026-10-10).
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A connected website with nothing ticked, so "nothing counted" fails; one super admin, one company admin. */
async function seeded(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const superAdminId = await ctx.db.insert("users", { name: "Platform", email: "platform@hakken.test", role: "SUPER_ADMIN", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "properties/1", propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1,
      events: [{ eventName: "generate_lead", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 }],
      createdAt: 1, updatedAt: 1,
    });
    return { superAdminId, adminId, connectionId };
  });
}

const alertsOf = (t: Harness, userId: Id<"users">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("notifications").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect())
      .filter((notice) => notice.kind === "GOOGLE_ANALYTICS_HEALTH"));

describe("tracking health's bell alerts", () => {
  test("a failing check tells the super admins once, never a company's admins", async () => {
    const t = harness();
    const { superAdminId, adminId, connectionId } = await seeded(t);
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    const alerts = await alertsOf(t, superAdminId);
    expect(alerts.map((notice) => notice.title)).toEqual(["acme-shop.test: nothing counts as a conversion"]);
    expect(await alertsOf(t, adminId)).toEqual([]);
  });

  test("the same alert waiting unread is not sent again, even when a run reads no earlier results", async () => {
    const t = harness();
    const { superAdminId, connectionId } = await seeded(t);
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    // Two runs that both read the results before either was kept look like this.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { health: undefined }));
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    expect(await alertsOf(t, superAdminId)).toHaveLength(1);
  });

  test("once read, a check that passes and then fails again tells them again", async () => {
    const t = harness();
    const { superAdminId, connectionId } = await seeded(t);
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    await t.run(async (ctx) => {
      for (const notice of await ctx.db.query("notifications").collect()) await ctx.db.patch(notice._id, { readAt: 2 });
      const connection = (await ctx.db.get(connectionId))!;
      await ctx.db.patch(connectionId, { events: connection.events!.map((event) => ({ ...event, counted: true, hakkenValue: 100 })) });
    });
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    await t.run(async (ctx) => {
      const connection = (await ctx.db.get(connectionId))!;
      await ctx.db.patch(connectionId, { events: connection.events!.map((event) => ({ ...event, counted: false })) });
    });
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    expect(await alertsOf(t, superAdminId)).toHaveLength(2);
  });
});
