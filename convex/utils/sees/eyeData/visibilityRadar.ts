/**
 * What Brand radar's Sources, one source website and one question hand the eye, and Your pages (visibility-16-eyes, 22
 * November 2026). Built here once, so each screen, a chat app's question (`chatAppEyes/visibility.ts`) and the every-period
 * test (`convex/utils/sees/visibilityRestPeriods.test.ts`) hand the rules (`own/visibilityRadar.ts`) the same figures.
 * Brand radar reads Google's AI answers once a month, so these show the newest month, whatever the dates. A kind of
 * website is named in the screen's own words (`sites.radar.sources.kinds`), never its code.
 */

type Said = { code: string; a?: number; b?: number; c?: number; text?: string };
type Box = { says?: ReadonlyArray<Said> } | null | undefined;
const said = (box: Box, code: string) => box?.says?.find((one) => one.code === code);

/** A page's address without its website, as a row is read: "/r/webdev/comments/…". */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

// --- One question (`radar/question`) ---

type QuestionAnswer = {
  found: boolean; question: string; volume: number | null; month: string | null; tracked: boolean;
  named: ReadonlyArray<{ host: string; place: number | null; you: boolean }>;
  pages: ReadonlyArray<{ host: string; kind: string }>;
};

/**
 * One question: how often it's asked, who the answer names and in what place, and the pages it quotes, yours, your
 * rivals' and the rest, by the kind of website each is.
 */
export function questionSees(answer: QuestionAnswer | null | undefined, kindName: (kind: string) => string, you: string, names: { yourRivals: string }) {
  if (!answer?.found) return undefined;
  const named = [...answer.named].sort((left, right) => (left.place ?? Infinity) - (right.place ?? Infinity));
  const kinds = new Map<string, number>();
  for (const page of answer.pages) kinds.set(page.kind, (kinds.get(page.kind) ?? 0) + 1);
  return {
    question: {
      name: answer.question, volume: answer.volume, month: answer.month, you,
      yourPlace: named.find((one) => one.you)?.place ?? null,
      businessesNamed: named.length, rivalsNamed: named.filter((one) => !one.you).length,
      quotedPages: answer.pages.length,
      yourPages: answer.pages.filter((page) => page.kind === "YOURS").length,
      rivalPages: answer.pages.filter((page) => page.kind === "RIVAL").length,
    },
    named: named.map((one) => ({ name: one.host, place: one.place, you: one.you ? 1 : 0 })),
    quotedKinds: [...kinds.entries()].map(([kind, quotedPages]) => ({ name: kindName(kind), quotedPages, yours: kind === "YOURS" ? 1 : 0, rivals: kind === "RIVAL" ? 1 : 0 })).sort((left, right) => right.quotedPages - left.quotedPages),
    quoted: answer.pages.map((page) => ({ name: page.host, kind: kindName(page.kind) })),
    names,
  };
}

// --- Sources (`radar/sources`) ---

type SourceRow = { host: string; kind: string; times: number; besideYou: number; besideRivals: number };
type SourcesAnswer = { websites: readonly SourceRow[]; yourTimes: number | null; yourPages: number | null; seen?: Box };

/**
 * Sources: every website Google's AI quotes, summed: how many appear in answers naming you, how many sit beside your
 * rivals and never beside you, the quotes by kind of website, the most quoted, those you're missing from, your rivals'
 * own sites and your own.
 */
export function sourcesSees(answer: SourcesAnswer | null | undefined, kindName: (kind: string) => string, names: { namingYou: string; neverBesideYou: string; besideRivals: string }) {
  if (!answer || answer.websites.length === 0) return undefined;
  const sorted = [...answer.websites].sort((left, right) => right.times - left.times);
  // Places to be quoted, as the box counts them: a rival's own site, or yours, is never a place to get onto.
  const missing = sorted.filter((one) => one.besideYou === 0 && one.besideRivals > 0 && one.kind !== "RIVAL" && one.kind !== "YOURS").sort((left, right) => right.besideRivals - left.besideRivals);
  const kinds = new Map<string, { quotes: number; besideYou: number; websites: number }>();
  for (const one of sorted) {
    const held = kinds.get(one.kind) ?? { quotes: 0, besideYou: 0, websites: 0 };
    held.quotes += one.times;
    held.besideYou += one.besideYou;
    held.websites += 1;
    kinds.set(one.kind, held);
  }
  const yours = sorted.find((one) => one.kind === "YOURS");
  const row = (one: SourceRow) => ({ name: one.host, kind: kindName(one.kind), quotes: one.times, besideYou: one.besideYou, besideRivals: one.besideRivals });
  const quoted = said(answer.seen, "websitesQuoted");
  return {
    sources: {
      websites: quoted?.a ?? sorted.length,
      namingYou: quoted?.b ?? sorted.filter((one) => one.besideYou > 0).length,
      neverBesideYou: said(answer.seen, "placesMissing")?.a ?? missing.length,
      quotes: sorted.reduce((sum, one) => sum + one.times, 0),
      yourQuotes: answer.yourTimes ?? yours?.times ?? 0,
      yourPages: answer.yourPages,
    },
    ...(yours ? { yours: row(yours) } : {}),
    kinds: [...kinds.entries()].map(([kind, held]) => ({ name: kindName(kind), quotes: held.quotes, besideYou: held.besideYou, websites: held.websites, rivals: kind === "RIVAL" ? 1 : 0, yours: kind === "YOURS" ? 1 : 0 })).sort((left, right) => right.quotes - left.quotes),
    mostQuoted: sorted.filter((one) => one.kind !== "YOURS").slice(0, 10).map(row),
    missing: missing.slice(0, 5).map(row),
    rivalSites: sorted.filter((one) => one.kind === "RIVAL").slice(0, 5).map(row),
    names,
  };
}

