import { runDecisions, type DecisionResult, type RunDecisionsDeps } from "./decisionActions";
import { couldBeSameBusiness, primaryBrandName } from "./utils/websiteBrands";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * What the model is asked about collected data.
 *
 * Every judgment the SEO pipeline makes, together because they share a shape:
 * each takes what a collection returned, asks one Decision about every item in
 * it in a single request, and hands back the same rows with a verdict
 * attached. None of them writes anything — the parse path files what they
 * return — and none of them reads the shared `websites` table, so the tenancy
 * guard's list of exactly two files that may stands untouched.
 *
 * Split out of `seoCollectionParse.ts` when that crossed the thousand-line
 * ceiling the module-size guard sets. This is the seam because reading a
 * payload and judging what it means are different jobs, and only one of them
 * costs money.
 *
 * Two rules hold for all of them, both from the Decisions plan. **Every
 * Decision ships switched off**, so each names the code fallback that keeps
 * its screen honest with no model at all. And **an unaskable Decision claims
 * nothing** rather than guessing: the rows still stand, unjudged.
 */



/** Judgments in flight at once, so fifty items take seconds, not a minute. */
const JUDGMENTS_AT_ONCE = 8;

/**
 * Ask a Decision about each item on its own, a few at a time.
 *
 * Every judgment here used to ask about a whole batch in one request, the
 * items keyed by number in one shared state. Tested against the live model on
 * 2026-09-23, that gave nearly the same answer for every item — every search
 * "buying", every website "directory" — each around 40% sure. Asked about one
 * item at a time it told them apart, most near certain. So each item is its
 * own request, each a fraction of a penny. A failed request leaves that one
 * item unjudged; the rest still are.
 */
async function askEach<T>(
  items: T[],
  ask: (item: T) => Promise<DecisionResult | undefined>,
): Promise<Array<DecisionResult | undefined>> {
  const results: Array<DecisionResult | undefined> = new Array(items.length);
  for (let start = 0; start < items.length; start += JUDGMENTS_AT_ONCE) {
    await Promise.all(items.slice(start, start + JUDGMENTS_AT_ONCE).map(async (item, offset) => {
      try {
        results[start + offset] = await ask(item);
      } catch {
        results[start + offset] = undefined;
      }
    }));
  }
  return results;
}

/**
 * Ask the stance Decision about every brand found in one answer — one brand
 * per request (see `askEach`).
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

  const answers = await askEach(args.hits, async (hit) => (await runDecisions(ctx, {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    subject: { kind: "seo-citation", id: args.pullId },
    state: { question: args.prompt, answer: { text: args.answer }, brand: { name: hit.text } },
    requests: [{
      key: "seo.citation-stance",
      fallback: () => ({ kind: "pick-one" as const, choice: "mentioned" }),
    }],
  }, deps))["seo.citation-stance"]);

  const judged = [];
  for (const [index, hit] of args.hits.entries()) {
    const result = answers[index];
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
    const answers = await askEach(pairs, async (pair) => (await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "seo-address", id: args.pullId },
      state: {
        seen: { address: pair.seenHost },
        tracked: { address: pair.trackedHost, name: pair.trackedName },
      },
      requests: [{
        key: "seo.same-business",
        // Before this Decision existed only an exact address matched.
        fallback: () => ({ kind: "score" as const, score: 0 }),
      }],
    }, deps))["seo.same-business"]);
    for (const [index, pair] of pairs.entries()) {
      const result = answers[index];
      if (!result || result.source === "RULES" || result.answer.kind !== "score") continue;
      if (Math.round(result.answer.score) === 2) linkedByIndex.set(pair.index, pair.websiteId);
    }
  }

  return args.sources.map((source, index) => {
    const websiteId = source.websiteId ?? linkedByIndex.get(index);
    return { url: source.url, ...(websiteId ? { websiteId } : {}) };
  });
}

/**
 * Sort discovered websites into rivals and everything else.
 *
 * Discovery returns dozens of domains that rank for the same searches, and
 * ranking together is not evidence of competing: directories, publishers and
 * suppliers all outrank a small business for its own trade. Without this the
 * client is handed a list of everything that beats them.
 *
 * One request per website — see the note in the body for why. Nothing is
 * hidden by the verdict — a directory outranking you is worth
 * knowing — so this labels rather than filters.
 */
