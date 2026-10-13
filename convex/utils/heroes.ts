/**
 * A landing page followed from Google's results to the money it makes
 * (docs/plans/active/google-analytics-plan.md §13, §15 screen 7): whether it
 * is one of the website's heroes, the stage where it loses most, its problems
 * and what fixing each is worth a month. Plain rules over the website's own
 * figures — never an industry average, never an AI model — so the same
 * figures always say the same thing.
 *
 * A page can have several problems, worth most first. The worth of each fix
 * uses the website's own figures: its click rate at each
 * position, read from Search Console over the same days; the page's own
 * conversion rate when it has 100 visits or more, otherwise the website's;
 * and the website's value per conversion.
 */

/** The labels a page can carry: Hero, then its problems in their order. */
export const HERO_KINDS = ["hero", "push", "click", "convert", "leave", "fall"] as const;
export type HeroKind = (typeof HERO_KINDS)[number];
/** The problems a page can have: every label but Hero. */
export type ProblemKind = Exclude<HeroKind, "hero">;
export const PROBLEM_KINDS: readonly ProblemKind[] = ["push", "click", "convert", "leave", "fall"];

/** The pages that, biggest first, make this share of the website's value are its heroes. */
export const HERO_SHARE = 0.8;
/** Push to page one: at position 8 to 20, and shown this often or more. */
export const PUSH_FROM = 8;
export const PUSH_TO = 20;
export const PUSH_SHOWN = 500;
/** Losing the click: in the top five. */
export const CLICK_TOP = 5;
/**
 * …and shown this often or more: a click rate from fewer showings is too few
 * to trust, as a conversion rate from fewer than 100 visits is (GA22). Without
 * it, Ronins' Losing the click listed eleven pages, ten shown under 30 times
 * and each worth under £1; the drawing showed one (2026-10-10).
 */
export const CLICK_SHOWN = 100;
/** Not converting: this many visits or more, converting under half the website's rate. */
export const CONVERT_VISITS = 50;
export const CONVERT_SHARE = 0.5;
/** People leave: this many visits or more, under this share engaged. */
export const LEAVE_VISITS = 30;
export const LEAVE_ENGAGED = 0.4;
/** Falling: visits down this share on the days before, from at least this many. */
export const FALL_SHARE = 0.3;
export const FALL_FROM = 20;
/** A page's own conversion rate is used from this many visits (GA22's "too few to trust"). */
export const OWN_RATE_VISITS = 100;

/**
 * Where a page sits in Google's results, in bands: the website's click rate
 * is read for each band from its own pages, since a single position holds too
 * few showings to say much.
 */
export const POSITION_BANDS = [
  { band: "top3", from: 1, to: 3 },
  { band: "4to5", from: 4, to: 5 },
  { band: "6to10", from: 6, to: 10 },
  { band: "11to20", from: 11, to: 20 },
  { band: "21plus", from: 21, to: Number.POSITIVE_INFINITY },
] as const;
export type PositionBand = (typeof POSITION_BANDS)[number]["band"];

export function bandOf(position: number): PositionBand {
  const rounded = Math.max(1, Math.round(position));
  return POSITION_BANDS.find((band) => rounded >= band.from && rounded <= band.to)!.band;
}

/** A page in Google's results over the days read: shown, clicked, and its average position. */
export type GoogleFigures = { shown: number; clicks: number; position: number };
/** A page as a landing page in Google Analytics over the days read; value in hundredths. */
export type VisitFigures = { visits: number; engaged: number; conversions: number; value: number };

export type HeroPageInput = {
  /** The page's path, as the website's pages are compared: `normalisePage`. */
  page: string;
  google: GoogleFigures | null;
  googleBefore: GoogleFigures | null;
  visits: VisitFigures | null;
  visitsBefore: VisitFigures | null;
};

