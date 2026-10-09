import type { ActivityKind, ListingSource } from "./localSchema";

/**
 * Reading what the Local purchases answer (`dataForSeoLocalOperations.ts`)
 * into the shapes Discovery's Local records hold. Pure, as every parser is
 * (`dataForSeoParsers.ts`): tested against the answers bought on 2026-10-09,
 * and a fix is a re-read of the answers held, never a purchase.
 *
 * A business found anywhere — a found list, a map check, a local market, a
 * profile read whole — comes in the same shape: Google's place number, its
 * name, address, map point, categories, website, rating and reviews. Only a
 * profile read whole, or a found list (which carries the supplier's copy of
 * the profile), has the rest (`profile`).
 *
 * **Words from the open web, kept on purpose and only these**: a business's
 * name, address, categories, description, services and Google's review
 * topics, which a profile page shows as they are; a post's words, cut short;
 * and Google's reason for showing a business on Maps. All are shown on
 * screen as quoted material and never handed to an AI as an instruction.
 */

export type ParsedListing = {
  source: ListingSource;
  key: string;
  name: string;
  address?: string;
  town?: string;
  point?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  categoryIds?: string[];
  websiteHost?: string;
  phone?: string;
  claimed?: boolean;
  rating?: number;
  reviews?: number;
  photos?: number;
  profile?: ParsedProfile;
};

export type ParsedProfile = {
  description?: string;
  categories: string[];
  hours?: Array<string | null>;
  services: Array<{ name: string; price?: string }>;
  attributes: string[];
  bookingUrl?: string;
  topics: Array<{ topic: string; reviews: number }>;
  alsoSearched: Array<{ key: string; name: string; rating?: number; reviews?: number }>;
  starCounts?: number[];
};

type Item = Record<string, unknown>;

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/** Most a description or a post keeps: a profile's own limit is 750 characters. */
const TEXT_KEPT = 750;
const POST_KEPT = 300;
/** Most services and topics a profile keeps. */
const SERVICES_KEPT = 40;
const TOPICS_KEPT = 20;
const ALSO_SEARCHED_KEPT = 10;

const asItem = (value: unknown): Item | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Item) : null);
const asText = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const asCount = (value: unknown): number | undefined => {
  const number = asNumber(value);
  return number !== undefined && number >= 0 ? Math.round(number) : undefined;
};

/** A map point as Local's records key it: five decimal places, about a metre. */
export function mapPointOf(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

/** A website's host as Local compares them: lower case, no "www.", no path. */
export function hostOfWebsite(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  return host || undefined;
}

/** The first answer's items, from the stored answer (the task's `result`). */
export function itemsOf(result: unknown): Item[] {
  const first = Array.isArray(result) ? result[0] : result;
  const items = asItem(first)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const value = asItem(item);
    return value ? [value] : [];
  });
}

/** How many the supplier holds past the ones read, where it says. */
export function totalOf(result: unknown): number | undefined {
  const first = asItem(Array.isArray(result) ? result[0] : result);
  return asCount(first?.total_count) ?? asCount(first?.items_count);
}

function hoursOf(item: Item): Array<string | null> | undefined {
  const table = asItem(asItem(asItem(item.work_time)?.work_hours)?.timetable ?? asItem(item.work_hours)?.timetable);
  if (!table) return undefined;
  const clock = (time: unknown) => {
    const at = asItem(time);
    const hour = asNumber(at?.hour);
    const minute = asNumber(at?.minute) ?? 0;
    return hour === undefined ? null : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };
  return DAYS.map((day) => {
    const spans = table[day];
    if (spans === null) return "Closed";
    if (!Array.isArray(spans)) return null;
    const words = spans.flatMap((span) => {
      const open = clock(asItem(span)?.open);
      const close = clock(asItem(span)?.close);
      return open && close ? [`${open}–${close}`] : [];
    });
    return words.length > 0 ? words.join(", ") : null;
  });
}

function priceOf(value: unknown): string | undefined {
  if (typeof value === "string") return asText(value);
  if (typeof value === "number") return String(value);
  const price = asItem(value);
  if (!price) return undefined;
  const amount = asNumber(price.current) ?? asNumber(price.value) ?? asNumber(price.amount);
  const currency = asText(price.currency);
  return amount === undefined ? asText(price.displayed_price) : `${currency ? `${currency} ` : ""}${amount}`;
}

