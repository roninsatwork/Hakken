import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type { SearchType } from "./searchConsoleSchema";

/**
 * Whether a website's lists have been added up (`reportsBuilt`), which
 * decides whether a nightly fetch adds them all up as a first collection
 * does. A country kept ready that Google showed the website in no search has
 * nothing to add up and never has a list: it must not count as never added
 * up, or every night adds the whole website up again (2026-10-07: Yemen,
 * kept ready for conterraops.com, did). Rows written directly: what is held
 * and what was built is all the check reads.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const DAYS = ["2026-10-04", "2026-10-05", "2026-10-06"];
const KINDS: SearchType[] = ["web", "video", "news", "discover", "googleNews"];

/** A connected website keeping the countries named ready beside its main one. */
async function setup(countries: string[] = []) {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: holdId, websiteId, status: "CONNECTED", property: "sc-domain:acme-shop.test",
      newestDay: DAYS.at(-1), oldestDay: DAYS[0],
      countriesHeld: countries.map((country) => ({ country, newestDay: DAYS.at(-1)!, oldestDay: DAYS[0] })),
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { holdId, connectionId };
  });
  return { t, ...ids };
}

/** Each day collected for every kind of result, all countries or one: no impressions but in the kinds named. */
async function days(t: Harness, holdId: Id<"companyWebsites">, country: string | undefined, shownIn: SearchType[]) {
  await t.run(async (ctx) => {
    for (const searchType of KINDS) {
      const impressions = shownIn.includes(searchType) ? 4 : 0;
      for (const day of DAYS) {
        await ctx.db.insert("searchConsoleDays", {
          companyWebsiteId: holdId, ...(country ? { country } : {}), searchType, day,
          clicks: 0, impressions, ctr: 0, position: impressions > 0 ? 6 : 0, fetchedAt: Date.now(),
        });
      }
    }
  });
}

/** One kind of result's 7-day page list added up, all countries or one. */
async function built(t: Harness, holdId: Id<"companyWebsites">, country: string | undefined, searchType: SearchType) {
  await t.run(async (ctx) => {
    await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: holdId, ...(country ? { country } : {}), searchType, list: "page", period: "7", which: "NOW", part: 0,
      from: DAYS[0], to: DAYS.at(-1)!, keys: [], clicks: [], impressions: [], positionSums: [], builtAt: Date.now(),
    });
  });
}

const reportsBuilt = (t: Harness, connectionId: Id<"searchConsoleConnections">) =>
  t.query(internal.searchConsoleSettling.reportsBuilt, { connectionId });

describe("whether a website's lists have been added up", () => {
  test("a first collection still adds them up: searches held, no list yet", async () => {
    const { t, holdId, connectionId } = await setup();
    await days(t, holdId, undefined, ["web"]);
    expect(await reportsBuilt(t, connectionId)).toBe(false);

    await built(t, holdId, undefined, "web");
    expect(await reportsBuilt(t, connectionId)).toBe(true);
  });

  test("a country kept ready that Google showed the website in no search needs no lists: added up, not every night again", async () => {
    const { t, holdId, connectionId } = await setup(["yem"]);
    await days(t, holdId, undefined, ["web"]);
    await built(t, holdId, undefined, "web");
    await days(t, holdId, "yem", []);
    expect(await reportsBuilt(t, connectionId)).toBe(true);
  });

  test("that country's first search: its lists are still to add up, so the next nightly fetch adds them up", async () => {
    const { t, holdId, connectionId } = await setup(["sau"]);
    await days(t, holdId, undefined, ["web"]);
    await built(t, holdId, undefined, "web");
    await days(t, holdId, "sau", ["web"]);
    expect(await reportsBuilt(t, connectionId)).toBe(false);

    await built(t, holdId, "sau", "web");
    expect(await reportsBuilt(t, connectionId)).toBe(true);
  });

  test("a country shown only in Discover is judged by its Discover lists, as it has no web search's", async () => {
    const { t, holdId, connectionId } = await setup(["are"]);
    await days(t, holdId, undefined, ["web"]);
    await built(t, holdId, undefined, "web");
    await days(t, holdId, "are", ["discover"]);
    expect(await reportsBuilt(t, connectionId)).toBe(false);

    await built(t, holdId, "are", "discover");
    expect(await reportsBuilt(t, connectionId)).toBe(true);
  });

  test("a website Google showed in no search at all has nothing to add up", async () => {
    const { t, holdId, connectionId } = await setup();
    await days(t, holdId, undefined, []);
    expect(await reportsBuilt(t, connectionId)).toBe(true);
  });
});
