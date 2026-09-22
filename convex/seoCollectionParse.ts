import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  isBulkOperation,
  parseBulkByTarget,
  parseLlmResponse,
  parseSeoResultFor,
} from "./dataForSeoParsers";

import { aiEngineValidator, engineForOperationId } from "./seoAiEngines";
import { couldBeSameBusiness, findBrandMention, primaryBrandName } from "./websiteBrands";
import { resolveWebsiteIdsByHost } from "./websites";
import { runDecisions, type DecisionResult, type RunDecisionsDeps } from "./decisionActions";
import type { ActionCtx } from "./_generated/server";
import { readWebsiteHost } from "./websiteIdentity";
import { getErrorMessage } from "./utils/lang";
import type { Id } from "./_generated/dataModel";
import { SEO_LOCATIONS } from "./seoLocations";

const LOCATION_BY_CITY = new Map(
  SEO_LOCATIONS.filter((location) => location.city).map((location) => [location.city!, location.code]),
);

/**
 * Reading a raw payload into the numbers that are kept forever.
 *
 * Split from the sending path because it is a different kind of work with a
 * different failure. A send that goes wrong costs money; a parse that goes
 * wrong costs nothing, because the raw file is still there and the fix is to
 * correct the parser and run it again. That is the whole reason raw responses
 * are stored at all.
 *
 * Idempotent by `pullId`: re-parsing replaces what the last parse wrote rather
 * than adding to it, so a corrected parser can be run over a month of files
 * without anyone auditing the result afterwards.
 */

export const parseSeoResult = internalAction({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pull = await ctx.runQuery(internal.seoCollectionParse.getPullForParse, {
      pullId: args.pullId,
    });
    if (!pull?.resultJson) return null;

    // An AI answer is read for who it names, then dropped. The matching and
    // the stance judgment both happen here, in the action, so the answer text
    // never reaches a mutation at all.
    const engine = engineForOperationId(pull.operationId);
    if (engine) {
      try {
        const parsed = parseLlmResponse(JSON.parse(pull.resultJson));
        const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
        const prompt = typeof sent.user_prompt === "string" ? sent.user_prompt : "";

        const branded = await ctx.runQuery(internal.websites.listBrandedWebsitesInternal, {
          limit: MAX_BRANDED_WEBSITES,
        });

        // Every brand we hold, not just the one who asked: the answer names
        // whoever it names and one purchase should serve every watcher.
        const hits = [];
        for (const website of branded) {
          const found = findBrandMention(parsed.answer, website.brandNames);
          if (found) {
            hits.push({
              websiteId: website.websiteId,
              text: found.matched,
              variantKind: found.kind,
              at: found.at,
            });
          }
        }
        hits.sort((left, right) => left.at - right.at);

        const sources = parsed.sources.slice(0, MAX_SOURCES);
        const sourceHosts = sources.map((source) => {
          const host = readWebsiteHost(source.url);
          return host.ok ? host.host : null;
        });
        const resolved = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, {
          hosts: sourceHosts.filter((host): host is string => host !== null),
        });
        const byHost = new Map(resolved.map((row) => [row.host, row.websiteId]));

        const judged = await judgeStances(ctx, {
          ...(pull.companyId ? { companyId: pull.companyId } : {}),
          pullId: args.pullId,
          prompt,
          answer: parsed.answer,
          hits: hits.slice(0, MAX_CITATION_ROWS),
        });

        const linked = await linkCitedAddresses(ctx, {
          ...(pull.companyId ? { companyId: pull.companyId } : {}),
          pullId: args.pullId,
          branded,
          sources: sources.map((source, index) => ({
            url: source.url,
            host: sourceHosts[index],
            ...(sourceHosts[index] && byHost.get(sourceHosts[index]!)
              ? { websiteId: byHost.get(sourceHosts[index]!)! }
              : {}),
          })),
        });

        await ctx.runMutation(internal.seoCollectionParse.writeAiCitations, {
          pullId: args.pullId,
          prompt,
          engine,
          day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
          brands: judged,
          sources: linked,
        });
      } catch (error) {
        await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
          pullId: args.pullId,
          error: getErrorMessage(error),
        });
      }
      return null;
    }

    if (!pull.websiteId) return null;

    try {
      const parsed = parseSeoResultFor(
        pull.operationId,
        JSON.parse(pull.resultJson),
        pull.target ?? undefined,
      );
      if (!parsed) return null;

      await ctx.runMutation(internal.seoCollectionParse.writeSeoMetrics, {
        pullId: args.pullId,
        websiteId: pull.websiteId as Id<"websites">,
        operationId: pull.operationId,
        day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
        metricsJson: JSON.stringify(parsed.metrics),
        positions: (parsed.positions ?? []).slice(0, MAX_POSITION_ROWS),
      });
    } catch (error) {
      await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
        pullId: args.pullId,
        error: getErrorMessage(error),
      });
    }
    return null;
  },
});