// --- One source website (`radar/sources/website`) ---

type WebsiteAnswer = {
  host: string; kind: string; times: number; besideYou: number; besideRivals: number; namesYou: number | null; asks: number | null;
  businesses: ReadonlyArray<{ host: string; quotedBeside: number; you: boolean }>;
  pages: ReadonlyArray<{ url: string; times: number; besideYou: number; besideRivals: number }>;
  questions: ReadonlyArray<{ question: string; volume: number | null; named: ReadonlyArray<{ host: string; you: boolean }> }>;
};

/**
 * One source website: how often Google's AI quotes it beside you and beside your rivals, the businesses quoted beside it,
 * its pages that name you, its most quoted pages and the most asked questions it's quoted for.
 */
export function sourceWebsiteSees(answer: WebsiteAnswer | null | undefined, kindName: (kind: string) => string, names: { besideRivals: string; pagesNamingYou: string }) {
  if (!answer || answer.times === 0) return undefined;
  return {
    source: {
      name: answer.host, kind: kindName(answer.kind), quotes: answer.times, besideYou: answer.besideYou, besideRivals: answer.besideRivals,
      pagesNamingYou: answer.namesYou, pages: answer.pages.length, questions: answer.questions.length,
      questionsVolume: answer.questions.reduce((sum, one) => sum + (one.volume ?? 0), 0),
    },
    businesses: [...answer.businesses].sort((left, right) => right.quotedBeside - left.quotedBeside).map((one) => ({ name: one.host, quotedBeside: one.quotedBeside, you: one.you ? 1 : 0 })),
    quotedPages: [...answer.pages].sort((left, right) => right.times - left.times).slice(0, 10).map((one) => ({ name: pathOf(one.url), quotes: one.times, besideYou: one.besideYou, besideRivals: one.besideRivals })),
    questions: [...answer.questions].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0)).slice(0, 10).map((one) => ({
      name: one.question, volume: one.volume, namesYou: one.named.some((business) => business.you) ? 1 : 0, rivalsNamed: one.named.filter((business) => !business.you).length,
    })),
    names,
  };
}

// --- Your pages (`your-pages`) ---

type YourPagesAnswer = {
  own?: boolean;
  /** Rows carry their Classification only where the company sorts its pages (`yourPages.ts`); else a kind of page, left out. */
  groupBy?: "CLASSIFICATION" | "KIND";
  rows: ReadonlyArray<{ page: string; clicks: number | null; group: string | null; ranks: boolean; shown: boolean | null }>;
  summary: {
    pages: number; shown: number | null; neverShown: number | null; notInSitemap: number; notCrawled: number; ranking: number | null; sitemap: number | null;
    console: boolean; consoleFrom: string | null; consoleTo: string | null;
  } | null;
};

/**
 * Your pages: every page known on the website, those Google showed and never showed over Search Console's three months,
 * those missing from the sitemap or the site audit couldn't reach, those ranking at the newest check, and the page of
 * pages on screen with their clicks, summed by Classification.
 */
export function yourPagesEye(answer: YourPagesAnswer | null | undefined, names: { shownOnGoogle: string; neverShown: string; notInSitemap: string; ranking: string; notCrawled: string }) {
  if (!answer?.summary || answer.own === false) return undefined;
  const summary = answer.summary;
  const classified = answer.groupBy === "CLASSIFICATION";
  const groups = new Map<string, { clicks: number; pages: number }>();
  for (const row of answer.rows) {
    if (!classified || !row.group) continue;
    const held = groups.get(row.group) ?? { clicks: 0, pages: 0 };
    held.clicks += row.clicks ?? 0;
    held.pages += 1;
    groups.set(row.group, held);
  }
  return {
    yourSite: {
      pages: summary.pages, shown: summary.console ? summary.shown : null, neverShown: summary.console ? summary.neverShown : null,
      notInSitemap: summary.notInSitemap, notCrawled: summary.notCrawled, ranking: summary.ranking, inSitemap: summary.sitemap,
      clicksFrom: summary.consoleFrom, clicksTo: summary.consoleTo,
    },
    pagesShown: answer.rows.map((row) => ({ name: row.page, clicks: row.clicks, ...(classified && row.group ? { classification: row.group } : {}), ranks: row.ranks ? 1 : 0, shown: row.shown ? 1 : 0 })),
    classifications: [...groups.entries()].map(([name, held]) => ({ name, clicks: held.clicks, pages: held.pages })).sort((left, right) => right.clicks - left.clicks),
    names,
  };
}
