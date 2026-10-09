import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ACTIVITY_KINDS, listingProfileValidator, listingSourceValidator, type ActivityKind } from "./localSchema";
import type { ParsedListing, ParsedPost } from "./localParse";
import { packColumn, packDays, unpackColumn, unpackDays } from "./utils/packedColumns";
import { weekStart } from "./utils/searchConsolePacks";

/**
 * Local's shared records written once for everyone (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, rules 1–3): a business is one
 * `listings` record whoever watches it, its weeks one packed record, its
 * activity one packed record. Every Local answer files through here.
 */

/** A business as filing hands it over: what one answer said of it (`localParse.ts`). */
export const parsedListingValidator = v.object({
  source: listingSourceValidator,
  key: v.string(),
  name: v.string(),
  address: v.optional(v.string()),
  town: v.optional(v.string()),
  point: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  category: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.string())),
  websiteHost: v.optional(v.string()),
  phone: v.optional(v.string()),
  claimed: v.optional(v.boolean()),
  rating: v.optional(v.number()),
  reviews: v.optional(v.number()),
  photos: v.optional(v.number()),
  profile: v.optional(listingProfileValidator),
});

type Reader = { db: QueryCtx["db"] };
type ListingProfile = Infer<typeof listingProfileValidator>;

/** A listing by its own number there, or null. */
export async function findListing(ctx: Reader, source: Doc<"listings">["source"], key: string): Promise<Doc<"listings"> | null> {
  return await ctx.db.query("listings").withIndex("by_source_key", (q) => q.eq("source", source).eq("key", key)).unique();
}

/** A listing not seen for this long is marked seen again when it next turns up, and not before: a write a week, not a write a check. */
const SEEN_AGAIN_MS = 7 * 86_400_000;

/**
 * How much of a business's profile an answer is trusted for:
 * - `whole` — a profile read now, or a found list (its copy of the profile
 *   is what "This is us" links): the profile is replaced;
 * - `light` — a local market: only a business with no profile yet takes the
 *   few details the market's screens compare (booking link, categories);
 * - `none` — a map check, which carries no profile.
 */
export type ProfileTrust = "whole" | "light" | "none";

function lightProfile(profile: ListingProfile): ListingProfile {
  return {
    categories: profile.categories,
    services: [],
    attributes: [],
    topics: [],
    alsoSearched: [],
    ...(profile.bookingUrl ? { bookingUrl: profile.bookingUrl } : {}),
  };
}