/**
 * The ceiling on keyword rows written from one pull.
 *
 * `domain_ranked_keywords` can return tens of thousands of keywords for a
 * large site, and every one of them is a document write inside a single
 * mutation. This keeps one parse inside one transaction; when per-keyword
 * tracking is switched on properly, this becomes a chunked write rather than
 * a cut.
 */
const MAX_POSITION_ROWS = 1_000;

/**
 * Websites filed from one bulk response.
 *
 * A page of expansion is a hundred websites and a bulk endpoint takes a
 * thousand, so this is well clear of both. It exists because the write happens
 * inside one mutation and a transaction needs a ceiling, not because a real
 * batch would ever approach it.
 */
const MAX_BULK_ROWS = 1_200;

/**
 * How much of a previous parse one re-parse will clear.
 *
 * A parse writes at most `MAX_POSITION_ROWS` positions and one metrics row, so
 * this is that with room to spare. Anything beyond it was not written here.
 */
const REPLACE_LIMIT = MAX_POSITION_ROWS + 100;

/**
 * One keyword on one day is one fact, so this should only ever find one row.
 * The small ceiling is the assertion: if it is ever hit, something upstream
 * has been writing duplicates.
 */
const SAME_DAY_LIMIT = 5;

export const getPullForParse = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({
    operationId: v.string(),
    websiteId: v.union(v.id("websites"), v.null()),
    target: v.union(v.string(), v.null()),
    resultJson: v.union(v.string(), v.null()),
    taskArgsJson: v.union(v.string(), v.null()),
    completedAt: v.union(v.number(), v.null()),
    /** Whose cadence caused this, so a Decision is asked in their name. */
    companyId: v.union(v.id("companies"), v.null()),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (!row) return null;
    return {
      operationId: row.operationId,
      websiteId: row.websiteId ?? null,
      target: row.target ?? null,
      resultJson: row.resultJson ?? null,
      taskArgsJson: row.taskArgsJson ?? null,
      completedAt: row.completedAt ?? null,
      companyId: row.companyId ?? null,
    };
  },
});

/**
 * Write the day's numbers, replacing anything a previous parse left.
 *
 * Replacing rather than inserting is what makes re-parsing safe. The keys are
 * the pull for the metrics row and the website, keyword and day for a position
 * row, which is also the shape a chart reads them back in.
 */
