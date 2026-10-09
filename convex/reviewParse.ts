import { GOOGLE_REVIEWS_OPERATION, TRUSTPILOT_REVIEWS_OPERATION } from "./dataForSeoReviewOperations";
import { itemsOf } from "./localParse";

/**
 * Reading Google's, Trustpilot's and Tripadvisor's reviews into one shape
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 2). Pure,
 * tested against the answers bought on 2026-10-09.
 *
 * **Words from the open web, kept on purpose**: a review's text and its
 * reviewer's name, for a company's own listings only (D4) — shown on its own
 * Your reviews page and read by its own AI to draft a reply, as quoted
 * material, never as an instruction. Rivals' reviews keep their stars, dates
 * and replies alone; filing drops the rest (`localReviews.ts`).
 */

export type ParsedReview = {
  /** The review's own number there: what files it once, however often it is read. */
  id: string;
  day: string;
  stars: number;
  text?: string;
  name?: string;
  /** A Google Local Guide. */
  guide?: boolean;
  /** When the owner replied, where they did. */
  replyDay?: string;
  /**
   * The reply's day is known only to the month or year: Google dates a reply
   * from its "a year ago", so `replyDay` is then today less a year (seen on
   * 2026-10-09). It still says the review was answered, never how fast.
   */
  replyRough?: boolean;
};

/** Most of a review's words kept: a long review's first few paragraphs. */
const TEXT_KEPT = 1_500;

type Item = Record<string, unknown>;
const asItem = (value: unknown): Item | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Item) : null);
const asText = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const dayOf = (value: unknown): string | undefined => {
  const day = asText(value)?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
};
const starsOf = (item: Item): number | undefined => {
  const value = asItem(item.rating)?.value;
  return typeof value === "number" && value >= 1 && value <= 5 ? Math.round(value) : undefined;
};

/** Google's "a year ago", "3 months ago": a reply dated only to the month or year. */
const ROUGHLY = /\b(month|months|year|years)\b/i;

/** The day the owner first replied: its own date, or the review's where the reply carries none — never before the review. */
function replyDayOf(item: Item, day: string): string | undefined {
  const owner = dayOf(item.owner_timestamp);
  if (owner) return owner < day ? day : owner;
  if (asText(item.owner_answer)) return day;
  const responses = Array.isArray(item.responses) ? item.responses.map(asItem).filter((entry): entry is Item => entry !== null) : [];
  if (responses.length === 0) return undefined;
  return responses.map((entry) => dayOf(entry.timestamp)).filter((value): value is string => Boolean(value)).sort()[0] ?? day;
}

/** One answer's reviews, newest first, each once. */
export function parseReviews(operationId: string, result: unknown): ParsedReview[] {
  const seen = new Set<string>();
  const reviews: ParsedReview[] = [];
  for (const item of itemsOf(result)) {
    const id = operationId === TRUSTPILOT_REVIEWS_OPERATION
      ? asText(item.url)?.split("/").filter(Boolean).pop()
      : asText(item.review_id);
    const day = dayOf(item.timestamp);
    const stars = starsOf(item);
    if (!id || !day || stars === undefined || seen.has(id)) continue;
    seen.add(id);
    const title = operationId === GOOGLE_REVIEWS_OPERATION ? undefined : asText(item.title);
    const body = asText(item.review_text);
    const text = [title, body].filter(Boolean).join(". ").slice(0, TEXT_KEPT) || undefined;
    const profile = asItem(item.user_profile);
    const name = operationId === GOOGLE_REVIEWS_OPERATION ? asText(item.profile_name) : asText(profile?.name);
    const replyDay = replyDayOf(item, day);
    const replyRough = Boolean(replyDay && dayOf(item.owner_timestamp) && ROUGHLY.test(asText(item.owner_time_ago) ?? ""));
    reviews.push({
      id,
      day,
      stars,
      ...(text ? { text } : {}),
      ...(name ? { name } : {}),
      ...(operationId === GOOGLE_REVIEWS_OPERATION && item.local_guide === true ? { guide: true } : {}),
      ...(replyDay ? { replyDay } : {}),
      ...(replyRough ? { replyRough } : {}),
    });
  }
  return reviews.sort((left, right) => right.day.localeCompare(left.day));
}

/** How many reviews the listing has in all, where the answer says. */
export function reviewsCountOf(result: unknown): number | undefined {
  const first = asItem(Array.isArray(result) ? result[0] : result);
  const count = first?.reviews_count;
  return typeof count === "number" && count >= 0 ? count : undefined;
}
