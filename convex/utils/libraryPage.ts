import { KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS } from "../knowledgeImportPolicy";
import { metadataText, type PageMetadata } from "./pageMetadata";

/**
 * What Admin → Content → Library makes of a page Firecrawl read
 * (docs/plans/active/content-library-plan.md, L4): its words, and the details
 * its meta tags give — the title, publication, author, dates, summary and
 * language — each left blank when the page does not say. Pure, so it is
 * tested without Firecrawl.
 */

/** An article's words, in characters: the knowledge importer's ceiling, about 15,000 words. */
export const LIBRARY_MAX_BODY_LENGTH = KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS;
/** Fewer words than this is a sign-in, subscription or cookie box, not an article (L6). */
export const LIBRARY_MIN_WORDS = 120;
export const LIBRARY_MAX_TITLE_LENGTH = 300;
export const LIBRARY_MAX_NAME_LENGTH = 160;
export const LIBRARY_MAX_DESCRIPTION_LENGTH = 600;
/** Hakken's summary for readers (insights-helpful-content-plan.md, IH2): two or three sentences. */
export const LIBRARY_MAX_SUMMARY_LENGTH = 600;
/** "What it means for you" (IH2). */
export const LIBRARY_MAX_MEANING_LENGTH = 400;

/** A page as the Library form takes it. */
export type LibraryPage = {
  title: string;
  publication: string;
  author?: string;
  publishedOn?: string;
  updatedOn?: string;
  description?: string;
  language?: string;
  body: string;
  words: number;
  /** The page ran past `LIBRARY_MAX_BODY_LENGTH` and was cut there. */
  cut: boolean;
};

