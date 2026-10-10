import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep, type SeenTarget } from "../utils/hakkenSees";

/**
 * What Hakken sees on a website's own screens and on the Websites list
 * (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §6, "Site" and
 * "Detail screens, the Websites list and Keyword research"): fixed rules over
 * each screen's own rows, most important first. Overview, Site audit and a
 * problem's pages name things in the reader's words or read figures other
 * screens share, so their screens run these rules; Your assets and Your pages
 * return theirs.
 */

type Maybe<T> = T | null;

type Point = { estimatedTraffic?: number; rankedKeywordsTotal?: number; referringDomains?: number };
type Measure = keyof Point;

/** A measure at the start of the dates and at their end: the newest point holding it, and the oldest (or the one before). */
function span(points: readonly Point[], before: Point | null, measure: Measure): { from: number; to: number } | null {
  const held = [...(before ? [before] : []), ...points].filter((point) => point[measure] !== undefined);
  return held.length > 1 ? { from: held[0][measure]!, to: held.at(-1)![measure]! } : null;
}

/** Site → Overview: what moved over the dates chosen — visits from Google, searches ranked for, websites linking. */
export function overviewSees(line: { points: readonly Point[]; before: Point | null } | undefined): Seen {
  const visits = span(line?.points ?? [], line?.before ?? null, "estimatedTraffic");
  const searches = span(line?.points ?? [], line?.before ?? null, "rankedKeywordsTotal");
  const links = span(line?.points ?? [], line?.before ?? null, "referringDomains");
  if (!visits && !searches && !links) return seen([{ code: "none" }]);
  const moved = (pair: { from: number; to: number } | null, up: string, down: string): Maybe<SeenPhrase> => {
    if (!pair || pair.to === pair.from) return null;
    return { code: pair.to > pair.from ? up : down, a: Math.abs(Math.round(pair.to - pair.from)), b: Math.round(pair.to) };
  };
  const visitsFell = visits !== null && visits.to < visits.from;
  const searchesFell = searches !== null && searches.to < searches.from;
  const says: Array<Maybe<SeenPhrase>> = [
    moved(visits, "visitsUp", "visitsDown") ?? (visits ? { code: "visitsSteady", a: Math.round(visits.to) } : null),
    moved(searches, "searchesUp", "searchesDown"),
    moved(links, "linksUp", "linksDown"),
  ];
  const steps: Array<Maybe<SeenStep>> = [
    visitsFell || searchesFell ? { code: "seeLosses", link: "newAndLostKeywords", to: toPage("keywords/new-lost") } : { code: "seeTopPages", link: "topPages", to: toPage("keywords/pages") },
    links !== null && links.to < links.from ? { code: "seeLostLinks", link: "newAndLost", to: toPage("backlinks/new-lost") } : null,
  ];
  return seen(says, steps);
}

type Stage = "NOT_THERE" | "NOT_SEEN" | "SEEN_NOT_CHOSEN" | "WORKING";
type Asset = { key: string; kind: string; name: string; stage: Stage };

/** Where an asset is worked on: its own record or the screen of its kind, as Your assets' rows open. */
export function assetTarget(asset: Pick<Asset, "key" | "kind" | "name">): SeenTarget {
  const rest = asset.key.slice(asset.key.indexOf(":") + 1);
  switch (asset.kind) {
    case "PAGE": return toRecord("page", asset.name);
    case "PROFILE": return toPage("local", { office: rest });
    case "REVIEW_SITE": return toPage("reviews");
    case "AI_APP": return toPage("ai/answers");
    case "AI_OVERVIEW": return toPage("radar/gaps");
    case "DIRECTORY": return toRecord("website", asset.name);
    case "PRESS": return toPage("mentions");
    default: return toPage("");
  }
}

/** The leaks, worst first: missing, then not seen, then seen and not chosen. */
const LEAKS: readonly Stage[] = ["NOT_THERE", "NOT_SEEN", "SEEN_NOT_CHOSEN"];

/** Site → Your assets: those working and those losing, the stage most are lost at, and the first to fix. */
export function assetsSees(rows: readonly Asset[]): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const count = (stage: Stage) => rows.filter((row) => row.stage === stage).length;
  const losing = count("NOT_SEEN") + count("SEEN_NOT_CHOSEN");
  const leak = [...LEAKS].sort((left, right) => count(right) - count(left) || LEAKS.indexOf(left) - LEAKS.indexOf(right))[0];
  const first = rows.find((row) => row.stage === leak) ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "stages", a: count("WORKING"), b: losing, c: count("NOT_THERE") },
    count(leak) > 0 ? { code: `mostAt.${leak}`, a: count(leak) } : { code: "allWorking" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    first && count(leak) > 0 ? { code: `fix.${leak}`, text: first.name, link: "seeAsset", to: assetTarget(first) } : null,
  ];
  return seen(says, steps);
}

