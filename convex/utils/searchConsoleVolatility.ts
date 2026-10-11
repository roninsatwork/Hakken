/**
 * Volatility (docs/plans/active/search-console-volatility-plan.md §3): how
 * much a website's positions on Google moved from one day to the next, out of
 * 10, read from Search Console's own daily lines — nothing bought.
 *
 * A keyword counts on a day when it had 10 or more impressions that day and
 * the day before; its move is the change in its average position, counted up
 * to 10 places, so one keyword falling forty places cannot carry the day. The
 * day's score is the average move of the keywords counted: 0 when nothing
 * moved, 10 when every one moved ten places or more. Fewer than 10 keywords
 * counted is too few to judge, and the day has no score.
 */

/** Impressions a keyword needs on both days to count. */
export const VOLATILITY_IMPRESSIONS = 10;
/** Keywords a day needs counted to have a score. */
export const VOLATILITY_KEYWORDS_LEAST = 10;
/** The most one keyword's move counts for. */
const MOVE_COUNTED_TO = 10;
/** A move this big is a keyword "moved 5 places or more". */
export const BIG_MOVE = 5;

/**
 * The levels (§2.1; changed 2026-10-11 on real data, Anthony: "yes" to the
 * change): against the website's own usual — its average over the complete
 * days of the four weeks before — never fixed numbers, since a real
 * website's day scores 1 to 2.5. Normal up to 30% above its usual, High from
 * 30%, Very high from 60%.
 */
export const HIGH_ABOVE_USUAL = 1.3;
export const VERY_HIGH_ABOVE_USUAL = 1.6;
/** Days the usual is the average of. */
export const USUAL_DAYS = 28;
export type VolatilityLevel = "NORMAL" | "HIGH" | "VERY_HIGH";

/** A keyword's day as the kept lines add it up. */
export type Standing = { impressions: number; positionSum: number };

/** What a day, week or month row keeps (`searchConsoleWeeks`): its score, if it has one, the keywords counted, and the big moves either way. */
export type Volatility = { volatility?: number; volatilityKeywords: number; movedUp5: number; movedDown5: number };

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** One day against the day before. */
export function dayVolatility(today: ReadonlyMap<string, Standing>, before: ReadonlyMap<string, Standing>): Volatility {
  let moved = 0;
  let counted = 0;
  let up = 0;
  let down = 0;
  for (const [keyword, now] of today) {
    const then = before.get(keyword);
    if (!then || now.impressions < VOLATILITY_IMPRESSIONS || then.impressions < VOLATILITY_IMPRESSIONS) continue;
    // Positive when the keyword fell: its position's number grew.
    const change = now.positionSum / now.impressions - then.positionSum / then.impressions;
    counted += 1;
    moved += Math.min(Math.abs(change), MOVE_COUNTED_TO);
    if (change <= -BIG_MOVE) up += 1;
    else if (change >= BIG_MOVE) down += 1;
  }
  const counts = { volatilityKeywords: counted, movedUp5: up, movedDown5: down };
  return counted >= VOLATILITY_KEYWORDS_LEAST ? { ...counts, volatility: oneDecimal(moved / counted) } : counts;
}

/** A week or a month: the average of its days' scores, and its days' counts added up. */
export function periodVolatility(days: readonly Volatility[]): Volatility {
  const scored = days.flatMap((day) => (day.volatility === undefined ? [] : [day.volatility]));
  const counts = {
    volatilityKeywords: days.reduce((sum, day) => sum + day.volatilityKeywords, 0),
    movedUp5: days.reduce((sum, day) => sum + day.movedUp5, 0),
    movedDown5: days.reduce((sum, day) => sum + day.movedDown5, 0),
  };
  return scored.length > 0 ? { ...counts, volatility: oneDecimal(scored.reduce((sum, one) => sum + one, 0) / scored.length) } : counts;
}

/** A score's level against the website's usual; Normal while there is no usual yet. */
export function levelOf(score: number, usual: number | null): VolatilityLevel {
  if (usual === null || usual <= 0) return "NORMAL";
  // To the hundredth, so 1.95 against 1.5 is the 30% it reads as, not a float's hair under.
  const ratio = Math.round((score / usual) * 100) / 100;
  if (ratio >= VERY_HIGH_ABOVE_USUAL) return "VERY_HIGH";
  if (ratio >= HIGH_ABOVE_USUAL) return "HIGH";
  return "NORMAL";
}

/**
 * Days Google has filled in (§3, 2026-10-11): its newest day is often half
 * in — on 8 October 20 of one website's keywords counted against about 120 —
 * and judged so it reads falsely calm. A day is complete when it counted at
 * least half as many keywords as the middle of the fortnight before it.
 * Days in order, oldest first; returns those complete.
 */
export function completeDays<Day extends { week: string; volatilityKeywords?: number }>(days: readonly Day[]): Set<string> {
  const complete = new Set<string>();
  days.forEach((day, at) => {
    if (day.volatilityKeywords === undefined) return;
    const fortnight = days.slice(Math.max(0, at - 14), at).flatMap((one) => (one.volatilityKeywords === undefined ? [] : [one.volatilityKeywords])).sort((left, right) => left - right);
    const middle = fortnight.length === 0 ? 0 : fortnight[Math.floor(fortnight.length / 2)];
    if (day.volatilityKeywords * 2 >= middle) complete.add(day.week);
  });
  return complete;
}

/** How much more than usual, as a whole percentage: null when not more, or no usual. */
export function aboveUsual(score: number | null, usual: number | null): number | null {
  if (score === null || usual === null || usual <= 0 || score <= usual) return null;
  return Math.round((score / usual - 1) * 100);
}
