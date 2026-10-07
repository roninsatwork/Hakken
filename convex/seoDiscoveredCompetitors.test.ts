import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { TypesafeAskResult } from "./typesafeProviderService";
import { judgeCompetitors } from "./seoJudgments";
import { discoveryTotal, parseDomainCompetitors } from "./dataForSeoParsers";
import { discoveredTotal } from "./siteDiscovery";

/**
 * Websites discovery says compete with one of a company's own.
 *
 * Two things carry this feature. Ranking for the same searches is not evidence
 * of competing, so the judgment labels the list rather than a client being
 * handed everything that outranks them. And nothing is tracked until a person
 * says so, which means a dismissal has to survive the next discovery run.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN", createdAt: Date.now(),
    } as never));
  return t.withIdentity({ subject: userId });
}

async function seedWorld(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", {
      host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now(),
    });
    const hold = await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "domain_competitors", family: "DataForSEO Labs", mode: "LIVE",
      companyId, websiteId, target: "ourshop.com", taskArgsJson: "{}",
      status: "READY", tag: "t", costUsd: 0.1, sandbox: false,
      submittedAt: Date.now(), completedAt: Date.now(),
    });
    return { companyId, websiteId, hold, pullId };
  });
}

const firstPage = { page: 1, pageSize: 15 };

describe("reading a discovery response", () => {
  test("keeps who they are and how much they overlap", () => {
    const rows = parseDomainCompetitors([{
      items: [
        { domain: "rival.com", intersections: 412, avg_position: 8.2, metrics: { organic: { etv: 900 } } },
        { domain: "directory.com", intersections: 1200, avg_position: 3.1 },
      ],
    }]);

    // Intersections is the figure that says how much of a rival this is.
    expect(rows[0]).toMatchObject({ host: "rival.com", intersections: 412, estimatedTraffic: 900 });
    expect(rows[1].intersections).toBe(1200);
  });

  test("survives a shape it does not recognise", () => {
    expect(parseDomainCompetitors(null)).toEqual([]);
    expect(parseDomainCompetitors([{ items: [{ intersections: 5 }] }])).toEqual([]);
  });

  // A discovery answer holds 50 rows of however many the supplier found: the
  // screens say "49 of N", so N is kept (sites-data-completeness-plan.md, B3).
  test("keeps how many the supplier found, the site itself left out", () => {
    const answer = [{ total_count: 1_297, items: [{ domain: "ourshop.com", intersections: 900 }, { domain: "rival.com", intersections: 412 }] }];
    expect(discoveryTotal(answer, "ourshop.com")).toBe(1_296);
    expect(discoveryTotal(answer, "elsewhere.com")).toBe(1_297);
    expect(discoveryTotal([{ items: [] }], "ourshop.com")).toBeNull();
  });

  test("the total is kept per place, and a parse run again replaces its own", async () => {
    const t = harness();
    const { websiteId, pullId } = await seedWorld(t);
    const record = (total: number | null, locationCode?: number) => t.mutation(internal.siteDiscovery.recordDiscoveryTotal, {
      pullId, websiteId, day: "2026-09-27", found: 49, total, ...(locationCode !== undefined ? { locationCode } : {}),
    });
    const read = (place: number) => t.run(async (ctx) => await discoveredTotal(ctx, websiteId, place));

    expect(await read(2826)).toBeNull();
    await record(1_296, 2826);
    await record(1_310, 2826);
    expect(await read(2826)).toBe(1_310);
    expect(await read(2840)).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("seoWebsiteMetrics").collect()).length)).toBe(1);

    // No total in the answer: the found count is kept, and no total is claimed.
    await record(null, 2826);
    expect(await read(2826)).toBeNull();
  });
});

describe("judging what a discovered website is", () => {
  const found = [
    { host: "rival.com", intersections: 412, averagePosition: 8.2, estimatedTraffic: 900 },
    { host: "yell.com", intersections: 1200, averagePosition: 3.1, estimatedTraffic: null },
  ];

  function stubCtx(modes: Record<string, string>) {
    const runQuery = vi.fn(async (_ref: unknown, queryArgs: unknown) => {
      const keys = (queryArgs as { decisionKeys?: string[] })?.decisionKeys;
      if (keys) return Object.fromEntries(keys.map((key) => [key, modes[key] ?? "OFF"]));
      return { modelId: "m1", providerKey: "typesafe", providerModelId: "jev-latest", source: "default" };
    });
    const runMutation = vi.fn(async () => ({ runIds: [], costUsd: 0 }));
    return { runQuery, runMutation } as unknown as ActionCtx;
  }

  /** Answers each single-website request by the candidate it was asked about. */
  const byCandidate = (choices: Record<string, string>) => async (request: { state: unknown }) => {
    const address = (request.state as { candidate: { address: string } }).candidate.address;
    return chose({ "seo.real-competitor": choices[address] ?? "other" });
  };

  const chose = (choices: Record<string, string>): TypesafeAskResult => ({
    model: "jev-latest",
    answers: Object.fromEntries(Object.entries(choices).map(([id, choice]) => [
      id, { type: "choice", choice, probabilities: { [choice]: 0.95 }, confidence: 0.95 },
    ])) as TypesafeAskResult["answers"],
    usage: { inputTokens: 90, outputTokens: 9 },
  });

  test("tells a rival from a directory that outranks everybody", async () => {
    const judged = await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, ourHost: "ourshop.com", found },
      { ask: byCandidate({ "rival.com": "competitor", "yell.com": "directory" }) as never },
    );

    // The directory has three times the overlap and is not a competitor. This
    // is the whole reason the judgment exists.
    expect(judged[0]).toMatchObject({ host: "rival.com", kind: "COMPETITOR" });
    expect(judged[1]).toMatchObject({ host: "yell.com", kind: "DIRECTORY" });
  });

  test("the judge is told what the business sells, not just two web addresses", async () => {
    let sentState: Record<string, unknown> | undefined;
    await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "ACT" }),
      {
        pullId: "p1" as Id<"seoDataPulls">,
        ourHost: "ourshop.com",
        ours: { sector: "Digital agency", market: "London, England", names: ["Our Shop"], searches: ["web design surrey"] },
        found,
      },
      { ask: (async (request: { state: unknown }) => { sentState = request.state as Record<string, unknown>; return chose({ "seo.real-competitor": "competitor" }); }) as never },
    );

    // With only two addresses to go on it answered "other, not sure" for 186
    // of 196 on the first live run, 2026-09-23.
    expect(sentState?.ours).toEqual({
      address: "ourshop.com",
      sells: "Digital agency",
      market: "London, England",
      knownAs: ["Our Shop"],
      searchedFor: ["web design surrey"],
    });
  });

  test("keeps everything, labelled, rather than hiding what is not a rival", async () => {
    const judged = await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, ourHost: "ourshop.com", found },
      { ask: byCandidate({ "rival.com": "publisher", "yell.com": "directory" }) as never },
    );

    // Being outranked by a directory is still worth knowing.
    expect(judged).toHaveLength(2);
  });

  test("labels nothing while the Decision is switched off", async () => {
    const ask = vi.fn();
    const judged = await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "OFF" }),
      { pullId: "p1" as Id<"seoDataPulls">, ourHost: "ourshop.com", found },
      { ask: ask as never },
    );

    expect(ask).not.toHaveBeenCalled();
    expect(judged.every((row) => row.kind === undefined)).toBe(true);
  });

  test("asks about each website on its own", async () => {
    // Asked about many at once, the live model gave every one the same answer
    // (2026-09-23). One request per website, each with only that website in it.
    const ask = vi.fn(byCandidate({}));
    await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, ourHost: "ourshop.com", found },
      { ask: ask as never },
    );
    expect(ask).toHaveBeenCalledTimes(2);
    const asked = ask.mock.calls.map(([request]) => (request.state as { candidate: { address: string } }).candidate.address);
    expect(asked.sort()).toEqual(["rival.com", "yell.com"]);
  });
});

