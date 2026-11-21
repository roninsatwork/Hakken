import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { EVERY_COUNTRY_LISTS, GOOGLE_DIMENSIONS } from "./searchConsoleApi";
import { shiftDay } from "./searchConsoleDays";
import { askLive, countryFilters } from "./searchConsoleReads";
import type { SearchConsoleList, SearchType } from "./searchConsoleSchema";
import { addRowsInto, fromGoogle, type GoogleRow, type Row } from "./utils/searchConsolePacks";
import { RowSums, Terms, type SavedSums } from "./utils/searchConsoleSums";

/**
 * The 90 days', the 90 days before's and twelve months' lists asked of
 * Google, once a week (keep-less-history-plan.md, part 3): the days are kept
 * 60 days, so the long lists are not added up from them.
 *
 * Google gives at most 50,000 rows an ask, and one ask for a busy website's
 * 90 days of searches and pages is cut there: measured on 2026-10-07
 * (step 3.1), one ask for morehandles.co.uk's lost 43% of the searches then
 * kept; the same days asked a week at a time and added up lost none with a
 * click, every page and every tracked search. So the pairs are
 * always asked in weekly pieces — a week still cut, a day at a time; a page,
 * country, device or appearance list once a period, and in pieces only when
 * its answer is cut. Pieces never
 * cross a period's edge, so one set answers every period.
 *
 * Each period keeps every search's pairs, as the days kept do (Anthony,
 * 18 November 2026: the keep rule went, `searchConsoleKeep.ts`), unless its
 * pairs pass what one job can hold (`MOST_PAIRS_HELD`), which says so.
 */

export type Span = { from: string; to: string };
type Google = { connectionId: Id<"searchConsoleConnections">; property: string };

/** Rows Google gives one ask at most (`searchConsoleApi.ts`): an answer this long may have been cut. */
const GOOGLE_MOST_ROWS = 50_000;

/** Days one piece asks for. */
const PIECE_DAYS = 7;

/** Asks of Google at once. */
const ASKS_AT_ONCE = 4;

/**
 * The most search-and-page pairs one period holds while its weeks are added up
 * (collection-reliability-plan.md, RR2): a guard on a job's memory, not a rule
 * about what is kept. Past it, the searches seen least so far go, down to half
 * of it, never one with a click or one the company tracks, and a search let go
 * stays out of that period unless it comes back with a click, so every click
 * stays in the lists. The
 * build says so in the run's log and on the website's Search Console screens
 * (`searchesLetGo`). Only a website far past kordatackle.com's size reaches
 * it: on dev none ever has, to 18 November 2026. Until 2026-10-15 such a year
 * was held whole, and would have run its step out of memory.
 */
export const MOST_PAIRS_HELD = 400_000;

/**
 * Time a job keeps, once its long periods' pairs are added up, for what
 * follows them — Pages competing, the keywords, then the pages, countries,
 * devices and rich results asked of Google — before the pairs pause for the
 * next job instead (search-console-streamed-lists-plan.md, SL4).
 */
export const PAIRS_RESERVE_MS = 3 * 60 * 1000;

/** Where a long period's pairs stood when a job's time ran short: the pieces added (`at` of `of`), and the running sums saved for the next job (SL4), and whether the memory guard let any searches go. */
export type PairsCarry = { at: number; of: number; saved: Id<"_storage">; pruned: boolean };

/**
 * A long period's pairs paused near the end of a job's time, their running
 * sums saved, for the next job to carry on from the same week (SL4): at ten
 * times kordatackle.com the twelve months' 834 answers from Google outlast one
 * job (the rehearsal run again, 2026-10-16), and before this the job stopped
 * itself and the twelve months were left as built before.
 */
export class PairsPaused extends Error {
  constructor(readonly carry: PairsCarry) {
    super(`paused at piece ${carry.at} of ${carry.of}`);
    this.name = "PairsPaused";
  }
}

