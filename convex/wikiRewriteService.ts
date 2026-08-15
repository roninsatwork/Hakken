/**
 * The rewrite loop's pure half: what the model is asked, and what its answer
 * must satisfy before it is allowed to become the page.
 *
 * The contract (self-improving-wiki-plan.md, acceptance 1-3): a rewrite folds
 * the new event into the page — replacing changed facts, pruning stale ones —
 * and comes back whole, bounded, and plain. Pinned human corrections are not
 * in the model's text at all: they are their own layer, appended by
 * `renderPageForReading` wherever a page is read, so no rewrite can lose them.
 */

/** A page is a briefing note, not a document. */
export const WIKI_PAGE_MAX_CHARS = 4_000;

/** How much of a transcript or email exchange one rewrite may consider. */
export const WIKI_EVENT_TEXT_MAX_CHARS = 8_000;

export type WikiPinnedCorrection = { text: string; pinnedAt: number };

export function buildRewriteSystemInstruction(): string {
  return [
    "You maintain one page of a company's wiki. The page is a short briefing note a colleague reads before a call.",
    "You will be given the page as it stands, any pinned corrections from staff, one new event or document, and a list of the wiki's other pages.",
    "Rewrite the whole page in the light of the event:",
    "- Fold in what is new and worth remembering about this subject.",
    "- A fact that changed is REPLACED, never listed twice. Remove what is now stale.",
    "- Never contradict a pinned correction; treat pinned corrections as ground truth. Do not repeat them in the page.",
    "- Where a sentence genuinely touches another page from the list, reference it inline as [[its-exact-name]] — the way a wiki cross-references. Two to four such references is typical; never force one, and never reference a page not on the list.",
    "- Keep facts, drop chit-chat. Plain sentences, no headings, no preamble.",
    `- At most ${WIKI_PAGE_MAX_CHARS} characters. Shorter than the old page is better than longer, when nothing new matters.`,
    "Reply with the complete new page text and nothing else. If the event adds nothing worth keeping, reply with the old page unchanged.",
  ].join("\n");
}

export function buildRewriteUserContent(args: {
  title: string;
  currentContent: string;
  pinnedCorrections: WikiPinnedCorrection[];
  eventLabel: string;
  eventText: string;
  /** Names of other pages the writing may [[reference]] — topic pages only,
   * so a customer's name is never woven into prose an anonymous surface can
   * read. */
  otherPages?: string[];
}): string {
  const pinnedBlock = args.pinnedCorrections.length
    ? `Pinned corrections from staff (ground truth, do not contradict, do not repeat):\n${args.pinnedCorrections
        .map((correction) => `- ${correction.text}`)
        .join("\n")}\n\n`
    : "";
  const currentBlock = args.currentContent.trim()
    ? `The page as it stands:\n${args.currentContent}\n\n`
    : "This page is new; there is no text yet.\n\n";
  const otherPagesBlock = args.otherPages?.length
    ? `Other pages on this wiki (reference as [[name]] only where genuinely related):\n${args.otherPages
        .slice(0, 150)
        .join(", ")}\n\n`
    : "";
  return (
    `Page: ${args.title}\n\n` +
    pinnedBlock +
    currentBlock +
    otherPagesBlock +
    `New material — ${args.eventLabel}:\n${args.eventText.slice(0, WIKI_EVENT_TEXT_MAX_CHARS)}`
  );
}

