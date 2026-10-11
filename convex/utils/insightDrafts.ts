import { v, type Infer } from "convex/values";

/**
 * Drafted fixes for what lives off the website (docs/plans/active/
 * insights-analyst-plan.md I23, phases 10 and 11, drawn as the VisLocal,
 * VisReviews and VisLinks boards): Business Profile posts, category, name and
 * description changes; a review request and replies to reviews waiting; and
 * an email to each site that links to rivals but not to the business. Each
 * carries a tagged link (I39), so Analytics' campaigns count the visits and
 * enquiries it brought and the Track record shows them beside it.
 *
 * Until Google approves Hakken's Business Profile access (I31) and while
 * nothing is emailed in alpha (I17), an approved draft is copied for the
 * person to paste or send themselves.
 */

export const DRAFT_AREAS = ["LOCAL", "REVIEWS", "LINKS"] as const;
export type DraftArea = (typeof DRAFT_AREAS)[number];

export const DRAFT_KINDS = ["CATEGORY", "NAME", "DESCRIPTION", "POST", "REVIEW_REQUEST", "REVIEW_REPLIES", "OUTREACH"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const AREA_OF: Record<DraftKind, DraftArea> = {
  CATEGORY: "LOCAL", NAME: "LOCAL", DESCRIPTION: "LOCAL", POST: "LOCAL",
  REVIEW_REQUEST: "REVIEWS", REVIEW_REPLIES: "REVIEWS",
  OUTREACH: "LINKS",
};

export const DRAFT_STATUSES = ["DRAFTED", "APPROVED", "DISMISSED"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const draftKindValidator = v.union(...DRAFT_KINDS.map((kind) => v.literal(kind)));
export const draftAreaValidator = v.union(...DRAFT_AREAS.map((area) => v.literal(area)));
export const draftStatusValidator = v.union(...DRAFT_STATUSES.map((status) => v.literal(status)));

/** One draft as the model writes it, before Hakken adds its link. */
export const draftedValidator = v.object({
  kind: draftKindValidator,
  /** What it is for: a profile's name, "Both profiles", a site's address. */
  target: v.string(),
  /** Why, in one short sentence. */
  why: v.string(),
  /** What it is, in a few words: "Add 'Artificial intelligence company' as a category". */
  title: v.string(),
  /** The words to paste or send. */
  body: v.string(),
  /** The page of the website it points to, a path; null for a draft with no link. */
  page: v.union(v.string(), v.null()),
});
export type Drafted = Infer<typeof draftedValidator>;

/** At most this many of each area's drafts a week. */
export const MOST_DRAFTS: Record<DraftArea, number> = { LOCAL: 4, REVIEWS: 2, LINKS: 8 };
/** A draft of the same kind for the same target isn't written again within this many days. */
export const REDRAFT_AFTER_DAYS = 60;

/** Where a tagged link's visits come from and how, as Analytics' campaigns read them (I39). */
const SOURCE: Record<DraftKind, { source: (target: string) => string; medium: string }> = {
  CATEGORY: { source: () => "google-business-profile", medium: "profile" },
  NAME: { source: () => "google-business-profile", medium: "profile" },
  DESCRIPTION: { source: () => "google-business-profile", medium: "profile" },
  POST: { source: () => "google-business-profile", medium: "post" },
  REVIEW_REQUEST: { source: () => "review-request", medium: "email" },
  REVIEW_REPLIES: { source: () => "google-business-profile", medium: "review-reply" },
  OUTREACH: { source: (target) => target.replace(/^www\./, ""), medium: "outreach" },
};

/** The campaign every Hakken draft's link carries: "hakken-" first, so the Track record finds them all. */
export function campaignOf(kind: DraftKind, week: string): string {
  return `hakken-${kind.toLowerCase().replaceAll("_", "-")}-${week}`;
}

/** A page of the website with the draft's tags, for Analytics' campaigns to count (I39). */
export function taggedLink(origin: string, page: string, kind: DraftKind, target: string, week: string): string {
  const path = page.startsWith("/") ? page : `/${page}`;
  const tags = new URLSearchParams({ utm_source: SOURCE[kind].source(target), utm_medium: SOURCE[kind].medium, utm_campaign: campaignOf(kind, week) });
  return `${origin}${path}${path.includes("?") ? "&" : "?"}${tags.toString()}`;
}

/** The drafts a model's answer holds, each checked; anything unreadable is left out. */
export function draftsFrom(raw: unknown, area: DraftArea, pages: readonly string[]): Drafted[] {
  const list = Array.isArray((raw as { drafts?: unknown })?.drafts) ? (raw as { drafts: unknown[] }).drafts : [];
  const text = (value: unknown, most: number) => (typeof value === "string" ? value.trim().slice(0, most) : "");
  return list.flatMap((entry) => {
    const draft = entry as Record<string, unknown>;
    const kind = DRAFT_KINDS.find((known) => known === draft.kind);
    if (!kind || AREA_OF[kind] !== area) return [];
    const body = text(draft.body, 3000);
    const title = text(draft.title, 160);
    if (!body || !title) return [];
    const page = typeof draft.page === "string" && pages.includes(draft.page) ? draft.page : null;
    return [{ kind, target: text(draft.target, 120) || "–", why: text(draft.why, 300), title, body, page }];
  }).slice(0, MOST_DRAFTS[area]);
}

/** How every draft is written: the business's own voice, nothing made up. */
export const DRAFT_RULES = [
  "You draft fixes a business will copy and use under its own name. Write in plain, warm British English, in the business's voice; never mention any software, AI or supplier.",
  "Never invent a figure, a client, a result, an award or a claim: use only what you are given. Leave a [square-bracketed gap] where the business must fill something in.",
  "Never write the word \"push\". Keep a post under 1,500 characters, a description under 750, an email under 150 words.",
  "Answer only with JSON: {\"drafts\": [{\"kind\": one of the kinds you are given, \"target\": what it is for, \"why\": one short sentence, \"title\": a few words saying what it is, \"body\": the words to paste or send, \"page\": the website page it should link to, from the pages given, or null}]}.",
].join("\n");
