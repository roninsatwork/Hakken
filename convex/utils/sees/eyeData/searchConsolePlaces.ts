import { ALPHA3_TO_ALPHA2 } from "../../countryCodes";
import type { ServerWords } from "../serverWords";

/**
 * What Search Console's Countries and devices hands its eye, built in one place for the screen and for a chat app's
 * question (`chatAppEyes/searchConsole.ts`), so the two can't disagree (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * Option B). Moved here from the screen's `placesSees.ts` and `countries.ts`, which hand these on, on 21 November 2026.
 */

// ---------------------------------------------------------------------------
// A country in the reader's words
// ---------------------------------------------------------------------------
/**
 * A country as the reader reads it: Google's three-letter code (`gbr`) turned
 * into the two-letter one the reader's language names, so `Intl.DisplayNames`
 * writes "United Kingdom" in English and "Regno Unito" in Italian. The codes
 * are the server's own list (`convex/utils/countryCodes.ts`). Null for a code
 * nobody can name.
 */
export function countryName(code: string, locale: string): string | null {
  const alpha2 = ALPHA3_TO_ALPHA2[code.toUpperCase()];
  return alpha2 ? regionName(alpha2, locale) : null;
}

/**
 * A two-letter country code (`GB`, as Google Analytics' `countryId` gives it)
 * in the reader's language. Null for a code nobody can name, "(not set)"
 * among them.
 */
export function regionName(alpha2: string, locale: string): string | null {
  if (!/^[a-z]{2}$/i.test(alpha2)) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(alpha2.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/**
 * The countries English says with "the" before them: "in the United Kingdom", "in the Netherlands", but "in France"
 * (Countries and devices' "Clicks in the United Kingdom" and "Devices in the United Kingdom", search-console-countries-and-
 * devices-way-1-plan-2026-11-18.md). By their two-letter codes.
 */
const TAKES_THE = new Set([
  "AE", "AX", "BQ", "BS", "CC", "CF", "CK", "DO", "EH", "FK", "FO", "GB", "GM", "GS", "HM", "IM", "IO", "KM", "KY", "MH",
  "MP", "MV", "NL", "PH", "PN", "PS", "SB", "SC", "TC", "TF", "UM", "US", "VA", "VG", "VI",
]);

/**
 * A country as a sentence says it after "in": "the United Kingdom" and "France" in English. Other languages get the
 * name alone, and their words are written round it ("Clic · Regno Unito"). Null for a code nobody can name.
 */
export function countryInWords(code: string, locale: string): string | null {
  const alpha2 = ALPHA3_TO_ALPHA2[code.toUpperCase()];
  const name = alpha2 ? regionName(alpha2, locale) : null;
  if (!name || !alpha2) return name;
  return locale.startsWith("en") && TAKES_THE.has(alpha2) ? `the ${name}` : name;
}

// ---------------------------------------------------------------------------
// The boxes' figures
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The screen's figures for its eye
// ---------------------------------------------------------------------------

/** The devices Search Console names. */
const DEVICES = ["DESKTOP", "MOBILE", "TABLET"];

/** A country's and a device's name as the page's tables say them, in the reader's language. */
export function placeRowNames(t: ServerWords, language: string) {
  return {
    country: (key: string) => countryName(key, language) ?? t("places.unknownCountry"),
    device: (key: string) => (DEVICES.includes(key) ? t(`places.deviceNames.${key}`) : key),
  };
}

/**
 * Countries and devices' figures for its eye: the boxes, every country against the dates before, the devices in the
 * country chosen, and the countries ticked onto the chart, by the names the page says them by (`t`: `searchConsole`).
 * Undefined until both lists and the country chosen are in.
 */
export function placesEyeData(reads: {
  /** The country chosen, or the website's main home country: Google's code. */
  chosen: string | null;
  countries: ReadonlyArray<PlaceRow & { name: string }> | undefined;
  summary: PlaceSummary;
  comparable: boolean;
  devices: ReadonlyArray<PlaceRow & { name: string }> | undefined;
  devicesComparable: boolean;
  ticked: ReadonlyArray<{ key: string; clicks: number | null; previousClicks: number | null }>;
}, t: ServerWords, language: string) {
  const { chosen, countries, devices } = reads;
  if (!countries || !devices || !chosen) return undefined;
  const chosenName = countryName(chosen, language) ?? t("places.unknownCountry");
  const chosenWords = countryInWords(chosen, language) ?? t("places.unknownCountry");
  return placesPageData({
    chosen,
    countries,
    summary: reads.summary,
    comparable: reads.comparable,
    devices,
    devicesComparable: reads.devicesComparable,
    ticked: reads.ticked.filter((row) => row.clicks !== null).map((row) => ({ name: countryName(row.key, language) ?? row.key, clicks: row.clicks ?? 0, previousClicks: row.previousClicks })),
    names: {
      chosen: chosenName,
      others: t("places.eye.others"),
      clicked: t("places.boxes.clicked"),
      devices: Object.fromEntries(devices.map((row) => [row.key, t("places.eye.deviceIn", { device: row.name, country: chosenWords })])),
    },
  });
}
