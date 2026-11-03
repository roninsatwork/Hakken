import type { Finding, FindingFact } from "./findings";
import { COUNT_ORDER, MEASURES, measureWords } from "./measures";

/**
 * What a page's own figures show, found by general rules (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase
 * 3; the Conversions screens keep their own, `findings.ts`). The same rules on every page of every section, over the
 * answer the page drew itself from (`pageData.ts`), never one of anyone's notes:
 *
 * - **the whole moved**: a total that rose or fell by a sixth or more against the span before;
 * - **the biggest mover**: the row of a list that gained most, and the one that lost most — a row new this period
 *   among them;
 * - **one holds most**: a row holding two-fifths or more of a list's main figure — never in a list the page picked;
 * - **a row far from the rest**: a percentage half as much again, or two-thirds, of the list's average, on a row with
 *   enough behind it to trust; a share of a whole never, as a list's shares always average the same;
 * - **apart from its own reference**: a percentage beside the whole website's or similar pages' (`websiteX`,
 *   `groupX`), on a row or on the page's own boxes, half as much again or two-thirds, or fifteen points apart.
 *
 * Only figures the measures list names (`measures.ts`) are spoken of. Each finding is scored by its size and the share
 * of the list it covers; the best six go forward, at most four from one list. No database here.
 */

type Row = Record<string, unknown>;
/** `picked`: rows the page chose from a longer list (a top ten, a table's first page), never the whole of anything. */
type Table = { path: string; rows: Row[]; picked: boolean };
/** `short`: the path of the list of one or two this row came from, its rows read as totals. */
type Totals = { path: string; row: Row; name: string | null; short?: string };

/** Findings carried forward at most, and from any one list: most pages draw one list, and it may hold the story. */
const MOST = 6;
const MOST_FROM_A_LIST = 4;
/** A total that moved this share or more, and by this many or more, against the span before. */
const WHOLE_SHARE = 1 / 6;
const WHOLE_LEAST = 10;
/**
 * A row's move worth saying: this many, and this share of the list's figure (lowered from a twentieth on 2026-11-03,
 * page-screen-redo-plan: a top ten's biggest move was lost under a twentieth of the list).
 */
const MOVE_LEAST = 10;
const MOVE_SHARE = 0.03;
/**
 * A row with nothing the span before and something now is new, and a mover too (2026-11-03) — where the list held the
 * span before: this many of its rows had something then. A list with nothing before at all was not kept then.
 */
const NEW_NEEDS_HELD = 2;
/** A row holding this share of a list's main figure, in a list of at least this many rows. */
const HOLDS_SHARE = 0.4;
const HOLDS_ROWS = 4;
/** A percentage this far from the list's average, on a row with this many behind it or this share of the list. */
const ABOVE = 1.5;
const BELOW = 1 / 1.5;
const TRUSTED_LEAST = 20;
const TRUSTED_SHARE = 0.02;
/**
 * A percentage against its own reference (the whole website's, similar pages'): as far as above, and this many points
 * apart; or this many points apart whatever the ratio (phones at 45% of a page's views against 62% of the website's).
 */
const APART_POINTS = 2;
const APART_FAR_POINTS = 15;
/** A share of a whole is weighed where it, or its reference, holds this much of the whole (in points). */
const SHARE_LEAST = 5;
/** A reference beside a percentage, by its prefix: `websiteViewsSharePercent` beside `viewsSharePercent`. */
const REFERENCES = ["website", "group"] as const;
type Against = (typeof REFERENCES)[number];
/** Lists are walked this deep into a page's answer; totals this deep. */
const MOST_DEPTH = 4;
const TOTALS_DEPTH = 3;
/** A list this short is read as totals, each row a whole of its own: a Websites screen's one website, Products' sale. */
const TOTALS_ROWS = 2;
/**
 * The fields a row is named by, in the order looked for: its own words (name, title, label, address) before the key
 * it is kept by, which is often a number (`~fu`) or an id.
 */
