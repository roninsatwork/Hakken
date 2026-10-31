import type { Finding, FindingFact } from "./findings";
import { COUNT_ORDER, MEASURES, measureWords } from "./measures";

/**
 * What a page's own figures show, found by general rules (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase
 * 3; the Conversions screens keep their own, `findings.ts`). The same rules on every page of every section, over the
 * answer the page drew itself from (`pageData.ts`), never one of anyone's notes:
 *
 * - **the whole moved**: a total that rose or fell by a sixth or more against the span before;
 * - **the biggest mover**: the row of a list that gained most, and the one that lost most;
 * - **one holds most**: a row holding two-fifths or more of a list's main figure;
 * - **a row far from the rest**: a percentage half as much again, or two-thirds, of the list's average, on a row with
 *   enough behind it to trust.
 *
 * Only figures the measures list names (`measures.ts`) are spoken of. Each finding is scored by its size and the share
 * of the list it covers; the best six go forward, at most four from one list. No database here.
 */

type Row = Record<string, unknown>;
type Table = { path: string; rows: Row[] };

/** Findings carried forward at most, and from any one list: most pages draw one list, and it may hold the story. */
const MOST = 6;
const MOST_FROM_A_LIST = 4;
/** A total that moved this share or more, and by this many or more, against the span before. */
const WHOLE_SHARE = 1 / 6;
const WHOLE_LEAST = 10;
/** A row's move worth saying: this many, and this share of the list's figure. */
const MOVE_LEAST = 10;
const MOVE_SHARE = 0.05;
/** A row holding this share of a list's main figure, in a list of at least this many rows. */
const HOLDS_SHARE = 0.4;
const HOLDS_ROWS = 4;
/** A percentage this far from the list's average, on a row with this many behind it or this share of the list. */
const ABOVE = 1.5;
const BELOW = 1 / 1.5;
const TRUSTED_LEAST = 20;
const TRUSTED_SHARE = 0.02;
/** Lists are walked this deep into a page's answer. */
const MOST_DEPTH = 4;
/** The fields a row is named by, in the order looked for. */
const NAME_FIELDS = ["name", "key", "query", "keyword", "page", "path", "label", "title", "host", "domain", "column", "channel", "event", "device", "country", "browser", "source", "anchor", "prompt", "url", "check", "kind"];

const round1 = (value: number) => Math.round(value * 10) / 10;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const cap = (field: string) => field.charAt(0).toUpperCase() + field.slice(1);

/** A name that is a code the screen turns into words ("UNJUDGED", "PAID_SEARCH"): never a name a reader is shown. */
const CODE = /^[A-Z][A-Z0-9_]+$/;

/** A row's name, as the page shows it; null for a row with none, or named only by a code. */
function rowName(row: Row): string | null {
  for (const field of NAME_FIELDS) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return CODE.test(value.trim()) ? null : value.trim().slice(0, 80);
  }
  return null;
}

/** A figure's value the span before, by the names the screens give it: `clicksBefore`, `previousClicks`, `before.clicks`. */
function beforeOf(row: Row, field: string): number | undefined {
  const nested = row.before && typeof row.before === "object" ? (row.before as Row)[field] : undefined;
  for (const value of [row[`${field}Before`], row[`previous${cap(field)}`], row[`${field}Previous`], nested]) {
    if (isNumber(value)) return value;
  }
  return undefined;
}

/** The lists in a page's answer: arrays of three or more named rows holding a figure the measures list knows. */
function tablesIn(value: unknown, path: string[] = [], depth = 0, found: Table[] = []): Table[] {
  if (depth > MOST_DEPTH || !value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    // A row's figures may sit one level down, as Clarity keeps them (`{ name, now: { visits, scroll }, scrollBefore }`).
    const rows = value
      .filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((row) => (row.now && typeof row.now === "object" && !Array.isArray(row.now) ? { ...(row.now as Row), ...row } : row));
    if (rows.length >= 3 && rows.some((row) => rowName(row) !== null && Object.keys(row).some((field) => MEASURES[field] && isNumber(row[field])))) {
      found.push({ path: path.join(".") || "list", rows: rows.filter((row) => rowName(row) !== null) });
    }
    return found;
  }
  for (const [name, inner] of Object.entries(value as Row)) tablesIn(inner, [...path, name], depth + 1, found);
  return found;
}