/** Site → Your pages: pages Google never showed, those missing from the sitemap, and those the audit could not reach. */
export function yourPagesSees(own: boolean, summary: { pages: number; shown: number; neverShown: number; notInSitemap: number; notCrawled: number; sitemapRead: boolean } | null): Seen {
  if (!own) return seen([{ code: "notOwn" }]);
  if (!summary || summary.pages === 0) return seen([{ code: "none" }]);
  const gaps = (["neverShown", "notInSitemap", "notCrawled"] as const)
    .map((filter) => ({ filter, count: summary[filter] }))
    .filter((gap) => gap.count > 0 && (gap.filter !== "notInSitemap" || summary.sitemapRead))
    .sort((left, right) => right.count - left.count);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "pages", a: summary.pages, b: summary.shown },
    ...gaps.slice(0, 2).map((gap): SeenPhrase => ({ code: gap.filter, a: gap.count })),
  ];
  const steps: Array<Maybe<SeenStep>> = gaps.slice(0, 2).map((gap): SeenStep => ({ code: `see.${gap.filter}`, a: gap.count, link: "seePages", to: toPage("your-pages", { filter: gap.filter }) }));
  return seen(says.length > 1 ? says : [...says, { code: "nothingMissing" }], steps);
}

const SEVERITY = { ERROR: 0, WARNING: 1, NOTICE: 2 } as const;

/** Site → Site audit: the pages read and the score, and the worst problem by pages affected. */
export function auditSees(
  audit: { pagesCrawled: number; onPageScore: number | null; turnedAway: string | null; issues: ReadonlyArray<{ check: string; pages: number; severity: keyof typeof SEVERITY }> } | null,
  label: (check: string) => string,
): Seen {
  if (!audit) return seen([{ code: "notCrawled" }]);
  const worst = [...audit.issues].sort((left, right) => SEVERITY[left.severity] - SEVERITY[right.severity] || right.pages - left.pages)[0] ?? null;
  const errors = audit.issues.filter((issue) => issue.severity === "ERROR").length;
  const says: Array<Maybe<SeenPhrase>> = [
    audit.turnedAway ? { code: "turnedAway", a: audit.pagesCrawled } : audit.onPageScore !== null ? { code: "crawled", a: audit.pagesCrawled, b: audit.onPageScore } : { code: "crawledNoScore", a: audit.pagesCrawled },
    worst ? { code: "worst", text: label(worst.check), a: worst.pages } : { code: "noProblems" },
    errors > 1 ? { code: "errors", a: errors } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    worst ? { code: "fix", text: label(worst.check), link: "seeProblem", to: toRecord("problem", worst.check) } : null,
  ];
  return seen(says, steps);
}

/** Site audit → one problem: the pages it was found on, and the first of them to fix. */
export function problemSees(rows: ReadonlyArray<{ page: string; brokenLinks: readonly unknown[] }>, pages: number | null, name: string): Seen {
  if (rows.length === 0) return seen([{ code: "none", text: name }]);
  const broken = rows.reduce((sum, row) => sum + row.brokenLinks.length, 0);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "pages", text: name, a: pages ?? rows.length },
    broken > 0 ? { code: "brokenLinks", a: broken } : null,
  ];
  return seen(says, [{ code: "fixFirst", text: rows[0].page || "/", link: "seePage", to: toRecord("page", rows[0].page) }]);
}

/** The Websites list: the websites held, and the one that moved most at its newest check. */
export function websitesSees(rows: ReadonlyArray<{ siteId: string; host: string; relationship: string; checked: boolean; rankedUp: number | null; rankedDown: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const owned = rows.filter((row) => row.relationship === "OWNED").length;
  const checked = rows.filter((row) => row.checked);
  const down = [...checked].filter((row) => (row.rankedDown ?? 0) > 0).sort((left, right) => (right.rankedDown ?? 0) - (left.rankedDown ?? 0))[0] ?? null;
  const up = [...checked].filter((row) => (row.rankedUp ?? 0) > 0).sort((left, right) => (right.rankedUp ?? 0) - (left.rankedUp ?? 0))[0] ?? null;
  const lead = down ?? up;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "websites", a: owned, b: rows.length - owned },
    down ? { code: "mostDown", text: down.host, a: down.rankedDown!, b: down.rankedUp ?? 0 } : null,
    up && up !== down ? { code: "mostUp", text: up.host, a: up.rankedUp! } : null,
    checked.length === 0 ? { code: "notChecked" } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    lead ? { code: "open", text: lead.host, link: "openWebsite", to: { url: `/app/sites/${lead.siteId}` } } : null,
  ];
  return seen(says, steps);
}