function profileOf(item: Item): ParsedProfile {
  const attributes = asItem(asItem(item.attributes)?.available_attributes);
  const topics = asItem(item.place_topics);
  const spread = asItem(item.rating_distribution);
  const starCounts = spread ? ["1", "2", "3", "4", "5"].map((star) => asCount(spread[star]) ?? 0) : undefined;
  return {
    ...(asText(item.description) ? { description: asText(item.description)!.slice(0, TEXT_KEPT) } : {}),
    categories: Array.isArray(item.additional_categories) ? item.additional_categories.flatMap((name) => asText(name) ?? []) : [],
    ...(hoursOf(item) ? { hours: hoursOf(item) } : {}),
    services: (Array.isArray(item.services) ? item.services : []).flatMap((service) => {
      const name = asText(asItem(service)?.title);
      if (!name) return [];
      const price = priceOf(asItem(service)?.price);
      return [{ name, ...(price ? { price } : {}) }];
    }).slice(0, SERVICES_KEPT),
    attributes: attributes ? Object.values(attributes).flatMap((group) => (Array.isArray(group) ? group.flatMap((name) => asText(name) ?? []) : [])) : [],
    ...(asText(item.book_online_url) ? { bookingUrl: asText(item.book_online_url) } : {}),
    topics: topics
      ? Object.entries(topics)
        .flatMap(([topic, reviews]) => (asCount(reviews) !== undefined ? [{ topic, reviews: asCount(reviews)! }] : []))
        .sort((left, right) => right.reviews - left.reviews)
        .slice(0, TOPICS_KEPT)
      : [],
    alsoSearched: (Array.isArray(item.people_also_search) ? item.people_also_search : []).flatMap((entry) => {
      const other = asItem(entry);
      const key = asText(other?.cid);
      const name = asText(other?.title);
      if (!key || !name) return [];
      const rating = asItem(other?.rating);
      return [{
        key,
        name,
        ...(asNumber(rating?.value) !== undefined ? { rating: asNumber(rating?.value) } : {}),
        ...(asCount(rating?.votes_count) !== undefined ? { reviews: asCount(rating?.votes_count) } : {}),
      }];
    }).slice(0, ALSO_SEARCHED_KEPT),
    ...(starCounts ? { starCounts } : {}),
  };
}

/**
 * One business on Google as any Local answer lists it, or null without its
 * place number or name. `whole` reads the rest of the profile too: a profile
 * read now, or a found list's copy of one.
 */
export function parseGoogleBusiness(item: Item, whole: boolean): ParsedListing | null {
  const key = asText(item.cid);
  const name = asText(item.title);
  if (!key || !name) return null;
  const latitude = asNumber(item.latitude);
  const longitude = asNumber(item.longitude);
  const rating = asItem(item.rating);
  const address = asItem(item.address_info);
  const ids = Array.isArray(item.category_ids) ? item.category_ids.flatMap((id) => asText(id) ?? []) : [];
  return {
    source: "GOOGLE",
    key,
    name,
    ...(asText(item.address) ? { address: asText(item.address) } : {}),
    ...(asText(address?.city) ? { town: asText(address?.city) } : {}),
    ...(latitude !== undefined && longitude !== undefined ? { point: mapPointOf(latitude, longitude), latitude, longitude } : {}),
    ...(asText(item.category) ? { category: asText(item.category) } : {}),
    ...(ids.length > 0 ? { categoryIds: ids } : {}),
    ...(hostOfWebsite(asText(item.domain) ?? asText(item.url)) ? { websiteHost: hostOfWebsite(asText(item.domain) ?? asText(item.url)) } : {}),
    ...(asText(item.phone) ? { phone: asText(item.phone) } : {}),
    ...(typeof item.is_claimed === "boolean" ? { claimed: item.is_claimed } : {}),
    ...(asNumber(rating?.value) !== undefined ? { rating: asNumber(rating?.value) } : {}),
    ...(asCount(rating?.votes_count) !== undefined ? { reviews: asCount(rating?.votes_count) } : {}),
    ...(asCount(item.total_photos) !== undefined ? { photos: asCount(item.total_photos) } : {}),
    ...(whole ? { profile: profileOf(item) } : {}),
  };
}

/** A found list or a local market: every business in it, in the supplier's order, each with its profile. */
export function parseBusinessList(result: unknown): ParsedListing[] {
  return itemsOf(result).flatMap((item) => parseGoogleBusiness(item, true) ?? []);
}

/** A profile read now: the business, whole. */
export function parseBusinessProfile(result: unknown): ParsedListing | null {
  const item = itemsOf(result).find((entry) => entry.type === "google_business_info") ?? itemsOf(result)[0];
  return item ? parseGoogleBusiness(item, true) : null;
}