describe("filing and deciding suggestions", () => {
  const found = [
    { host: "rival.com", intersections: 412, kind: "COMPETITOR" as const },
    { host: "yell.com", intersections: 1200, kind: "DIRECTORY" as const },
  ];

  test("files one suggestion per company holding the website", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await seedWorld(t);

    await t.mutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
      pullId: world.pullId, websiteId: world.websiteId, found,
    });

    const listed = await admin.query(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
      companyWebsiteId: world.hold, ...firstPage,
    });
    // Closest overlap first, and the directory is on the list, labelled.
    expect(listed.data.map((row) => [row.host, row.kind]))
      .toEqual([["yell.com", "DIRECTORY"], ["rival.com", "COMPETITOR"]]);
    // Each day's figures kept too, one row per competitor per day, however
    // often that day's result is filed.
    await t.mutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
      pullId: world.pullId, websiteId: world.websiteId, found,
    });
    const dated = await t.run(async (ctx) => await ctx.db.query("discoveredCompetitorDays").collect());
    expect(dated.map((row) => [row.host, row.intersections]).sort())
      .toEqual([["rival.com", 412], ["yell.com", 1200]]);
  });

  test("tracking one adds it exactly as typing it in would", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await seedWorld(t);
    await t.mutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
      pullId: world.pullId, websiteId: world.websiteId, found,
    });

    const listed = await admin.query(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
      companyWebsiteId: world.hold, ...firstPage,
    });
    const rival = listed.data.find((row) => row.host === "rival.com")!;
    await admin.mutation(api.seoDiscoveredCompetitors.acceptDiscoveredCompetitor, {
      suggestionId: rival._id,
    });

    // The same shared website record and the same audit entry as a typed one,
    // with the trail saying which way it arrived.
    // It joins the company's own list, exactly as typing the address would.
    const tracked = await t.run(async (ctx) => (await ctx.db.query("companyWebsites").collect())
      .filter((row) => row.relationship === "TRACKED"));
    expect(tracked).toHaveLength(1);
    // The trail says it was found rather than typed, the distinction a
    // suggestion exists to keep.
    const audit = await t.run(async (ctx) =>
      await ctx.db.query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "ADD_TRACKED_WEBSITE")).collect());
    expect(JSON.parse(audit[0].metadata ?? "{}").via).toBe("discovered");
  });

  test("a rival already tracked another way is not suggested again", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await seedWorld(t);
    await t.mutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
      pullId: world.pullId, websiteId: world.websiteId, found,
    });
    // Typed in by hand, not accepted from the list, so the suggestion row
    // itself was never marked decided.
    await admin.mutation(api.websiteAttachments.addTrackedCompetitor, {
      companyWebsiteId: world.hold, url: "rival.com",
    });

    const listed = await admin.query(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
      companyWebsiteId: world.hold, ...firstPage,
    });
    expect(listed.data.map((row) => row.host)).toEqual(["yell.com"]);
  });

  test("a dismissal survives the next discovery run", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await seedWorld(t);
    await t.mutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
      pullId: world.pullId, websiteId: world.websiteId, found,
    });

    const listed = await admin.query(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
      companyWebsiteId: world.hold, ...firstPage,
    });
    await admin.mutation(api.seoDiscoveredCompetitors.dismissDiscoveredCompetitor, {
      suggestionId: listed.data[0]._id,
    });

    // Re-running discovery must never resurrect something a person rejected.
    await t.mutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
      pullId: world.pullId, websiteId: world.websiteId, found,
    });

    const after = await admin.query(api.seoDiscoveredCompetitors.listDiscoveredCompetitors, {
      companyWebsiteId: world.hold, ...firstPage,
    });
    expect(after.data.map((row) => row.host)).toEqual(["rival.com"]);
  });
});