/** The totals in a page's answer: an object outside any list holding a count the measures list knows, and its span before. */
function totalsIn(value: unknown, path: string[] = [], depth = 0, found: Array<{ path: string; row: Row }> = []): Array<{ path: string; row: Row }> {
  if (depth > 2 || !value || typeof value !== "object" || Array.isArray(value)) return found;
  const row = value as Row;
  if (COUNT_ORDER.some((field) => isNumber(row[field]) && beforeOf(row, field) !== undefined)) found.push({ path: path.join(".") || "page", row });
  // The span before beside the figures, as a sibling (`{ steps: {…}, before: {…} }`, `{ now: {…}, before: {…} }`).
  const sibling = row.before && typeof row.before === "object" && !Array.isArray(row.before) ? (row.before as Row) : null;
  if (sibling) {
    for (const [name, inner] of Object.entries(row)) {
      if (name === "before" || !inner || typeof inner !== "object" || Array.isArray(inner)) continue;
      const figures = inner as Row;
      if (COUNT_ORDER.some((field) => isNumber(figures[field]) && isNumber(sibling[field]))) found.push({ path: [...path, name].join("."), row: { ...figures, before: sibling } });
    }
  }
  for (const [name, inner] of Object.entries(row)) if (name !== "before") totalsIn(inner, [...path, name], depth + 1, found);
  return found;
}

type Found = Omit<Finding, "facts"> & { facts: FindingFact[]; list: string };
const unitOf = (field: string): FindingFact["unit"] => (MEASURES[field]?.kind === "percent" ? "percent" : "count");

