import { bandsSeesData, bandsSeesRows } from "../own/searchConsoleBands";
import { cannibalisationSeesData } from "../own/searchConsoleCannibalisation";
import { lowCtrSeesData } from "../own/searchConsoleLowCtr";
import type { ServerWords } from "../serverWords";
import type { SearchConsoleFormats } from "./searchConsoleWords";

/**
 * What Search Console's list screens hand their eye, each built in one place for the screen and for a chat app's
 * question (`chatAppEyes/searchConsole.ts`), so the two can't disagree (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * Option B): Keywords, Pages, Brand and non-brand, Position bands, Shown but not clicked, Keyword cannibalisation, Tracked
 * keywords and pages, and Volatility. Each takes the reads the screen makes and its words (`t`, `searchConsole`: the
 * reader's on the screen, English on the server), and gives back the figures `pageFindings` reads, or undefined until
 * the screen has them.
 */

/** A list's first page as the screen opens it (`useSearchConsoleList`'s `pageData`): its figures and the rows on screen. */
export type ListPage<Summary = unknown, Row = unknown> = { summary: Summary; rows: readonly Row[] | null; picked: boolean };

/** A list's page for the eye, once its figures are in. */
export function listPageOf<Summary, Row>(summary: Summary | null | undefined, rows: readonly Row[] | null | undefined): ListPage<Summary, Row> | undefined {
  return summary ? { summary, rows: rows ?? null, picked: true } : undefined;
}

/** A row ticked onto a chart, with its clicks against the span before; null clicks while on its way. */
export type TickedClicks = { name: string; clicks: number | null; previousClicks: number | null };

/** The ticked rows the eye reads: those whose clicks are in. */
const tickedIn = (ticked: readonly TickedClicks[]) => ticked.filter((row) => row.clicks !== null).map((row) => ({ name: row.name, clicks: row.clicks, previousClicks: row.previousClicks }));

/** Each band of Google's places as its boxes name it. */
const bandNames = (t: ServerWords) => ({
  "1-3": t("bands.top3"), "4-10": t("filters.bands.4-10"), "11-20": t("filters.bands.11-20"), "21-50": t("filters.bands.21-50"), "51+": t("filters.bands.51+"),
});

/** A chart's days, weeks or months by their first day (`day`), so the eye keeps the newest of a long chart, never its oldest. */
const byFirstDay = <Period extends { start: string }>(periods: readonly Period[] | null | undefined) => (periods ? periods.map((period) => ({ ...period, day: period.start })) : null);

/** Each Classification's name by its id, as the page's filter offers them. */
const kindNames = (choices: ReadonlyArray<{ id: string; name: string }> | null | undefined) => Object.fromEntries((choices ?? []).map((choice) => [choice.id, choice.name]));

/**
 * Keywords (search-console-keywords-way-2-plan-2026-11-17.md): the list's figures, every click the website had, the
 * keywords ticked onto the chart against the span before, and the names the page says things by (as Position bands and
 * Brand and non-brand name them).
 */
export function keywordsEyeData(reads: { page: ListPage | undefined; websiteClicks: number | null; ticked: readonly TickedClicks[] }, t: ServerWords) {
  if (!reads.page) return undefined;
  return {
    ...reads.page,
    ...(reads.websiteClicks !== null ? { website: { clicks: reads.websiteClicks } } : {}),
    ticked: tickedIn(reads.ticked),
    names: { ...bandNames(t), brand: t("filters.brandYes"), other: t("filters.brandNo"), hidden: t("performance.squares.groups.hidden") },
  };
}

/**
 * Pages (search-console-pages-way-1-plan-2026-11-17.md): the list's figures, the country's clicks from the boxes (the gap
 * Google leaves, said once), the pages ticked onto the chart against the span before by the names the chart says, and the
 * names the page says things by, each Classification's among them (pages not sorted yet are never named).
 */
export function pagesEyeData(reads: { page: ListPage | undefined; countryClicks: number | null; ticked: readonly TickedClicks[]; kinds: ReadonlyArray<{ id: string; name: string }> | null | undefined }, t: ServerWords) {
  if (!reads.page) return undefined;
  return {
    ...reads.page,
    ...(reads.countryClicks !== null ? { website: { clicks: reads.countryClicks } } : {}),
    ticked: tickedIn(reads.ticked),
    names: {
      // "Your pages", not "All your pages": the pages share out only what Google ties to one, and an answer read "All your
      // pages" as the whole website (18 November 2026).
      allPages: t("pages.eye.yourPages"), clicked: t("pages.eye.clicked"), half: t("pages.eye.half"), home: t("pages.chart.homePage"),
      hidden: t("performance.squares.groups.hidden"),
      kinds: kindNames(reads.kinds),
    },
  };
}

/**
 * Brand and non-brand: the list's figures, its brand words, the chart's periods, every click (the hidden ones too, as the
 * boxes count them) and the page's own names for the kinds of search. Only once every click is in (`every` not
 * undefined), so the eye never writes the share of named clicks alone while the totals are on their way.
 */
export function brandEyeData<Period extends { start: string }>(reads: {
  page: ListPage | undefined;
  brandWords: readonly string[] | null;
  periods: readonly Period[] | null | undefined;
  every: { totals: { clicks: number } | null; previous: { clicks: number } | null } | undefined;
}, t: ServerWords) {
  if (!reads.page || reads.every === undefined) return undefined;
  const { totals, previous } = reads.every;
  return {
    ...reads.page,
    brandWords: reads.brandWords,
    chart: byFirstDay(reads.periods),
    // Every click, the hidden ones too, as the boxes count them: the eye's share and hidden clicks are the boxes'.
    every: totals ? { clicks: totals.clicks, before: previous?.clicks ?? null } : null,
    names: { brand: t("performance.squares.groups.brand"), other: t("performance.squares.groups.named"), hidden: t("performance.squares.groups.hidden") },
  };
}

