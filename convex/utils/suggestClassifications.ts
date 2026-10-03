import { normalisePage } from "./pageClassification";
import type { ClassificationType } from "./pageKinds";

/**
 * The suggested start (docs/plans/active/page-groups-plan.md: "groups and
 * rules read from the site's own folders and sitemap files, to keep, rename
 * or remove — most of the one-off job done in a minute").
 *
 * Read from the website's every page once (`holdPages`), its sections are:
 *
 * - **Each sitemap file of its own** — `post-sitemap.xml`,
 *   `case_study-sitemap.xml` — skipping the generic ones (`page-sitemap.xml`,
 *   `sitemap.xml`) that list a bit of everything. Files that differ only by a
 *   number (`post-sitemap2.xml`) are one section.
 * - **Each first-level folder holding at least `FOLDER_PAGES` pages** —
 *   `/hub/`, `/case-study/` — skipping the folders a website keeps files in
 *   (`/wp-content/`). Folders ending in the same word of a kind
 *   (`/web-design-insights/`, `/mobile-app-insights/`) are one section,
 *   named by that word ("Insights").
 *
 * A file whose pages all sit in one folder (one listing page aside) is that
 * folder's section: named by the file ("Content hub", from
 * `content-hub-sitemap.xml`) and caught by the folder's "starts with" line,
 * which also catches the folder's pages the sitemap leaves out. A file whose
 * pages are spread across the top level is caught by its "listed in sitemap
 * file" line, and named by its own listing page when it has one ("/journal/"
 * in `post-sitemap.xml` makes "Journal").
 *
 * Names are in words (`content-hub` becomes "Content hub"); a type is
 * guessed from them. Pages at the top level that no file or folder of their
 * own groups — a website's service pages — are left for a person to classify.
 * Plain code, no Convex: the admin's Suggest classifications writes what it
 * returns (`pageClassifications.ts`).
 */

/** Pages a first-level folder must hold to be suggested as a section of its own. */
export const FOLDER_PAGES = 3;

export type SuggestedLine = { kind: "STARTS_WITH" | "SITEMAP_FILE"; value: string };
export type SuggestedClassification = { name: string; type: ClassificationType; lines: SuggestedLine[]; pages: number };

/** A classification's name, at most this long (as `pageClassifications.ts` keeps it). */
const NAME_LENGTH = 60;

/** Sitemap files that list a bit of everything: a section of nothing in particular. */
const GENERIC_FILE_WORDS = new Set(["page", "pages", "sitemap", "main", "index", "misc", "general", "default", "root", "home", "static", "site", "standard", "wp"]);

/** Folders a website keeps files and machinery in, never a section of its pages. */
const TECHNICAL_FOLDERS = new Set([
  "wp-content", "wp-includes", "wp-admin", "wp-json", "cdn-cgi", "feed", "assets", "static", "uploads", "images", "img", "css", "js",
  "_next", "page", "amp", "search", "cart", "checkout", "my-account", "login", "account",
]);

/** Words that say a kind of section, Anthony's list (2026-10-03): the first match decides the type. */
const TYPE_WORDS: ReadonlyArray<{ type: ClassificationType; words: readonly string[] }> = [
  // An archive of other pages — by category, tag or author — is none of them, whatever else its name says.
  { type: "OTHER", words: ["category", "categories", "tag", "tags", "author", "authors", "archive", "archives"] },
  { type: "CASE_STUDY", words: ["case", "work", "portfolio"] },
  { type: "INFORMATIONAL", words: ["hub", "blog", "insights", "news", "journal", "post", "article"] },
  { type: "PRODUCT", words: ["product", "shop", "store"] },
  { type: "LEGAL", words: ["privacy", "cookies", "cookie", "terms", "legal"] },
];

/** Words a section is named in the plural by: "post" makes "Posts", "case study" "Case studies". */
const COUNTED = new Set([
  "post", "article", "product", "project", "story", "study", "event", "service", "insight", "guide", "review", "job",
  "location", "recipe", "course", "episode", "testimonial", "video", "podcast", "resource", "user", "author", "member",
  "category", "tag", "webinar", "report", "client",
]);

/** A word as its singular, near enough to match a word list: "studies" → "study", "posts" → "post". */
function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function plural(word: string): string {
  if (!COUNTED.has(word)) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** Words as a name: the first capitalised, the last counted in the plural where it counts things. */
function nameFrom(words: readonly string[]): string {
  const said = words.map((word, index) => (index === words.length - 1 ? plural(word) : word));
  const name = said.join(" ");
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, NAME_LENGTH);
}