export const writeSeoMetrics = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    operationId: v.string(),
    day: v.string(),
    metricsJson: v.string(),
    positions: v.array(v.object({
      keyword: v.string(),
      position: v.optional(v.number()),
      url: v.optional(v.string()),
      searchVolume: v.optional(v.number()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Bounded, like every read here: a re-parse replaces at most what one
    // parse wrote, and a query with no ceiling is a query that works until the
    // day the table is large.
    const existing = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(REPLACE_LIMIT);
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.db.patch(args.pullId, { error: undefined });

    await ctx.db.insert("seoWebsiteMetrics", {
      websiteId: args.websiteId,
      day: args.day,
      operationId: args.operationId,
      pullId: args.pullId,
      metricsJson: args.metricsJson,
      createdAt: now,
    });

    const priorPositions = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(REPLACE_LIMIT);
    for (const row of priorPositions) await ctx.db.delete(row._id);

    for (const entry of args.positions) {
      // The same keyword measured twice on one day is one fact, so an earlier
      // row for that day is replaced rather than joined by a second.
      const sameDay = await ctx.db
        .query("seoKeywordPositions")
        .withIndex("by_website_keyword_day", (q) =>
          q.eq("websiteId", args.websiteId).eq("keyword", entry.keyword).eq("day", args.day))
        .take(SAME_DAY_LIMIT);
      for (const row of sameDay) await ctx.db.delete(row._id);

      await ctx.db.insert("seoKeywordPositions", {
        websiteId: args.websiteId,
        keyword: entry.keyword,
        day: args.day,
        ...(entry.position !== undefined ? { position: entry.position } : {}),
        ...(entry.url ? { url: entry.url } : {}),
        ...(entry.searchVolume !== undefined ? { searchVolume: entry.searchVolume } : {}),
        pullId: args.pullId,
        createdAt: now,
      });
    }
    return null;
  },
});

/**
 * Record who an AI answer named.
 *
 * **A row per mention, never per tracked site.** Every website with brand
 * names is matched against the answer — the client who asked, their rivals,
 * and everyone else we hold — because the answer names whoever it names and
 * one purchase should serve every watcher. Names we cannot match to a website
 * are still kept, as the cited domain, so a rival added later already has a
 * history waiting.
 *
 * The answer text arrives here, is read once, and is not stored. Only the
 * matched variant or the cited domain is written, so nothing an engine wrote
 * can ever reach an agent's prompt from this table.
 *
 * Replaces by pull, like every other parse, so a corrected matcher can be run
 * over stored payloads without anyone auditing the result afterwards.
 */
export const writeAiCitations = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    day: v.string(),
    /** Already matched and already judged; see `judgeStances` in this file. */
    brands: v.array(v.object({
      websiteId: v.id("websites"),
      text: v.string(),
      variantKind: v.union(v.literal("NAME"), v.literal("MISSPELLING")),
      stance: v.optional(v.union(
        v.literal("RECOMMENDED"), v.literal("MENTIONED"), v.literal("WARNED_AGAINST"),
      )),
      stanceCertainty: v.optional(v.union(
        v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"),
      )),
    })),
    /** Already resolved, and already judged where an address needed judging. */
    sources: v.array(v.object({
      url: v.string(),
      title: v.optional(v.string()),
      websiteId: v.optional(v.id("websites")),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const pull = await ctx.db.get(args.pullId);
    const locationCode = readLocationCode(pull?.taskArgsJson);

    const existing = await ctx.db
      .query("aiCitations")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_CITATION_ROWS + 100);
    for (const row of existing) await ctx.db.delete(row._id);

    // A parse that now succeeds clears what an earlier attempt left behind,
    // or the row would carry "Parse failed" forever after the fix that fixed it.
    await ctx.db.patch(args.pullId, { error: undefined });

    // Brands in order of appearance: being named first and being named last
    // are different results, and the position is the screen's headline. They
    // arrive already matched and already judged, from the action.
    let position = 0;
    for (const hit of args.brands) {
      position += 1;
      await ctx.db.insert("aiCitations", {
        prompt: args.prompt,
        engine: args.engine,
        ...(locationCode !== undefined ? { locationCode } : {}),
        day: args.day,
        pullId: args.pullId,
        kind: "BRAND",
        mentionedWebsiteId: hit.websiteId,
        mentionedText: hit.text,
        variantKind: hit.variantKind,
        ...(hit.stance ? { stance: hit.stance } : {}),
        ...(hit.stanceCertainty ? { stanceCertainty: hit.stanceCertainty } : {}),
        position,
        createdAt: now,
      });
    }

    // Then the sources the engine cited, by domain. A domain we do not hold
    // is still a rival worth seeing.
    const hosts = args.sources
      .map((source) => readWebsiteHost(source.url))
      .map((parsed) => (parsed.ok ? parsed.host : null));

    let sourcePosition = 0;
    for (const [index, source] of args.sources.entries()) {
      const host = hosts[index];
      if (!host) continue;
      sourcePosition += 1;
      const websiteId = source.websiteId;
      await ctx.db.insert("aiCitations", {
        prompt: args.prompt,
        engine: args.engine,
        ...(locationCode !== undefined ? { locationCode } : {}),
        day: args.day,
        pullId: args.pullId,
        kind: "SOURCE",
        ...(websiteId ? { mentionedWebsiteId: websiteId } : {}),
        mentionedText: host,
        url: source.url,
        position: sourcePosition,
        createdAt: now,
      });
    }
    return null;
  },
});

