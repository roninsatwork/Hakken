/**
 * Why the enquiries moved (docs/plans/active/insights-intelligence-plan.md,
 * phase 8; Anthony, 2026-10-12: "we must store data in Search Console,
 * Analytics that supports a hypothesis … the whole point of this app is to
 * not use one data source"). Six tests, service pages first, each a verdict
 * from two sources where it can be, and the move in enquiries split into
 * three parts that add up to it: Analytics counting fewer (or more) of the
 * visitors Google sends, fewer (or more) visitors, and fewer (or more) of them
 * enquiring. Worked out in code from the figures; the Analyst agent writes the
 * words from it, and the Editor checks them.
 */

export type Pair = { now: number; then: number };
export type Maybe = { now: number | null; then: number | null };

export type WhyInput = {
  enquiries: Pair;
  visits: Pair;
  /** Analytics' visits from Google for each of Google's clicks (Search Console). */
  share: Maybe;
  /** The rivals' estimated Google visitors added up (DataForSEO). */
  rivals: Maybe;
  service: {
    /** Search Console's figures for the service pages: times shown, clicks, average place. */
    shown: Pair;
    clicks: Pair;
    position: Maybe;
    /** The service pages' best month for average place in the history, and the place. */
    best: { month: string; position: number } | null;
  };
  /**
   * DataForSEO's searches on page one: at the end of the period against the end of the one compared, from the
   * weekly readings kept (insights-intelligence-plan.md phase 10), else this week against last; null when not held.
   */
  pageOne: { now: number; before: number; months?: { now: string; then: string } } | null;
  /** Microsoft Clarity's visits against Analytics' on the days both hold: a second witness to the counting. */
  clarity?: { clarity: number; analytics: number; days: number } | null;
  /** Page-one searches whose results show Google's AI overview, of those on page one. */
  aiOverviews: { with: number; of: number } | null;
  /** False when Google changed what it counts as shown between the two spans: times shown and place are not compared. */
  shownComparable: boolean;
  sources: ReadonlyArray<{ key: string; now: number; then: number }>;
  kinds: ReadonlyArray<{ key: string; service: boolean; visits: Pair; enquiries: Pair }>;
};

export type WhyVerdict = "LIKELY" | "BIGGEST" | "PART" | "WATCH" | "NOT" | "RULED_OUT" | "NO_DATA";
export type WhyTestId = "COUNTING" | "MARKET" | "RANKINGS" | "SHOWN" | "SOURCES" | "CONVERSION";

export type WhyTest = {
  id: WhyTestId;
  verdict: WhyVerdict;
  /** The enquiries this test accounts for, where it is one of the split's parts. */
  part: number | null;
  figures: Record<string, number | string | null>;
  /** The sources the verdict rests on. */
  sources: string[];
};

export type Why = {
  /** Enquiries then less enquiries now: above nought a fall. */
  lost: number;
  split: { counting: number; visits: number; rate: number };
  tests: WhyTest[];
};

/** How far a share must move to count: a tenth. */
const LEAST_MOVE = 0.1;
/** Places worse that make a ranking fall. */
const LEAST_PLACES = 2;
/** How far a source must fall, and from how many visits, to be named. */
const SOURCE_FALL = 0.3;
const SOURCE_LEAST_VISITS = 5;
/** How far the share of visits that enquire must fall to be a cause. */
const RATE_FALL = 0.15;

const moved = (now: number | null, then: number | null) => (now === null || then === null || then === 0 ? null : (now - then) / then);

/** Rounds parts to whole enquiries that still add up to the whole: the largest part takes the rounding. */
export function roundedParts(parts: readonly number[], whole: number): number[] {
  const rounded = parts.map((part) => Math.round(part));
  const short = Math.round(whole) - rounded.reduce((sum, part) => sum + part, 0);
  if (short !== 0 && rounded.length > 0) {
    let at = 0;
    for (let index = 1; index < parts.length; index += 1) if (Math.abs(parts[index]) > Math.abs(parts[at])) at = index;
    rounded[at] += short;
  }
  return rounded;
}