/** A value as text with its keys in order and nothing undefined, so two equal values always read the same. */
export function stableText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableText).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableText(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const sameValue = (left: unknown, right: unknown) => stableText(left) === stableText(right);

/**
 * File what one answer said of a business over what was held — writing
 * nothing when nothing it says is new (plan rule 11; normalisation plan
 * §7A.1): a map check naming a business seen yesterday at the same rating
 * leaves its record alone. What an answer leaves out stays, so a map check
 * never clears a profile read last week.
 */
export async function upsertListing(
  ctx: MutationCtx,
  business: ParsedListing,
  trust: ProfileTrust,
  options: { readNow?: boolean } = {},
): Promise<{ listingId: Id<"listings">; before: Doc<"listings"> | null }> {
  const now = Date.now();
  const before = await findListing(ctx, business.source, business.key);
  const { profile, source, key, ...facts } = business;
  const fields: Partial<Doc<"listings">> = {};
  for (const [name, value] of Object.entries(facts)) {
    if (value !== undefined && !sameValue(value, (before as Record<string, unknown> | null)?.[name])) {
      (fields as Record<string, unknown>)[name] = value;
    }
  }
  if (profile && trust === "whole" && !sameValue(profile, before?.profile)) fields.profile = profile;
  if (profile && trust === "light" && !before?.profile) fields.profile = lightProfile(profile);
  if (options.readNow) fields.profileReadAt = now;
  if (!before) {
    const listingId = await ctx.db.insert("listings", { ...fields, source, key, name: business.name, seenAt: now });
    return { listingId, before: null };
  }
  if (Object.keys(fields).length > 0 || now - before.seenAt > SEEN_AGAIN_MS) await ctx.db.patch(before._id, { ...fields, seenAt: now });
  return { listingId: before._id, before };
}

export type ListingWeek = { day: string; rating?: number; reviews?: number; photos?: number; claimed?: boolean };

function weeksOf(record: Doc<"listingWeeks">): ListingWeek[] {
  const days = unpackDays(record.days);
  const rating = unpackColumn(record.rating);
  const reviews = unpackColumn(record.reviews);
  const photos = unpackColumn(record.photos);
  const claimed = unpackColumn(record.claimed);
  return days.map((day, at) => ({
    day: day!,
    ...(rating[at] !== undefined ? { rating: rating[at]! / 10 } : {}),
    ...(reviews[at] !== undefined ? { reviews: reviews[at] } : {}),
    ...(photos[at] !== undefined ? { photos: photos[at] } : {}),
    ...(claimed[at] !== undefined ? { claimed: claimed[at] === 1 } : {}),
  }));
}

/** A listing's weeks, oldest first. */
export async function readListingWeeks(ctx: Reader, listingId: Id<"listings">): Promise<ListingWeek[]> {
  const record = await ctx.db.query("listingWeeks").withIndex("by_listing", (q) => q.eq("listingId", listingId)).unique();
  return record ? weeksOf(record) : [];
}

/** One reading's figures filed as its week's, a later reading in the week replacing the earlier. */
export async function writeListingWeek(ctx: MutationCtx, listingId: Id<"listings">, day: string, business: ParsedListing): Promise<void> {
  const record = await ctx.db.query("listingWeeks").withIndex("by_listing", (q) => q.eq("listingId", listingId)).unique();
  const byWeek = new Map((record ? weeksOf(record) : []).map((week) => [week.day, week]));
  const monday = weekStart(day);
  const week = { day: monday, rating: business.rating, reviews: business.reviews, photos: business.photos, claimed: business.claimed };
  if (record && sameValue(byWeek.get(monday), week)) return;
  byWeek.set(monday, week);
  const weeks = [...byWeek.values()].sort((left, right) => left.day.localeCompare(right.day));
  const fields = {
    listingId,
    days: packDays(weeks.map((week) => week.day)),
    rating: packColumn(weeks.map((week) => (week.rating === undefined ? undefined : Math.round(week.rating * 10)))),
    reviews: packColumn(weeks.map((week) => week.reviews)),
    photos: packColumn(weeks.map((week) => week.photos)),
    claimed: packColumn(weeks.map((week) => (week.claimed === undefined ? undefined : week.claimed ? 1 : 0))),
    updatedAt: Date.now(),
  };
  if (record) await ctx.db.replace(record._id, fields);
  else await ctx.db.insert("listingWeeks", fields);
}

export type ActivityLine = { kind: ActivityKind; day: string; text: string; answeredDay?: string };

/** Lines a listing's activity keeps, the newest first. */
export const ACTIVITY_KEPT = 100;

function linesOf(record: Doc<"listingActivityParts">): ActivityLine[] {
  const kinds = unpackColumn(record.kinds);
  const days = unpackDays(record.days);
  const answered = record.answeredDays ? unpackDays(record.answeredDays) : [];
  return record.texts.map((text, at) => ({
    kind: ACTIVITY_KINDS[kinds[at] ?? 0],
    day: days[at]!,
    text,
    ...(answered[at] ? { answeredDay: answered[at] } : {}),
  }));
}

/** A listing's activity, newest first. */
export async function readListingActivity(ctx: Reader, listingId: Id<"listings">): Promise<ActivityLine[]> {
  const record = await ctx.db.query("listingActivityParts").withIndex("by_listing", (q) => q.eq("listingId", listingId)).unique();
  return record ? linesOf(record) : [];
}

/**
 * Add lines to a listing's activity: each line once, however often it is
 * filed (a post read again next week is the same post), newest first, the
 * newest `ACTIVITY_KEPT` kept. `replacing` names kinds the lines given are the
 * whole of — a profile's questions, read whole each week, answered since or
 * not — so the held ones of those kinds give way to them.
 */
export async function addListingActivity(
  ctx: MutationCtx,
  listingId: Id<"listings">,
  lines: readonly ActivityLine[],
  replacing: readonly ActivityKind[] = [],
): Promise<void> {
  if (lines.length === 0 && replacing.length === 0) return;
  const record = await ctx.db.query("listingActivityParts").withIndex("by_listing", (q) => q.eq("listingId", listingId)).unique();
  const all = record ? linesOf(record) : [];
  const held = all.filter((line) => !replacing.includes(line.kind));
  if (replacing.length > 0 && sameValue(all.filter((line) => replacing.includes(line.kind)), lines)) return;
  const keyOf = (line: ActivityLine) => `${line.kind}|${line.day}|${line.text}`;
  const seen = new Set(held.map(keyOf));
  const added: ActivityLine[] = [];
  for (const line of lines) {
    if (seen.has(keyOf(line))) continue;
    seen.add(keyOf(line));
    added.push(line);
  }
  if (added.length === 0 && held.length === all.length) return;
  const merged = [...held, ...added]
    .sort((left, right) => right.day.localeCompare(left.day))
    .slice(0, ACTIVITY_KEPT);
  const fields = {
    listingId,
    kinds: packColumn(merged.map((line) => ACTIVITY_KINDS.indexOf(line.kind))),
    days: packDays(merged.map((line) => line.day)),
    texts: merged.map((line) => line.text),
    ...(merged.some((line) => line.answeredDay) ? { answeredDays: packDays(merged.map((line) => line.answeredDay)) } : {}),
    updatedAt: Date.now(),
  };
  if (record) await ctx.db.replace(record._id, fields);
  else await ctx.db.insert("listingActivityParts", fields);
}

/** A profile's posts as activity lines. */
export function postLines(posts: readonly ParsedPost[]): ActivityLine[] {
  return posts.map((post) => ({ kind: post.kind, day: post.day, text: post.text }));
}

const categoriesOf = (listing: { category?: string; profile?: ListingProfile }) =>
  [listing.category, ...(listing.profile?.categories ?? [])].filter((name): name is string => Boolean(name));

/**
 * What changed on a profile since it was last read whole: categories added
 * or taken off, opening hours, its name, its website. Nothing on the first
 * reading — a business is not "changed" by being seen. Hours are kept as the
 * days that changed, "5:Closed>10:00–14:00" (Monday is 0), so the screen
 * words them in its own language.
 */
export function profileChanges(before: Doc<"listings"> | null, after: ParsedListing, day: string): ActivityLine[] {
  if (!before?.profileReadAt || !after.profile) return [];
  const lines: ActivityLine[] = [];
  const was = new Set(categoriesOf(before));
  const now = new Set(categoriesOf(after));
  for (const name of now) if (!was.has(name)) lines.push({ kind: "CATEGORY_ADDED", day, text: name });
  for (const name of was) if (!now.has(name)) lines.push({ kind: "CATEGORY_REMOVED", day, text: name });
  const oldHours = before.profile?.hours;
  const newHours = after.profile.hours;
  if (oldHours && newHours) {
    const changed = newHours.flatMap((hours, at) => (hours !== oldHours[at] ? [`${at}:${oldHours[at] ?? ""}>${hours ?? ""}`] : []));
    if (changed.length > 0) lines.push({ kind: "HOURS_CHANGED", day, text: changed.join(";") });
  }
  if (after.name !== before.name) lines.push({ kind: "NAME_CHANGED", day, text: after.name });
  if (after.websiteHost && before.websiteHost && after.websiteHost !== before.websiteHost) {
    lines.push({ kind: "WEBSITE_CHANGED", day, text: after.websiteHost });
  }
  return lines;
}

/** Where a listing is read by a person: its Google profile, its Trustpilot page, its Tripadvisor page. */
export function listingAddress(listing: Pick<Doc<"listings">, "source" | "key">): string {
  if (listing.source === "TRUSTPILOT") return `https://uk.trustpilot.com/review/${listing.key}`;
  if (listing.source === "TRIPADVISOR") return `https://www.tripadvisor.co.uk${listing.key}`;
  return `https://www.google.com/maps?cid=${listing.key}`;
}

/** A listing as every Local screen's tables show it. */
export const listingRowValidator = v.object({
  listingId: v.id("listings"),
  source: listingSourceValidator,
  name: v.string(),
  address: v.union(v.string(), v.null()),
  town: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  websiteHost: v.union(v.string(), v.null()),
  rating: v.union(v.number(), v.null()),
  reviews: v.union(v.number(), v.null()),
  photos: v.union(v.number(), v.null()),
  claimed: v.union(v.boolean(), v.null()),
  url: v.string(),
});

export function listingRowOf(listing: Doc<"listings">): Infer<typeof listingRowValidator> {
  return {
    listingId: listing._id,
    source: listing.source,
    name: listing.name,
    address: listing.address ?? null,
    town: listing.town ?? null,
    category: listing.category ?? null,
    websiteHost: listing.websiteHost ?? null,
    rating: listing.rating ?? null,
    reviews: listing.reviews ?? null,
    photos: listing.photos ?? null,
    claimed: listing.claimed ?? null,
    url: listingAddress(listing),
  };
}
