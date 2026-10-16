import type { Packed, Row, Summed } from "./searchConsolePacks";
import { unpackNumbers } from "./searchConsolePacks";

/**
 * Running sums of Search Console's kept lines, held by number
 * (search-console-streamed-lists-plan.md, SL1 and SL2): a build reads its
 * kept days a day at a time and adds each into every period the day belongs
 * to, instead of holding every day's lines and adding them up again for each
 * period — at ten times kordatackle.com the 60 days held whole were 256 MB
 * before a period was worked out (measured 2026-10-16).
 *
 * Each keyword and page is numbered once, the first time a build sees it
 * (`Terms`); a sum is its numbers and three columns of figures, in the order
 * its rows were first seen. That order is the one `addUp` gives the same days
 * in, so what is built from the sums — a keyword's top page among equal ones,
 * a list's order before it is packed — is the same as before.
 */

/** Each text a build sees, once, by its number: the order first seen. */
export class Terms {
  private readonly numbers = new Map<string, number>();
  readonly texts: string[] = [];

  /** Terms saved before, numbered as they were. */
  static of(texts: readonly string[]): Terms {
    const terms = new Terms();
    for (const text of texts) terms.numberOf(text);
    return terms;
  }

  numberOf(text: string): number {
    let number = this.numbers.get(text);
    if (number === undefined) {
      number = this.texts.length;
      this.numbers.set(text, number);
      this.texts.push(text);
    }
    return number;
  }

  get size(): number {
    return this.texts.length;
  }
}

/** A pair's two numbers as one: a keyword's number times this, and its page's. Far past any website's pages. */
const PAGE_ROOM = 2 ** 22;

/** A period's sums as saved between jobs (SL4): each column whole, in the order first seen. */
export type SavedSums = { keys: number[]; pages: number[]; clicks: number[]; impressions: number[]; positionSums: number[] };

/**
 * One period's rows added up by key — a keyword and page together for the
 * pairs, a key alone for the other lists — in columns, first seen first.
 */
export class RowSums {
  private readonly at = new Map<number, number>();
  private readonly keys: number[] = [];
  private readonly pages: number[] = [];
  private readonly clicks: number[] = [];
  private readonly impressions: number[] = [];
  private readonly positionSums: number[] = [];

  constructor(private readonly keyTerms: Terms, private readonly pageTerms: Terms | null) {}

  /** Sums saved before, by the same terms, as they were: the same rows in the same order with the same figures. */
  static restored(keyTerms: Terms, pageTerms: Terms | null, saved: SavedSums): RowSums {
    const sums = new RowSums(keyTerms, pageTerms);
    for (let at = 0; at < saved.keys.length; at += 1) sums.add(saved.keys[at], saved.pages[at], saved.clicks[at], saved.impressions[at], saved.positionSums[at]);
    return sums;
  }

  /** The sums to save, column by column. */
  saved(): SavedSums {
    return { keys: [...this.keys], pages: [...this.pages], clicks: [...this.clicks], impressions: [...this.impressions], positionSums: [...this.positionSums] };
  }

  /** One row's figures added, by its key's (and page's) numbers. */
  add(key: number, page: number, clicks: number, impressions: number, positionSum: number): void {
    const code = this.pageTerms ? key * PAGE_ROOM + page : key;
    const held = this.at.get(code);
    if (held === undefined) {
      this.at.set(code, this.keys.length);
      this.keys.push(key);
      this.pages.push(page);
      this.clicks.push(clicks);
      this.impressions.push(impressions);
      this.positionSums.push(positionSum);
      return;
    }
    this.clicks[held] += clicks;
    this.impressions[held] += impressions;
    this.positionSums[held] += positionSum;
  }

  get size(): number {
    return this.keys.length;
  }

  /** Each sum in turn, first seen first, by its numbers. */
  forEach(visit: (key: number, page: number, clicks: number, impressions: number, positionSum: number) => void): void {
    for (let at = 0; at < this.keys.length; at += 1) visit(this.keys[at], this.pages[at], this.clicks[at], this.impressions[at], this.positionSums[at]);
  }

