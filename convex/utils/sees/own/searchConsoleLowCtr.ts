import { isNumber, isRow, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { against, namesOf, text } from "./searchConsoleShared";
import { pageName } from "./searchConsolePages";

/** What Shown but not clicked shows of the list's figures, or its rules read: never the brand split, estimates or movers. */
const SUMMARY_FIELDS = ["rows", "of", "clicks", "impressions", "expected", "kinds", "lowCtr"] as const;

/** What a row of its table shows, the eye's copy of it: each page's times shown, position, clicks and the clicks it'd usually get. */
const TABLE_FIELDS = ["key", "title", "impressions", "position", "clicks", "expected", "gap"] as const;

/** A position's clicks short, the pages there together, under this aren't worth naming. */
const SHORT_LEAST = 5;

/**
 * The list's figures as Shown but not clicked hands them its eye (search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md),
 * with the table's rows: only what the page shows or its rules read. A row of the list carries 26 fields, and the whole summary
 * took Position bands' brief past its size (`codeFirstBriefCeilings.json`); this page's is held the same way.
 */
export function lowCtrSeesData<Summary, Shown>(summary: Summary, rows: readonly Shown[] | null): { summary: Partial<Summary>; rows: Array<Partial<Record<(typeof TABLE_FIELDS)[number], unknown>>> | null; picked: true } {
  const shown = isRow(summary) ? Object.fromEntries(SUMMARY_FIELDS.filter((field) => field in summary).map((field) => [field, summary[field]])) : {};
  const table = rows ? rows.map((row) => Object.fromEntries(TABLE_FIELDS.filter((field) => isRow(row) && field in row).map((field) => [field, (row as Row)[field]]))) : null;
  return { summary: shown as Partial<Summary>, rows: table, picked: true };
}

/**
 * Shown but not clicked (Way 2, 20 November 2026): pages Google showed a lot that people rarely clicked, each set against what
 * the website usually gets at the same position on Google. The pages' clicks against the clicks they'd usually get; how few of
 * all the pages Google showed they are; the page short by most clicks; the position short by most; how much of the shortfall
 * sits on Google's first page below the top 3 (positions 4 to 10); and the Classification with most of these pages, where the
 * website has Classifications. Every figure is the list's own, over every page it lists.
 */
export function lowCtrFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const summary = isRow(data.summary) ? data.summary : {};
  const listed = isNumber(summary.rows) ? summary.rows : 0;
  const clicks = isNumber(summary.clicks) ? summary.clicks : null;
  const expected = isNumber(summary.expected) ? summary.expected : null;
  if (listed === 0 || clicks === null || expected === null) return found;
  const usually = text(names, "usually", "Clicks you'd usually get");
  const these = text(names, "these", "Pages shown a lot, clicked a little");
  // The headline: the clicks these pages got against the clicks they'd usually get at their positions.
  found.push({ ...against("clicks", these, "clicks", clicks, expected, 0, usually), score: 1.5 + Math.min(0.4, (expected - clicks) / Math.max(1, expected)) });
  // How few of the pages Google showed they are.
  if (isNumber(summary.of) && summary.of > 0) found.push(partOf("pages", these, "pages", listed, summary.of, 1.1 + Math.min(0.3, listed / summary.of)));
  const figures = isRow(summary.lowCtr) ? summary.lowCtr : {};
  // The page short by most clicks, by its title, as the table names it.
  const top = rowsOf(figures.top).filter((page) => isNumber(page.clicks) && isNumber(page.expected) && (page.expected as number) > (page.clicks as number))[0];
  if (top) {
    const short = (top.expected as number) - (top.clicks as number);
    found.push({ ...against("page", pageName(top, names), "clicks", top.clicks as number, top.expected as number, 0, usually), score: 1.3 + Math.min(0.3, short / Math.max(1, expected - clicks)) });
  }
  // The position short by most clicks, with every page there that got few.
  const positions = rowsOf(figures.positions).filter((one) => isNumber(one.position) && isNumber(one.clicks) && isNumber(one.expected));
  const shortOf = (one: Row) => (one.expected as number) - (one.clicks as number);
  const worst = [...positions].sort((left, right) => shortOf(right) - shortOf(left))[0];
  if (worst && shortOf(worst) >= SHORT_LEAST) {
    const name = `${text(names, "position", "Position")} ${worst.position as number}`;
    found.push({ ...against("position", name, "clicks", worst.clicks as number, worst.expected as number, 0, usually), score: 1.0 + Math.min(0.3, shortOf(worst) / Math.max(1, expected - clicks)) });
  }
  // How much of the shortfall sits just below the top 3, on Google's first page: where a better title pays most.
  const allShort = positions.reduce((sum, one) => sum + Math.max(0, shortOf(one)), 0);
  const firstPage = positions.filter((one) => (one.position as number) >= 4 && (one.position as number) <= 10).reduce((sum, one) => sum + Math.max(0, shortOf(one)), 0);
  if (allShort >= SHORT_LEAST && firstPage > 0) {
    found.push(partOf("firstPage", text(names, "firstPage", "Positions 4 to 10"), "clicksShort", firstPage, allShort, 0.95 + Math.min(0.3, firstPage / allShort)));
  }
  // The Classification with most of these pages: pages not sorted yet are never named.
  const kindNames = isRow(names.kinds) ? names.kinds : {};
  const kinds = rowsOf(summary.kinds).filter((kind) => typeof kind.kind === "string" && typeof kindNames[kind.kind] === "string" && isNumber(kind.rows) && (kind.rows as number) > 0);
  const most = [...kinds].sort((left, right) => (right.rows as number) - (left.rows as number))[0];
  // Its share of these pages, never of every page Google showed (`lowCtrPages`).
  if (most && listed >= 4) found.push(partOf("kind", kindNames[most.kind as string] as string, "lowCtrPages", most.rows as number, listed, 0.9 + Math.min(0.3, (most.rows as number) / listed)));
  return found;
}