describe("what the judge is told about the business", () => {
  test("the company's own profile, or for a competitor the company's own site's — never another company's", async () => {
    const t = harness();
    const { ownHold, rivalHold, otherHold } = await t.run(async (ctx) => {
      const own = await ctx.db.insert("websites", { host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now() });
      // What it ranks for, most visits first — facts every watcher can see —
      // never a company's own tracked searches.
      const ranked = (keyword: string, position: number | undefined, traffic: number) => ctx.db.insert("siteKeywordRanks", {
        websiteId: own, locationCode: 2826, keyword, ...(position !== undefined ? { position } : {}),
        band: position !== undefined ? "p01_03" : "zz_none", page: "/", volume: 100, volumeKnown: true, intent: "UNJUDGED",
        status: position !== undefined ? "SAME" : "LOST", change: 0, day: "2026-09-20", firstSeenDay: "2026-09-01",
        traffic,
      } as never);
      await ranked("web design surrey", 2, 90);
      await ranked("no longer ranking", undefined, 500);
      const rival = await ctx.db.insert("websites", { host: "rival.com", displayHost: "rival.com", firstSeenAt: Date.now() });
      const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
      const ownHold = await ctx.db.insert("companyWebsites", { companyId, websiteId: own, relationship: "OWNED", createdAt: Date.now() });
      const rivalHold = await ctx.db.insert("companyWebsites", { companyId, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, createdAt: Date.now() });
      await ctx.db.insert("holdProfiles", {
        companyWebsiteId: ownHold, companyId, websiteId: own, brandNames: [{ name: "Our Shop", isPrimary: true }], hasBrandNames: true,
        sector: "Digital agency", marketLabel: "London, England", updatedAt: Date.now(),
      });
      // Another company owning the same site describes it its own way.
      const otherCompany = await ctx.db.insert("companies", { name: "Other", createdAt: Date.now() });
      const otherHold = await ctx.db.insert("companyWebsites", { companyId: otherCompany, websiteId: own, relationship: "OWNED", createdAt: Date.now() });
      await ctx.db.insert("holdProfiles", {
        companyWebsiteId: otherHold, companyId: otherCompany, websiteId: own, brandNames: [], hasBrandNames: false,
        sector: "Something else entirely", updatedAt: Date.now(),
      });
      return { ownHold, rivalHold, otherHold };
    });

    const expected = { sector: "Digital agency", market: "London, England", names: ["Our Shop"], searches: ["web design surrey"] };
    expect(await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: ownHold })).toEqual(expected);
    // A competitor has no profile of its own; it is in the trade of the company's own site it is compared with.
    expect(await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: rivalHold }))
      .toEqual({ ...expected, names: [], searches: [] });
    expect(await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: otherHold }))
      .toMatchObject({ sector: "Something else entirely", names: [] });
  });

  test("a company's description of what its business does is saved and handed to the judge", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const holdId = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now() });
      const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    });

    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, {
      companyWebsiteId: holdId, sector: "Digital agency", marketLabel: null,
      description: "  Web design and AI products   for UK businesses. ",
    });
    expect(await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: holdId }))
      .toMatchObject({ sector: "Digital agency", does: "Web design and AI products for UK businesses." });
  });
});