/** A period's pairs as saved between jobs: each search's and page's text once, the sums by number, and the searches let go. */
export type SavedPairs = { keys: string[]; pages: string[]; sums: SavedSums; letGo?: string[] };

/**
 * One period's search-and-page pairs added up as Google's answers come in,
 * held by number (search-console-streamed-lists-plan.md, SL3): each search's
 * and page's text once, each pair five numbers, in the order first seen —
 * what the running sums by text gave, the same rows in the same order. Until
 * 2026-10-16 each pair was held as its own row under its own key, about four
 * times the room: at ten times kordatackle.com a step held 400 MB adding up
 * its two 90 days.
 */
export class PairSums {
  private keys = new Terms();
  private pages = new Terms();
  private sums = new RowSums(this.keys, this.pages);
  /**
   * The searches the memory guard let go (`prune`), none with a click yet: kept out of the period from then on, unless
   * one comes back with a click, which it keeps whole, as it had none before.
   */
  private gone = new Set<string>();

  get size(): number {
    return this.sums.size;
  }

  /** How many searches the memory guard let go. */
  get letGo(): number {
    return this.gone.size;
  }

  add(key: string, page: string, clicks: number, impressions: number, positionSum: number): void {
    if (this.gone.size > 0 && this.gone.has(key)) {
      if (clicks === 0) return;
      this.gone.delete(key);
    }
    this.sums.add(this.keys.numberOf(key), this.pages.numberOf(page), clicks, impressions, positionSum);
  }

  /** Google's rows for a list of pairs, added: what `fromGoogle` makes of them. */
  addGoogle(rows: readonly GoogleRow[]): void {
    for (const row of rows) this.add(row.keys[0] ?? "", row.keys[1] ?? "", row.clicks, row.impressions, row.position * row.impressions);
  }

  /** Another set of sums added in, first seen first: a week's into each period it belongs to. */
  addSums(other: PairSums): void {
    other.sums.forEach((key, page, clicks, impressions, positionSum) => this.add(other.keys.texts[key], other.pages.texts[page], clicks, impressions, positionSum));
  }

  /** The sums as rows, first seen first. */
  rows(): Row[] {
    return this.sums.rows();
  }

  /** The sums to save between jobs (SL4). */
  saved(): SavedPairs {
    return { keys: this.keys.texts, pages: this.pages.texts, sums: this.sums.saved(), ...(this.gone.size > 0 ? { letGo: [...this.gone] } : {}) };
  }

  /** Sums saved before, back as they were: the same rows in the same order with the same figures. */
  static restored(saved: SavedPairs): PairSums {
    const sums = new PairSums();
    sums.keys = Terms.of(saved.keys);
    sums.pages = Terms.of(saved.pages);
    sums.sums = RowSums.restored(sums.keys, sums.pages, saved.sums);
    sums.gone = new Set(saved.letGo ?? []);
    return sums;
  }

  /**
   * Pairs held cut back to half of `most` when past it (the memory guard, `MOST_PAIRS_HELD`): the searches seen least so
   * far go first, never one with a click or one the company tracks. The ones left keep their order; a search gone is
   * kept out from then on, unless it comes back with a click (`add`). True when any went.
   */
  prune(tracked: ReadonlySet<string>, most: number = MOST_PAIRS_HELD): boolean {
    if (this.sums.size <= most) return false;
    const searches = new Map<number, { clicks: number; impressions: number; pages: number }>();
    this.sums.forEach((key, _page, clicks, impressions) => {
      const one = searches.get(key);
      if (one) {
        one.clicks += clicks;
        one.impressions += impressions;
        one.pages += 1;
      } else {
        searches.set(key, { clicks, impressions, pages: 1 });
      }
    });
    const text = this.keys.texts;
    const unkept = [...searches.entries()]
      .filter(([key, figures]) => figures.clicks === 0 && !tracked.has(text[key]))
      .sort((left, right) => left[1].impressions - right[1].impressions || (text[left[0]] < text[right[0]] ? -1 : 1));
    const gone = new Set<number>();
    let size = this.sums.size;
    for (const [key, figures] of unkept) {
      if (size <= most / 2) break;
      gone.add(key);
      size -= figures.pages;
    }
    if (gone.size === 0) return false;
    for (const key of gone) this.gone.add(text[key]);
    const held = { keys: this.keys, pages: this.pages, sums: this.sums };
    this.keys = new Terms();
    this.pages = new Terms();
    this.sums = new RowSums(this.keys, this.pages);
    held.sums.forEach((key, page, clicks, impressions, positionSum) => {
      if (!gone.has(key)) this.add(held.keys.texts[key], held.pages.texts[page], clicks, impressions, positionSum);
    });
    return true;
  }
}

