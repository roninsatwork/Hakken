import { shiftDay } from "../../searchConsoleDays";
import { seen, toPage, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";
import { HIGH_ABOVE_USUAL, aboveUsual, levelOf } from "../searchConsoleVolatility";

/**
 * What Hakken sees on Search Console's Volatility and Google updates
 * (docs/plans/active/search-console-volatility-plan.md §4): "is it Google, or
 * is it us?" answered as an SEO specialist would, then what to do first.
 * Fixed rules over the figures the page's own query reads — never an AI
 * model, never a purchase — most important first, sent as codes with their
 * numbers and days for the page's words (`searchConsole.seen.<screen>`).
 * "Usual" is the website's own (§3, 2026-10-11): a real website's positions
 * move 1 to 2.5 places a day, so the box says how much more than that.
 */

type Maybe<T> = T | null | undefined | false;

/** Days after an update finishes before its effect on clicks is read, as Google updates reads it (`consoleUpdateWindowDays`). */
export const SETTLE_DAYS = 14;
/** A change in clicks or impressions this big, as a share, is worth saying. */
const CLICKS_WORTH_SAYING = 0.1;
/** Clicks falling this much during an update are said to fall with it. */
const CLICKS_FELL_WITH_IT = 0.05;
/** An update's days this much above the fortnight before, as a percentage, moved the website: the High level's line. */
const UPDATE_MOVED_FROM = Math.round((HIGH_ABOVE_USUAL - 1) * 100);

/** One Google update as the page reads it: its days, and the website's volatility before it began and while it rolled out. */
export type UpdateSeen = { title: string; startedOn: string; finishedOn: string | null; before: number | null; during: number | null };

/** What the Volatility page's figures say, for its box. */
export type VolatilityFacts = {
  /** The newest complete day, with its score where enough keywords counted, and its keywords moved 5 places or more. */
  latest: { day: string; volatility: number | null; movedUp5: number; movedDown5: number } | null;
  /** The website's usual: its average over the complete days of the four weeks before. */
  usual: number | null;
  /** The newest Google update still rolling out, or finished in the last `SETTLE_DAYS` days. */
  update: UpdateSeen | null;
  /** Clicks and impressions, the last 7 days and the 7 before. */
  clicks: { now: number; before: number | null };
  impressions: { now: number; before: number | null };
};

/** A change as a share: -0.094 for a fall of 9.4%. Null without the days before. */
const change = (now: number, before: number | null): number | null => (before === null || before === 0 ? null : (now - before) / before);
const percent = (share: number) => Math.round(Math.abs(share) * 100);

/** Volatility (§4.1). */
export function volatilitySees(facts: VolatilityFacts): Seen {
  const latest = facts.latest;
  if (!latest) return seen([{ code: "noDays" }]);
  if (latest.volatility === null) return seen([{ code: "tooFew", days: [latest.day] }]);
  const level = levelOf(latest.volatility, facts.usual);
  const clicks = change(facts.clicks.now, facts.clicks.before);
  const impressions = change(facts.impressions.now, facts.impressions.before);
  const dropped = latest.movedDown5;
  const checkDropped: Maybe<SeenStep> = dropped > 0 && { code: "checkDropped", a: dropped, link: "seeKeywords", to: toPage("volatility", { way: "down" }) };
  const update = facts.update;

  // Google's update moved the website when its days ran 30% or more above the fortnight before — whatever the
  // newest day says, since an update's effect shows across its days — or when the newest day is high while it plays.
  const more = update ? aboveUsual(update.during, update.before) : null;
  if (update && ((more !== null && more >= UPDATE_MOVED_FROM) || level !== "NORMAL")) {
    const settled = update.finishedOn ? shiftDay(update.finishedOn, SETTLE_DAYS) : null;
    const says: Array<Maybe<SeenPhrase>> = [
      update.finishedOn
        ? { code: more === null ? "updateMovedALot" : "updateMoved", text: update.title, a: more ?? undefined, days: [update.startedOn, update.finishedOn] }
        : { code: more === null ? "updateRollingALot" : "updateRolling", text: update.title, a: more ?? undefined, days: [update.startedOn] },
      clicks !== null && clicks <= -CLICKS_FELL_WITH_IT && { code: "clicksFellWithIt", a: percent(clicks) },
      { code: "pointsToGoogle" },
    ];
    const steps: Array<Maybe<SeenStep>> = [
      settled
        ? { code: "holdUntil", days: [settled], link: "seeUpdate", to: toPage("google-updates") }
        : { code: "holdWhileRolling", link: "seeUpdate", to: toPage("google-updates") },
      checkDropped,
      dropped > 0 && settled !== null && { code: "pagesIfNotBack", days: [settled], link: "seePages", to: toPage("pages") },
    ];
    return seen(says, steps);
  }

  if (level !== "NORMAL") {
    return seen(
      [{ code: "movedNoUpdate", a: aboveUsual(latest.volatility, facts.usual) ?? 0, days: [latest.day] }, { code: "ownPagesFirst" }],
      [checkDropped, { code: "lookAtPages", link: "seePages", to: toPage("pages") }],
    );
  }

  // Calm: when clicks fell with impressions while positions held, fewer people searched.
  if (clicks !== null && impressions !== null && clicks <= -CLICKS_WORTH_SAYING && impressions <= -CLICKS_WORTH_SAYING) {
    return seen(
      [{ code: "demand", a: percent(impressions) }, { code: "isDemand" }],
      [{ code: "seeSearches", link: "seeKeywords", to: toPage("keywords") }],
    );
  }
  const clicksMoved = clicks !== null && Math.abs(clicks) >= CLICKS_WORTH_SAYING;
  return seen(
    [
      facts.usual === null
        ? { code: "calmNoUsual", a: latest.volatility, days: [latest.day] }
        : { code: "calm", a: latest.volatility, b: facts.usual, days: [latest.day] },
      clicksMoved && { code: clicks > 0 ? "clicksRoseCalm" : "clicksFellCalm", a: percent(clicks) },
    ],
    [clicksMoved && { code: "seeWins", link: "seeWins", to: toPage("wins-and-losses") }],
  );
}

/** An update as Google updates reads it: its volatility, and its clicks and position the days before it began against the days after it finished. */
export type UpdateFacts = UpdateSeen & { clicksChange: number | null; positionBefore: number | null; positionAfter: number | null };

/** Google updates (§4.2): the newest update in the dates, and what it did. */
export function updatesSees(update: UpdateFacts | null, newest: string): Seen {
  if (!update) return seen([{ code: "noneInDates" }]);
  const more = aboveUsual(update.during, update.before);
  if (!update.finishedOn) {
    return seen(
      [{ code: "rolling", text: update.title, days: [update.startedOn] }, more !== null && { code: "movingMore", a: more }],
      [{ code: "holdWhileRolling", link: "seeVolatility", to: toPage("volatility") }],
    );
  }
  const settled = shiftDay(update.finishedOn, SETTLE_DAYS);
  if (settled > newest) {
    return seen(
      [
        { code: "finished", text: update.title, days: [update.finishedOn] },
        update.during !== null && update.before !== null && (more !== null
          ? { code: "movedMore", a: more, b: update.during, c: update.before }
          : { code: "movedAsUsual", b: update.during, c: update.before }),
        { code: "clicksShowOn", days: [settled] },
      ],
      [{ code: "holdUntil", days: [settled], link: "seeVolatility", to: toPage("volatility") }],
    );
  }
  const clicks = update.clicksChange;
  return seen(
    [
      clicks === null
        ? { code: "notKnown", text: update.title }
        : { code: clicks >= 0 ? "raisedClicks" : "cutClicks", text: update.title, a: percent(clicks) },
      update.positionBefore !== null && update.positionAfter !== null && { code: "positionFromTo", a: update.positionBefore, b: update.positionAfter },
    ],
    [clicks !== null && clicks <= -CLICKS_WORTH_SAYING && { code: "seeLosses", link: "seeWins", to: toPage("wins-and-losses", { move: "loss" }) }],
  );
}

/** The newest update in the dates as Google updates' box reads it (§4.2): its volatility, and its clicks and position before → after. */
export function newestUpdateFacts(updates: ReadonlyArray<{
  title: string;
  startedOn: string;
  finishedOn: string | null;
  state: "done" | "rolling" | "waiting";
  before: { clicks: number; position: number } | null;
  after: { clicks: number; position: number } | null;
  volatility?: { before: number | null; during: number | null };
}>): UpdateFacts | null {
  const update = [...updates].sort((left, right) => right.startedOn.localeCompare(left.startedOn))[0];
  if (!update) return null;
  const done = update.state === "done" && update.before && update.after;
  return {
    title: update.title,
    startedOn: update.startedOn,
    finishedOn: update.finishedOn,
    before: update.volatility?.before ?? null,
    during: update.volatility?.during ?? null,
    clicksChange: done && update.before!.clicks > 0 ? (update.after!.clicks - update.before!.clicks) / update.before!.clicks : null,
    positionBefore: done ? Math.round(update.before!.position * 10) / 10 : null,
    positionAfter: done ? Math.round(update.after!.position * 10) / 10 : null,
  };
}
