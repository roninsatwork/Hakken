import { v, type Infer } from "convex/values";

/**
 * The weekly checks on a website's money pages (docs/plans/active/
 * insights-analyst-plan.md §4.4, phase 8, drawn as the VisAudit and
 * ScIndexing boards): whether Google has indexed each page and when it last
 * read it (Search Console's URL inspection), how fast it is for real
 * visitors (Google's Chrome figures, through PageSpeed Insights), and the
 * structured data it carries (read from the page itself). Pure parts here:
 * reading Google's answers and a page's markup.
 */

export const indexedValidator = v.object({
  /** PASS indexed; NEUTRAL excluded; FAIL a problem; as Google says. */
  verdict: v.string(),
  /** Google's own words for where the page stands ("Submitted and indexed"). */
  coverage: v.union(v.string(), v.null()),
  /** When Google last read the page, as a day. */
  lastRead: v.union(v.string(), v.null()),
  /** Google could fetch it ("SUCCESSFUL") or why not. */
  fetch: v.union(v.string(), v.null()),
  /** Google chose another page as the one to show. */
  otherCanonical: v.boolean(),
});
export type Indexed = Infer<typeof indexedValidator>;

export const speedValidator = v.object({
  /** The 75th visit's figures: time to show the main content, to respond to a tap, and how much the layout shifts. */
  lcpMs: v.union(v.number(), v.null()),
  inpMs: v.union(v.number(), v.null()),
  cls: v.union(v.number(), v.null()),
  /** Google's own call over the three: FAST, AVERAGE or SLOW. */
  category: v.union(v.string(), v.null()),
  /** The page's own figures, or the whole website's where the page has too few visits. */
  scope: v.union(v.literal("PAGE"), v.literal("WEBSITE")),
});
export type Speed = Infer<typeof speedValidator>;

/** Google's three thresholds for a good visit (Core Web Vitals). */
export const GOOD = { lcpMs: 2500, inpMs: 200, cls: 0.1 } as const;

/** Whether a page is fast enough on all three measures; null when Google has no figures. */
export function fastEnough(speed: Speed | null): boolean | null {
  if (!speed || speed.lcpMs === null) return null;
  return speed.lcpMs <= GOOD.lcpMs && (speed.inpMs === null || speed.inpMs <= GOOD.inpMs) && (speed.cls === null || speed.cls <= GOOD.cls);
}

/** The worst of a page's three measures, for its one word: what to fix first. */
export function slowestPart(speed: Speed | null): "MAIN_CONTENT" | "TAPS" | "SHIFTS" | null {
  if (!speed) return null;
  if (speed.lcpMs !== null && speed.lcpMs > GOOD.lcpMs) return "MAIN_CONTENT";
  if (speed.inpMs !== null && speed.inpMs > GOOD.inpMs) return "TAPS";
  if (speed.cls !== null && speed.cls > GOOD.cls) return "SHIFTS";
  return null;
}

/** Google's URL inspection answer, as kept. */
export function indexedFrom(json: unknown, address: string): Indexed | null {
  const result = (json as { inspectionResult?: { indexStatusResult?: Record<string, unknown> } })?.inspectionResult?.indexStatusResult;
  if (!result) return null;
  const crawled = typeof result.lastCrawlTime === "string" ? result.lastCrawlTime.slice(0, 10) : null;
  const google = typeof result.googleCanonical === "string" ? result.googleCanonical : null;
  const own = typeof result.userCanonical === "string" ? result.userCanonical : address;
  return {
    verdict: typeof result.verdict === "string" ? result.verdict : "VERDICT_UNSPECIFIED",
    coverage: typeof result.coverageState === "string" ? result.coverageState : null,
    lastRead: crawled,
    fetch: typeof result.pageFetchState === "string" ? result.pageFetchState : null,
    otherCanonical: Boolean(google && google.replace(/\/$/, "") !== own.replace(/\/$/, "")),
  };
}

type Metric = { percentile?: number; category?: string };
type Experience = { metrics?: Record<string, Metric>; overall_category?: string; id?: string };

/** PageSpeed Insights' real-visitor figures: the page's own, or the website's when the page has too few. */
export function speedFrom(json: unknown): Speed | null {
  const answer = json as { loadingExperience?: Experience; originLoadingExperience?: Experience };
  const own = answer?.loadingExperience;
  const page = own?.metrics && Object.keys(own.metrics).length > 0 && !(own.id ?? "").startsWith("origin:") ? own : null;
  const chosen = page ?? (answer?.originLoadingExperience?.metrics ? answer.originLoadingExperience : null);
  if (!chosen?.metrics) return null;
  const at = (name: string) => (typeof chosen.metrics?.[name]?.percentile === "number" ? chosen.metrics[name].percentile! : null);
  const shift = at("CUMULATIVE_LAYOUT_SHIFT_SCORE");
  return {
    lcpMs: at("LARGEST_CONTENTFUL_PAINT_MS"),
    inpMs: at("INTERACTION_TO_NEXT_PAINT"),
    // Google gives the shift score a hundred times over.
    cls: shift === null ? null : shift / 100,
    category: chosen.overall_category ?? null,
    scope: page ? "PAGE" : "WEBSITE",
  };
}

/** The kinds of structured data a page carries: its JSON-LD types and its microdata types, each once. */
export function structuredDataOf(html: string): string[] {
  const types = new Set<string>();
  const addType = (value: unknown) => {
    if (typeof value === "string") types.add(value.replace(/^https?:\/\/schema\.org\//, ""));
    else if (Array.isArray(value)) value.forEach(addType);
  };
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      addType(record["@type"]);
      if (record["@graph"]) walk(record["@graph"]);
      for (const [key, value] of Object.entries(record)) if (key !== "@type" && key !== "@graph" && value && typeof value === "object") walk(value);
    }
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(match[1].trim()));
    } catch {
      // A broken block carries nothing Google can read either.
    }
  }
  for (const match of html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) types.add(match[1]);
  return [...types].sort();
}

/** What a money page should carry, by its kind, and what it lacks: company facts on the home and about pages, a service on a service page. */
export function missingStructuredData(kind: string | null, types: readonly string[]): string[] {
  const has = (...names: string[]) => names.some((name) => types.includes(name));
  const missing: string[] = [];
  if (kind === "HOME" || kind === "ABOUT") {
    if (!has("Organization", "LocalBusiness", "ProfessionalService", "Corporation")) missing.push("ORGANISATION");
  }
  if (kind === "SERVICE" && !has("Service", "Product", "Offer")) missing.push("SERVICE");
  return missing;
}
