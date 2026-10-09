import { AI_MODE_ENGINE, aiCitationOperationId } from "./seoAiEngines";

/**
 * Reading an answer as a person saw it (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 3, D5): the two apps (`APP_ENGINES`) and Google
 * AI Mode, into the shape the models' answers are filed in
 * (`parseLlmResponse`), plus what only an app shows — the businesses it put on
 * screen, the pages it read and the searches it ran. Pure, tested against the
 * answers bought on 2026-10-09.
 *
 * Words from the open web: the answer is kept word for word for 90 days, as
 * the models' are; a business's name and address as the app showed them.
 */

export type ShownBusiness = { name: string; host?: string; rating?: number; reviews?: number; address?: string };

export type ShownAnswer = {
  answer: string;
  sources: Array<{ url: string; title?: string }>;
  fanOutQueries: string[];
  businesses: ShownBusiness[];
  read: string[];
};

type Item = Record<string, unknown>;
const asItem = (value: unknown): Item | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Item) : null);
const asList = (value: unknown): Item[] => (Array.isArray(value) ? value.map(asItem).filter((entry): entry is Item => entry !== null) : []);
const asText = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const asCount = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/** Businesses kept from one answer's cards. */
const BUSINESSES_KEPT = 20;
/** Pages kept of those it read. */
const READ_KEPT = 50;

/** Images and the app's own link marks out of the words: what is left reads as the answer did. */
export function plainAnswer(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Google's numbered marks, "[[1]](…)", and the apps' source chips, "[evince.uk](…)": marks, not words.
    .replace(/\[\[\d+\]\]\([^)]*\)/g, "")
    .replace(/\[([^\]\s]+\.[^\]\s]+)\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** An address without its tracking and fragment, so the same page read twice is one. */
function pageOf(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "force_isolation") parsed.searchParams.delete(key);
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function uniquePages(entries: Item[], urlOf: (entry: Item) => string | undefined): Array<{ url: string; title?: string }> {
  const seen = new Set<string>();
  const pages: Array<{ url: string; title?: string }> = [];
  for (const entry of entries) {
    const raw = urlOf(entry);
    if (!raw) continue;
    const url = pageOf(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    const title = asText(entry.title);
    pages.push({ url, ...(title ? { title } : {}) });
  }
  return pages;
}

function uniqueQueries(values: unknown): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const query = asText(value);
    if (!query || seen.has(query.toLowerCase())) continue;
    seen.add(query.toLowerCase());
    queries.push(query);
  }
  return queries;
}

/** One answer read from an app or Google AI Mode, by the operation that bought it. */
export function parseShownAnswer(operationId: string, result: unknown): ShownAnswer {
  const first = asItem(Array.isArray(result) ? result[0] : result) ?? {};
  const items = asList(first.items);

  if (operationId === aiCitationOperationId(AI_MODE_ENGINE)) {
    // Google AI Mode: one overview block, its words and the pages linked under it.
    const blocks = items.filter((item) => item.type === "ai_overview");
    const answer = plainAnswer(blocks.map((block) => asText(block.markdown) ?? "").filter(Boolean).join("\n\n"));
    const references = blocks.flatMap((block) => [...asList(block.references), ...asList(block.items).flatMap((element) => asList(element.references))]);
    // A reference to Google itself is a business's card on Google Maps, named by its title; the rest are pages.
    const onGoogle = (reference: Item) => hostOf(asText(reference.url)) === "google.com";
    const businesses: ShownBusiness[] = [];
    for (const reference of references.filter(onGoogle)) {
      const name = asText(reference.title);
      if (name && !businesses.some((held) => held.name === name)) businesses.push({ name });
    }
    return {
      answer,
      sources: uniquePages(references.filter((reference) => !onGoogle(reference)), (reference) => asText(reference.url)),
      fanOutQueries: [],
      businesses: businesses.slice(0, BUSINESSES_KEPT),
      read: [],
    };
  }

  // The apps: the words in order, the pages it cited, and — ChatGPT's only — the cards, the pages read and its searches.
  const words = items.filter((item) => typeof item.type === "string" && (item.type as string).endsWith("_text"));
  const answer = plainAnswer(words.map((item) => asText(item.markdown) ?? "").join("\n"));
  const cited = asList(first.sources).length > 0 ? asList(first.sources) : words.flatMap((item) => asList(item.sources));
  const businesses: ShownBusiness[] = [];
  for (const card of items.filter((item) => item.type === "chat_gpt_local_businesses").flatMap((item) => asList(item.items))) {
    const name = asText(card.title);
    if (!name || businesses.some((held) => held.name === name)) continue;
    const host = hostOf(asText(card.domain) ?? asText(card.url));
    const rating = asItem(card.rating);
    const stars = typeof rating?.value === "number" ? rating.value : undefined;
    const reviews = asCount(card.reviews_count) ?? asCount(rating?.votes_count);
    const address = asText(card.address);
    businesses.push({ name, ...(host ? { host } : {}), ...(stars !== undefined ? { rating: stars } : {}), ...(reviews !== undefined ? { reviews } : {}), ...(address ? { address } : {}) });
  }
  return {
    answer,
    sources: uniquePages(cited, (source) => asText(source.url)),
    fanOutQueries: uniqueQueries(first.fan_out_queries),
    businesses: businesses.slice(0, BUSINESSES_KEPT),
    read: uniquePages(asList(first.search_results), (page) => asText(page.url)).map((page) => page.url).slice(0, READ_KEPT),
  };
}
