import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { GOOGLE_DIMENSIONS } from "./searchConsoleApi";
import { shiftDay } from "./searchConsoleDays";
import { keptLines } from "./searchConsoleKeep";
import { askLive, countryFilters } from "./searchConsoleReads";
import type { SearchConsoleList, SearchType } from "./searchConsoleSchema";
import { addUpRows, fromGoogle, type Row } from "./utils/searchConsolePacks";

/**
 * The 90 days', the 90 days before's and twelve months' lists asked of
 * Google, once a week (keep-less-history-plan.md, part 3): the days are kept
 * 60 days, so the long lists are not added up from them.
 *
 * Google gives at most 50,000 rows an ask, and one ask for a busy website's
 * 90 days of searches and pages is cut there: measured on 2026-10-07
 * (step 3.1), one ask for morehandles.co.uk's lost 43% of the searches the
 * keep rule keeps; the same days asked a week at a time and added up lost
 * none with a click, every page and every tracked search. So the pairs are
 * always asked in weekly pieces — a week still cut, a day at a time; a page,
 * country, device or appearance list once a period, and in pieces only when
 * its answer is cut. Pieces never
 * cross a period's edge, so one set answers every period.
 *
 * Each period's pairs then keep the searches the keep rule keeps on the
 * period's own figures, and every tracked search (`keptLines`), as the days
 * are kept.
 */

export type Span = { from: string; to: string };
type Google = { connectionId: Id<"searchConsoleConnections">; property: string };

/** Rows Google gives one ask at most (`searchConsoleApi.ts`): an answer this long may have been cut. */
const GOOGLE_MOST_ROWS = 50_000;

/** Days one piece asks for. */
const PIECE_DAYS = 7;

/** Asks of Google at once. */
const ASKS_AT_ONCE = 4;

/** Every day from `from` to `to`, in pieces of a week at most, never across a period's first day or past its last. */
export function piecesOf(spans: readonly Span[]): Span[] {
  if (spans.length === 0) return [];
  const from = spans.reduce((first, span) => (span.from < first ? span.from : first), spans[0].from);
  const to = spans.reduce((last, span) => (span.to > last ? span.to : last), spans[0].to);
  const edges = [...new Set(spans.flatMap((span) => [span.from, shiftDay(span.to, 1)]))].sort();
  const pieces: Span[] = [];
  for (let start = from; start <= to;) {
    let end = shiftDay(start, PIECE_DAYS - 1);
    const edge = edges.find((day) => day > start);
    if (edge !== undefined && edge <= end) end = shiftDay(edge, -1);
    if (end > to) end = to;
    pieces.push({ from: start, to: end });
    start = shiftDay(end, 1);
  }
  return pieces;
}

/** Each day of a span on its own. */
function daysOf(span: Span): Span[] {
  const days: Span[] = [];
  for (let day = span.from; day <= span.to; day = shiftDay(day, 1)) days.push({ from: day, to: day });
  return days;
}

const spanKey = (span: Span) => `${span.from}|${span.to}`;

type Scope = { searchType: SearchType; list: SearchConsoleList; country: string | undefined };

/** One ask of Google for a list's days: its rows and whether Google may have cut them; null when Google would not answer. */
async function asked(ctx: ActionCtx, google: Google, scope: Scope, span: Span): Promise<{ rows: Row[]; cut: boolean } | null> {
  const filters = countryFilters(scope.country);
  const answer = await askLive(ctx, google, {
    startDate: span.from,
    endDate: span.to,
    type: scope.searchType,
    dimensions: [...GOOGLE_DIMENSIONS[scope.list]],
    ...(filters.length > 0 ? { dimensionFilterGroups: [{ filters }] } : {}),
  });
  if (!answer.ok) return null;
  return { rows: fromGoogle(answer.rows, scope.list === "pair"), cut: answer.rows.length >= GOOGLE_MOST_ROWS };
}

/** Each of the days asked for, a few asks at a time: null when Google would not answer one. */
async function askedEach(ctx: ActionCtx, google: Google, scope: Scope, spans: readonly Span[]) {
  const answers: Array<{ rows: Row[]; cut: boolean }> = [];
  for (let at = 0; at < spans.length; at += ASKS_AT_ONCE) {
    const some = await Promise.all(spans.slice(at, at + ASKS_AT_ONCE).map((span) => asked(ctx, google, scope, span)));
    for (const answer of some) {
      if (answer === null) return null;
      answers.push(answer);
    }
  }
  return answers;
}

/**
 * A list's rows for each of the periods given, asked of Google: by each
 * period's days (`spanKey`), or null when Google would not answer — the
 * periods built before then stay.
 */
export async function longListRows(
  ctx: ActionCtx,
  google: Google,
  scope: Scope,
  spans: readonly Span[],
  tracked: readonly string[],
): Promise<Map<string, Row[]> | null> {
  const out = new Map<string, Row[]>();
  if (scope.list === "pair") {
    const pieces = piecesOf(spans);
    const answers = await askedEach(ctx, google, scope, pieces);
    if (answers === null) return null;
    // A week of a very busy website's pairs cut too: that week asked again a day at a time.
    for (const [index, answer] of answers.entries()) {
      if (!answer.cut) continue;
      const days = await askedEach(ctx, google, scope, daysOf(pieces[index]));
      if (days === null) return null;
      answers[index] = { rows: addUpRows(days.map((day) => day.rows)), cut: false };
    }
    for (const span of spans) {
      const inside = answers.filter((_, index) => pieces[index].from >= span.from && pieces[index].to <= span.to).map((answer) => answer.rows);
      out.set(spanKey(span), keptLines(addUpRows(inside), new Set(tracked)));
    }
    return out;
  }
  for (const span of spans) {
    const whole = await asked(ctx, google, scope, span);
    if (whole === null) return null;
    if (!whole.cut) {
      out.set(spanKey(span), whole.rows);
      continue;
    }
    // Cut: asked again a week at a time.
    const answers = await askedEach(ctx, google, scope, piecesOf([span]));
    if (answers === null) return null;
    out.set(spanKey(span), addUpRows(answers.map((answer) => answer.rows)));
  }
  return out;
}

/** The rows asked for one period, from what `longListRows` gave. */
export function rowsFor(asked: Map<string, Row[]> | null, span: Span): Row[] | undefined {
  return asked?.get(spanKey(span));
}