export async function judgeCompetitors(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    pullId: Id<"seoDataPulls">;
    ourHost: string;
    /** What the watched business does, so the judge has more than two web addresses to go on. */
    ours?: BusinessForJudging | null;
    found: Array<{
      host: string; intersections: number; averagePosition: number | null; estimatedTraffic: number | null;
      domainKeywords?: number | null; domainTraffic?: number | null;
    }>;
    /** What known candidates do, by host, where an admin has written it down. */
    knownCandidates?: Record<string, { sector?: string; does?: string }>;
  },
  deps: RunDecisionsDeps = {},
): Promise<Array<{
  host: string;
  intersections: number;
  averagePosition?: number;
  estimatedTraffic?: number;
  domainKeywords?: number;
  domainTraffic?: number;
  kind?: "COMPETITOR" | "DIRECTORY" | "PUBLISHER" | "SUPPLIER" | "OTHER";
  kindCertainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE";
}>> {
  const base = args.found.map((row) => ({
    host: row.host,
    intersections: row.intersections,
    ...(row.averagePosition !== null ? { averagePosition: row.averagePosition } : {}),
    ...(row.estimatedTraffic !== null ? { estimatedTraffic: row.estimatedTraffic } : {}),
    // Carried for the Sites Market map; nothing here judges on them.
    ...(typeof row.domainKeywords === "number" ? { domainKeywords: row.domainKeywords } : {}),
    ...(typeof row.domainTraffic === "number" ? { domainTraffic: row.domainTraffic } : {}),
  }));
  if (base.length === 0) return base;

  // One website per request — see `askEach`.
  const ours = {
    address: args.ourHost,
    ...(args.ours?.sector ? { sells: args.ours.sector } : {}),
    ...(args.ours?.does ? { does: args.ours.does } : {}),
    ...(args.ours?.market ? { market: args.ours.market } : {}),
    ...(args.ours?.names.length ? { knownAs: args.ours.names } : {}),
    ...(args.ours?.searches.length ? { searchedFor: args.ours.searches } : {}),
  };
  const results = await askEach(args.found, async (row) => (await runDecisions(ctx, {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    subject: { kind: "seo-competitors", id: args.pullId },
    state: {
      ours,
      candidate: {
        address: row.host,
        ...(args.knownCandidates?.[row.host]?.sector ? { sells: args.knownCandidates[row.host]!.sector } : {}),
        ...(args.knownCandidates?.[row.host]?.does ? { does: args.knownCandidates[row.host]!.does } : {}),
        searchesInCommon: row.intersections,
        ...(row.averagePosition !== null ? { averageGooglePosition: row.averagePosition } : {}),
      },
    },
    requests: [{
      key: "seo.real-competitor",
      // Before this Decision existed every discovered site was offered as a
      // competitor, so that is the rule it replaces.
      fallback: () => ({ kind: "pick-one" as const, choice: "competitor" }),
    }],
  }, deps))["seo.real-competitor"]);

  return base.map((row, index) => {
    const result = results[index];
    if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") return row;
    return {
      ...row,
      kind: COMPETITOR_KIND_BY_CHOICE[result.answer.choice] ?? "OTHER",
      ...(result.certainty ? { kindCertainty: result.certainty } : {}),
    };
  });
}

const COMPETITOR_KIND_BY_CHOICE: Record<string, "COMPETITOR" | "DIRECTORY" | "PUBLISHER" | "SUPPLIER" | "OTHER"> = {
  competitor: "COMPETITOR",
  directory: "DIRECTORY",
  publisher: "PUBLISHER",
  supplier: "SUPPLIER",
  other: "OTHER",
};

/**
 * Judge what people mean by the searches this site newly ranks for.
 *
 * **Once per distinct search, ever.** A phrase's meaning does not change while
 * the rankings under it do, so a site with a thousand searches is a thousand
 * questions on its first collection and none on its next. Two clients in the
 * same trade share every answer between them, because the store is keyed on
 * the search alone.
 *
 * Everything unjudged in a collection is judged in that collection. There is
 * no cap on how many, because a Decision costs a fraction of a penny and no
 * company is on a Decision budget (Anthony, 2026-09-22: "Decisions are super
 * cheap and no company has a budget, it's virtually free to use"). The two
 * numbers below are request shapes, not spending limits: how many phrases one
 * query looks up, and how many questions ride in one call.
 *
 * The run stops early when a whole batch comes back from the rules, because
 * that means the Decision is switched off or the provider is down, and every
 * batch after it would say the same. Whatever was judged before that is kept.
 */
