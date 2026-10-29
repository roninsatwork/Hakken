import { weekStart } from "@/convex/utils/searchConsolePacks";

/**
 * The rule every `ChartExplorer` follows (docs/developer/screen-kit.md, "Configurable charts"; Anthony, 2026-10-20:
 * "I think this is great, let's lock this in as a component style"): the step the page's dates call for, which steps
 * are whole, whether a year before can be compared, and better or worse over the latest steps. Plain code, so a chart
 * and its tests share one rule; what a step holds is each chart's own.
 */

export type ExplorerStep = "day" | "week" | "month";

/** A step's dates: its key (the day, its week's Monday, or its month) and the first and last days held in it. */
export type StepSpan = { key: string; first: string; last: string };

const DAY_MS = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The step the page's dates call for ("this should be automatic from the date range"; calendar-periods-plan.md, rule
 * 8): days for the weeks and months, weeks for the quarters, months for the year — the same rule as every chart. The
 * page's step menu can change it, and the explorer follows the menu.
 */
export function stepFor(period: string): ExplorerStep {
  return period === "last12Months" || period === "thisYear" ? "month" : period === "last3Months" || period === "last6Months" || period === "thisQuarter" || period === "lastQuarter" ? "week" : "day";
}

/**
 * Whether the dates can be set against the same dates a year before: only for This Year, month against month. A year
 * ago only weeks and months are kept, so a week, month or quarter a year before would be read from weeks and months
 * that miss the dates (Anthony, 2026-10-20: the audit; "fix all"; calendar-periods-plan.md, the chart explorer's
 * point 2: quarters compare with a year before in figures and tables only).
 */
export const yearComparable = (period: string) => period === "last12Months" || period === "thisYear";

/** A step's key for a day: the day, its week's Monday, or its month. */
export const stepKey = (day: string, step: ExplorerStep) => (step === "day" ? day : step === "week" ? weekStart(day) : day.slice(0, 7));

/** A step's last day. */
function stepEnd(key: string, step: ExplorerStep): string {
  if (step === "day") return key;
  if (step === "week") return shift(key, 6);
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * A step held only in part — the month or week still going, or one the dates cut — is left out of the scorecard,
 * and drawn as a part of one, so its dip reads as fewer days rather than a fall.
 */
export const whole = (span: StepSpan, step: ExplorerStep) => span.last >= stepEnd(span.key, step) && span.first === (step === "month" ? `${span.key}-01` : span.key);

/**
 * The steps the scorecard reads, from the span just before the dates and the dates themselves, whole steps only: the
 * latest and the one before, the last three and the three before, and the same three a year before.
 */
export function scoreWindows<S extends StepSpan>(before: readonly S[], now: readonly S[], year: readonly S[], step: ExplorerStep) {
  const timeline = [...before.filter((span) => !now.some((one) => one.key === span.key)), ...now].filter((span) => whole(span, step));
  const n = timeline.length;
  const yearWhole = year.filter((span) => whole(span, step));
  return {
    latest: timeline.slice(Math.max(0, n - 1)),
    previous: timeline.slice(Math.max(0, n - 2), Math.max(0, n - 1)),
    last3: timeline.slice(Math.max(0, n - 3)),
    previous3: timeline.slice(Math.max(0, n - 6), Math.max(0, n - 3)),
    yearAgo: yearWhole.slice(Math.max(0, yearWhole.length - 3)),
  };
}

/** A line's scorecard: its figure over each window, none where a window is short of its steps. */
export type ExplorerScore = { key: string; name: string; latest: number | null; previous: number | null; last3: number | null; previous3: number | null; yearAgo: number | null };

/**
 * Each line's scorecard from the windows: `valueOver` is the chart's own figure over some steps (the visits over the
 * conversions for visits for one, never an average of each step's).
 */
export function scoresOf<S extends StepSpan, L extends { key: string; name: string }>(
  windows: ReturnType<typeof scoreWindows<S>>,
  lines: readonly L[],
  valueOver: (line: L, spans: readonly S[]) => number | null,
): ExplorerScore[] {
  const of = (line: L, spans: readonly S[], count: number) => (spans.length === count ? valueOver(line, spans) : null);
  return lines.map((line) => ({
    key: line.key,
    name: line.name,
    latest: of(line, windows.latest, 1),
    previous: of(line, windows.previous, 1),
    last3: of(line, windows.last3, 3),
    previous3: of(line, windows.previous3, 3),
    yearAgo: of(line, windows.yearAgo, 3),
  }));
}

/** A change between two figures as better, worse or about the same (within 2%), by the measure's own direction. */
export function verdictOf(fewerIsBetter: boolean, now: number | null, before: number | null): { kind: "better" | "worse" | "same"; by: number } | null {
  if (now === null || before === null || before === 0) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.02) return { kind: "same", by: 0 };
  const improved = fewerIsBetter ? change < 0 : change > 0;
  return { kind: improved ? "better" : "worse", by: Math.round(Math.abs(change) * 100) };
}