export type ParsedMapCheck = { businesses: ParsedListing[]; reasons: Array<string | undefined> };

/** A map check: the businesses in Google's order, and Google's reason under each, if it gave one. */
export function parseMapCheck(result: unknown): ParsedMapCheck {
  const businesses: ParsedListing[] = [];
  const reasons: Array<string | undefined> = [];
  for (const item of itemsOf(result)) {
    if (item.type !== undefined && item.type !== "maps_search") continue;
    const business = parseGoogleBusiness(item, false);
    if (!business) continue;
    businesses.push(business);
    const reason = Array.isArray(item.local_justifications) ? asText(asItem(item.local_justifications[0])?.text) : undefined;
    reasons.push(reason?.slice(0, POST_KEPT));
  }
  return { businesses, reasons };
}

export type ParsedPost = { kind: Extract<ActivityKind, "POST" | "OFFER" | "EVENT">; day: string; text: string };

/** A profile's posts, newest first: what each is, its day and its words, cut short. */
export function parsePosts(result: unknown): ParsedPost[] {
  return itemsOf(result).flatMap((item) => {
    const day = asText(item.timestamp)?.slice(0, 10);
    const text = asText(item.post_text) ?? asText(item.snippet) ?? "";
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
    const type = String(item.type ?? "");
    const kind = type.includes("offer") ? "OFFER" as const : type.includes("event") ? "EVENT" as const : "POST" as const;
    return [{ kind, day, text: text.slice(0, POST_KEPT) }];
  }).sort((left, right) => right.day.localeCompare(left.day));
}

export type ParsedQuestion = { day: string; text: string; answeredDay?: string };

/**
 * A profile's questions, newest first: each with the day it was asked and its
 * first answer's, as Google dates them — from "4 years ago", so a day of the
 * right year rather than the true one.
 */
export function parseQuestions(result: unknown): ParsedQuestion[] {
  const first = asItem(Array.isArray(result) ? result[0] : result);
  const answered = itemsOf(result);
  const open: Item[] = [];
  for (const item of Array.isArray(first?.items_without_answers) ? first.items_without_answers : []) {
    const question = asItem(item);
    if (question) open.push(question);
  }
  const read = (item: Item): ParsedQuestion | null => {
    const day = asText(item.timestamp)?.slice(0, 10);
    const text = asText(item.question_text);
    if (!day || !text) return null;
    const answers = Array.isArray(item.items) ? item.items.flatMap((answer) => asText(asItem(answer)?.timestamp)?.slice(0, 10) ?? []) : [];
    const answeredDay = answers.sort()[0];
    return { day, text: text.slice(0, POST_KEPT), ...(answeredDay ? { answeredDay } : {}) };
  };
  return [...answered, ...open].flatMap((item) => read(item) ?? []).sort((left, right) => right.day.localeCompare(left.day));
}

/** A Trustpilot search: each business's page, by its website, with its rating and reviews. */
export function parseTrustpilotSearch(result: unknown): ParsedListing[] {
  return itemsOf(result).flatMap((item) => {
    const key = hostOfWebsite(asText(item.domain) ?? asText(item.url));
    const name = asText(item.title);
    if (!key || !name) return [];
    const rating = asItem(item.rating);
    return [{
      source: "TRUSTPILOT" as const,
      key,
      name,
      websiteHost: key,
      ...(asNumber(rating?.value) !== undefined ? { rating: asNumber(rating?.value) } : {}),
      ...(asCount(item.reviews_count) !== undefined ? { reviews: asCount(item.reviews_count) } : {}),
    }];
  });
}

/** A Tripadvisor search: each place's page, by its path, with its rating and reviews. */
export function parseTripadvisorSearch(result: unknown): ParsedListing[] {
  return itemsOf(result).flatMap((item) => {
    const key = asText(item.url_path);
    const name = asText(item.title);
    if (!key || !name) return [];
    const rating = asItem(item.rating);
    return [{
      source: "TRIPADVISOR" as const,
      key,
      name,
      ...(asNumber(rating?.value) !== undefined ? { rating: asNumber(rating?.value) } : {}),
      ...(asCount(item.reviews_count) ?? asCount(rating?.votes_count)) !== undefined
        ? { reviews: asCount(item.reviews_count) ?? asCount(rating?.votes_count) }
        : {},
    }];
  });
}

/** Metres between two map points, as the crow flies. */
export function metresBetween(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earth * Math.asin(Math.sqrt(a)));
}