/** How many words a text holds: runs of letters or digits, so Markdown's marks and a link's address count for nothing. */
export function countWords(text: string): number {
  const withoutAddresses = text.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ");
  return withoutAddresses.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/**
 * One address per article (L2): the same page however it was pasted — no
 * `#section`, no slash at the end of its path, the host in lower case.
 */
export function libraryUrlKey(url: string): string {
  const parsed = new URL(url.trim());
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

/** A calendar day, "YYYY-MM-DD", from however a page writes its date; undefined for none or nonsense. */
export function dayFrom(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // "2026-09-18T23:30:00+01:00" is the 18th where it was written, whatever the clock here says.
  const written = /^(\d{4}-\d{2}-\d{2})(?![\d])/.exec(value.trim())?.[1];
  const at = Date.parse(written ? `${written}T00:00:00Z` : value);
  if (Number.isNaN(at)) return undefined;
  // Anything else ("18 September 2026") is read as a day on this clock, so its own parts are the day.
  const date = new Date(at);
  const pad = (part: number) => String(part).padStart(2, "0");
  const day = written ?? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  // A year a page could really have been written in.
  const year = Number(day.slice(0, 4));
  return year >= 1990 && year <= 2100 ? day : undefined;
}

/** The website's own name, else its address without "www.". */
export function publicationFrom(metadata: PageMetadata, url: string): string {
  const named = metadataText(metadata, "ogSiteName", "og:site_name", "application-name", "publisher");
  if (named) return named.slice(0, LIBRARY_MAX_NAME_LENGTH);
  return new URL(url).hostname.replace(/^www\./, "");
}

/** A page's title without its website's name tacked on: "AI features and your website | Google Search Central". */
export function titleWithoutSite(title: string, publication: string): string {
  const site = publication.trim().toLowerCase();
  for (const mark of [" | ", " – ", " — ", " - ", " · ", " :: "]) {
    const at = title.lastIndexOf(mark);
    if (at > 0 && title.slice(at + mark.length).trim().toLowerCase() === site) return title.slice(0, at).trim();
  }
  return title.trim();
}

/** A person's name, never a profile's address (`article:author` is often a Facebook link). */
function authorFrom(metadata: PageMetadata): string | undefined {
  const author = metadataText(metadata, "author", "article:author", "dc.creator", "dcCreator", "parsely-author", "sailthru.author");
  if (!author || /^https?:\/\//i.test(author)) return undefined;
  return author.slice(0, LIBRARY_MAX_NAME_LENGTH);
}

/** "en_GB" (Open Graph) and "en-GB" alike, as a language tag. */
function languageFrom(metadata: PageMetadata): string | undefined {
  const language = metadataText(metadata, "language", "og:locale", "ogLocale");
  if (!language) return undefined;
  const tag = language.replace("_", "-").split(/[,;\s]/)[0];
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(tag) ? tag : undefined;
}

/** The Library's share of one answer (L11), in characters: three sections and the wrapper round them. */
export const LIBRARY_CONTEXT_MAX_CHARS = 9_000 + 1_000;

/** The longest section Ask Hakken reads of an article (L11), in characters. */
export const LIBRARY_SECTION_LENGTH = 3_000;
/** The most sections one article is cut into: room for the longest article. */
export const LIBRARY_MAX_SECTIONS = 60;

export type LibrarySection = { heading: string; text: string };

/** A run of text cut at paragraphs, then lines, into pieces no longer than `max`. */
function piecesOf(text: string, max: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n/)) {
    const block = paragraph.trim();
    if (!block) continue;
    const joined = current ? `${current}\n\n${block}` : block;
    if (joined.length <= max) {
      current = joined;
      continue;
    }
    if (current) pieces.push(current);
    // One paragraph longer than a section: cut it where it must.
    let rest = block;
    while (rest.length > max) {
      const at = Math.max(rest.lastIndexOf(" ", max), Math.floor(max / 2));
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    current = rest;
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Headings over a list of other pages rather than words of the article's own (IH9). */
const REFERENCE_HEADING = /^(references?|sources?|citations?|bibliography|footnotes|notes and references|further reading|see also|read more|related( articles| posts| reading| links| content)?|more (articles|posts|reading|from .+)|links?|useful links|resources)\s*:?$/i;
/** A line that is little but a link: a list of other pages, not something the article says. */
const LINK_LINE_MAX_WORDS = 12;

function isLinkLine(line: string): boolean {
  if (!/\]\([^)]*\)|https?:\/\//.test(line)) return false;
  const words = line.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length <= LINK_LINE_MAX_WORDS;
}

/**
 * A section Ask Hakken should not read (insights-helpful-content-plan.md,
 * IH9): a reference list by its heading, or one whose lines are mostly links
 * — the pages the article points to, not what it says.
 */
export function isReferenceSection(heading: string, text: string): boolean {
  if (REFERENCE_HEADING.test(heading.trim())) return true;
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return lines.filter(isLinkLine).length / lines.length > 0.5;
}

/**
 * An article cut at its headings into the sections Ask Hakken searches
 * (L11): each starts with its heading, so it reads on its own, and none is
 * longer than `LIBRARY_SECTION_LENGTH`. Reference lists and sections made
 * mostly of links are left out (IH9).
 */
export function librarySections(title: string, body: string): LibrarySection[] {
  const sections: LibrarySection[] = [];
  let heading = title;
  let lines: string[] = [];
  const flush = () => {
    const words = lines.join("\n");
    if (isReferenceSection(heading, words)) {
      lines = [];
      return;
    }
    for (const piece of piecesOf(words, LIBRARY_SECTION_LENGTH - heading.length - 1)) {
      sections.push({ heading, text: `${heading}\n${piece}` });
    }
    lines = [];
  };
  for (const line of body.split("\n")) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1].replace(/(\*\*|__|`)/g, "").slice(0, 200);
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections.slice(0, LIBRARY_MAX_SECTIONS);
}

/** Words too common to tell one article from another. */
const COMMON_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this", "that", "from", "have", "has", "was", "were", "will",
  "can", "how", "what", "why", "when", "who", "which", "does", "did", "should", "would", "could", "about", "into", "they",
  "them", "their", "there", "our", "its", "it's", "any", "all", "more", "most", "some", "than", "then", "also", "just", "get",
]);
/** Convex reads the first 16 words of a search. */
export const LIBRARY_SEARCH_TERMS = 16;

/** A question's distinctive words, in order, at most `LIBRARY_SEARCH_TERMS`: what the Library is searched by. */
export function librarySearchTerms(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const terms: string[] = [];
  for (const word of words) {
    if (word.length < 3 || COMMON_WORDS.has(word) || terms.includes(word)) continue;
    terms.push(word);
    if (terms.length === LIBRARY_SEARCH_TERMS) break;
  }
  return terms;
}

/** How many of the terms a section holds: a section sharing one common word with a question is not about it. */
export function termsFound(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term)).length;
}

/** A page Firecrawl read, as the Library form takes it. */
/** What an article's structured data is called: the article itself first, a plain web page last. */
const ARTICLE_TYPES = ["Article", "BlogPosting", "NewsArticle", "TechArticle", "Report", "ScholarlyArticle", "WebPage"];

/** Every object in a JSON-LD value, through @graph and arrays. */
function structuredNodes(value: unknown, into: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(value)) for (const item of value) structuredNodes(item, into);
  else if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    into.push(node);
    if (node["@graph"]) structuredNodes(node["@graph"], into);
  }
  return into;
}

/**
 * An article's published and updated days from its page's structured data
 * (insights-helpful-content-plan.md, IH10): the article's own node — never a
 * work it cites, which carries dates of its own — the article types before a
 * plain web page.
 */
export function datesFromStructuredData(blocks: string[]): { publishedOn?: string; updatedOn?: string } {
  const nodes: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    try {
      structuredNodes(JSON.parse(block), nodes);
    } catch {
      // A block that is not JSON is the page's mistake; the others still count.
    }
  }
  const rank = (node: Record<string, unknown>) => {
    const types = ([] as unknown[]).concat(node["@type"] ?? []).map(String);
    const ranks = types.map((type) => ARTICLE_TYPES.indexOf(type)).filter((at) => at >= 0);
    return ranks.length ? Math.min(...ranks) : -1;
  };
  const article = nodes
    .filter((node) => rank(node) >= 0 && (node.datePublished || node.dateModified))
    .sort((left, right) => rank(left) - rank(right))[0];
  if (!article) return {};
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return { publishedOn: dayFrom(text(article.datePublished)), updatedOn: dayFrom(text(article.dateModified)) };
}

export function libraryPageFrom(markdown: string, metadata: PageMetadata, url: string, structuredData: string[] = []): LibraryPage {
  const publication = publicationFrom(metadata, url);
  const rawTitle = metadataText(metadata, "ogTitle", "og:title", "title") ?? "";
  const text = markdown.trim();
  const cut = text.length > LIBRARY_MAX_BODY_LENGTH;
  const body = cut ? text.slice(0, LIBRARY_MAX_BODY_LENGTH) : text;
  const description = metadataText(metadata, "description", "ogDescription", "og:description");
  const fromData = datesFromStructuredData(structuredData);
  return {
    title: titleWithoutSite(rawTitle, publication).slice(0, LIBRARY_MAX_TITLE_LENGTH),
    publication,
    author: authorFrom(metadata),
    // The meta tags first; the page's structured data when they say nothing (IH10).
    publishedOn: dayFrom(metadataText(metadata, "publishedTime", "article:published_time", "datePublished", "dcTermsCreated", "parsely-pub-date", "date")) ?? fromData.publishedOn,
    updatedOn: dayFrom(metadataText(metadata, "modifiedTime", "article:modified_time", "dateModified", "og:updated_time")) ?? fromData.updatedOn,
    description: description?.slice(0, LIBRARY_MAX_DESCRIPTION_LENGTH),
    language: languageFrom(metadata),
    body,
    words: countWords(body),
    cut,
  };
}
