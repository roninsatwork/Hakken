import type { Finding, FindingFact } from "../findings";
import { measureWords } from "../measures";

/**
 * The helpers every section's own rules share (`own/<section>.ts`, registered in `pageOwnFindings.ts`).
 *
 * A page's own findings (Anthony, 2026-11-03: "every page we touch needs its own finding i have asked this more than
 * once across all pages"; visits-redo-plan-2026-11-03.md, step 2): rules written for one screen's figures, as the
 * Conversions screens have theirs (`findings.ts`), because the general rules (`pageFindings.ts`) speak only when a total
 * moves by a sixth or one row holds two-fifths of a list — on Visits in October 2026 they found only that Chrome is the
 * busiest browser. Each rule reads the figures the page hands its eye (`pageData.ts`), compares each figure with
 * something, and is scored against the others. A page listed here with `general: false` says only its own; one with
 * `general: true` keeps the general rules' too (Products' products selling more and less). No database here.
 */

export type OwnFound = Omit<Finding, "facts"> & { facts: FindingFact[]; list: string };
export type Row = Record<string, unknown>;

export const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : isRow(value) && Array.isArray(value.rows) ? value.rows.filter(isRow) : []);
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const named = (row: Row) => (typeof row.name === "string" && row.name.trim() ? row.name.trim() : null);

/** A move between the span before and now: its change as a fraction, and the facts that say it. */
export function moved(list: string, name: string, measure: string, now: number, before: number, score: number, other?: { name: string; change: number }): OwnFound {
  const change = (now - before) / before;
  const kind = change >= 0 ? "movedUp" : "movedDown";
  const words = measureWords(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: {
      name, measure, now, before, change: round1(Math.abs(change) * 100),
      ...(other ? { other: other.name, otherChange: round1(Math.abs(other.change) * 100), otherWay: other.change >= 0 ? "up" : "down" } : {}),
    },
    facts: [
      { key: "now", value: now, unit: "count", label: `${name}: ${words}, this span` },
      { key: "before", value: before, unit: "count", label: `${name}: ${words}, the span before` },
      // The size of the change, its way in the words ("fell 7.5%"): a signed figure read "fell -7.5%" (2026-11-03).
      { key: "change", value: round1(Math.abs(change) * 100), unit: "percent", label: `${name}: how much ${words} ${change >= 0 ? "rose" : "fell"}` },
    ],
  };
}

/** A percentage set against another's: another group's (`other`), or the whole website's. */
export function apartFrom(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string | null): OwnFound {
  const kind = value > mean ? "rowAbove" : "rowBelow";
  const words = measureWords(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: { name, measure, value: round1(value), mean: round1(mean), against: other === null ? "website" : "other", ...(other !== null ? { other } : {}), lessIsBetter: 1 },
    facts: [
      { key: "value", value: round1(value), unit: "percent", label: `${name}: ${words}` },
      { key: "mean", value: round1(mean), unit: "percent", label: `${other ?? "the whole website"}: ${words}` },
    ],
  };
}

/** A part of a whole worth knowing: "products never bought: 37.6% of all the products added". */
export function partOf(list: string, name: string, measure: string, value: number, whole: number, score: number): OwnFound {
  const share = round1((value / whole) * 100);
  return {
    id: `holdsMost:${list}:${measure}:${name}`, kind: "holdsMost", list, score,
    params: { name, measure, share, value },
    facts: [
      { key: "value", value, unit: "count", label: `${name}: ${measureWords(measure)}` },
      { key: "share", value: share, unit: "percent", label: `${name}'s share of all the ${measureWords(measure)}` },
    ],
  };
}

/** The first of each list, in the order given, up to `most`: so one list's groups never fill the page's findings. */
export function firstOfEachList<T extends { list: string }>(ranked: readonly T[], most: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const one of ranked) {
    if (seen.has(one.list)) continue;
    seen.add(one.list);
    out.push(one);
    if (out.length >= most) break;
  }
  return out;
}
