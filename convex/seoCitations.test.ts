import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { parseLlmResponse } from "./dataForSeoParsers";
import { judgeStances, linkCitedAddresses } from "./seoJudgments";
import type { TypesafeAskResult } from "./typesafeProviderService";
import type { ActionCtx } from "./_generated/server";

/**
 * Who an AI answer named, and who gets to see it.
 *
 * Two properties carry the feature. One purchase serves every watcher: the
 * answer is matched against every brand we hold, not just the one who asked.
 * And a company reads only through its own hold on a website, so the shared
 * table never shows one client another client's rivals.
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
    const ronins = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
    const acme = await ctx.db.insert("companies", { name: "Acme Ltd", createdAt: Date.now() });
    const ours = await ctx.db.insert("websites", {
      host: "ronins-test.co.uk", displayHost: "ronins-test.co.uk", firstSeenAt: Date.now(),
      brandNames: [{ name: "Ronins Agency", isPrimary: true, kind: "NAME" }, { name: "Ronnins", isPrimary: false, kind: "MISSPELLING" }],
    });
    const rival = await ctx.db.insert("websites", {
      host: "rival.com", displayHost: "rival.com", firstSeenAt: Date.now(),
      brandNames: [{ name: "Rival Plumbing", isPrimary: true, kind: "NAME" }],
    });
    const hold = await ctx.db.insert("companyWebsites", {
      companyId: ronins, websiteId: ours, createdAt: Date.now(), locationCode: 1006925,
    });
    await ctx.db.insert("companyWebsites", { companyId: acme, websiteId: rival, createdAt: Date.now() });
    return { ronins, acme, ours, rival, hold };
  });
}

const ANSWER = [{
  items: [
    { type: "reasoning", sections: [{ text: "Thinking about plumbers." }] },
    {
      type: "message",
      sections: [{
        type: "text",
        text: "For Leeds I'd look at Rival Plumbing first, then Ronins Agency. Both are well reviewed.",
        annotations: [
          { url: "https://www.rival.com/leeds", title: "Rival" },
          { url: "https://unknown-plumber.co.uk/", title: "Unknown" },
        ],
      }],
    },
  ],
}];

describe("reading an answer", () => {
  test("keeps the answer's words and its cited sources, and drops the reasoning", () => {
    const parsed = parseLlmResponse(ANSWER);
    expect(parsed.answer).toContain("Rival Plumbing");
    expect(parsed.answer).not.toContain("Thinking about");
    expect(parsed.sources.map((source) => source.url))
      .toEqual(["https://www.rival.com/leeds", "https://unknown-plumber.co.uk/"]);
  });

  test("survives a shape it does not recognise", () => {
    const nothing = { answer: "", sources: [], fanOutQueries: [] };
    expect(parseLlmResponse(null)).toEqual(nothing);
    expect(parseLlmResponse([{ items: [{ type: "message" }] }])).toEqual(nothing);
  });
});

describe("recording who was named", () => {
  async function seedPull(t: Harness, companyId: Id<"companies">, cycleWebsite: Id<"websites">, hold: Id<"companyWebsites">) {
    return await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "QUEUED",
        companyId, taskArgsJson: JSON.stringify({ user_prompt: "best plumber in Leeds", web_search_city: "Leeds" }),
        status: "READY", tag: "t", costUsd: 0.01, sandbox: false,
        submittedAt: Date.now(), completedAt: Date.now(),
      });
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId, trigger: "MANUAL", status: "DONE",
        plannedCount: 1, reusedCount: 0, sentCount: 1, readyCount: 1, failedCount: 0,
        totalCostUsd: 0.01, startedAt: Date.now(),
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId, companyId, websiteId: cycleWebsite, operationId: "ai_citation_chatgpt",
        pullId, reused: false, createdAt: Date.now(),
      });
      void hold;
      return pullId;
    });
  }

  test("files a row per brand, in the order the answer named them", async () => {
    const t = harness();
    const world = await seedWorld(t);
    const pullId = await seedPull(t, world.ronins, world.ours, world.hold);

    // Matching happens in the action now, so the writer is handed the hits it
    // is to file. That is what keeps the answer's prose out of every mutation.
    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId, prompt: "best plumber in Leeds", engine: "chatgpt", day: "2026-09-22",
      brands: [
        { websiteId: world.rival, text: "Rival Plumbing", variantKind: "NAME" },
        { websiteId: world.ours, text: "Ronins Agency", variantKind: "NAME", stance: "RECOMMENDED", stanceCertainty: "SURE" },
      ],
      sources: [{ url: "https://www.rival.com/leeds", websiteId: world.rival }],
    });

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("aiCitations").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect());
    const brands = rows.filter((row) => row.kind === "BRAND");

    expect(brands.map((row) => [row.mentionedText, row.position]))
      .toEqual([["Rival Plumbing", 1], ["Ronins Agency", 2]]);
    // The place the question was asked from comes back from what was sent.
    expect(brands[0].locationCode).toBe(1006925);
  });

  test("keeps the stance when one was judged, and claims none when it was not", async () => {
    const t = harness();
    const world = await seedWorld(t);
    const pullId = await seedPull(t, world.ronins, world.ours, world.hold);

    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId, prompt: "best plumber in Leeds", engine: "chatgpt", day: "2026-09-22",
      brands: [
        { websiteId: world.ours, text: "Ronins Agency", variantKind: "NAME", stance: "WARNED_AGAINST", stanceCertainty: "SURE" },
        { websiteId: world.rival, text: "Rival Plumbing", variantKind: "NAME" },
      ],
      sources: [],
    });

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("aiCitations").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect());

    // An answer saying "avoid them" is a citation, but it is not a win.
    expect(rows[0].stance).toBe("WARNED_AGAINST");
    expect(rows[0].stanceCertainty).toBe("SURE");
    // Nobody judged the second, so nothing is claimed about it and the screen
    // reads it as a plain mention — what it said before the Decision existed.
    expect(rows[1].stance).toBeUndefined();
  });

  test("a cited domain nobody tracks is still kept, as a rival worth seeing", async () => {
    const t = harness();
    const world = await seedWorld(t);
    const pullId = await seedPull(t, world.ronins, world.ours, world.hold);

    // The action resolves each address before the writer sees it, so a source
    // arrives with its website id already decided or without one.
    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId, prompt: "best plumber in Leeds", engine: "chatgpt", day: "2026-09-22",
      brands: [],
      sources: [
        { url: "https://www.rival.com/leeds", websiteId: world.rival },
        { url: "https://unknown-plumber.co.uk/" },
      ],
    });

    const sources = await t.run(async (ctx) =>
      (await ctx.db.query("aiCitations").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect())
        .filter((row) => row.kind === "SOURCE"));

    expect(sources.map((row) => [row.mentionedText, row.mentionedWebsiteId ?? null]))
      .toEqual([["rival.com", world.rival], ["unknown-plumber.co.uk", null]]);
  });

  test("stores no prose from the answer", async () => {
    const t = harness();
    const world = await seedWorld(t);
    const pullId = await seedPull(t, world.ronins, world.ours, world.hold);

    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId, prompt: "best plumber in Leeds", engine: "chatgpt", day: "2026-09-22",
      brands: [{ websiteId: world.ours, text: "Ronins Agency", variantKind: "NAME" }],
      sources: [],
    });

    // Stronger than before: the answer's text is not even a parameter of this
    // mutation any more, so there is nothing for it to store.
    const rows = await t.run(async (ctx) =>
      await ctx.db.query("aiCitations").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect());
    expect(JSON.stringify(rows)).not.toContain("Ignore previous");
    expect(rows[0].mentionedText).toBe("Ronins Agency");
  });

  test("a second parse replaces the first rather than doubling it", async () => {
    const t = harness();
    const world = await seedWorld(t);
    const pullId = await seedPull(t, world.ronins, world.ours, world.hold);
    const args = {
      pullId, prompt: "best plumber in Leeds", engine: "chatgpt" as const, day: "2026-09-22",
      brands: [
        { websiteId: world.rival, text: "Rival Plumbing", variantKind: "NAME" as const },
        { websiteId: world.ours, text: "Ronins Agency", variantKind: "NAME" as const },
      ],
      sources: [{ url: "https://www.rival.com/leeds" }, { url: "https://unknown-plumber.co.uk/" }],
    };

    await t.mutation(internal.seoCollectionParse.writeAiCitations, args);
    await t.mutation(internal.seoCollectionParse.writeAiCitations, args);

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("aiCitations").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect());
    expect(rows).toHaveLength(4);
  });
});

describe("who gets to see it", () => {
  test("a company reads its own answers, with itself separated from the rest", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await seedWorld(t);
    const pullId = await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "QUEUED",
        companyId: world.ronins, taskArgsJson: JSON.stringify({ user_prompt: "best plumber in Leeds" }),
        status: "READY", tag: "t", costUsd: 0.01, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
      });
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: world.ronins, trigger: "MANUAL", status: "DONE",
        plannedCount: 1, reusedCount: 0, sentCount: 1, readyCount: 1, failedCount: 0, totalCostUsd: 0.01, startedAt: Date.now(),
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId, companyId: world.ronins, websiteId: world.ours, operationId: "ai_citation_chatgpt", pullId, reused: false, createdAt: Date.now(),
      });
      return pullId;
    });
    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId, prompt: "best plumber in Leeds", engine: "chatgpt", day: "2026-09-22",
      brands: [
        { websiteId: world.rival, text: "Rival Plumbing", variantKind: "NAME" },
        { websiteId: world.ours, text: "Ronins Agency", variantKind: "NAME" },
      ],
      sources: [
        { url: "https://www.rival.com/leeds", websiteId: world.rival },
        { url: "https://unknown-plumber.co.uk/" },
      ],
    });

    const listed = await admin.query(api.seoCitationReports.listCompanyWebsiteCitations, {
      companyWebsiteId: world.hold, page: 1, pageSize: 15,
    });

    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].ourPosition).toBe(2);
    // Everyone else, with the rival we hold shown by its host and the domain
    // nobody tracks kept as it was cited.
    expect(listed.data[0].others.map((other) => other.text))
      .toEqual(["Rival Plumbing", "rival.com", "unknown-plumber.co.uk"]);
  });

  test("a company with no hold on the website sees nothing, not somebody else's rivals", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await seedWorld(t);
    // Acme's hold is on rival.com and has no citation lines of its own.
    const acmeHold = await t.run(async (ctx) =>
      (await ctx.db.query("companyWebsites").filter((q) => q.eq(q.field("companyId"), world.acme)).first())!._id);

    const listed = await admin.query(api.seoCitationReports.listCompanyWebsiteCitations, {
      companyWebsiteId: acmeHold, page: 1, pageSize: 15,
    });
    expect(listed.data).toHaveLength(0);
  });
});

describe("judging how an answer treated a business", () => {
  const HITS = [
    { websiteId: "w1" as Id<"websites">, text: "Ronins Agency", variantKind: "NAME" as const, at: 10 },
    { websiteId: "w2" as Id<"websites">, text: "Rival Plumbing", variantKind: "NAME" as const, at: 40 },
  ];

  function stubCtx(modes: Record<string, string>, providerKey = "typesafe") {
    // Function references are opaque proxies, so the two queries are told
    // apart by their arguments: only the mode lookup carries `decisionKeys`.
    const runQuery = vi.fn(async (_ref: unknown, queryArgs: unknown) => {
      const keys = (queryArgs as { decisionKeys?: string[] })?.decisionKeys;
      if (keys) return Object.fromEntries(keys.map((key) => [key, modes[key] ?? "OFF"]));
      return {
        modelId: "m1", providerKey,
        providerModelId: providerKey === "typesafe" ? "jev-latest" : "text",
        source: "default",
      };
    });
    const runMutation = vi.fn(async () => ({ runIds: [], costUsd: 0 }));
    return { runQuery, runMutation } as unknown as ActionCtx;
  }

  const answered = (choices: Record<string, string>, confidence = 0.95): TypesafeAskResult => ({
    model: "jev-latest",
    answers: Object.fromEntries(Object.entries(choices).map(([id, choice]) => [
      id,
      { type: "choice", choice, probabilities: { [choice]: confidence }, confidence },
    ])) as TypesafeAskResult["answers"],
    usage: { inputTokens: 100, outputTokens: 10 },
  });

  test("claims nothing while the Decision is switched off", async () => {
    const ask = vi.fn();
    const judged = await judgeStances(
      stubCtx({ "seo.citation-stance": "OFF" }),
      { pullId: "p1" as Id<"seoDataPulls">, prompt: "q", answer: "a", hits: HITS },
      { ask: ask as never },
    );

    // Every Decision ships off, so this is the shipped behaviour: the rows
    // stand as plain mentions and the model is never asked.
    expect(ask).not.toHaveBeenCalled();
    expect(judged).toHaveLength(2);
    expect(judged.every((row) => row.stance === undefined)).toBe(true);
  });

  test("records a warning as a warning, not as a win", async () => {
    const judged = await judgeStances(
      stubCtx({ "seo.citation-stance": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, prompt: "q", answer: "a", hits: HITS },
      { ask: async () => answered({ "0": "warned_against", "1": "recommended" }) },
    );

    // The whole point of the judgment: an answer saying "avoid them" names the
    // business, and without this it counted the same as praise.
    expect(judged[0]).toMatchObject({ text: "Ronins Agency", stance: "WARNED_AGAINST", stanceCertainty: "SURE" });
    expect(judged[1]).toMatchObject({ text: "Rival Plumbing", stance: "RECOMMENDED" });
  });

  test("drops a name that turned out not to be the business", async () => {
    const judged = await judgeStances(
      stubCtx({ "seo.citation-stance": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, prompt: "q", answer: "a", hits: HITS },
      { ask: async () => answered({ "0": "other", "1": "mentioned" }) },
    );

    // A short brand name matching unrelated prose is the false positive no
    // amount of whole-word matching can catch. This is the only thing that can.
    expect(judged.map((row) => row.text)).toEqual(["Rival Plumbing"]);
  });

  test("asks about each business by name, in one request", async () => {
    const ask = vi.fn(async () => answered({ "0": "mentioned", "1": "mentioned" }));
    await judgeStances(
      stubCtx({ "seo.citation-stance": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, prompt: "q", answer: "a", hits: HITS },
      { ask: ask as never },
    );

    // Independent judgments over the same answer ride together: two businesses
    // judged, one call paid for.
    expect(ask).toHaveBeenCalledTimes(1);
  });

  test("claims nothing when the model could not be asked", async () => {
    const judged = await judgeStances(
      stubCtx({ "seo.citation-stance": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, prompt: "q", answer: "a", hits: HITS },
      { ask: async () => { throw new Error("overloaded"); } },
    );

    // The rows still stand; nothing is guessed. That is the fallback the
    // Decisions framework requires of every entry.
    expect(judged).toHaveLength(2);
    expect(judged.every((row) => row.stance === undefined)).toBe(true);
  });
});


describe("linking a cited address to a rival already tracked", () => {
  const branded = [{
    websiteId: "w1" as Id<"websites">,
    host: "acmeplumbing.com",
    brandNames: [{ name: "Acme Plumbing", isPrimary: true, kind: "NAME" as const }],
  }];

  function stubCtx(modes: Record<string, string>) {
    const runQuery = vi.fn(async (_ref: unknown, queryArgs: unknown) => {
      const keys = (queryArgs as { decisionKeys?: string[] })?.decisionKeys;
      if (keys) return Object.fromEntries(keys.map((key) => [key, modes[key] ?? "OFF"]));
      return { modelId: "m1", providerKey: "typesafe", providerModelId: "jev-latest", source: "default" };
    });
    const runMutation = vi.fn(async () => ({ runIds: [], costUsd: 0 }));
    return { runQuery, runMutation } as unknown as ActionCtx;
  }

  const scored = (scores: Record<string, number>): TypesafeAskResult => ({
    model: "jev-latest",
    answers: Object.fromEntries(Object.entries(scores).map(([id, score]) => [
      id,
      { type: "score", score, legend: {}, probabilities: {}, confidence: 0.95 },
    ])) as TypesafeAskResult["answers"],
    usage: { inputTokens: 80, outputTokens: 8 },
  });

  const sources = [
    { url: "https://acme-plumbing.co.uk/leeds", host: "acme-plumbing.co.uk" },
    { url: "https://unrelated-news.com/story", host: "unrelated-news.com" },
  ];

  test("links a second domain of a business already tracked", async () => {
    const linked = await linkCitedAddresses(
      stubCtx({ "seo.same-business": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, branded, sources },
      { ask: async () => scored({ "0": 2 }) },
    );

    // One business, two addresses. Without this it shows as a stranger.
    expect(linked[0].websiteId).toBe("w1");
    expect(linked[1].websiteId).toBeUndefined();
  });

  test("leaves a maybe unlinked, so a person still sees the address", async () => {
    const linked = await linkCitedAddresses(
      stubCtx({ "seo.same-business": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, branded, sources },
      { ask: async () => scored({ "0": 1 }) },
    );

    // A wrong link quietly merges two rivals into one; an unlinked address is
    // still on the screen and still something a person can act on.
    expect(linked[0].websiteId).toBeUndefined();
  });

  test("never asks about addresses that share nothing", async () => {
    const ask = vi.fn(async () => scored({ "0": 0 }));
    await linkCitedAddresses(
      stubCtx({ "seo.same-business": "ACT" }),
      { pullId: "p1" as Id<"seoDataPulls">, branded, sources },
      { ask: ask as never },
    );

    // Code does the cheap first pass, so the model is asked once, about the
    // one pair worth asking about — not once per tracked site per address.
    expect(ask).toHaveBeenCalledTimes(1);
  });

  test("links nothing while the Decision is switched off", async () => {
    const ask = vi.fn();
    const linked = await linkCitedAddresses(
      stubCtx({ "seo.same-business": "OFF" }),
      { pullId: "p1" as Id<"seoDataPulls">, branded, sources },
      { ask: ask as never },
    );

    expect(ask).not.toHaveBeenCalled();
    expect(linked.every((row) => row.websiteId === undefined)).toBe(true);
  });
});
