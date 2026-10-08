import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Where a website trades, for Search Console (search-console-plan.md §16):
 * set only in admin, several per website, held to "Countries kept ready per
 * website", and what was kept for a country taken off cleared behind it.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function setUp(t: Harness, relationship: "OWNED" | "TRACKED" = "OWNED") {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
    const superId = await ctx.db.insert("users", { name: "Super", email: "super@acme-shop.test", role: "SUPER_ADMIN", createdAt: Date.now() });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: Date.now() });
    return { companyId, siteId, superId, adminId };
  });
}

async function keptFor(t: Harness, siteId: Id<"companyWebsites">, country: string) {
  return await t.run(async (ctx) => (await ctx.db.query("searchConsoleDays").collect()).filter((row) => row.companyWebsiteId === siteId && row.country === country).length);
}

describe("where a website trades", () => {
  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  test("a super admin sets several countries, in the order given, as Google writes them", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const asSuper = t.withIdentity({ subject: superId });

    await asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["GBR", "irl", "gbr"] });

    expect(await asSuper.query(api.searchConsoleCountries.searchConsoleMarket, { companyWebsiteId: siteId }))
      .toEqual({ owned: true, countries: ["gbr", "irl"], limit: 3 });
  });

  test("a company admin cannot set them: countries are set only in admin", async () => {
    const t = harness();
    const { siteId, adminId } = await setUp(t);

    await expect(t.withIdentity({ subject: adminId }).mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["gbr"] }))
      .rejects.toThrow();
  });

  test("refuses a code that is not one of Google's countries, and Google's own unknown", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const asSuper = t.withIdentity({ subject: superId });

    await expect(asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["xyz"] })).rejects.toThrow(/not a country/);
    await expect(asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["zzz"] })).rejects.toThrow(/not a country/);
  });

  test("holds to the limit when adding, but lets a list longer than a lowered limit be edited down", async () => {
    const t = harness();
    const { companyId, siteId, superId } = await setUp(t);
    const asSuper = t.withIdentity({ subject: superId });

    await expect(asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["gbr", "irl", "usa", "fra"] }))
      .rejects.toThrow(/keeps 3 home countries/);

    await t.run(async (ctx) => {
      await ctx.db.patch(siteId, { searchConsoleCountries: ["gbr", "irl", "usa", "fra"] });
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: siteId, consoleCountriesPerSite: 2, updatedAt: Date.now() });
    });
    await asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["gbr", "irl", "usa"] });
    expect((await asSuper.query(api.searchConsoleCountries.searchConsoleMarket, { companyWebsiteId: siteId }))?.limit).toBe(2);
  });

  test("a competitor has no Search Console, so no countries", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t, "TRACKED");
    const asSuper = t.withIdentity({ subject: superId });

    await expect(asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["gbr"] })).rejects.toThrow(/competitor/);
    expect((await asSuper.query(api.searchConsoleCountries.searchConsoleMarket, { companyWebsiteId: siteId }))?.owned).toBe(false);
  });

  test("a country taken off has what was kept for it cleared, and only that country", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const asSuper = t.withIdentity({ subject: superId });
    await asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["gbr", "irl"] });
    await t.run(async (ctx) => {
      for (const country of ["gbr", "irl", undefined]) {
        await ctx.db.insert("searchConsoleDays", {
          companyWebsiteId: siteId, country, searchType: "web", day: "2026-09-20", clicks: 1, impressions: 10, ctr: 0.1, position: 4, fetchedAt: Date.now(),
        });
      }
    });

    await asSuper.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: siteId, countries: ["gbr"] });
    await finishScheduled(t);

    expect(await keptFor(t, siteId, "irl")).toBe(0);
    expect(await keptFor(t, siteId, "gbr")).toBe(1);
    expect(await t.run(async (ctx) => (await ctx.db.query("searchConsoleDays").collect()).filter((row) => row.country === undefined).length)).toBe(1);
  });
});