/**
 * A piece's pairs added into each period it belongs to, each then cut back when
 * past the most held (`PairSums.prune`). True when any were cut.
 */
export function addPiece(periods: readonly PairSums[], spans: readonly Span[], piece: Span, week: PairSums, tracked: ReadonlySet<string>, most: number = MOST_PAIRS_HELD): boolean {
  let pruned = false;
  spans.forEach((span, which) => {
    if (piece.from >= span.from && piece.to <= span.to) {
      periods[which].addSums(week);
      if (periods[which].prune(tracked, most)) pruned = true;
    }
  });
  return pruned;
}

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

/**
 * `inCountry`: the list in the country built, Google's country filter on, even for a list kept of every country — the main
 * home country's own pages, for Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md).
 */
type Scope = { searchType: SearchType; list: SearchConsoleList; country: string | undefined; inCountry?: boolean };

/** One ask of Google for a list's days: Google's rows and whether Google may have cut them; null when Google would not answer. */
async function askedOf(ctx: ActionCtx, google: Google, scope: Scope, span: Span): Promise<{ rows: GoogleRow[]; cut: boolean } | null> {
  // The pages are every country's, whichever country is built (`EVERY_COUNTRY_LISTS`, 2026-11-17), but where asked in it.
  const everyCountry = EVERY_COUNTRY_LISTS.has(scope.list) && scope.inCountry !== true;
  const filters = everyCountry ? [] : countryFilters(scope.country);
  const answer = await askLive(ctx, google, {
    startDate: span.from,
    endDate: span.to,
    type: scope.searchType,
    dimensions: [...GOOGLE_DIMENSIONS[scope.list]],
    ...(filters.length > 0 ? { dimensionFilterGroups: [{ filters }] } : {}),
  }, { everyCountry });
  if (!answer.ok) return null;
  return { rows: answer.rows, cut: answer.rows.length >= GOOGLE_MOST_ROWS };
}

/** One ask for a list's days, as rows. */
async function asked(ctx: ActionCtx, google: Google, scope: Scope, span: Span): Promise<{ rows: Row[]; cut: boolean } | null> {
  const answer = await askedOf(ctx, google, scope, span);
  return answer && { rows: fromGoogle(answer.rows, scope.list === "pair"), cut: answer.cut };
}

/**
 * One ask for a piece's pairs, added up by number as it comes in and Google's rows let go: a cut week's rows go at
 * once, as its days are asked again (`pairsDayByDay`). A day is never asked again, so a cut day's rows are kept.
 */
async function pairsAsked(ctx: ActionCtx, google: Google, scope: Scope, span: Span): Promise<{ sums: PairSums; cut: boolean } | null> {
  const answer = await askedOf(ctx, google, scope, span);
  if (answer === null) return null;
  const sums = new PairSums();
  if (!answer.cut || span.from === span.to) sums.addGoogle(answer.rows);
  return { sums, cut: answer.cut };
}

/**
 * A week of pairs asked again a day at a time, a few days at once, each day's Google rows added straight into the week
 * in day order as its batch comes in: what the seven answers held together gave. Null when Google would not answer a
 * day. A day's rows are each a pair once, so adding them straight in gives the very sums a day's own sums added in did,
 * one pass the fewer over a busy website's twenty million rows a year (2026-10-16).
 */