/** Which place the question was asked from, read back from what was sent. */
function readLocationCode(taskArgsJson: string | undefined): number | undefined {
  if (!taskArgsJson) return undefined;
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    // The engines take a country and city, not a code; the code is what the
    // company website stored, and it is recovered from the city when present.
    const city = typeof args.web_search_city === "string" ? args.web_search_city : undefined;
    if (!city) return undefined;
    return LOCATION_BY_CITY.get(city);
  } catch {
    return undefined;
  }
}

/**
 * Ask the stance Decision about every brand found in one answer.
 *
 * One request, not one per brand: the questions are independent judgments over
 * the same state, so they ride together and cost a single call. Each carries
 * its own id because the same Decision is asked several times.
 *
 * Switched off, or not sure enough, or the model unavailable — all three leave
 * the stance absent, and the screen then reads the row as a plain mention,
 * which is exactly what it said before this Decision existed. That is the
 * fallback the Decisions framework requires of every entry.
 */
export async function judgeStances(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    pullId: Id<"seoDataPulls">;
    prompt: string;
    answer: string;
    hits: Array<{ websiteId: Id<"websites">; text: string; variantKind: "NAME" | "MISSPELLING"; at: number }>;
  },
  /** A test hands in its own asker; production asks whatever the job resolves to. */
  deps: RunDecisionsDeps = {},
): Promise<Array<{
  websiteId: Id<"websites">;
  text: string;
  variantKind: "NAME" | "MISSPELLING";
  stance?: "RECOMMENDED" | "MENTIONED" | "WARNED_AGAINST";
  stanceCertainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE";
}>> {
  if (args.hits.length === 0) return [];

  let results: Record<string, DecisionResult> = {};
  try {
    results = await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "seo-citation", id: args.pullId },
      // One state for all the questions, with a map keyed by the id each
      // question carries — the platform's pattern for asking one Decision
      // about several things. Requests in a call cannot hold their own state.
      state: {
        question: args.prompt,
        answer: { text: args.answer },
        brands: Object.fromEntries(args.hits.map((hit, index) => [`${index}`, { name: hit.text }])),
      },
      requests: args.hits.map((_hit, index) => ({
        key: "seo.citation-stance",
        id: `${index}`,
        fallback: () => ({ kind: "pick-one" as const, choice: "mentioned" }),
      })),
    }, deps);
  } catch {
    // A Decision that cannot be asked leaves the stance unclaimed rather than
    // guessed. The row still stands as a mention.
    return args.hits.map((hit) => ({
      websiteId: hit.websiteId, text: hit.text, variantKind: hit.variantKind,
    }));
  }

  const judged = [];
  for (const [index, hit] of args.hits.entries()) {
    const result = results[`${index}`];
    const base = { websiteId: hit.websiteId, text: hit.text, variantKind: hit.variantKind };

    // The rules answered, so nothing was judged and nothing is claimed.
    if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") {
      judged.push(base);
      continue;
    }
    // Not this business at all. A short brand name matching unrelated prose is
    // the false positive no amount of whole-word matching can catch, and this
    // is the only thing that can drop it.
    if (result.answer.choice === "other") continue;

    judged.push({
      ...base,
      stance: STANCE_BY_CHOICE[result.answer.choice] ?? "MENTIONED",
      ...(result.certainty ? { stanceCertainty: result.certainty } : {}),
    });
  }
  return judged;
}

const STANCE_BY_CHOICE: Record<string, "RECOMMENDED" | "MENTIONED" | "WARNED_AGAINST"> = {
  recommended: "RECOMMENDED",
  mentioned: "MENTIONED",
  warned_against: "WARNED_AGAINST",
};

/**
 * Link a cited address to a website already tracked under a different domain.
 *
 * A business often holds several addresses, so a rival cited as
 * `acme-plumbing.co.uk` while we track `acmeplumbing.com` looks like a
 * stranger on the screen. Code pairs only the addresses worth asking about —
 * see `couldBeSameBusiness` — and the Decision judges those.
 *
 * Only "the same business" links. "Possibly" is left unlinked on purpose: the
 * chip then still names the address, which a person can act on, where a wrong
 * link quietly merges two rivals into one.
 */