/** The website's own figures every worth is worked out from. */
export type WebsiteRates = {
  /** Conversions over visits, every landing page and channel; null without visits. */
  conversionRate: number | null;
  /** Value of a conversion, in hundredths; null without conversions. */
  valuePerConversion: number | null;
  /** Engaged visits over visits; null without visits. */
  engagedShare: number | null;
  /** Conversions over engaged visits; null without engaged visits. */
  conversionsPerEngaged: number | null;
  /** Clicks over showings in each band of positions; null for a band with no showings. */
  clickRates: Record<PositionBand, number | null>;
  /** The value every landing page made, in hundredths: what heroes are a share of. */
  totalValue: number;
};

/** One problem: what fixing it is worth a month (hundredths, null when it cannot be priced) and the clicks or visits it would add. */
export type Problem = { kind: ProblemKind; worth: number | null; gain: number | null; expected?: number };

export type HeroPage = HeroPageInput & {
  hero: boolean;
  /** Worth most first, then in `PROBLEM_KINDS`' order. */
  problems: Problem[];
};

/**
 * The website's click rate in each band, from its searches' showings and
 * clicks, each at its own position — as Search Console's Click rate by
 * position reads them. A page's average position mixes every search it is
 * shown for, so pages hardly ever average a top-three place: read from pages,
 * Ronins' top three had almost no showings and every push was worth nothing.
 * Takes each search's figures as they are read, one at a time.
 */
export function clickRatesOf(searches: Iterable<{ impressions: number; clicks: number; position: number }>): Record<PositionBand, number | null> {
  const sums = new Map<PositionBand, { shown: number; clicks: number }>();
  for (const search of searches) {
    if (search.impressions <= 0 || search.position < 0.5) continue;
    const band = bandOf(search.position);
    const sum = sums.get(band) ?? { shown: 0, clicks: 0 };
    sum.shown += search.impressions;
    sum.clicks += search.clicks;
    sums.set(band, sum);
  }
  const rates = {} as Record<PositionBand, number | null>;
  for (const { band } of POSITION_BANDS) {
    const sum = sums.get(band);
    rates[band] = sum && sum.shown > 0 ? sum.clicks / sum.shown : null;
  }
  return rates;
}

/** The website's rates from its totals: every visit, whichever page it started on, and every search Google showed it for. */
export function websiteRatesOf(
  totals: { visits: number; engaged: number; conversions: number; value: number },
  searches: Iterable<{ impressions: number; clicks: number; position: number }>,
  totalValue: number,
): WebsiteRates {
  return {
    conversionRate: totals.visits > 0 ? totals.conversions / totals.visits : null,
    valuePerConversion: totals.conversions > 0 ? totals.value / totals.conversions : null,
    engagedShare: totals.visits > 0 ? totals.engaged / totals.visits : null,
    conversionsPerEngaged: totals.engaged > 0 ? totals.conversions / totals.engaged : null,
    clickRates: clickRatesOf(searches),
    totalValue,
  };
}

/** The conversion rate a fix is priced at: the page's own from 100 visits, otherwise the website's. */
export function rateFor(page: Pick<HeroPageInput, "visits">, rates: WebsiteRates): number | null {
  const visits = page.visits;
  if (visits && visits.visits >= OWN_RATE_VISITS) return visits.conversions / visits.visits;
  return rates.conversionRate;
}

/** Visits turned into money a month: visits × rate × value per conversion; null when either is unknown. */
function priced(visits: number, rate: number | null, rates: WebsiteRates): number | null {
  if (rate === null || rates.valuePerConversion === null) return null;
  return Math.max(0, visits) * rate * rates.valuePerConversion;
}