/** Position bands: the list's own figures the page shows and the table's own columns (`bandsSeesData`), the chart, and each band named as its boxes name it. */
export function bandsEyeData<Period extends { start: string }>(reads: { page: ListPage | undefined; periods: readonly Period[] | null | undefined }, t: ServerWords) {
  if (!reads.page) return undefined;
  return { ...reads.page, summary: bandsSeesData(reads.page.summary), rows: bandsSeesRows(reads.page.rows), chart: byFirstDay(reads.periods), names: bandNames(t) };
}

/** Shown but not clicked: the list's own figures the page shows and the table's columns (`lowCtrSeesData`), with the names the page says things by. */
export function lowCtrEyeData<Summary, Row>(reads: { summary: Summary | null | undefined; rows: readonly Row[] | null; kinds: ReadonlyArray<{ id: string; name: string }> | null | undefined }, t: ServerWords) {
  if (!reads.summary) return undefined;
  return {
    ...lowCtrSeesData(reads.summary, reads.rows),
    names: {
      these: t("lowCtr.eye.these"), usually: t("lowCtr.eye.usually"), position: t("lowCtr.eye.position"), firstPage: t("lowCtr.eye.firstPage"),
      home: t("pages.chart.homePage"),
      kinds: kindNames(reads.kinds),
    },
  };
}

/** Keyword cannibalisation: the list's own figures the page shows and the table's columns (`cannibalisationSeesData`), with the names the page says things by. */
export function competingEyeData<Summary, Row>(reads: { summary: Summary | null | undefined; rows: readonly Row[] | null }, t: ServerWords) {
  if (!reads.summary) return undefined;
  return {
    ...cannibalisationSeesData(reads.summary, reads.rows),
    names: { these: t("competing.eye.these"), competing: t("competing.eye.competing"), nextPage: t("competing.eye.nextPage"), average: t("competing.eye.average"), swapped: t("competing.eye.swapped") },
  };
}

/** The ticked rows' clicks either side of a Google update, by the names the chart says them (`tickedUpdateOf`). */
export type TickedUpdate = { title: string; startedOn: string; finishedOn: string; rows: Array<{ name: string; before: number; after: number }> };

/**
 * The figures a tracked screen hands its eye (search-console-tracked-way-1-plan-2026-11-18.md): the list's own (its
 * summary, with `trackedList`, and the rows on screen), every click the country had, for the tracked rows' share of them;
 * the rows ticked onto the chart against the span before; the ticked rows either side of the newest finished Google update;
 * and the names the page says things by. Moved here from the screens' `trackedSees.ts` on 21 November 2026.
 */
export function trackedPageData<Page extends object>({ page, countryClicks, ticked, update, names }: {
  page: Page;
  countryClicks: number | null;
  ticked: ReadonlyArray<{ name: string; clicks: number | null; previousClicks: number | null }>;
  update: TickedUpdate | null;
  names: Record<string, string>;
}) {
  return {
    ...page,
    ...(countryClicks !== null ? { website: { clicks: countryClicks } } : {}),
    ticked: ticked.filter((row) => row.clicks !== null),
    // Only an update the ticked rows had clicks either side of: two noughts were written up as "0 clicks a day before and 0
    // after the September spam update" (18 November 2026).
    ...(update && update.rows.some((row) => row.before + row.after > 0) ? { update } : {}),
    names,
  };
}

/** Tracked keywords' and Tracked pages' eye: `trackedPageData`, with the names the page says things by. */
export function trackedEyeData(reads: { page: ListPage | undefined; countryClicks: number | null; ticked: readonly TickedClicks[]; update: TickedUpdate | null; kind: "keywords" | "pages" }, t: ServerWords) {
  if (!reads.page) return undefined;
  return trackedPageData({
    page: reads.page,
    countryClicks: reads.countryClicks,
    ticked: reads.ticked,
    update: reads.update,
    names: {
      allTracked: t(`tracked.${reads.kind}.eye.all`), firstPage: t("tracked.keywords.eye.firstPage"), notShown: t("tracked.eye.notShown"), home: t("pages.chart.homePage"),
      onChart: t(`tracked.${reads.kind}.eye.onChart`),
    },
  });
}

/**
 * Volatility: the four boxes' figures (with the same days' times shown), the keywords on screen and the chart, each part
 * named as the page names it. `facts` is the screen's read (`readVolatilityFacts`).
 */
export function volatilityEyeData<Facts extends { latest: { day: string } | null }, Row, Period extends { start: string }>(
  reads: { facts: Facts | null | undefined; rows: readonly Row[] | null; periods: readonly Period[] | null | undefined },
  t: ServerWords,
  formats: Pick<SearchConsoleFormats, "shortDay">,
) {
  const { facts } = reads;
  if (!facts) return undefined;
  const latestDay = facts.latest?.day ?? null;
  return {
    volatility: facts,
    rows: reads.rows,
    picked: true,
    chart: byFirstDay(reads.periods),
    names: {
      latest: latestDay ? formats.shortDay(latestDay) : t("volatility.latestDayNone"),
      up: t("volatility.up"), down: t("volatility.down"),
      usual: t("sees.usual"), last7: t("sees.last7"), week7Before: t("sees.week7Before"), climbed5: t("sees.climbed5"), fell5: t("sees.fell5"), beforeIt: t("sees.beforeIt"), dayBefore: t("sees.dayBefore"),
    },
  };
}