export async function linkCitedAddresses(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    pullId: Id<"seoDataPulls">;
    branded: Array<{ websiteId: Id<"websites">; host: string; brandNames: Array<{ name: string; isPrimary: boolean; kind?: "NAME" | "MISSPELLING" }> }>;
    sources: Array<{ url: string; host: string | null; websiteId?: Id<"websites"> }>;
  },
  deps: RunDecisionsDeps = {},
): Promise<Array<{ url: string; title?: string; websiteId?: Id<"websites"> }>> {
  const unresolved = args.sources
    .map((source, index) => ({ ...source, index }))
    .filter((source) => source.host !== null && !source.websiteId);

  const pairs: Array<{ id: string; index: number; websiteId: Id<"websites">; seenHost: string; trackedHost: string; trackedName: string }> = [];
  for (const source of unresolved) {
    for (const website of args.branded) {
      if (!couldBeSameBusiness(source.host!, website)) continue;
      pairs.push({
        id: `${pairs.length}`,
        index: source.index,
        websiteId: website.websiteId,
        seenHost: source.host!,
        trackedHost: website.host,
        trackedName: primaryBrandName(website.brandNames) ?? website.host,
      });
      // One candidate per cited address. A second would need the model to
      // choose between them, which is a different question from this one.
      break;
    }
  }

  const linkedByIndex = new Map<number, Id<"websites">>();
  if (pairs.length > 0) {
    try {
      const results = await runDecisions(ctx, {
        ...(args.companyId ? { companyId: args.companyId } : {}),
        subject: { kind: "seo-address", id: args.pullId },
        state: {
          pairs: Object.fromEntries(pairs.map((pair) => [pair.id, {
            seen: { address: pair.seenHost },
            tracked: { address: pair.trackedHost, name: pair.trackedName },
          }])),
        },
        requests: pairs.map((pair) => ({
          key: "seo.same-business",
          id: pair.id,
          // Before this Decision existed only an exact address matched.
          fallback: () => ({ kind: "score" as const, score: 0 }),
        })),
      }, deps);

      for (const pair of pairs) {
        const result = results[pair.id];
        if (!result || result.source === "RULES" || result.answer.kind !== "score") continue;
        if (Math.round(result.answer.score) === 2) linkedByIndex.set(pair.index, pair.websiteId);
      }
    } catch {
      // Unasked means unlinked, which is what the screen showed before.
    }
  }

  return args.sources.map((source, index) => {
    const websiteId = source.websiteId ?? linkedByIndex.get(index);
    return { url: source.url, ...(websiteId ? { websiteId } : {}) };
  });
}

/** Cited sources kept per answer; an engine rarely cites more than a dozen. */
const MAX_SOURCES = 40;

/** Named brands kept per answer. */
const MAX_CITATION_ROWS = 200;

/** A ceiling on the platform's branded estate, not on this feature. */
const MAX_BRANDED_WEBSITES = 2_000;

/**
 * File one bulk response against every website it covered.
 *
 * Matched on the host, because a bulk row names its target and nothing else. A
 * target we do not hold is skipped rather than guessed at: filing a number
 * against the wrong website is worse than filing none.
 *
 * Replaces by pull, like every other parse here, so a corrected parser can be
 * re-run over stored payloads without anyone auditing the result afterwards.
 */
export const writeBulkMetrics = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    operationId: v.string(),
    day: v.string(),
    rows: v.array(v.object({ host: v.string(), metricsJson: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_BULK_ROWS + 100);
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.db.patch(args.pullId, { error: undefined });
    const byHost = await resolveWebsiteIdsByHost(ctx, args.rows.map((row) => row.host));

    for (const row of args.rows) {
      const websiteId = byHost.get(row.host);
      // A target we do not hold is skipped rather than guessed at.
      if (!websiteId) continue;

      await ctx.db.insert("seoWebsiteMetrics", {
        websiteId,
        day: args.day,
        operationId: args.operationId,
        pullId: args.pullId,
        metricsJson: row.metricsJson,
        createdAt: now,
      });
    }
    return null;
  },
});

/**
 * A parse that threw.
 *
 * Recorded on the pull and nowhere else, and deliberately not a status change:
 * the data was bought and collected successfully, and only our reading of it
 * failed. Marking the pull failed would hide a paid result from the re-parse
 * that is meant to rescue it.
 */
export const recordParseFailure = internalMutation({
  args: { pullId: v.id("seoDataPulls"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pullId, { error: `Parse failed: ${args.error}` });
    return null;
  },
});
