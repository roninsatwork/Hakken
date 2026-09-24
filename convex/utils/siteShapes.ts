import { v, type Infer } from "convex/values";
import { aiEngineValidator } from "../seoAiEngines";

/**
 * The shapes the Sites screens read, shared by the tables that hold them and
 * the queries that page through them.
 *
 * See docs/plans/active/user-sites-plan.md. Kept apart from the schema so a
 * query's validator and a table's field are the same object, not two copies
 * that drift a letter at a time.
 */

/**
 * Where a ranking sits on Google's results, as a band.
 *
 * **The spelling is the ordering.** An index on (band, position) reads in the
 * same order as one on position alone, because the band codes sort as the
 * positions they cover — `p01_03` before `p04_10` before `p51_up` — and a row
 * that no longer ranks sorts last as `zz_none`. That is what lets one index
 * serve both "best position first" and "only page one" without a second read.
 */
export const RANK_BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up", "zz_none"] as const;
export type RankBand = (typeof RANK_BANDS)[number];
export const rankBandValidator = v.union(
  v.literal("p01_03"),
  v.literal("p04_10"),
  v.literal("p11_20"),
  v.literal("p21_50"),
  v.literal("p51_up"),
  v.literal("zz_none"),
);

/** The band a position falls in; no position is a search it no longer ranks for. */
export function bandForPosition(position: number | undefined): RankBand {
  if (position === undefined) return "zz_none";
  if (position <= 3) return "p01_03";
  if (position <= 10) return "p04_10";
  if (position <= 20) return "p11_20";
  if (position <= 50) return "p21_50";
  return "p51_up";
}

/** What a search is for, or not judged yet. The judged values are `seoKeywordIntents`' own. */
export const RANK_INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
export type RankIntent = (typeof RANK_INTENTS)[number];
export const rankIntentValidator = v.union(
  v.literal("BUYING"),
  v.literal("RESEARCHING"),
  v.literal("BRANDED"),
  v.literal("IRRELEVANT"),
  v.literal("OTHER"),
  v.literal("UNJUDGED"),
);

/**
 * How a ranking moved at its last check, against the check before.
 *
 * `LOST` is a search the site ranked for and no longer does. A search it has
 * never ranked for has no row at all, so "lost" always means something was
 * there to lose.
 */
export const RANK_STATUSES = ["NEW", "UP", "DOWN", "SAME", "LOST"] as const;
export type RankStatus = (typeof RANK_STATUSES)[number];
export const rankStatusValidator = v.union(
  v.literal("NEW"),
  v.literal("UP"),
  v.literal("DOWN"),
  v.literal("SAME"),
  v.literal("LOST"),
);

/** The status of a ranking, from its position now and at the check before. */
export function statusFor(position: number | undefined, previous: number | undefined, hadRow: boolean): RankStatus {
  if (position === undefined) return "LOST";
  if (!hadRow || previous === undefined) return "NEW";
  if (position < previous) return "UP";
  if (position > previous) return "DOWN";
  return "SAME";
}

/**
 * One engine's answers for a site on a day. A list tagged by engine rather than
 * an object keyed by one, so the engine names stay in `seoAiEngines.ts`.
 */
export const engineDayValidator = v.object({
  engine: aiEngineValidator,
  asked: v.number(),
  named: v.number(),
  recommended: v.number(),
});
export type EngineDay = Infer<typeof engineDayValidator>;

/** How many keywords sit in each band, by band code. `zz_none` is never counted. */
export const bandCountsValidator = v.object({
  p01_03: v.number(),
  p04_10: v.number(),
  p11_20: v.number(),
  p21_50: v.number(),
  p51_up: v.number(),
});
export type BandCounts = Infer<typeof bandCountsValidator>;

export function emptyBandCounts(): BandCounts {
  return { p01_03: 0, p04_10: 0, p11_20: 0, p21_50: 0, p51_up: 0 };
}

/**
 * The path of a ranking page, which is what a person recognises and what the
 * page filter matches on. The host is the site's own, so it adds nothing.
 */