/** The rules over one page's answer, most worth saying first. */
export function pageFindings(screen: string, data: unknown): Finding[] {
  if (!data || typeof data !== "object") return [];
  const found: Found[] = [];

  // The whole moved: each total against the span before.
  for (const { path, row } of totalsIn(data)) {
    for (const field of COUNT_ORDER) {
      const now = row[field];
      const before = beforeOf(row, field);
      if (!isNumber(now) || before === undefined || before <= 0) continue;
      const change = (now - before) / before;
      if (Math.abs(change) < WHOLE_SHARE || Math.abs(now - before) < WHOLE_LEAST) continue;
      const words = measureWords(field);
      found.push({
        id: `whole:${path}:${field}`, kind: now > before ? "wholeUp" : "wholeDown", list: `whole:${path}`,
        score: 1.2 * Math.min(2, Math.abs(change)) + 0.3,
        params: { measure: field, now, before, change: round1(change * 100) },
        facts: [
          { key: "now", value: now, unit: "count", label: `${words}, this span` },
          { key: "before", value: before, unit: "count", label: `${words}, the span before` },
        ],
      });
    }
  }

  for (const table of tablesIn(data)) {
    const main = COUNT_ORDER.find((field) => table.rows.filter((row) => isNumber(row[field])).length >= 3);
    const total = main ? table.rows.reduce((sum, row) => sum + (isNumber(row[main]) ? row[main] : 0), 0) : 0;

    if (main && total > 0) {
      const words = measureWords(main);
      // The biggest movers: the row that gained most, and the one that lost most.
      const moves = table.rows
        .map((row) => ({ row, now: row[main], before: beforeOf(row, main) }))
        // A row with nothing the span before is new, not risen: often only that its figures were not kept then.
        .filter((one): one is { row: Row; now: number; before: number } => isNumber(one.now) && one.before !== undefined && one.before > 0)
        .map((one) => ({ ...one, change: one.now - one.before }));
      if (moves.length >= 3) {
        const least = Math.max(MOVE_LEAST, total * MOVE_SHARE);
        const up = [...moves].sort((a, b) => b.change - a.change)[0];
        const down = [...moves].sort((a, b) => a.change - b.change)[0];
        for (const [one, kind] of [[up, "rowUp"], [down, "rowDown"]] as const) {
          if (!one || Math.abs(one.change) < least || (kind === "rowUp" ? one.change <= 0 : one.change >= 0)) continue;
          const name = rowName(one.row)!;
          found.push({
            id: `${kind}:${table.path}:${main}:${name}`, kind, list: table.path,
            score: Math.min(1.5, Math.abs(one.change) / total) + 0.4,
            params: { name, measure: main, now: one.now, before: one.before },
            facts: [
              { key: "now", value: one.now, unit: "count", label: `${name}: ${words}, this span` },
              { key: "before", value: one.before, unit: "count", label: `${name}: ${words}, the span before` },
            ],
          });
        }
      }

      // One holds most of the list's main figure.
      if (table.rows.length >= HOLDS_ROWS) {
        const top = [...table.rows].filter((row) => isNumber(row[main])).sort((a, b) => (b[main] as number) - (a[main] as number))[0];
        const share = top ? (top[main] as number) / total : 0;
        if (top && share >= HOLDS_SHARE && share < 1) {
          const name = rowName(top)!;
          found.push({
            id: `holdsMost:${table.path}:${main}:${name}`, kind: "holdsMost", list: table.path,
            score: share,
            params: { name, measure: main, share: round1(share * 100), value: top[main] as number, rows: table.rows.length },
            facts: [
              { key: "value", value: top[main] as number, unit: "count", label: `${name}: ${words}` },
              { key: "share", value: round1(share * 100), unit: "percent", label: `${name}'s share of the list's ${words}` },
            ],
          });
        }
      }
    }

    // A row far from the rest: each percentage, weighed by the row's main figure.
    for (const field of Object.keys(MEASURES).filter((one) => MEASURES[one].kind === "percent")) {
      // Weighed by its own base where the rows hold it (a click rate by the times shown), else by the list's main figure.
      const base = MEASURES[field].weighBy && table.rows.some((row) => isNumber(row[MEASURES[field].weighBy!])) ? MEASURES[field].weighBy! : main;
      const rows = table.rows.filter((row) => isNumber(row[field]) && (!base || isNumber(row[base])));
      if (rows.length < 3) continue;
      const weight = (row: Row) => (base ? (row[base] as number) : 1);
      const all = rows.reduce((sum, row) => sum + weight(row), 0);
      const trusted = rows.filter((row) => weight(row) >= Math.max(base ? TRUSTED_LEAST : 0, all * TRUSTED_SHARE));
      if (trusted.length < 3) continue;
      const weighed = trusted.reduce((sum, row) => sum + weight(row), 0);
      const mean = weighed > 0 ? trusted.reduce((sum, row) => sum + (row[field] as number) * weight(row), 0) / weighed : 0;
      if (mean <= 0) continue;
      const scored = trusted.map((row) => ({ row, ratio: (row[field] as number) / mean, reach: weight(row) / weighed }));
      const above = scored.filter((one) => one.ratio >= ABOVE).sort((a, b) => b.reach * b.ratio - a.reach * a.ratio)[0];
      const below = scored.filter((one) => one.ratio <= BELOW).sort((a, b) => b.reach / Math.max(0.01, b.ratio) - a.reach / Math.max(0.01, a.ratio))[0];
      for (const [one, kind] of [[above, "rowAbove"], [below, "rowBelow"]] as const) {
        if (!one) continue;
        const name = rowName(one.row)!;
        const words = measureWords(field);
        found.push({
          id: `${kind}:${table.path}:${field}:${name}`, kind, list: `${table.path}:${field}`,
          score: Math.sqrt(Math.min(1, one.reach / 0.05)) * Math.min(1.5, Math.abs(Math.log(Math.max(0.01, one.ratio)))),
          params: { name, measure: field, value: round1(one.row[field] as number), mean: round1(mean), ...(MEASURES[field].lessIsBetter ? { lessIsBetter: 1 } : {}) },
          facts: [
            { key: "value", value: round1(one.row[field] as number), unit: unitOf(field), label: `${name}: ${words}` },
            { key: "mean", value: round1(mean), unit: unitOf(field), label: `the list's ${words}, on average` },
          ],
        });
      }
    }
  }

  // The best first, at most four from one list, and each once: a page may hold the same list twice (its table and its chart).
  const fromList = new Map<string, number>();
  const said = new Set<string>();
  const chosen: Found[] = [];
  for (const finding of found.sort((a, b) => b.score - a.score)) {
    const same = `${finding.kind}|${JSON.stringify(finding.params)}`;
    if (said.has(same)) continue;
    said.add(same);
    const list = finding.list.split(":")[0];
    if ((fromList.get(list) ?? 0) >= MOST_FROM_A_LIST) continue;
    fromList.set(list, (fromList.get(list) ?? 0) + 1);
    chosen.push(finding);
    if (chosen.length >= MOST) break;
  }
  void screen;
  return chosen.map(({ list: _list, ...finding }, at) => ({ ...finding, score: Math.round(finding.score * 100) / 100, facts: finding.facts.map((fact) => ({ ...fact, key: `f${at + 1}.${fact.key}` })) }));
}
