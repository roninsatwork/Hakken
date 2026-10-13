import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { FACT_UNITS, formatFact, shiftDay, type Fact } from "./insightFacts";
import { fingerprintChanges, outcomeOf, type Outcome } from "./insightTrack";
import { pageFactsValidator, type PageFacts } from "./moneyPageChecks";

/**
 * When a finding is checked, and on what (Anthony, 13 October 2026, on a
 * check set for 9 January: "why is this so far in the future"; "go" on
 * counting from the change). A finding watches a figure the run holds for
 * 30 or 90 days. Its clock starts when it is written, and again whenever
 * Hakken sees its page change; it is judged once every day of that figure
 * falls after the clock started, against the same days a year before (or
 * the days just before, where a year before isn't held) — on 30 days first
 * for a short check, going on to 90 when 30 show no clear change — and its
 * figure so far is kept each week for the screens. A figure held for no span — links,
 * mentions, reviews — is judged as before: read again on its day, against
 * what it was when written.
 */

/** The spans a check is judged on. */
export const CLOCK_DAYS = [30, 90] as const;
/** Days after a span ends before its figures are all in. */
const LAG_DAYS = 3;
/**
 * A specialist's check shorter than this starts on 30 days where its figure
 * is held for 30, and goes on to 90 when 30 show no clear change.
 */
const SHORT_CHECK = 75;
/** Days past its check a figure no longer read is given, before the finding is closed as too early to tell. */
const GRACE_DAYS = 28;
/** A page's words moving by this share is a change. */
const WORDS_MOVED = 0.1;

const unitValidator = v.union(...FACT_UNITS.map((unit) => v.literal(unit)));

export const clockValidator = v.object({
  /** The day its days start. */
  from: v.string(),
  why: v.union(v.literal("WRITTEN"), v.literal("PAGE_CHANGED")),
  /** The span it is judged on, 30 or 90 days. */
  days: v.number(),
  /** The watched figure's key with that span, without its period: `ga.landing./guide/.conversions.90`. */
  key: v.string(),
  /** The page it is about, whose changes start its days again. */
  page: v.optional(v.string()),
});
export type Clock = Infer<typeof clockValidator>;

/** The finding's page as last read, to see it change. */
export const pageSeenValidator = v.object({ day: v.string(), facts: pageFactsValidator, structured: v.array(v.string()) });
export type PageSeen = Infer<typeof pageSeenValidator>;

/** Its watched figure so far, as this week's run read it. */
export const progressValidator = v.object({
  day: v.string(),
  now: v.number(),
  against: v.union(v.number(), v.null()),
  /** What it is set against: the same days a year before, the days just before, or the figure when written. */
  than: v.union(v.literal("YEAR"), v.literal("BEFORE"), v.literal("WRITTEN")),
  unit: unitValidator,
  from: v.optional(v.string()),
  to: v.optional(v.string()),
});
export type Progress = Infer<typeof progressValidator>;

const WINDOWED = /^(.*)\.(30|90|365)\.(now|before|year)$/;
const PAGED = /^(?:ga\.landing|ga\.landingSearch|sc\.page|tech\.page)\.(\/.*?)\.[A-Za-z]+(?:\.(?:30|90|365)\.(?:now|before|year))?$/;

/** The page a watched figure is about, when it is one page's. */
export function pageOfKey(key: string): string | null {
  return PAGED.exec(key)?.[1] ?? null;
}

/**
 * A new finding's clock, from the day it is written: its figure held for 30
 * days when its specialist's check is a short one and 30 days are held with
 * something to set them against, else for 90; none for a figure held for no
 * span.
 */
export function clockFor(watchKey: string, checkInDays: number, facts: ReadonlyMap<string, Fact>, from: string): Clock | null {
  const base = WINDOWED.exec(watchKey)?.[1];
  if (!base) return null;
  const held = (days: number) => facts.has(`${base}.${days}.now`) && (facts.has(`${base}.${days}.year`) || facts.has(`${base}.${days}.before`));
  const days = checkInDays < SHORT_CHECK && held(30) ? 30 : held(90) ? 90 : null;
  if (!days) return null;
  const page = pageOfKey(watchKey);
  return { from, why: "WRITTEN", days, key: `${base}.${days}`, ...(page ? { page } : {}) };
}

/**
 * A new finding's check: its clock from today and the day it is due, where
 * its figure is held for a span; else the day its specialist gave it, 14 to
 * 120 days on.
 */
export function checkOf(draft: { watch?: { key: string }; checkInDays?: number }, facts: ReadonlyMap<string, Fact>, today: string): { clock?: Clock; checkOn: string } {
  const days = Math.min(120, Math.max(14, Math.round(draft.checkInDays ?? 56)));
  const clock = draft.watch && facts.has(draft.watch.key) ? clockFor(draft.watch.key, days, facts, today) : null;
  return clock ? { clock, checkOn: checkOnFor(clock) } : { checkOn: shiftDay(today, days) };
}

/** The day a clock's finding is due: once its span has passed since it started, and the figures are in. */
export function checkOnFor(clock: Pick<Clock, "from" | "days">): string {
  return shiftDay(clock.from, clock.days + LAG_DAYS);
}