export function pagePath(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

/**
 * The folder a page sits in — `/hub/bad-websites/` is in `/hub/`. A page at the
 * top of the site, like `/ai-agency/`, is in `/` with the home page: it is a
 * page, not a folder, and a section per top-level page would be a second list
 * of pages rather than a structure.
 */
export function sectionOf(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length <= 1 ? "/" : `/${segments[0]}/`;
}

/**
 * A competitor's keywords read for the content gap, most-searched first. Here
 * rather than in `siteContentGap.ts` because the Content gap page names it,
 * and a client screen importing a Convex module would ship the backend with it.
 */
export const GAP_KEYWORDS_PER_RIVAL = 5_000;

/**
 * How hard a search is to rank for, as a band of DataForSEO's keyword
 * difficulty (0–100), for the All keywords filter. The steps are Ahrefs' own
 * (easy to 10, medium to 30, hard to 70, then very hard), because that is the
 * scale the owner compares against; the number itself is DataForSEO's.
 */
export const KD_BANDS = ["kd00_10", "kd11_30", "kd31_70", "kd71_100"] as const;
export type KdBand = (typeof KD_BANDS)[number];
export const kdBandValidator = v.union(
  v.literal("kd00_10"),
  v.literal("kd11_30"),
  v.literal("kd31_70"),
  v.literal("kd71_100"),
);

export function kdBandFor(difficulty: number | undefined): KdBand | undefined {
  if (difficulty === undefined) return undefined;
  if (difficulty <= 10) return "kd00_10";
  if (difficulty <= 30) return "kd11_30";
  if (difficulty <= 70) return "kd31_70";
  return "kd71_100";
}

/**
 * One keyword a site ranks for, as the parser hands it to the filing
 * mutation: the ranking, and what DataForSEO says about the search and the
 * ranking page (docs/plans/active/user-sites-plan.md, Phase 2).
 */
export const rankedPositionValidator = v.object({
  keyword: v.string(),
  position: v.optional(v.number()),
  url: v.optional(v.string()),
  searchVolume: v.optional(v.number()),
  cpc: v.optional(v.number()),
  difficulty: v.optional(v.number()),
  trend: v.optional(v.array(v.number())),
  traffic: v.optional(v.number()),
  trafficValue: v.optional(v.number()),
  serpFeatures: v.optional(v.array(v.string())),
  pageRank: v.optional(v.number()),
  pageReferringDomains: v.optional(v.number()),
  pageBacklinks: v.optional(v.number()),
});

/**
 * What kind of page a ranking page is, for Top pages. Worked out from the
 * address where the address says it plainly, and otherwise by the page-type
 * Decision (`seo.page-type`); `UNJUDGED` until one of them has.
 */
export const PAGE_TYPES = [
  "HOME", "SERVICE", "PRODUCT", "CATEGORY", "ARTICLE", "CASE_STUDY",
  "ABOUT", "CONTACT", "LOCATION", "CAREERS", "LEGAL", "OTHER", "UNJUDGED",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export const pageTypeValidator = v.union(
  v.literal("HOME"),
  v.literal("SERVICE"),
  v.literal("PRODUCT"),
  v.literal("CATEGORY"),
  v.literal("ARTICLE"),
  v.literal("CASE_STUDY"),
  v.literal("ABOUT"),
  v.literal("CONTACT"),
  v.literal("LOCATION"),
  v.literal("CAREERS"),
  v.literal("LEGAL"),
  v.literal("OTHER"),
  v.literal("UNJUDGED"),
);

/** Folder names that say what a page is, whatever site they are on. */
const PAGE_TYPE_FOLDERS: Array<[RegExp, PageType]> = [
  [/^(contact|contact-us|get-in-touch|enquire|enquiries|get-a-quote|quote|book|booking)$/, "CONTACT"],
  [/^(about|about-us|our-story|who-we-are|team|our-team|meet-the-team)$/, "ABOUT"],
  [/^(blog|blogs|news|insights|articles?|guides?|resources|hub|journal|stories|press|learn|knowledge|knowledge-base|faqs?)$/, "ARTICLE"],
  [/^(case-studies|case-study|work|our-work|portfolio|projects?|clients|success-stories|showcase)$/, "CASE_STUDY"],
  [/^(careers?|jobs|vacancies|join-us|work-with-us)$/, "CAREERS"],
  [/^(privacy|privacy-policy|cookies|cookie-policy|terms|terms-and-conditions|terms-of-service|legal|gdpr|accessibility|sitemap|disclaimer)$/, "LEGAL"],
  [/^(services?|what-we-do|solutions|capabilities|expertise|our-services)$/, "SERVICE"],
  [/^(category|categories|collections?|product-category|departments?)$/, "CATEGORY"],
  [/^(locations?|areas|areas-we-cover|areas-we-serve|branches|find-us)$/, "LOCATION"],
];

/**
 * The page type the address alone gives away — the home page, `/contact/`,
 * anything under `/blog/` — or null when only reading the page would tell.
 * Free and certain, so the Decision is only asked about the rest.
 */
export function pageTypeByAddress(path: string): PageType | null {
  const segments = path.toLowerCase().split("/").filter(Boolean)
    .map((segment) => segment.replace(/\.(html?|php|aspx?)$/, ""));
  if (segments.length === 0 || (segments.length === 1 && /^(index|home|default)$/.test(segments[0]))) return "HOME";
  for (const [pattern, type] of PAGE_TYPE_FOLDERS) if (pattern.test(segments[0])) return type;
  if (/^(shop|store|products?)$/.test(segments[0])) return segments.length > 1 ? "PRODUCT" : "CATEGORY";
  return null;
}

/** The Sites tables that can be downloaded whole, as a CSV file built on the server (`siteExports.ts`). */
export const SITE_EXPORT_KINDS = [
  "keywords", "pages", "gap", "cited", "backlinks", "broken", "domains", "anchors", "ips", "paid", "answers",
] as const;
export type SiteExportKind = (typeof SITE_EXPORT_KINDS)[number];
export const siteExportKindValidator = v.union(
  v.literal("keywords"), v.literal("pages"), v.literal("gap"), v.literal("cited"), v.literal("backlinks"),
  v.literal("broken"), v.literal("domains"), v.literal("anchors"), v.literal("ips"), v.literal("paid"),
  v.literal("answers"),
);
