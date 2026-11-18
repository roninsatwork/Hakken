/**
 * Countries and devices' figures, worked out once for its four boxes and its eye
 * (search-console-countries-and-devices-way-1-plan-2026-11-18.md; the rules are `convex/utils/sees/own/searchConsolePlaces.ts`).
 * Every figure follows the country chosen in the menu (Anthony, 18 November 2026: "can we align this to the country
 * scope"): its clicks, its share of every country's, the clicks from the other countries, and how many countries sent a
 * click. Pure, so the page and the rules' test of every period (`convex/utils/sees/searchConsolePeriods.test.ts`) build
 * the very same figures.
 */

/** A country's or a device's row, as the page's lists send it: its clicks before null when the span before isn't held. */
export type PlaceRow = { key: string; clicks: number; impressions: number; ctr: number; position: number; previousClicks: number | null };
/** A list's summary, as far as the boxes need it: the span before's clicks, and its rows that got a click. */
export type PlaceSummary = { beforeTotals?: { clicks: number } | null; clickedBefore?: number | null } | null | undefined;

/** The four boxes' figures, each with the dates before's, null when that span isn't held. */
export type PlacesFigures = {
  /** The country chosen's clicks. */
  clicks: number;
  clicksBefore: number | null;
  /** Its clicks out of every 100, unrounded. */
  outOf100: number;
  outOf100Before: number | null;
  /** The clicks from every other country. */
  others: number;
  othersBefore: number | null;
  /** Countries that sent a click, out of every country Google showed the website in. */
  clicked: number;
  countries: number;
  clickedBefore: number | null;
};

const per100 = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : 0);

/**
 * A row's clicks in the span before: a country Google didn't show then had none, where the span is held
 * (`shapeRows` leaves such a row's `previousClicks` empty).
 */
export const clicksBeforeOf = (row: Pick<PlaceRow, "previousClicks">, comparable: boolean): number | null => (comparable ? (row.previousClicks ?? 0) : null);

/** The boxes' figures from every country's list, for the country chosen (Google's code). */
export function placesFigures(countries: readonly PlaceRow[], summary: PlaceSummary, comparable: boolean, chosen: string): PlacesFigures {
  const row = countries.find((one) => one.key === chosen);
  const total = countries.reduce((sum, one) => sum + one.clicks, 0);
  const totalBefore = comparable && summary?.beforeTotals ? summary.beforeTotals.clicks : null;
  const clicks = row?.clicks ?? 0;
  // A country chosen that Google didn't show now: its clicks before aren't in the list.
  const clicksBefore = totalBefore === null ? null : row ? clicksBeforeOf(row, true) : null;
  return {
    clicks,
    clicksBefore,
    outOf100: per100(clicks, total),
    outOf100Before: totalBefore !== null && clicksBefore !== null ? per100(clicksBefore, totalBefore) : null,
    others: total - clicks,
    othersBefore: totalBefore !== null && clicksBefore !== null ? totalBefore - clicksBefore : null,
    clicked: countries.filter((one) => one.clicks > 0).length,
    countries: countries.length,
    clickedBefore: comparable ? (summary?.clickedBefore ?? null) : null,
  };
}

/** A row the eye reads: its name in the reader's words, its figures, and its clicks before where held. */
type Named = { name: string; clicks: number; previousClicks: number | null };

/** The names the page says things by, in the reader's language. */
export type PlacesNames = {
  /** The country chosen: "United Kingdom". */
  chosen: string;
  /** "Other countries". */
  others: string;
  /** "Countries with a click". */
  clicked: string;
  /** Each device in the country chosen, by its key: "Mobile in the United Kingdom". */
  devices: Record<string, string>;
};

/** Rows of a list the eye is handed: the first, as the table opens, most clicks first. */
const LISTED = 25;

/**
 * What the page hands its eye: the boxes' figures, every country's clicks against the span before (the first rows, as
 * the table opens), the countries abroad that gained and lost most over the whole list, the devices in the country
 * chosen, and each country ticked onto the chart.
 */
export function placesPageData(input: {
  chosen: string;
  countries: ReadonlyArray<PlaceRow & { name: string }>;
  summary: PlaceSummary;
  comparable: boolean;
  devices: ReadonlyArray<PlaceRow & { name: string }>;
  devicesComparable: boolean;
  ticked: readonly Named[];
  names: PlacesNames;
}) {
  const { chosen, countries, comparable, devices, devicesComparable, names } = input;
  const figures = placesFigures(countries, input.summary, comparable, chosen);
  const row = (one: PlaceRow & { name: string }, held: boolean) => ({
    name: one.name, clicks: one.clicks, previousClicks: clicksBeforeOf(one, held), impressions: one.impressions, ctr: one.ctr, position: one.position,
  });
  const byClicks = [...countries].sort((left, right) => right.clicks - left.clicks);
  // The countries abroad that gained and lost most clicks, over every country, each shown in the span before too.
  const abroad = comparable ? countries.filter((one) => one.key !== chosen && (one.previousClicks ?? 0) > 0) : [];
  const moved = (one: PlaceRow) => one.clicks - (one.previousClicks ?? 0);
  const up = [...abroad].filter((one) => moved(one) > 0).sort((left, right) => moved(right) - moved(left))[0];
  const down = [...abroad].filter((one) => moved(one) < 0).sort((left, right) => moved(left) - moved(right))[0];
  const mover = (one: (PlaceRow & { name: string }) | undefined) => (one ? { name: one.name, clicks: one.clicks, previousClicks: one.previousClicks ?? 0 } : null);
  return {
    chosen: { name: names.chosen, clicks: figures.clicks, clicksBefore: figures.clicksBefore },
    others: { name: names.others, clicks: figures.others, clicksBefore: figures.othersBefore },
    clicked: { name: names.clicked, countries: figures.clicked, of: figures.countries, countriesBefore: figures.clickedBefore },
    countries: byClicks.slice(0, LISTED).map((one) => row(one, comparable)),
    movers: { up: mover(up), down: mover(down) },
    devices: [...devices].sort((left, right) => right.clicks - left.clicks).map((one) => ({ ...row(one, devicesComparable), key: one.key })),
    ticked: input.ticked,
    names: { devices: names.devices },
  };
}
