/**
 * Every reason Google's Page indexing report gives for a page not in Google
 * (search-console-indexing-v1-plan-2026-11-18.md, "The reasons"): each in
 * Google's exact words as its URL inspection answers them (`coverageState`),
 * with the Source the report gives it, its kind (which four boxes and which
 * columns its own page shows) and its key for the reader's words
 * (`searchConsole.indexing.reasons.<key>`: Google's term, a short name for the
 * chart's key and one plain line). Plain code, so the collector, the reads,
 * the screens and the eye all name a reason the same way.
 *
 * Google's term only names a thing (docs/developer/writing-guide.md, "Google's
 * own terms stay"). A reason Google adds later shows in its own words, with
 * no Source, until it joins the list.
 */

/** Which boxes and columns a reason's page shows: what tells its pages apart. */
export type ReasonKind = "error" | "keptOut" | "duplicate" | "notChosen" | "unknown";
/** The report's Source: the website's own doing, or Google's. */
export type ReasonSource = "website" | "google";

export type IndexingReason = {
  /** Its key in the reader's words. */
  key: string;
  /** Its own page's address, under Indexing. */
  slug: string;
  /** Google's words, as its URL inspection writes them in English. */
  words: string;
  source: ReasonSource;
  kind: ReasonKind;
  /** Its plain line in English, for Ask Hakken: the screen says it in the reader's language (`means`). */
  means: string;
};

/** Google's reasons, in the order its report lists them: the website's first, then Google's own. */
export const INDEXING_REASONS: readonly IndexingReason[] = [
  { key: "serverError", slug: "server-error", words: "Server error (5xx)", source: "website", kind: "error", means: "Your website broke when Google asked for these pages." },
  { key: "redirectError", slug: "redirect-error", words: "Redirect error", source: "website", kind: "error", means: "These links send people round in a loop, or to a dead end." },
  { key: "robots", slug: "blocked-by-robots-txt", words: "Blocked by robots.txt", source: "website", kind: "keptOut", means: "Your website tells Google not to visit these pages." },
  { key: "noindex", slug: "noindex", words: "Excluded by ‘noindex’ tag", source: "website", kind: "keptOut", means: "These pages tell Google not to show them." },
  { key: "soft404", slug: "soft-404", words: "Soft 404", source: "website", kind: "error", means: "These pages are there, but Google thinks they look empty." },
  { key: "unauthorized", slug: "unauthorized-401", words: "Blocked due to unauthorized request (401)", source: "website", kind: "error", means: "Google needs to sign in to see these pages." },
  { key: "notFound", slug: "not-found-404", words: "Not found (404)", source: "website", kind: "error", means: "These pages have gone. People who click them see an error." },
  { key: "forbidden", slug: "forbidden-403", words: "Blocked due to access forbidden (403)", source: "website", kind: "error", means: "Your website won't let Google see these pages." },
  { key: "other4xx", slug: "other-4xx", words: "Blocked due to other 4xx issue", source: "website", kind: "error", means: "Your website said no when Google asked for these pages." },
  { key: "removed", slug: "page-removal-tool", words: "Blocked by page removal tool", source: "website", kind: "keptOut", means: "Someone asked Google to hide these pages for a while." },
  { key: "alternate", slug: "alternate-page", words: "Alternate page with proper canonical tag", source: "website", kind: "duplicate", means: "These pages point Google to a main page. That's as it should be." },
  { key: "redirect", slug: "page-with-redirect", words: "Page with redirect", source: "website", kind: "duplicate", means: "These old links send people on to another page. Google shows that page instead." },
  { key: "duplicate", slug: "duplicate-no-canonical", words: "Duplicate without user-selected canonical", source: "website", kind: "duplicate", means: "These pages copy another, and don't say which is the main one." },
  { key: "googleChose", slug: "duplicate-google-chose", words: "Duplicate, Google chose different canonical than user", source: "google", kind: "duplicate", means: "You picked a main page, but Google picked a different one." },
  { key: "crawled", slug: "crawled-not-indexed", words: "Crawled - currently not indexed", source: "google", kind: "notChosen", means: "Google visited these pages, but chose not to show them yet." },
  { key: "discovered", slug: "discovered-not-indexed", words: "Discovered - currently not indexed", source: "google", kind: "notChosen", means: "Google knows about these pages, but hasn't visited them yet." },
  // Only a page check gives this one: Google's report counts only what it has a record of.
  { key: "unknown", slug: "unknown-to-google", words: "URL is unknown to Google", source: "google", kind: "unknown", means: "Google has no record of these pages." },
];

/** Google's words for a page in Google, as its URL inspection writes them. */
export const INDEXED_WORDS = ["Submitted and indexed", "Indexed, not submitted in sitemap"] as const;

/** Google's words made comparable: its curly quotes, dashes and spaces as they come. */
const plain = (words: string) => words.trim().toLowerCase().replace(/[‘’'`]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ");

const BY_WORDS = new Map(INDEXING_REASONS.map((reason) => [plain(reason.words), reason]));
const BY_SLUG = new Map(INDEXING_REASONS.map((reason) => [reason.slug, reason]));

/** The reason Google's words name, or null for one not on the list (yet). */
export function reasonOf(words: string | null | undefined): IndexingReason | null {
  return words ? BY_WORDS.get(plain(words)) ?? null : null;
}

/** A reason's own page's address: its slug, or Google's words themselves for a reason not on the list. */
export function reasonSlug(words: string): string {
  return reasonOf(words)?.slug ?? encodeURIComponent(words);
}

/** Google's words from a reason page's address: the list's own, or the words a reason not on the list was given. */
export function wordsOfSlug(slug: string): string {
  const listed = BY_SLUG.get(slug);
  if (listed) return listed.words;
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/** A reason's kind: its list's, or Google's own choice for one not on the list, as the board draws it. */
export const kindOf = (words: string): ReasonKind => reasonOf(words)?.kind ?? "notChosen";

/**
 * Whether Google's answer puts a page in Google: its own verdict (PASS, or PARTIAL for one in Google with a warning),
 * or its words for one, such as "Indexed, though blocked by robots.txt".
 */
export function isIndexed(verdict: string | null | undefined, words: string | null | undefined): boolean {
  if (verdict === "PASS" || verdict === "PARTIAL") return true;
  const said = words ? plain(words) : "";
  return INDEXED_WORDS.some((one) => plain(one) === said) || said.startsWith("indexed,");
}