export async function judgeNewKeywords(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    pullId: Id<"seoDataPulls">;
    /** The site these searches came from, when they came from one. A fan-out
     * belongs to a question rather than to a website, so it passes none. */
    host?: string;
    /** What that site's business does, when known, so "irrelevant" can be judged. */
    business?: BusinessForJudging | null;
    keywords: string[];
  },
  deps: RunDecisionsDeps = {},
): Promise<void> {
  const distinct = [...new Set(args.keywords.map(normaliseKeyword).filter((word) => word.length > 0))];
  if (distinct.length === 0) return;

  const unjudged: string[] = [];
  for (let start = 0; start < distinct.length; start += KEYWORDS_PER_LOOKUP) {
    const found = await ctx.runQuery(internal.seoCollectionParse.findUnjudgedKeywords, {
      keywords: distinct.slice(start, start + KEYWORDS_PER_LOOKUP),
    });
    unjudged.push(...found);
  }
  if (unjudged.length === 0) return;

  // One search per request — see `askEach` — in rounds, so a Decision that
  // is switched off, or a provider that is down, is found out after one round
  // rather than after every search has been tried.
  for (let start = 0; start < unjudged.length; start += KEYWORDS_PER_ROUND) {
    const round = unjudged.slice(start, start + KEYWORDS_PER_ROUND);
    const answers = await askEach(round, async (keyword) => (await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "seo-keywords", id: args.pullId },
      state: {
        ...(args.host ? {
          business: {
            address: args.host,
            ...(args.business?.sector ? { sells: args.business.sector } : {}),
            ...(args.business?.does ? { does: args.business.does } : {}),
          },
        } : {}),
        search: { text: keyword },
      },
      requests: [{
        key: "seo.keyword-intent",
        // Before this Decision existed every search looked alike, so the rule
        // it replaces is "no opinion".
        fallback: () => ({ kind: "pick-one" as const, choice: "other" }),
      }],
    }, deps))["seo.keyword-intent"]);

    const judged = [];
    for (const [index, keyword] of round.entries()) {
      const result = answers[index];
      if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") continue;
      judged.push({
        keyword,
        intent: KEYWORD_INTENT_BY_CHOICE[result.answer.choice] ?? "OTHER",
        ...(result.certainty ? { certainty: result.certainty } : {}),
      });
    }

    // Written a few at a time: each meaning is carried onto every ranking and
    // gap that holds the search, rows other filings are writing too, and a
    // short write is over before it meets them.
    for (let at = 0; at < judged.length; at += INTENTS_PER_WRITE) {
      await ctx.runMutation(internal.seoCollectionParse.writeKeywordIntents, { judged: judged.slice(at, at + INTENTS_PER_WRITE) });
    }

    // Nothing in this round reached a model: the Decision is off, or the
    // provider is down. Asking the next round would only repeat the failure.
    if (judged.length === 0) return;
  }
}

const KEYWORD_INTENT_BY_CHOICE: Record<string, "BUYING" | "RESEARCHING" | "BRANDED" | "IRRELEVANT" | "OTHER"> = {
  buying: "BUYING",
  researching: "RESEARCHING",
  branded: "BRANDED",
  irrelevant: "IRRELEVANT",
  other: "OTHER",
};

/** One phrase is one row, however it was typed. */
export function normaliseKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Searches looked up in one query, so no single read grows without limit. */
const KEYWORDS_PER_LOOKUP = 500;

/**
 * Searches judged per round. Each is its own request; a round is how many are
 * tried before checking that the Decision is actually answering.
 */
const KEYWORDS_PER_ROUND = 50;

/** Meanings written per mutation (`writeKeywordIntents`). */
const INTENTS_PER_WRITE = 10;

/** What a watched business does, from `describeBusinessForJudging` in websiteCanonical.ts. */
export type BusinessForJudging = { sector?: string; market?: string; does?: string; names: string[]; searches: string[] };
