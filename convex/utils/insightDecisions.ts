import { v, type Infer } from "convex/values";
import type { PlanAction } from "./insightPlan";
import { variantOf } from "./insightCompeting";
import { decidedFields, type Decider } from "./insightDecided";

/**
 * Page decisions (docs/plans/active/insights-intelligence-plan.md phase 4,
 * "the Page plan taken further"): a verdict for every page of the website,
 * not only its money pages and guides — keep it, improve it, merge it into
 * another, redirect it, remove it — and the pages to create. Read from what
 * Hakken already holds: each page's visits and enquiries, Google's showings
 * and clicks, the links other websites point at it, the groups of pages
 * competing for one search, the monthly site audit's flags and the Page
 * plan's own actions. A page other websites link to is never removed without
 * a redirect: the links would be lost.
 */

export const VERDICTS = ["IMPROVE", "MERGE", "REDIRECT", "REMOVE", "KEEP"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const REASONS = [
  // Improve: the Page plan's actions, a competing page made different, and the site audit's flags.
  "REBUILD", "RESTORE", "STRENGTHEN", "REFRESH", "REFRESH_OR_RETIRE", "KEEP_ROUTE", "COMPETING", "COMPETING_LINK", "REVIEW", "DUPLICATE", "THIN", "ORPHAN", "NOT_INDEXABLE",
  // Merge, redirect, remove.
  "COMPETING_MERGE", "BROKEN_LINKED", "UNUSED_LINKED", "BROKEN", "UNUSED",
  // Keep.
  "WORKING", "QUIET",
  // Any verdict the Page decisions specialist gave other than the rule's: its own sentence says why (`why`).
  "SPECIALIST",
] as const;
export type Reason = (typeof REASONS)[number];

/** The site audit's problems a decision reads (`CRAWL_ISSUES`, siteCrawl.ts). */
export const BROKEN_FLAGS = ["is_broken", "is_4xx_code", "is_5xx_code"] as const;
/** Too little text on the page; the audit's text-to-code ratio (`low_content_rate`) flags nearly every modern page, so it isn't read. */
export const THIN_FLAGS = ["low_character_count"] as const;
export const DECISION_FLAGS = [...BROKEN_FLAGS, ...THIN_FLAGS, "duplicate_content", "is_orphan_page", "non_indexable"] as const;

/** A list's further pages ("/author/anthony/page/3/"): the website's software makes them, so they are never removed one by one. */
const isListPage = (path: string) => /\/page\/\d+\/?$/.test(path);

/** Kinds of page a website needs whoever visits them: never removed for want of visitors. */
const NEEDED_TYPES = new Set(["SERVICE", "COMPANY", "LEGAL", "PRODUCT"]);

export type DecisionInput = {
  path: string;
  kind: string | null;
  type: string;
  /** Analytics: landing visits and enquiries over 12 months; page views over a year, null when Analytics isn't connected. */
  visits: number;
  enquiries: number;
  views: number | null;
  /** Search Console over 90 days. */
  shown: number;
  clicks: number;
  /** Other websites linking to the page; null when links aren't held. */
  domains: number | null;
  /** The newest site audit's flags for the page, and links to it from the website's own pages; null when it wasn't crawled. */
  flags: readonly string[];
  inbound: number | null;
  status: number | null;
};

/**
 * What else already decided for a page: the Page plan's action; Keyword
 * cannibalisation's decision, with its specialist's reason where it gave one
 * (it stands here as decided, so the two screens never disagree); and the
 * Conversion specialist's page review where it asked for a change.
 */
export type Decided = {
  plan: ReadonlyMap<string, PlanAction>;
  competing: ReadonlyMap<string, { decision: "OWNER" | "MERGE" | "DIFFERENTIATE" | "LINK"; owner: string; why?: string; decidedBy?: Decider }>;
  reviews?: ReadonlyMap<string, string>;
};

/** The reasons Keyword cannibalisation gives: its decision stands, and the Page decisions specialist isn't asked. */
export const COMPETING_REASONS: ReadonlySet<Reason> = new Set(["COMPETING_MERGE", "COMPETING", "COMPETING_LINK"]);

export const decisionValidator = v.object({
  path: v.string(),
  kind: v.union(v.string(), v.null()),
  type: v.string(),
  verdict: v.union(...VERDICTS.map((verdict) => v.literal(verdict))),
  reason: v.union(...REASONS.map((reason) => v.literal(reason))),
  /** The page a merge or a difference is read against. */
  into: v.union(v.string(), v.null()),
  visits: v.number(),
  enquiries: v.number(),
  views: v.union(v.number(), v.null()),
  shown: v.number(),
  clicks: v.number(),
  domains: v.union(v.number(), v.null()),
  flags: v.array(v.string()),
  // Who decided it and why (utils/insightDecided.ts): the rule, the Page decisions specialist, or Keyword cannibalisation's.
  ...decidedFields,
});
export type PageDecision = Infer<typeof decisionValidator>;

const isHome = (path: string) => path === "/";

/** One page's verdict, the first rule that holds. */
export function decide(page: DecisionInput, decided: Decided): Pick<PageDecision, "verdict" | "reason" | "into"> {
  const linked = (page.domains ?? 0) > 0;
  const flags = new Set(page.flags);
  // A broken page: redirected when anything links to it, else taken out.
  if ((page.status !== null && page.status >= 400) || BROKEN_FLAGS.some((flag) => flags.has(flag))) {
    return linked || (page.inbound ?? 0) > 0 ? { verdict: "REDIRECT", reason: "BROKEN_LINKED", into: null } : { verdict: "REMOVE", reason: "BROKEN", into: null };
  }
  const competing = decided.competing.get(page.path);
  if (competing?.decision === "MERGE") return { verdict: "MERGE", reason: "COMPETING_MERGE", into: competing.owner };
  const planned = decided.plan.get(page.path);
  if (planned && planned !== "KEEP" && planned !== "CREATE") return { verdict: "IMPROVE", reason: planned, into: null };
  if (competing?.decision === "DIFFERENTIATE") return { verdict: "IMPROVE", reason: "COMPETING", into: competing.owner };
  if (competing?.decision === "LINK") return { verdict: "IMPROVE", reason: "COMPETING_LINK", into: competing.owner };
  // Nobody visits it and Google doesn't show it: a page the website can do without, unless it is one a website needs.
  const unused = page.views !== null && page.views === 0 && page.visits === 0 && page.shown === 0 && page.clicks === 0;
  if (unused && !isHome(page.path) && !isListPage(page.path) && !NEEDED_TYPES.has(page.type)) {
    return linked ? { verdict: "REDIRECT", reason: "UNUSED_LINKED", into: null } : { verdict: "REMOVE", reason: "UNUSED", into: null };
  }
  if (flags.has("duplicate_content")) return { verdict: "IMPROVE", reason: "DUPLICATE", into: null };
  if (THIN_FLAGS.some((flag) => flags.has(flag)) && (page.visits > 0 || page.shown > 0)) return { verdict: "IMPROVE", reason: "THIN", into: null };
  if (flags.has("non_indexable") && (page.visits > 0 || page.enquiries > 0)) return { verdict: "IMPROVE", reason: "NOT_INDEXABLE", into: null };
  if (flags.has("is_orphan_page") && !isHome(page.path)) return { verdict: "IMPROVE", reason: "ORPHAN", into: null };
  // The Conversion specialist's page review asked for a change (`utils/insightConversion.VERDICTS`).
  const review = decided.reviews?.get(page.path);
  if (review && review !== "KEEP") return { verdict: "IMPROVE", reason: "REVIEW", into: null };
  return { verdict: "KEEP", reason: page.enquiries > 0 || page.visits > 0 || page.clicks > 0 ? "WORKING" : "QUIET", into: null };
}

/** Every page's decision: improve, merge, redirect and remove first, the most visited first within each, then keep. */
export function pageDecisionsFrom(pages: readonly DecisionInput[], decided: Decided): PageDecision[] {
  const order = (verdict: Verdict) => VERDICTS.indexOf(verdict);
  return pages
    .map((page) => {
      const verdict = decide(page, decided);
      const competing = COMPETING_REASONS.has(verdict.reason) ? decided.competing.get(page.path) : undefined;
      return {
        path: page.path, kind: page.kind, type: page.type, ...verdict,
        ...(competing?.why ? { why: competing.why } : {}),
        ...(competing?.decidedBy ? { decidedBy: competing.decidedBy } : {}),
        visits: page.visits, enquiries: page.enquiries, views: page.views, shown: page.shown, clicks: page.clicks, domains: page.domains,
        flags: page.flags.filter((flag) => (DECISION_FLAGS as readonly string[]).includes(flag)),
      };
    })
    .sort((a, b) => order(a.verdict) - order(b.verdict) || b.enquiries - a.enquiries || b.visits - a.visits || b.shown - a.shown || a.path.localeCompare(b.path));
}

/** A page to create: a search rivals win and the website has no page for, or a buyer's question nothing answers. */
export const createValidator = v.object({
  search: v.string(),
  from: v.union(v.literal("GAP"), v.literal("QUESTION")),
  volume: v.union(v.number(), v.null()),
  /** Rivals ranking for it, and the best place one holds. */
  rivals: v.number(),
  best: v.union(v.number(), v.null()),
});
export type PageToCreate = Infer<typeof createValidator>;

/** Pages to create at most: the most searched first. */
export const MOST_CREATES = 20;
/** A search rivals win is a page to create when two of them rank for it and it is searched this often. */
export const CREATE_RIVALS = 2;
export const CREATE_VOLUME = 50;

/**
 * The pages to create: searches at least two rivals rank for that the website
 * doesn't, searched at least `CREATE_VOLUME` times a month, then the buyers'
 * questions built from a search the website doesn't rank for — each search
 * once, the most searched first.
 */
export function pagesToCreate(
  gap: ReadonlyArray<{ keyword: string; volume: number | null; rivals: ReadonlyArray<{ position: number }> }>,
  questions: ReadonlyArray<{ builtFrom: string; kind: string; volume: number | null }>,
  ranked: ReadonlySet<string>,
): PageToCreate[] {
  const out = new Map<string, PageToCreate>();
  // Google gives close variants one volume ("web development agency", "web dev agency"): each is one page to create.
  const variants = new Set<string>();
  for (const row of [...gap].sort((a, b) => b.rivals.length - a.rivals.length)) {
    if (row.rivals.length < CREATE_RIVALS || (row.volume ?? 0) < CREATE_VOLUME) continue;
    const variant = `${row.volume}|${variantOf(row.keyword)}`;
    if (variants.has(variant)) continue;
    variants.add(variant);
    out.set(row.keyword.toLowerCase(), { search: row.keyword, from: "GAP", volume: row.volume, rivals: row.rivals.length, best: Math.min(...row.rivals.map((rival) => rival.position)) });
  }
  for (const question of questions) {
    const search = question.builtFrom.trim();
    const key = search.toLowerCase();
    if (question.kind !== "SEARCH" || !search || ranked.has(key) || out.has(key)) continue;
    out.set(key, { search, from: "QUESTION", volume: question.volume, rivals: 0, best: null });
  }
  return [...out.values()].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || b.rivals - a.rivals || a.search.localeCompare(b.search)).slice(0, MOST_CREATES);
}