  /** The sums as rows, first seen first: what `addUp` gives for the same days. */
  rows(): Row[] {
    const rows: Row[] = new Array(this.keys.length);
    for (let at = 0; at < this.keys.length; at += 1) {
      rows[at] = {
        key: this.keyTerms.texts[this.keys[at]],
        ...(this.pageTerms ? { page: this.pageTerms.texts[this.pages[at]] } : {}),
        clicks: this.clicks[at],
        impressions: this.impressions[at],
        positionSum: this.positionSums[at],
      };
    }
    return rows;
  }
}

/**
 * One period's keywords added up from its pairs: what `bySide(addUp(…), "query")`
 * gives, but its count and top page, which the charts, the fan-out's days and
 * the volatility day never read.
 */
export class KeywordSums {
  private readonly at = new Map<number, number>();
  private readonly keys: number[] = [];
  private readonly clicks: number[] = [];
  private readonly impressions: number[] = [];
  private readonly positionSums: number[] = [];

  constructor(private readonly keyTerms: Terms) {}

  add(key: number, clicks: number, impressions: number, positionSum: number): void {
    const held = this.at.get(key);
    if (held === undefined) {
      this.at.set(key, this.keys.length);
      this.keys.push(key);
      this.clicks.push(clicks);
      this.impressions.push(impressions);
      this.positionSums.push(positionSum);
      return;
    }
    this.clicks[held] += clicks;
    this.impressions[held] += impressions;
    this.positionSums[held] += positionSum;
  }

  get size(): number {
    return this.keys.length;
  }

  /** Each keyword's figures, first seen first, as `bySide` keys them. */
  *summed(): Generator<Pick<Summed, "key" | "clicks" | "impressions" | "positionSum">> {
    for (let at = 0; at < this.keys.length; at += 1) {
      yield { key: this.keyTerms.texts[this.keys[at]], clicks: this.clicks[at], impressions: this.impressions[at], positionSum: this.positionSums[at] };
    }
  }

  /** Each keyword's standing, by its text: what a day's volatility compares. */
  standings(): Map<string, { impressions: number; positionSum: number }> {
    const out = new Map<string, { impressions: number; positionSum: number }>();
    for (let at = 0; at < this.keys.length; at += 1) {
      out.set(this.keyTerms.texts[this.keys[at]], { impressions: this.impressions[at], positionSum: this.positionSums[at] });
    }
    return out;
  }
}

/** A kept part's rows by number, its figures unpacked once: what each sum it goes into adds. */
export type NumberedPart = { keys: number[]; pages: number[] | null; clicks: number[]; impressions: number[]; positionSums: number[] };

/** A decoded kept part numbered by the build's terms. */
export function numbered(part: Packed, keyTerms: Terms, pageTerms: Terms | null): NumberedPart {
  return {
    keys: part.keys.map((key) => keyTerms.numberOf(key)),
    pages: pageTerms && part.pages ? part.pages.map((page) => pageTerms.numberOf(page)) : null,
    clicks: unpackNumbers(part.clicks),
    impressions: unpackNumbers(part.impressions),
    positionSums: unpackNumbers(part.positionSums),
  };
}

/** A numbered part added into a period's row sums. */
export function addPart(sums: RowSums, part: NumberedPart): void {
  for (let at = 0; at < part.keys.length; at += 1) {
    sums.add(part.keys[at], part.pages?.[at] ?? 0, part.clicks[at] ?? 0, part.impressions[at] ?? 0, part.positionSums[at] ?? 0);
  }
}

/** A numbered part's keywords added into a period's keyword sums. */
export function addKeywords(sums: KeywordSums, part: NumberedPart): void {
  for (let at = 0; at < part.keys.length; at += 1) {
    sums.add(part.keys[at], part.clicks[at] ?? 0, part.impressions[at] ?? 0, part.positionSums[at] ?? 0);
  }
}