/*
  A competitor's page lists the searches in both kept lists, and says how many
  the two share across everything both rank for, as discovery counted them
  (sites-data-completeness-plan.md, §4.D3).
*/
describe("the searches a site shares with a competitor", () => {
  test("from the site's own discovery, else the competitor's, and only the company's own", async () => {
    const t = harness();
    const { companyId, websiteId, hold } = await seedWorld(t);
    const { rivalHold, otherHold, userId } = await t.run(async (ctx) => {
      const rivalSite = await ctx.db.insert("websites", { host: "rival.com", displayHost: "rival.com", firstSeenAt: Date.now() });
      const rivalHold = await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalSite, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: Date.now() });
      const otherCompany = await ctx.db.insert("companies", { name: "Someone Else", createdAt: Date.now() });
      const otherHold = await ctx.db.insert("companyWebsites", { companyId: otherCompany, websiteId: rivalSite, createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "M", email: "m@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      // Found by the competitor's discovery, not the site's own.
      await ctx.db.insert("discoveredCompetitors", { companyWebsiteId: rivalHold, companyId, host: "ourshop.com", intersections: 412, discoveredAt: Date.now() });
      return { rivalHold, otherHold, userId };
    });
    const asMember = t.withIdentity({ subject: userId });
    expect(await asMember.query(api.siteDiscovery.sharedWithRival, { siteId: hold, rivalId: rivalHold })).toBe(412);

    await t.run(async (ctx) => {
      await ctx.db.insert("discoveredCompetitors", { companyWebsiteId: hold, companyId, host: "rival.com", intersections: 420, discoveredAt: Date.now() });
    });
    expect(await asMember.query(api.siteDiscovery.sharedWithRival, { siteId: hold, rivalId: rivalHold })).toBe(420);
    // Another company's hold of the same website is its own.
    expect(await asMember.query(api.siteDiscovery.sharedWithRival, { siteId: hold, rivalId: otherHold })).toBeNull();
  });
});
