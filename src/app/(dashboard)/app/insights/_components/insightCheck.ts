import { formatFact, type Fact } from "@/convex/utils/insightFacts";
import { formatDay } from "../../sites/_components/siteFormat";

type Clock = { from: string; why: "WRITTEN" | "PAGE_CHANGED"; days: number; page?: string };
type Progress = { now: number; against: number | null; than: "YEAR" | "BEFORE" | "WRITTEN"; unit: Fact["unit"]; to?: string };
type Words = (key: string, values?: Record<string, string | number>) => string;

const figure = (value: number, unit: Fact["unit"]) => formatFact({ value, unit });

/**
 * How a finding will be checked, as its page says it (utils/insightClock.ts;
 * Anthony, 13 October 2026: "go" on counting from the change): the days
 * after it was written, or after its page changed, against the same days a
 * year before — or, for a figure held for no span, read again on its day.
 */
export function howWeKnowWords(
  finding: { checkOn: string | null; howWeKnow: string; clock: Clock | null; progress: Progress | null },
  check: Words,
  legacy: (day: string) => string,
): string {
  if (!finding.clock) return finding.checkOn ? legacy(formatDay(finding.checkOn)) : finding.howWeKnow;
  const { clock } = finding;
  return check(clock.page ? "clock" : "clockSite", {
    days: clock.days,
    start: clock.why === "PAGE_CHANGED" ? check("changed", { day: formatDay(clock.from) }) : check("written"),
    than: check(`with.${finding.progress?.than === "BEFORE" ? "BEFORE" : "YEAR"}`),
    day: formatDay(finding.checkOn ?? clock.from),
    how: finding.howWeKnow,
  });
}

/** Its figure so far, as this week's run read it; null before the first. */
export function soFarWords(progress: Progress | null, clock: Clock | null, check: Words): string | null {
  if (!progress || progress.against === null) return null;
  if (progress.than === "WRITTEN") return check("soFarWritten", { now: figure(progress.now, progress.unit), against: figure(progress.against, progress.unit) });
  return check("soFar", {
    now: figure(progress.now, progress.unit), against: figure(progress.against, progress.unit),
    days: clock?.days ?? "", to: progress.to ? formatDay(progress.to) : "", than: check(`in.${progress.than}`),
  });
}

/** The same, short, for a table's row. */
export function soFarRow(progress: Progress | null, check: Words): string | null {
  if (!progress || progress.against === null) return null;
  return check("soFarRow", { now: figure(progress.now, progress.unit), against: figure(progress.against, progress.unit) });
}