const NAME_FIELDS = ["name", "title", "label", "address", "key", "query", "keyword", "page", "path", "host", "domain", "column", "channel", "eventName", "event", "engine", "question", "device", "country", "browser", "source", "anchor", "prompt", "url", "check", "kind"];

const round1 = (value: number) => Math.round(value * 10) / 10;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isRow = (item: unknown): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item);
const cap = (field: string) => field.charAt(0).toUpperCase() + field.slice(1);

/** A name that is a code the screen turns into words ("UNJUDGED", "PAID_SEARCH"): never a name a reader is shown. */
const CODE = /^[A-Z][A-Z0-9_]+$/;
/** A page by its number (`~fu`) or a record by its id: what a row is kept by, never what a reader calls it. */
const REF = /^~[0-9a-z]+$/;
/** Google's own stand-ins for no name ("(not set)", "(data not available)", "(other)"): no row a person can act on. Typed in, "(direct)", is one. */
const NO_NAME = /^\((?!direct\))[^)]*\)$/;
const ID = /^(?=[0-9a-z]*\d)[0-9a-z]{31,37}$/;

/** A row's name, as the page shows it: the first of its name fields that is words, past a code, a page number or an id; null for none. */
function rowName(row: Row): string | null {
  for (const field of NAME_FIELDS) {
    const value = row[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const name = value.trim();
    if (CODE.test(name) || REF.test(name) || ID.test(name)) continue;
    if (NO_NAME.test(name)) return null;
    return name.slice(0, 80).trim();
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

/** A percentage's own reference beside it: the whole website's (`websiteX`), else similar pages' (`groupX`). */
function referenceOf(row: Row, field: string): { against: Against; value: number } | null {
  for (const against of REFERENCES) {
    const value = row[`${against}${cap(field)}`];
    if (isNumber(value)) return { against, value };
  }
  return null;
}

/** A row's figures, with those it keeps one level down, as Clarity keeps them (`{ name, now: { visits, scroll }, scrollBefore }`). */
const flat = (row: Row): Row => (isRow(row.now) ? { ...(row.now as Row), ...row } : row);
const measured = (row: Row) => Object.keys(row).some((field) => MEASURES[field] && isNumber(row[field]));

/**
 * The lists in a page's answer: arrays of three or more named rows holding a figure the measures list knows, and the
 * lists inside such rows (an AI engine's websites, a website's own). A list the page marked `{ picked: true, rows }`
 * is picked from a longer one.
 */
function tablesIn(value: unknown, path: string[] = [], depth = 0, found: Table[] = [], picked = false): Table[] {
  if (depth > MOST_DEPTH || !value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    const named = value.filter(isRow).map(flat).filter((row) => rowName(row) !== null);
    if (value.length > TOTALS_ROWS && named.some(measured)) found.push({ path: path.join(".") || "list", rows: named, picked });
    // The lists inside each named row, each a list of its own; a row named by nothing (a day) is never looked into.
    for (const row of named) {
      for (const [field, inner] of Object.entries(row)) if (inner && typeof inner === "object") tablesIn(inner, [...path, rowName(row)!, field], depth + 1, found);
    }
    return found;
  }
  const row = value as Row;
  for (const [name, inner] of Object.entries(row)) tablesIn(inner, [...path, name], depth + 1, found, picked || row.picked === true);
  return found;
}

/**
 * The totals in a page's answer: every object outside a list, and each row of a list of one or two (a whole of its own,
 * named by its row), with the span before beside its figures as a sibling where kept (`{ steps: {…}, before: {…} }`).
 */
function totalsIn(value: unknown, path: string[] = [], depth = 0, found: Totals[] = [], name: string | null = null, short?: string): Totals[] {
  if (depth > TOTALS_DEPTH || !value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    const rows = value.filter(isRow);
    if (rows.length > TOTALS_ROWS || rows.length !== value.length) return found;
    rows.forEach((row, at) => totalsIn(flat(row), [...path, rowName(row) ?? String(at)], depth + 1, found, rowName(row), path.join(".") || "list"));
    return found;
  }
  const row = value as Row;
  found.push({ path: path.join(".") || "page", row, name, ...(short !== undefined ? { short } : {}) });
  const sibling = isRow(row.before) ? (row.before as Row) : null;
  if (sibling) {
    for (const [field, inner] of Object.entries(row)) {
      if (field === "before" || !isRow(inner)) continue;
      const figures = inner as Row;
      if (COUNT_ORDER.some((count) => isNumber(figures[count]) && isNumber(sibling[count]))) found.push({ path: [...path, field].join("."), row: { ...figures, before: sibling }, name });
    }
  }
  for (const [field, inner] of Object.entries(row)) if (field !== "before") totalsIn(inner, [...path, field], depth + 1, found);
  return found;
}

type Found = Omit<Finding, "facts"> & { facts: FindingFact[]; list: string };
/** Of two findings the stronger; of two as strong (a share of a whole and its mirror), the one above, said as the gain. */
const firstOf = (held: Found | undefined, next: Found): Found => (!held || next.score > held.score || (next.score === held.score && next.kind === "rowAbove" && held.kind !== "rowAbove") ? next : held);
const unitOf = (field: string): FindingFact["unit"] => (MEASURES[field]?.kind === "percent" ? "percent" : "count");
const AGAINST_WORDS: Record<Against, string> = { website: "the whole website's", group: "similar pages'" };

/**
 * A percentage set against its own reference: above or below it by half as much again (or two-thirds), or by fifteen
 * points whatever the ratio; trusted on its own base where the row holds it, or, for a share of a whole, where it or
 * its reference is a twentieth of the whole or more. `name` null: the page itself (a box).
 */
function apart(list: string, name: string | null, row: Row, field: string, reach: number | null): Found | null {
  const measure = MEASURES[field];
  const value = row[field];
  const reference = referenceOf(row, field);
  if (!isNumber(value) || !reference || reference.value <= 0) return null;
  const base = measure.weighBy && isNumber(row[measure.weighBy]) ? (row[measure.weighBy] as number) : null;
  if (base !== null && base < TRUSTED_LEAST) return null;
  if (base === null && measure.ofWhole && Math.max(value, reference.value) < SHARE_LEAST) return null;
  const gap = Math.abs(value - reference.value);
  const ratio = Math.max(0.01, value / reference.value);
  if (gap < APART_POINTS || (ratio < ABOVE && ratio > BELOW && gap < APART_FAR_POINTS)) return null;
  const kind = value > reference.value ? "rowAbove" : "rowBelow";
  const words = measureWords(field);
  const who = name ?? "this page";
  return {
    id: `${kind}:${list}:${field}:${name ?? "page"}`, kind, list: `${list}:${field}`,
    score: (reach === null ? 1 : Math.sqrt(Math.min(1, reach / 0.05))) * Math.min(1.5, Math.max(Math.abs(Math.log(ratio)), gap / 30)) + (reach === null ? 0.3 : 0),
    params: {
      name: name ?? "This page", ...(name === null ? { whole: 1 } : {}), measure: field, value: round1(value), mean: round1(reference.value), against: reference.against,
      ...(measure.lessIsBetter ? { lessIsBetter: 1 } : {}),
    },
    facts: [
      { key: "value", value: round1(value), unit: unitOf(field), label: `${who}: ${words}` },
      { key: "mean", value: round1(reference.value), unit: unitOf(field), label: `${AGAINST_WORDS[reference.against]} ${words}` },
    ],
  };
}

/** The rules over one page's answer, most worth saying first. */
export function pageFindings(screen: string, data: unknown): Finding[] {
  if (!data || typeof data !== "object") return [];
  const found: Found[] = [];

  // A short list's rows against their references: the one furthest only, as the other mirrors it (women up, men down).
  const shortBest = new Map<string, Found>();
  for (const { path, row, name, short } of totalsIn(data)) {
    // The whole moved: each total against the span before.
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
        params: { ...(name ? { name } : {}), measure: field, now, before, change: round1(change * 100) },
        facts: [
          { key: "now", value: now, unit: "count", label: `${name ? `${name}: ` : ""}${words}, this span` },
          { key: "before", value: before, unit: "count", label: `${name ? `${name}: ` : ""}${words}, the span before` },
        ],
      });
    }
    // The page's own percentages against the whole website's or similar pages'.
    for (const field of Object.keys(MEASURES).filter((one) => MEASURES[one].kind === "percent")) {
      const one = apart(`totals:${short ?? path}`, name, row, field, null);
      if (!one) continue;
      if (short === undefined) found.push(one);
      else if (firstOf(shortBest.get(`${short}:${field}`), one) === one) shortBest.set(`${short}:${field}`, one);
    }
  }
  found.push(...shortBest.values());

  for (const table of tablesIn(data)) {
    // The list's main figure: the first count most of its rows hold, with something in it.
    const totalOf = (field: string) => table.rows.reduce((sum, row) => sum + (isNumber(row[field]) ? row[field] : 0), 0);
    const main = COUNT_ORDER.find((field) => table.rows.filter((row) => isNumber(row[field])).length >= 3 && totalOf(field) > 0);
    const total = main ? totalOf(main) : 0;

    if (main && total > 0) {
      const words = measureWords(main);
      // The biggest movers: the row that gained most, and the one that lost most. A row with nothing the span before
      // is new, and moved as much as any, where the list held the span before.
      const held = table.rows
        .map((row) => ({ row, now: row[main], before: beforeOf(row, main) }))
        .filter((one): one is { row: Row; now: number; before: number } => isNumber(one.now) && one.before !== undefined && one.before >= 0);
      const kept = held.filter((one) => one.before > 0).length >= NEW_NEEDS_HELD;
      const moves = held.filter((one) => one.before > 0 || (kept && one.now > 0)).map((one) => ({ ...one, change: one.now - one.before }));
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

      // One holds most of the list's main figure: never of a list the page picked, which is no whole.
      if (!table.picked && table.rows.length >= HOLDS_ROWS) {
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

    for (const field of Object.keys(MEASURES).filter((one) => MEASURES[one].kind === "percent")) {
      // Weighed by its own base where the rows hold it (a click rate by the times shown), else by the list's main figure.
      const base = MEASURES[field].weighBy && table.rows.some((row) => isNumber(row[MEASURES[field].weighBy!])) ? MEASURES[field].weighBy! : main;
      // A row beside its own reference is set against it, never against the list's average: the one furthest from it,
      // as the rest of a share of a whole mirror it (phones up on the website's share, computers down by as much).
      if (table.rows.some((row) => isNumber(row[field]) && referenceOf(row, field))) {
        const all = base ? table.rows.reduce((sum, row) => sum + (isNumber(row[base]) ? row[base] : 0), 0) : 0;
        const best = table.rows
          .map((row) => {
            const reach = base && all > 0 && isNumber(row[base]) ? (row[base] as number) / all : MEASURES[field].ofWhole && isNumber(row[field]) ? Math.max(row[field] as number, referenceOf(row, field)?.value ?? 0) / 100 : 0.05;
            return apart(table.path, rowName(row), row, field, reach);
          })
          .filter((one): one is Found => one !== null)
          .reduce<Found | undefined>(firstOf, undefined);
        if (best) found.push(best);
        continue;
      }
      // A share of a whole has nothing to be set against: a list's shares always average the same.
      if (MEASURES[field].ofWhole) continue;
      // A row far from the rest: each percentage, weighed by the row's main figure.
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