async function pairsDayByDay(ctx: ActionCtx, google: Google, scope: Scope, week: Span): Promise<PairSums | null> {
  const sums = new PairSums();
  const days = daysOf(week);
  for (let at = 0; at < days.length; at += ASKS_AT_ONCE) {
    const some = await Promise.all(days.slice(at, at + ASKS_AT_ONCE).map((day) => askedOf(ctx, google, scope, day)));
    for (const day of some) {
      if (day === null) return null;
      sums.addGoogle(day.rows);
    }
  }
  return sums;
}

/** Each period's running pairs saved for the next job (SL4). */
async function savePairs(ctx: ActionCtx, periods: readonly PairSums[]): Promise<Id<"_storage">> {
  return await ctx.storage.store(new Blob([JSON.stringify(periods.map((one) => one.saved()))], { type: "application/json" }));
}

/** The running pairs a job before saved, or null when they are gone or were saved for other periods: then begun again. */
async function restoredPairs(ctx: ActionCtx, carry: PairsCarry, count: number): Promise<PairSums[] | null> {
  const blob = await ctx.storage.get(carry.saved);
  if (!blob) return null;
  const saved = JSON.parse(await blob.text()) as SavedPairs[];
  return saved.length === count ? saved.map((one) => PairSums.restored(one)) : null;
}

/** Pieces of a list's days asked a few at a time and added up in order as each batch comes in: null when Google would not answer one. */
async function addedUpPieces(ctx: ActionCtx, google: Google, scope: Scope, spans: readonly Span[]): Promise<Row[] | null> {
  const sums = new Map<string, Row>();
  for (let at = 0; at < spans.length; at += ASKS_AT_ONCE) {
    const some = await Promise.all(spans.slice(at, at + ASKS_AT_ONCE).map((span) => asked(ctx, google, scope, span)));
    for (const answer of some) {
      if (answer === null) return null;
      addRowsInto(sums, answer.rows);
    }
  }
  return [...sums.values()];
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
  /** When the job must stop by: the pairs pause `PAIRS_RESERVE_MS` before it, for the next job to carry on (`PairsPaused`). */
  stopAt?: number,
  /**
   * Set when a period's pairs passed `MOST_PAIRS_HELD` and its least-seen searches went (RR2), with `letGo` the most
   * searches let go from any one period; `asked` once the pairs were all asked of Google and added up.
   */
  held: { pruned: boolean; letGo?: number; asked?: boolean } = { pruned: false },
  /** The pairs a job before paused at (`PairsPaused`): carried on from there. */
  carry?: PairsCarry,
): Promise<Map<string, Row[]> | null> {
  const out = new Map<string, Row[]>();
  const trackedSet = new Set(tracked);
  if (scope.list === "pair") {
    const pieces = piecesOf(spans);
    // Each period's pairs added up as the weeks come in, a few asks at a time — a busy website's year of weekly
    // answers is never all held at once (the adding-up that hands on, 2026-10-15: kordatackle.com's ran out of time).
    const restored = carry ? await restoredPairs(ctx, carry, spans.length) : null;
    const periods = restored ?? spans.map(() => new PairSums());
    const first = restored ? carry!.at : 0;
    if (restored && carry!.pruned) held.pruned = true;
    // Near the end of the job's time the pairs are saved and the next job carries on from the same week (SL4), leaving
    // this one's last minutes for what follows them; the sums carried in are let go once replaced or done.
    const pauseAt = stopAt === undefined ? undefined : stopAt - PAIRS_RESERVE_MS;
    const letGoCarried = async () => { if (restored) await ctx.storage.delete(carry!.saved); };
    const pause = async (at: number): Promise<never> => {
      const saved = await savePairs(ctx, periods);
      await letGoCarried();
      throw new PairsPaused({ at, of: pieces.length, saved, pruned: held.pruned });
    };
    for (let at = first; at < pieces.length; at += ASKS_AT_ONCE) {
      // A job adds a batch at least before it may pause, so a chain of them always finishes.
      if (pauseAt !== undefined && at > first && Date.now() > pauseAt) await pause(at);
      const batch = pieces.slice(at, at + ASKS_AT_ONCE);
      const answers = await Promise.all(batch.map((piece) => pairsAsked(ctx, google, scope, piece)));
      for (const [index, answer] of answers.entries()) {
        if (answer === null) return null;
        // A week of a very busy website's pairs cut too: that week asked again a day at a time, each day's answer added
        // into the week as it comes and let go (search-console-streamed-lists-plan.md, SL3). Until 2026-10-16 the
        // week's seven answers were held together, for up to four weeks at once: at ten times kordatackle.com over a
        // million rows, 1.2 GB, and the step was stopped by the platform every try.
        const piece = batch[index];
        const week = answer.cut && piece.from !== piece.to ? await pairsDayByDay(ctx, google, scope, piece) : answer.sums;
        if (week === null) return null;
        if (addPiece(periods, spans, piece, week, trackedSet)) held.pruned = true;
      }
    }
    // Finished late: what follows gets a job of its own, the pairs carried to it whole.
    if (pauseAt !== undefined && first < pieces.length && Date.now() > pauseAt) await pause(pieces.length);
    await letGoCarried();
    spans.forEach((span, which) => out.set(spanKey(span), periods[which].rows()));
    const letGo = Math.max(0, ...periods.map((one) => one.letGo));
    if (letGo > 0) held.letGo = Math.max(held.letGo ?? 0, letGo);
    held.asked = true;
    return out;
  }
  if (scope.list === "query") return await searchesInPieces(ctx, google, scope, spans);
  for (const span of spans) {
    const whole = await asked(ctx, google, scope, span);
    if (whole === null) return null;
    if (!whole.cut) {
      out.set(spanKey(span), whole.rows);
      continue;
    }
    // Cut: asked again a week at a time, each week added in as it comes.
    const rows = await addedUpPieces(ctx, google, scope, piecesOf([span]));
    if (rows === null) return null;
    out.set(spanKey(span), rows);
  }
  return out;
}