/** The [[references]] a page's own text makes, as normalised slugs. */
export function extractWikiLinkSlugs(content: string): string[] {
  const slugs = new Set<string>();
  for (const match of content.matchAll(/\[\[([^\[\]]{1,60})\]\]/g)) {
    const slug = normaliseTopicSlug(match[1]);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

export type RewriteVerdict =
  | { ok: true; content: string }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * What a model answer must satisfy to become the page. Length is clamped
 * rather than refused only when barely over; a wildly over-long answer is
 * refused outright, because it means the model appended instead of rewrote.
 */
export function validateRewrittenPage(raw: string): RewriteVerdict {
  const content = raw.trim();
  if (!content) return { ok: false, reason: "empty" };
  if (content.length > WIKI_PAGE_MAX_CHARS * 2) return { ok: false, reason: "too_long" };
  return { ok: true, content: content.slice(0, WIKI_PAGE_MAX_CHARS) };
}

/**
 * The one way a page becomes text for a reader — model or human. The
 * machine-tended body first, then the pinned layer, appended in code so no
 * rewrite, sweep, or prompt failure can ever drop a human correction.
 */
export function renderPageForReading(page: {
  title: string;
  content: string;
  pinnedCorrections: WikiPinnedCorrection[];
}): string {
  const pinned = page.pinnedCorrections.length
    ? `\n\nCorrections from staff (authoritative):\n${page.pinnedCorrections
        .map((correction) => `- ${correction.text}`)
        .join("\n")}`
    : "";
  return `Customer page: ${page.title}\n\n${page.content}${pinned}`;
}

/** Normalised email for matching a sender to a customer record. */
export function normaliseEmail(value: string | undefined | null): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

// ---------------------------------------------------------------------------
// Topic pages (wiki plan, phase 5): what a conversation teaches beyond the
// customer — a product, a policy, a recurring issue. The model names them;
// these helpers keep the names honest and the count bounded.
// ---------------------------------------------------------------------------

export const WIKI_TOPIC_KINDS = ["PRODUCT", "POLICY", "ISSUE"] as const;
export type WikiTopicKind = (typeof WIKI_TOPIC_KINDS)[number];

/** At most this many topic pages learn from one conversation. */
export const WIKI_TOPICS_PER_EVENT = 2;

/** One naming rule, so "Delivery Times" and "delivery-times" are one page. */
export function normaliseTopicSlug(value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length >= 3 ? slug : null;
}

export function buildTopicSuggestionInstruction(): string {
  return [
    "You read one customer conversation and decide whether it taught something durable about the COMPANY itself — not about the customer.",
    "Three kinds count: PRODUCT (something the company sells or does), POLICY (how the company works — hours, delivery, returns, invoicing), ISSUE (a problem or question that keeps coming up).",
    `Reply with strict JSON, nothing else: {"topics": [{"kind": "PRODUCT"|"POLICY"|"ISSUE", "slug": string, "learned": string}]} — at most ${WIKI_TOPICS_PER_EVENT} topics, and an empty list is the right answer for most conversations.`,
    "slug is a short kebab-case name for the topic (e.g. \"winter-linen-contracts\"). learned is one or two plain sentences stating what this conversation established about it.",
    "Only include a topic when the conversation genuinely established something a colleague would write down. Small talk, one-off details, and things about the customer alone are not topics.",
  ].join("\n");
}

export type TopicSuggestion = { kind: WikiTopicKind; slug: string; learned: string };

/** The model's JSON, distrusted: bad kinds, bad slugs, and excess are dropped. */
export function parseTopicSuggestions(raw: string): TopicSuggestion[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  let parsed: { topics?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { topics?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.topics)) return [];
  const suggestions: TopicSuggestion[] = [];
  for (const entry of parsed.topics) {
    if (suggestions.length >= WIKI_TOPICS_PER_EVENT) break;
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { kind?: unknown; slug?: unknown; learned?: unknown };
    if (!WIKI_TOPIC_KINDS.includes(candidate.kind as WikiTopicKind)) continue;
    if (typeof candidate.slug !== "string" || typeof candidate.learned !== "string") continue;
    const slug = normaliseTopicSlug(candidate.slug);
    const learned = candidate.learned.trim();
    if (!slug || !learned) continue;
    suggestions.push({ kind: candidate.kind as WikiTopicKind, slug, learned });
  }
  return suggestions;
}

/** How a link names its target page: "KIND:subjectKey". */
export function linkKeyFor(kind: string, subjectKey: string): string {
  return `${kind}:${subjectKey}`;
}

// ---------------------------------------------------------------------------
// The distiller (wiki-replaces-knowledge plan, stage one): a document in,
// topic pages out. Importing IS how the wiki learns — these helpers are used
// by the on-ready hook and the one-time catch-up alike, never by a button.
// ---------------------------------------------------------------------------

/** A document may establish more than a conversation; still bounded. */
export const WIKI_TOPICS_PER_DOCUMENT = 3;

export function buildDocumentTopicInstruction(): string {
  return [
    "You read one company knowledge document and name the durable topics it establishes about the company.",
    "Three kinds count: PRODUCT (something the company sells or does), POLICY (how the company works — hours, delivery, returns, invoicing, guarantees), ISSUE (a problem or question the document exists to answer).",
    `Reply with strict JSON, nothing else: {"topics": [{"kind": "PRODUCT"|"POLICY"|"ISSUE", "slug": string, "learned": string}]} — at most ${WIKI_TOPICS_PER_DOCUMENT} topics, and an empty list is right for pages that establish nothing durable (navigation, legal boilerplate, news).`,
    "slug is a short kebab-case name (e.g. \"sports-hall-flooring\"). Reuse the obvious name for the subject rather than inventing a new variant — the wiki keeps one page per subject.",
    "learned is two or three plain sentences stating what the document establishes about the topic — the facts a colleague would keep, not a summary of the writing.",
  ].join("\n");
}

/** The model's document-topic JSON, distrusted like every other. */
export function parseDocumentTopicSuggestions(raw: string): TopicSuggestion[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  let parsed: { topics?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { topics?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.topics)) return [];
  const suggestions: TopicSuggestion[] = [];
  for (const entry of parsed.topics) {
    if (suggestions.length >= WIKI_TOPICS_PER_DOCUMENT) break;
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { kind?: unknown; slug?: unknown; learned?: unknown };
    if (!WIKI_TOPIC_KINDS.includes(candidate.kind as WikiTopicKind)) continue;
    if (typeof candidate.slug !== "string" || typeof candidate.learned !== "string") continue;
    const slug = normaliseTopicSlug(candidate.slug);
    const learned = candidate.learned.trim();
    if (!slug || !learned) continue;
    suggestions.push({ kind: candidate.kind as WikiTopicKind, slug, learned });
  }
  return suggestions;
}

/** The stage-three switch, read one way everywhere: absent means the wiki
 * answers (wiki-replaces-knowledge plan); false is the escape hatch. */
export function companyAnswersFromWiki(
  company: { answersFromWiki?: boolean } | null | undefined
): boolean {
  return company?.answersFromWiki ?? true;
}

/** The source string a rewrite carries, decomposed for the receipts list. */
export function parseSourceKey(
  source: string
): { kind: "DOCUMENT" | "PHONE_CALL" | "EMAIL" | "HUMAN"; ref: string } | null {
  const separator = source.indexOf(":");
  if (separator <= 0) return null;
  const kind = source.slice(0, separator);
  const ref = source.slice(separator + 1);
  if (!ref) return null;
  if (kind === "DOCUMENT" || kind === "PHONE_CALL" || kind === "EMAIL" || kind === "HUMAN") {
    return { kind, ref };
  }
  return null;
}
