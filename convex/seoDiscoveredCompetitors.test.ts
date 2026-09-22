import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { TypesafeAskResult } from "./typesafeProviderService";
import { judgeCompetitors } from "./seoJudgments";
import { parseDomainCompetitors } from "./dataForSeoParsers";

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
    const runMutation = vi.fn(async () => ({ runIds: [], costGBP: 0 }));
    return { runQuery, runMutation } as unknown as ActionCtx;
  }

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
      { ask: async () => chose({ "0": "competitor", "1": "directory" }) },
    );

    // The directory has three times the overlap and is not a competitor. This
    // is the whole reason the judgment exists.
    expect(judged[0]).toMatchObject({ host: "rival.com", kind: "COMPETITOR" });
    expect(judged[1]).toMatchObject({ host: "yell.com", kind: "DIRECTORY" });
  });

  test("keeps everything, labelled, rather than hiding what is not a rival", async () => {
    const judged = await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, ourHost: "ourshop.com", found },
      { ask: async () => chose({ "0": "publisher", "1": "directory" }) },
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

  test("asks about the whole batch in one request", async () => {
    const ask = vi.fn(async () => chose({ "0": "competitor", "1": "competitor" }));
    await judgeCompetitors(
      stubCtx({ "seo.real-competitor": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, ourHost: "ourshop.com", found },
      { ask: ask as never },
    );
    expect(ask).toHaveBeenCalledTimes(1);
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
    const competitors = await t.run(async (ctx) => await ctx.db.query("trackedCompetitors").collect());
    expect(competitors).toHaveLength(1);
    const audit = await t.run(async (ctx) =>
      await ctx.db.query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "ADD_TRACKED_COMPETITOR")).collect());
    expect(JSON.parse(audit[0].metadata ?? "{}").via).toBe("discovered");
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
