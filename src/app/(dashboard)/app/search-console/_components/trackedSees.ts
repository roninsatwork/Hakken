import { shiftDay } from "../../sites/_components/siteRange";

/**
 * What Tracked keywords and Tracked pages hand their eye (search-console-tracked-way-1-plan-2026-11-18.md), worked out
 * here once so the screens and the test of every period build it the same way (`searchConsolePeriods.test.ts`), as
 * Countries and devices' and Demand by Classification's are.
 */

/** A ticked row's own days, as the chart holds them: the dates' and the span before's. */
type TickedDays = { key: string; days: ReadonlyArray<{ day: string; clicks: number }> | null; daysBefore: ReadonlyArray<{ day: string; clicks: number }>; failed: boolean };

/** The ticked rows' clicks either side of a Google update, by the names the chart says them. */
export type TickedUpdate = { title: string; startedOn: string; finishedOn: string; rows: Array<{ name: string; before: number; after: number }> };

/**
 * The newest Google update that finished inside the dates, with its days after inside them too, and each ticked row's
 * clicks in the days before it began against the days after it finished (`window` days each side, as the Google updates
 * screen reads them), off the rows' own days. Null with no such update, or no ticked row's days yet.
 */
export function tickedUpdateOf(
  ticked: readonly TickedDays[],
  updates: ReadonlyArray<{ title: string; startedOn: string; finishedOn: string | null }>,
  to: string,
  window: number,
  nameOf: (key: string) => string,
): TickedUpdate | null {
  const done = updates
    .filter((update): update is { title: string; startedOn: string; finishedOn: string } => update.finishedOn !== null && shiftDay(update.finishedOn, window) <= to)
    .sort((left, right) => right.startedOn.localeCompare(left.startedOn))[0];
  if (!done) return null;
  const before = { from: shiftDay(done.startedOn, -window), to: shiftDay(done.startedOn, -1) };
  const after = { from: shiftDay(done.finishedOn, 1), to: shiftDay(done.finishedOn, window) };
  const rows = ticked.flatMap((row) => {
    if (!row.days || row.failed) return [];
    const days = [...row.daysBefore, ...row.days];
    const clicksIn = (span: { from: string; to: string }) => days.reduce((sum, day) => sum + (day.day >= span.from && day.day <= span.to ? day.clicks : 0), 0);
    return [{ name: nameOf(row.key), before: clicksIn(before), after: clicksIn(after) }];
  });
  return rows.length > 0 ? { title: done.title, startedOn: done.startedOn, finishedOn: done.finishedOn, rows } : null;
}

/**
 * The figures a tracked screen hands its eye: the list's own (its summary, with `trackedList`, and the rows on screen),
 * every click the country had, for the tracked rows' share of them; the rows ticked onto the chart against the span
 * before; the ticked rows either side of the newest finished Google update; and the names the page says things by.
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