/**
 * Each search alone (`query`, fix 1, 21 November 2026) for the long periods: asked a week at a time, each week once and
 * added into every period it falls in, as the pairs are — a busy website's 3, 6 and 12 months are each past Google's
 * 50,000 rows an ask, and asked whole first and then in weeks period by period, More Handles' months-and-quarters stage
 * ran 7 minutes 10 seconds of its 7. A week Google cuts too is asked a day at a time. A search's weeks add up to its
 * period exactly (31,538 of 31,538 October searches, 2026-11-21). Null when Google won't answer.
 */
async function searchesInPieces(ctx: ActionCtx, google: Google, scope: Scope, spans: readonly Span[]): Promise<Map<string, Row[]> | null> {
  const pieces = piecesOf(spans);
  const sums = spans.map(() => new Map<string, Row>());
  for (let at = 0; at < pieces.length; at += ASKS_AT_ONCE) {
    const batch = pieces.slice(at, at + ASKS_AT_ONCE);
    const answers = await Promise.all(batch.map((piece) => asked(ctx, google, scope, piece)));
    for (const [index, answer] of answers.entries()) {
      if (answer === null) return null;
      const piece = batch[index];
      const rows = answer.cut && piece.from !== piece.to ? await addedUpPieces(ctx, google, scope, daysOf(piece)) : answer.rows;
      if (rows === null) return null;
      // Pieces never cross a period's edge: each lies wholly inside a period, or outside it.
      spans.forEach((span, which) => { if (piece.from >= span.from && piece.to <= span.to) addRowsInto(sums[which], rows); });
    }
  }
  return new Map(spans.map((span, which) => [spanKey(span), [...sums[which].values()]]));
}

/** The rows asked for one period, from what `longListRows` gave. */
export function rowsFor(asked: Map<string, Row[]> | null, span: Span): Row[] | undefined {
  return asked?.get(spanKey(span));
}
