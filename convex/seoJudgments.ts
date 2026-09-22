import { runDecisions, type DecisionResult, type RunDecisionsDeps } from "./decisionActions";
import { couldBeSameBusiness, findBrandMention, primaryBrandName } from "./websiteBrands";
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

/** Named brands judged per answer, matching what the writer will file. */
const MAX_CITATION_ROWS = 200;


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

/**
 * Sort discovered websites into rivals and everything else.
 *
 * Discovery returns dozens of domains that rank for the same searches, and
 * ranking together is not evidence of competing: directories, publishers and
 * suppliers all outrank a small business for its own trade. Without this the
 * client is handed a list of everything that beats them.
 *
 * One request for the batch, keyed by id with a state map, like the others.
 * Nothing is hidden by the verdict — a directory outranking you is worth
 * knowing — so this labels rather than filters.
 */
export async function judgeCompetitors(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    pullId: Id<"seoDataPulls">;
    ourHost: string;
    found: Array<{ host: string; intersections: number; averagePosition: number | null; estimatedTraffic: number | null }>;
  },
  deps: RunDecisionsDeps = {},
): Promise<Array<{
  host: string;
  intersections: number;
  averagePosition?: number;
  estimatedTraffic?: number;
  kind?: "COMPETITOR" | "DIRECTORY" | "PUBLISHER" | "SUPPLIER" | "OTHER";
  kindCertainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE";
}>> {
  const base = args.found.map((row) => ({
    host: row.host,
    intersections: row.intersections,
    ...(row.averagePosition !== null ? { averagePosition: row.averagePosition } : {}),
    ...(row.estimatedTraffic !== null ? { estimatedTraffic: row.estimatedTraffic } : {}),
  }));
  if (base.length === 0) return base;

  let results: Record<string, DecisionResult> = {};
  try {
    results = await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "seo-competitors", id: args.pullId },
      state: {
        ours: { address: args.ourHost },
        candidates: Object.fromEntries(args.found.map((row, index) => [`${index}`, {
          address: row.host,
          searchesInCommon: row.intersections,
        }])),
      },
      requests: args.found.map((_row, index) => ({
        key: "seo.real-competitor",
        id: `${index}`,
        // Before this Decision existed every discovered site was offered as
        // a competitor, so that is the rule it replaces.
        fallback: () => ({ kind: "pick-one" as const, choice: "competitor" }),
      })),
    }, deps);
  } catch {
    return base;
  }

  return base.map((row, index) => {
    const result = results[`${index}`];
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
 * Bounded per run as well, because a first collection of a large site would
 * otherwise be one very large bill on one day. The rest are picked up by the
 * collections that follow; nothing is lost, it arrives over a few days. That
 * cap is the interim measure until the per-company Decision budget the
 * Decisions plan records as unbuilt.
 */
export async function judgeNewKeywords(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    pullId: Id<"seoDataPulls">;
    host: string;
    keywords: string[];
  },
  deps: RunDecisionsDeps = {},
): Promise<void> {
  const distinct = [...new Set(args.keywords.map(normaliseKeyword).filter((word) => word.length > 0))];
  if (distinct.length === 0) return;

  const unjudged = await ctx.runQuery(internal.seoCollectionParse.findUnjudgedKeywords, {
    keywords: distinct.slice(0, MAX_KEYWORD_LOOKUP),
  });
  const batch = unjudged.slice(0, MAX_KEYWORDS_JUDGED_PER_RUN);
  if (batch.length === 0) return;

  let results: Record<string, DecisionResult> = {};
  try {
    results = await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "seo-keywords", id: args.pullId },
      state: {
        business: { address: args.host },
        searches: Object.fromEntries(batch.map((keyword, index) => [`${index}`, { text: keyword }])),
      },
      requests: batch.map((_keyword, index) => ({
        key: "seo.keyword-intent",
        id: `${index}`,
        // Before this Decision existed every search looked alike, so the rule
        // it replaces is "no opinion".
        fallback: () => ({ kind: "pick-one" as const, choice: "other" }),
      })),
    }, deps);
  } catch {
    // Unjudged searches are simply judged next time. Nothing is lost and
    // nothing is guessed.
    return;
  }

  const judged = [];
  for (const [index, keyword] of batch.entries()) {
    const result = results[`${index}`];
    if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") continue;
    judged.push({
      keyword,
      intent: KEYWORD_INTENT_BY_CHOICE[result.answer.choice] ?? "OTHER",
      ...(result.certainty ? { certainty: result.certainty } : {}),
    });
  }

  if (judged.length > 0) {
    await ctx.runMutation(internal.seoCollectionParse.writeKeywordIntents, { judged });
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

/** Searches looked up per run; beyond this the rest wait for the next one. */
const MAX_KEYWORD_LOOKUP = 500;

/**
 * Searches judged per run.
 *
 * A first collection of a large site would otherwise be one very large bill on
 * a single day. The remainder arrive over the following collections, and since
 * an answer is kept forever the backlog drains and never returns.
 */
const MAX_KEYWORDS_JUDGED_PER_RUN = 50;