/** Whether a page changed between two reads: a part the money pages' check names, its title or opening, or a tenth of its words. */
export function pageMoved(before: { facts: PageFacts; structured: string[] }, after: { facts: PageFacts; structured: string[] }): boolean {
  if (fingerprintChanges({ kind: null, ...before }, { kind: null, ...after }).length > 0) return true;
  const plain = (text: string | null) => (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const was = before.facts, now = after.facts;
  if (was.words === 0 || now.words === 0) return false;
  return plain(was.title) !== plain(now.title) || plain(was.opening) !== plain(now.opening) || Math.abs(now.words - was.words) / was.words >= WORDS_MOVED;
}

export type OpenFinding = {
  findingId: Id<"insightFindings">;
  specialist: string;
  watch: { key: string; direction: "UP" | "DOWN" };
  /** Its watched figure when written. */
  then: Fact | null;
  /** The day it was written, and the days its specialist gave its check. */
  written: string;
  checkInDays: number;
  clock: Clock | null;
  checkOn: string | null;
};

/** What a finding's week changes on it: its clock and day, its figure so far, its page as read. */
export type Update = { findingId: Id<"insightFindings">; clock?: Clock; checkOn?: string; progress?: Progress; pageSeen?: PageSeen };
type Scored = { findingId: Id<"insightFindings">; specialist: string; outcome: Outcome; note: string };

const SPAN_WORDS: Record<Progress["than"], string> = { YEAR: "the same days a year before", BEFORE: "the days just before", WRITTEN: "when the finding was written" };

/**
 * Each open finding's week: a finding from before clocks gets one from the
 * day it was written; a clock starts again from the newest change seen on its
 * page since it started; its figure so far is kept; and it is judged once it
 * is due and every day of its figure is after its clock started.
 */
export function trackOpen(open: readonly OpenFinding[], facts: ReadonlyMap<string, Fact>, changedOn: ReadonlyMap<string, string>, today: string) {
  const outcomes: Scored[] = [];
  const updates: Update[] = [];
  for (const finding of open) {
    let clock = finding.clock ?? clockFor(finding.watch.key, finding.checkInDays, facts, finding.written);
    const update: Update = { findingId: finding.findingId };
    if (clock && !finding.clock) update.clock = clock;
    const changed = clock?.page ? changedOn.get(clock.page) : undefined;
    if (clock && changed && changed > clock.from && changed <= today) {
      clock = { ...clock, from: changed, why: "PAGE_CHANGED" };
      update.clock = clock;
    }
    const checkOn = clock ? checkOnFor(clock) : finding.checkOn;
    if (clock && checkOn !== finding.checkOn) update.checkOn = checkOn!;

    if (clock) {
      const now = facts.get(`${clock.key}.now`);
      const year = facts.get(`${clock.key}.year`);
      const against = year ?? facts.get(`${clock.key}.before`);
      const than = year ? "YEAR" as const : "BEFORE" as const;
      if (now) update.progress = { day: today, now: now.value, against: against?.value ?? null, than, unit: now.unit, ...(now.from ? { from: now.from } : {}), ...(now.to ? { to: now.to } : {}) };
      if (checkOn && checkOn <= today) {
        const outcome = now && now.from && now.from > clock.from ? (against ? outcomeOf(against.value, now.value, finding.watch.direction, now.unit) : "TOO_EARLY") : null;
        const base = clock.key.replace(/\.30$/, "");
        const longer = clock.days === 30 && facts.has(`${base}.90.now`) && (facts.has(`${base}.90.year`) || facts.has(`${base}.90.before`));
        if (outcome === "TOO_EARLY" && longer) {
          // Thirty days show no clear change: it goes on to ninety, from the same start.
          clock = { ...clock, days: 90, key: `${base}.90` };
          update.clock = clock;
          update.checkOn = checkOnFor(clock);
        } else if (now && outcome) {
          outcomes.push({
            findingId: finding.findingId, specialist: finding.specialist,
            outcome,
            note: `${now.label}: ${formatFact(now)} in the ${clock.days} days to ${now.to ?? today}${against ? `, against ${formatFact(against)} ${SPAN_WORDS[than]}` : ""}.`,
          });
        } else if (!now && today >= shiftDay(checkOn, GRACE_DAYS)) {
          outcomes.push({ findingId: finding.findingId, specialist: finding.specialist, outcome: "TOO_EARLY", note: `${finding.then?.label ?? "Its figure"} is no longer read, so it can't be told.` });
        }
      }
    } else {
      // A figure held for no span: read again on its day, against what it was when written.
      const current = facts.get(finding.watch.key);
      if (current) update.progress = { day: today, now: current.value, against: finding.then?.value ?? null, than: "WRITTEN", unit: current.unit, ...(current.from ? { from: current.from } : {}), ...(current.to ? { to: current.to } : {}) };
      if (finding.then && current && checkOn && checkOn <= today) {
        outcomes.push({
          findingId: finding.findingId, specialist: finding.specialist,
          outcome: outcomeOf(finding.then.value, current.value, finding.watch.direction, finding.then.unit),
          note: `${finding.then.label}: ${formatFact(finding.then)} then, ${formatFact(current)} now.`,
        });
      }
    }
    if (update.clock || update.checkOn || update.progress) updates.push(update);
  }
  return { outcomes, updates };
}

/** How a finding is checked, for Ask Hakken, in the words the finding's page uses. */
export function checkForAssistant(clock: Clock | null | undefined, progress: Progress | null | undefined, checkOn: string | null | undefined): string | null {
  const soFar = progress
    ? ` So far: ${formatFact({ value: progress.now, unit: progress.unit })}${progress.to ? ` in the days to ${progress.to}` : ""}${progress.against !== null ? `, against ${formatFact({ value: progress.against, unit: progress.unit })} ${SPAN_WORDS[progress.than]}` : ""}.`
    : "";
  if (!clock) return checkOn ? `Checked on ${checkOn}, against its figure when written.${soFar}` : null;
  const start = clock.why === "PAGE_CHANGED" ? `its page changed on ${clock.from}` : `it was written, on ${clock.from}`;
  return `Judged on the ${clock.days} days after ${start}, against the same days a year before, on ${checkOn ?? checkOnFor(clock)}; the days start again if its page changes first.${soFar}`;
}