/**
 * The move in enquiries split into three parts that add up to it. Analytics'
 * share of Google's clicks, now against then, says how many visitors (and
 * their enquiries) it no longer counts; set right, the visits part is the
 * visitors lost at the old rate, and the rate part what is left.
 */
export function splitMove(input: Pick<WhyInput, "enquiries" | "visits" | "share">): Why["split"] {
  const { enquiries, visits, share } = input;
  const ratio = share.now !== null && share.then !== null && share.then > 0 ? share.now / share.then : 1;
  const factor = Math.abs(ratio - 1) >= LEAST_MOVE && ratio > 0 ? ratio : 1;
  const enquiriesNow = enquiries.now / factor;
  const visitsNow = visits.now / factor;
  const rateThen = visits.then > 0 ? enquiries.then / visits.then : 0;
  const counting = enquiriesNow - enquiries.now;
  const fromVisits = (visits.then - visitsNow) * rateThen;
  const fromRate = visitsNow * rateThen - enquiriesNow;
  const [a, b, c] = roundedParts([counting, fromVisits, fromRate], enquiries.then - enquiries.now);
  return { counting: a, visits: b, rate: c };
}

/** The six tests, service pages first, and the split. */
export function whyEnquiriesMoved(input: WhyInput): Why {
  const split = splitMove(input);
  const lost = input.enquiries.then - input.enquiries.now;
  const tests: WhyTest[] = [];

  // 1. Is Analytics counting everyone? Analytics against Google's own clicks.
  const shareMove = moved(input.share.now, input.share.then);
  tests.push({
    id: "COUNTING",
    verdict: shareMove === null ? "NO_DATA" : Math.abs(shareMove) < LEAST_MOVE ? "RULED_OUT" : "LIKELY",
    part: shareMove === null || Math.abs(shareMove) < LEAST_MOVE ? null : split.counting,
    figures: {
      shareNow: perHundred(input.share.now), shareThen: perHundred(input.share.then),
      ...(input.clarity ? { clarityVisits: input.clarity.clarity, analyticsVisits: input.clarity.analytics, clarityDays: input.clarity.days } : {}),
    },
    sources: input.clarity ? ["analytics", "searchConsole", "clarity"] : ["analytics", "searchConsole"],
  });

  // 2. Is the market shrinking? The rivals' estimates, and how often Google showed the service pages.
  const rivalsMove = moved(input.rivals.now, input.rivals.then);
  const shownMove = input.shownComparable ? moved(input.service.shown.now, input.service.shown.then) : null;
  const falling = [rivalsMove, shownMove].filter((move) => move !== null && move <= -LEAST_MOVE).length;
  tests.push({
    id: "MARKET",
    verdict: rivalsMove === null && shownMove === null ? "NO_DATA" : falling === 2 ? "LIKELY" : falling === 1 ? "PART" : "RULED_OUT",
    part: null,
    figures: {
      rivalsNow: input.rivals.now, rivalsThen: input.rivals.then,
      shownNow: input.shownComparable ? input.service.shown.now : null, shownThen: input.shownComparable ? input.service.shown.then : null,
      clicksNow: input.service.clicks.now, clicksThen: input.service.clicks.then,
    },
    sources: ["dataForSeo", "searchConsole"],
  });

  // 3. Did the service pages' rankings fall? Their average place, its best month, and DataForSEO's week.
  const { position, best } = input.service;
  const worse = input.shownComparable && position.now !== null && position.then !== null ? position.now - position.then : null;
  const slipped = best !== null && position.now !== null && position.now - best.position >= LEAST_PLACES;
  const pageOneFell = input.pageOne !== null && input.pageOne.before > 0 && (input.pageOne.before - input.pageOne.now) / input.pageOne.before >= LEAST_MOVE;
  tests.push({
    id: "RANKINGS",
    verdict: position.now === null ? "NO_DATA" : worse !== null && worse >= LEAST_PLACES ? "LIKELY" : slipped || pageOneFell ? "WATCH" : "NOT",
    part: null,
    figures: {
      positionNow: position.now, positionThen: input.shownComparable ? position.then : null,
      bestMonth: best?.month ?? null, bestPosition: best?.position ?? null,
      pageOneNow: input.pageOne?.now ?? null, pageOneBefore: input.pageOne?.before ?? null,
      ...(input.pageOne?.months ? { pageOneMonth: input.pageOne.months.now, pageOneThenMonth: input.pageOne.months.then } : {}),
    },
    sources: ["searchConsole", "dataForSeo", "googleUpdates"],
  });

  // 4. Does Google show the service pages as often? Times shown, and Google's own AI answers on their searches.
  tests.push({
    id: "SHOWN",
    verdict: !input.shownComparable ? "NO_DATA" : shownMove !== null && shownMove <= -LEAST_MOVE ? "PART" : "RULED_OUT",
    part: null,
    figures: {
      shownNow: input.service.shown.now, shownThen: input.shownComparable ? input.service.shown.then : null,
      aiWith: input.aiOverviews?.with ?? null, aiOf: input.aiOverviews?.of ?? null,
    },
    sources: ["searchConsole", "dataForSeo"],
  });

  // 5. Which sources stopped sending people? Each source's visits, the biggest falls first.
  const losers = [...input.sources]
    .filter((source) => source.then >= SOURCE_LEAST_VISITS && (source.then - source.now) / source.then >= SOURCE_FALL)
    .sort((a, b) => (b.then - b.now) - (a.then - a.now))
    .slice(0, 3);
  tests.push({
    id: "SOURCES",
    verdict: input.sources.length === 0 ? "NO_DATA" : losers.length > 0 ? "LIKELY" : "RULED_OUT",
    part: split.visits,
    figures: Object.fromEntries(losers.flatMap((source, at) => [[`source${at}`, source.key], [`source${at}Now`, source.now], [`source${at}Then`, source.then]])),
    sources: ["analytics"],
  });

  // 6. Did fewer visitors enquire? The share of visits that enquired, the service pages' first.
  const rate = (pair: Pair, visits: Pair, side: "now" | "then") => (visits[side] > 0 ? (pair[side] * 100) / visits[side] : null);
  const service = input.kinds.filter((kind) => kind.service);
  const serviceVisits = { now: sum(service, (kind) => kind.visits.now), then: sum(service, (kind) => kind.visits.then) };
  const serviceEnquiries = { now: sum(service, (kind) => kind.enquiries.now), then: sum(service, (kind) => kind.enquiries.then) };
  const rateNow = rate(input.enquiries, input.visits, "now"), rateThen = rate(input.enquiries, input.visits, "then");
  const rateMove = moved(rateNow, rateThen);
  const biggest = split.rate > 0 && split.rate >= split.visits && split.rate >= split.counting;
  tests.push({
    id: "CONVERSION",
    verdict: rateMove === null ? "NO_DATA" : rateMove <= -RATE_FALL && split.rate >= 1 ? (biggest ? "BIGGEST" : "LIKELY") : "RULED_OUT",
    part: split.rate,
    figures: {
      rateNow: tenth(rateNow), rateThen: tenth(rateThen),
      serviceRateNow: tenth(rate(serviceEnquiries, serviceVisits, "now")), serviceRateThen: tenth(rate(serviceEnquiries, serviceVisits, "then")),
    },
    sources: ["analytics"],
  });

  return { lost, split, tests };
}

const sum = <T,>(rows: readonly T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
const perHundred = (share: number | null) => (share === null ? null : Math.round(share * 100));
const tenth = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