/** Each problem a page has, by the rules of §13, with its worth. */
export function problemsOf(page: HeroPageInput, rates: WebsiteRates): Problem[] {
  const problems: Problem[] = [];
  const google = page.google;
  const visits = page.visits;
  const rate = rateFor(page, rates);

  if (google && google.shown > 0) {
    const position = Math.round(google.position);
    const top = rates.clickRates.top3;
    // Push to page one: the extra clicks it would get in the top three.
    if (position >= PUSH_FROM && position <= PUSH_TO && google.shown >= PUSH_SHOWN && top !== null) {
      const here = rates.clickRates[bandOf(google.position)] ?? 0;
      const gain = Math.max(0, google.shown * (top - here));
      problems.push({ kind: "push", gain, worth: priced(gain, rate, rates) });
    }
    // Losing the click: clicked less than the website's own rate at its position.
    const usual = rates.clickRates[bandOf(google.position)];
    if (position <= CLICK_TOP && google.shown >= CLICK_SHOWN && usual !== null && google.clicks / google.shown < usual) {
      const expected = google.shown * usual;
      const gain = Math.max(0, expected - google.clicks);
      problems.push({ kind: "click", gain, expected, worth: priced(gain, rate, rates) });
    }
  }

  if (visits && visits.visits > 0) {
    const own = visits.conversions / visits.visits;
    // Not converting: visits × (the website's rate − the page's) × the value per conversion.
    if (visits.visits >= CONVERT_VISITS && rates.conversionRate !== null && own < rates.conversionRate * CONVERT_SHARE) {
      const missed = visits.visits * (rates.conversionRate - own);
      problems.push({ kind: "convert", gain: missed, worth: rates.valuePerConversion === null ? null : missed * rates.valuePerConversion });
    }
    // People leave: visits × (the website's engaged share − the page's) × conversions per engaged visit × value.
    const engaged = visits.engaged / visits.visits;
    if (visits.visits >= LEAVE_VISITS && engaged < LEAVE_ENGAGED && rates.engagedShare !== null) {
      const kept = visits.visits * Math.max(0, rates.engagedShare - engaged);
      const worth = rates.conversionsPerEngaged === null || rates.valuePerConversion === null
        ? null
        : kept * rates.conversionsPerEngaged * rates.valuePerConversion;
      problems.push({ kind: "leave", gain: kept, worth });
    }
  }

  // Falling: the visits lost × the conversion rate × the value per conversion.
  const before = page.visitsBefore?.visits ?? 0;
  const now = visits?.visits ?? 0;
  if (before >= FALL_FROM && now <= before * (1 - FALL_SHARE)) {
    const lost = before - now;
    problems.push({ kind: "fall", gain: lost, worth: priced(lost, rate, rates) });
  }

  return problems.sort((one, two) => (two.worth ?? -1) - (one.worth ?? -1) || PROBLEM_KINDS.indexOf(one.kind) - PROBLEM_KINDS.indexOf(two.kind));
}

/** The website's heroes: its pages that, biggest value first, make 80% of the value its landing pages made. */
export function heroPagesOf(pages: readonly HeroPageInput[], totalValue: number): Set<string> {
  const heroes = new Set<string>();
  if (totalValue <= 0) return heroes;
  const made = pages
    .filter((page) => (page.visits?.value ?? 0) > 0)
    .sort((one, two) => (two.visits!.value - one.visits!.value) || (two.visits!.visits - one.visits!.visits) || (one.page < two.page ? -1 : 1));
  let sum = 0;
  for (const page of made) {
    if (sum >= totalValue * HERO_SHARE) break;
    heroes.add(page.page);
    sum += page.visits!.value;
  }
  return heroes;
}

/** Every page with its problems and whether it is a hero. */
export function heroesOf(pages: readonly HeroPageInput[], rates: WebsiteRates): HeroPage[] {
  const heroes = heroPagesOf(pages, rates.totalValue);
  return pages.map((page) => ({ ...page, hero: heroes.has(page.page), problems: problemsOf(page, rates) }));
}

/**
 * The stage from Google to money where a page loses most: Shown in Google
 * (push), Clicked (losing the click), Visits (people leave, falling) or
 * Conversions (not converting; a hero's money).
 */
export const STAGE_OF: Record<HeroKind, 0 | 1 | 2 | 3> = { push: 0, click: 1, leave: 2, fall: 2, convert: 3, hero: 3 };