const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** A sitemap file's own words: `case_study-sitemap.xml` → ["case", "study"]; `wp-sitemap-posts-post-1.xml` → ["post"]. */
export function fileWords(file: string): string[] {
  const bare = file.toLowerCase().split(/[?#]/)[0].replace(/(\.xml)?(\.gz)?$/, "");
  let words = wordsOf(bare).filter((word) => !/^\d+$/.test(word)).map((word) => word.replace(/^sitemap\d*$/, "sitemap"));
  // WordPress's own sitemaps: wp-sitemap-posts-post-1, wp-sitemap-taxonomies-category-1, wp-sitemap-users-1.
  if (words[0] === "wp" && words[1] === "sitemap" && words.length > 3) words = words.slice(3);
  return words.filter((word) => word !== "sitemap" && word !== "wp");
}

/** Whether a file lists a bit of everything (`page-sitemap.xml`, `sitemap.xml`), so is no section of its own. */
export function isGenericFile(file: string): boolean {
  return fileWords(file).every((word) => GENERIC_FILE_WORDS.has(word));
}

/** The type a section's words suggest; Other when none says. */
export function guessType(words: readonly string[]): ClassificationType {
  const said = new Set(words.flatMap((word) => [word, singular(word)]));
  return TYPE_WORDS.find((entry) => entry.words.some((word) => said.has(word)))?.type ?? "OTHER";
}

const segmentsOf = (page: string) => page.split("/").filter(Boolean);

/** The first-level folder a page sits in, or null for a page at the top level. */
function folderOf(page: string): string | null {
  const segments = segmentsOf(page);
  return segments.length >= 2 ? segments[0] : null;
}

/** A folder worth a section: its name is words, not a host or a file, and it is not machinery. */
const isSectionFolder = (folder: string) => !TECHNICAL_FOLDERS.has(folder) && !folder.includes(".") && /[a-z]/.test(folder);

/**
 * The suggested classifications for a website's pages, the most pages
 * first: names in words, a guessed type, and the lines that catch each.
 */
export function suggestClassifications(pages: ReadonlyArray<{ page: string; sitemapFile: string | null }>): SuggestedClassification[] {
  const all = pages.map((entry) => ({ page: normalisePage(entry.page), file: entry.sitemapFile }));
  const caught = (prefix: string) => all.filter((entry) => entry.page.startsWith(prefix)).length;

  // First-level folders and the pages each holds — the folder's own page among them, as its "starts with" line catches it.
  const folders = new Map<string, number>();
  for (const entry of all) {
    const folder = folderOf(entry.page);
    if (folder !== null && isSectionFolder(folder) && !folders.has(folder)) folders.set(folder, caught(`/${folder}/`));
  }
  const sectionFolders = new Set([...folders].filter(([, count]) => count >= FOLDER_PAGES).map(([folder]) => folder));

  // Sitemap files of their own, those differing only by a number together.
  const files = new Map<string, { words: string[]; names: Set<string>; pages: string[] }>();
  for (const entry of all) {
    if (!entry.file || isGenericFile(entry.file)) continue;
    const words = fileWords(entry.file);
    const key = words.join(" ");
    const held = files.get(key) ?? { words, names: new Set<string>(), pages: [] };
    held.names.add(entry.file.toLowerCase());
    held.pages.push(entry.page);
    files.set(key, held);
  }

  const suggested: SuggestedClassification[] = [];
  const usedFolders = new Set<string>();
  for (const file of files.values()) {
    // The folder most of its pages sit in: the file's own folder when every page but a listing page does.
    const counts = new Map<string, number>();
    for (const page of file.pages) {
      const folder = folderOf(page);
      if (folder !== null) counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
    const [folder, inFolder] = [...counts].sort((left, right) => right[1] - left[1])[0] ?? [null, 0];
    if (folder !== null && isSectionFolder(folder) && !usedFolders.has(folder) && inFolder >= 2 && inFolder >= file.pages.length - 1) {
      usedFolders.add(folder);
      suggested.push({ name: nameFrom(file.words), type: guessType([...file.words, ...wordsOf(folder)]), lines: [{ kind: "STARTS_WITH", value: `/${folder}/` }], pages: caught(`/${folder}/`) });
      continue;
    }
    // Spread across the top level: caught by the file, named by its own listing page when it lists one ("/journal/").
    // A listing page is short — a word or two, one of them a word of a kind — never a post that mentions one.
    const listing = file.pages.filter((page) => {
      const segments = segmentsOf(page);
      if (segments.length !== 1) return false;
      const words = wordsOf(segments[0]);
      return words.length <= 2 && words.some((word) => !["OTHER", "LEGAL"].includes(guessType([word])));
    });
    const words = listing.length === 1 ? wordsOf(segmentsOf(listing[0])[0]) : file.words;
    suggested.push({
      name: nameFrom(words),
      type: guessType([...words, ...file.words]),
      lines: [...file.names].sort().map((name) => ({ kind: "SITEMAP_FILE" as const, value: name })),
      pages: file.pages.length,
    });
  }

  // The folders left: those ending in the same word of a kind are one section, named by it; the rest one each.
  const left = [...sectionFolders].filter((folder) => !usedFolders.has(folder)).sort();
  const byLastWord = new Map<string, string[]>();
  for (const folder of left) {
    const last = wordsOf(folder).at(-1) ?? folder;
    byLastWord.set(last, [...(byLastWord.get(last) ?? []), folder]);
  }
  for (const folder of left) {
    const last = wordsOf(folder).at(-1) ?? folder;
    const together = byLastWord.get(last) ?? [folder];
    if (together.length >= 2 && guessType([last]) !== "OTHER") {
      if (together[0] !== folder) continue;
      suggested.push({
        name: nameFrom([last]),
        type: guessType(together.flatMap(wordsOf)),
        lines: together.map((each) => ({ kind: "STARTS_WITH" as const, value: `/${each}/` })),
        pages: together.reduce((sum, each) => sum + caught(`/${each}/`), 0),
      });
      continue;
    }
    suggested.push({ name: nameFrom(wordsOf(folder)), type: guessType(wordsOf(folder)), lines: [{ kind: "STARTS_WITH", value: `/${folder}/` }], pages: caught(`/${folder}/`) });
  }

  // One suggestion a name: a second of the same name is left for a person.
  const named = new Set<string>();
  return suggested
    .sort((left, right) => right.pages - left.pages || left.name.localeCompare(right.name))
    .filter((entry) => {
      const key = entry.name.toLowerCase();
      if (named.has(key) || key === "not sorted") return false;
      named.add(key);
      return true;
    });
}
