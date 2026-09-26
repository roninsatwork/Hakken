import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { TypesafeAskResult } from "./typesafeProviderService";
import { judgeCompetitors } from "./seoJudgments";
import { parseDomainCompetitors } from "./dataForSeoParsers";
import { listOwnerOf } from "@/src/test/listOwner";

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
    // And the rivalry is recorded on the host as observed rather than claimed,
    // which is the distinction the two sources exist to keep. That record is
    // market knowledge; it decides no purchase.
    const edges = await t.run(async (ctx) => await ctx.db.query("websiteRivals").collect());
    expect(edges[0].source).toBe("DISCOVERED");
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
  test("its own profile, or the one of the site it is compared with", async () => {
    const t = harness();
    const { own, rival } = await t.run(async (ctx) => {
      const own = await ctx.db.insert("websites", {
        host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now(),
        sector: "Digital agency", marketLabel: "London, England",
        brandNames: [{ name: "Our Shop", isPrimary: true }],
      });
      // What it ranks for, most visits first — facts every watcher can see —
      // never a company's own tracked searches, which a judgment filed for
      // everyone must not carry (docs/plans/active/private-tracking-lists-plan.md).
      const ranked = (keyword: string, position: number | undefined, traffic: number) => ctx.db.insert("siteKeywordRanks", {
        websiteId: own, locationCode: 2826, keyword, ...(position !== undefined ? { position } : {}),
        band: position !== undefined ? "p01_03" : "zz_none", page: "/", volume: 100, volumeKnown: true, intent: "UNJUDGED",
        status: position !== undefined ? "SAME" : "LOST", change: 0, day: "2026-09-20", firstSeenDay: "2026-09-01",
        searchText: keyword, traffic, updatedAt: Date.now(),
      } as never);
      await ranked("web design surrey", 2, 90);
      await ranked("no longer ranking", undefined, 500);
      await ctx.db.insert("websiteKeywords", { websiteId: own, companyWebsiteId: await listOwnerOf(ctx, own), keyword: "a private tracked search", isActive: true, createdAt: Date.now() });
      const rival = await ctx.db.insert("websites", { host: "rival.com", displayHost: "rival.com", firstSeenAt: Date.now() });
      const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
      await ctx.db.insert("companyWebsites", { companyId, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, createdAt: Date.now() });
      return { own, rival };
    });

    const expected = { sector: "Digital agency", market: "London, England", names: ["Our Shop"], searches: ["web design surrey"] };
    expect(await t.query(internal.websiteCanonical.describeBusinessForJudging, { websiteId: own })).toEqual(expected);
    // A tracked rival has no profile of its own; it is in the same trade as
    // the site it is compared with, so it borrows that one.
    expect(await t.query(internal.websiteCanonical.describeBusinessForJudging, { websiteId: rival })).toEqual(expected);
  });

  test("an admin's description of what the business does is saved and handed to the judge", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const websiteId = await t.run(async (ctx) => await ctx.db.insert("websites", {
      host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now(),
    }));

    await admin.mutation(api.websiteCanonical.setWebsiteProfile, {
      websiteId, sector: "Digital agency", marketLabel: null,
      description: "  Web design and AI products   for UK businesses. ",
    });
    expect(await t.query(internal.websiteCanonical.describeBusinessForJudging, { websiteId }))
      .toMatchObject({ sector: "Digital agency", does: "Web design and AI products for UK businesses." });
    expect(await t.query(internal.websiteCanonical.describeWebsitesForJudging, { websiteIds: [websiteId] }))
      .toEqual([{ websiteId, sector: "Digital agency", does: "Web design and AI products for UK businesses." }]);

    // Saving the profile without the field leaves the description alone.
    await admin.mutation(api.websiteCanonical.setWebsiteProfile, { websiteId, sector: "Digital agency", marketLabel: "London" });
    expect((await t.run(async (ctx) => await ctx.db.get(websiteId)))?.businessDescription)
      .toBe("Web design and AI products for UK businesses.");
  });
});
