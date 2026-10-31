import { keyedRead } from "../agentTools";
import type { Fact } from "../insightFacts";
import { seesScreenFor, sourceOfSection } from "./screens";

/**
 * A page's own figures, handed to the eye (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase 1). Every page
 * already holds what it shows — the answer of the very query that draws it — so the eye takes that, not a second read:
 * the writer, the panel's findings and the chat then name exactly the figures the reader sees. Kept short (each list
 * its first rows, as the page opens), numbers given keys the writer names and the Editor fills in. No database here.
 */

/** Rows a list keeps, depth an answer is followed to, and the words a string keeps: a page's first screen, never all of it. */
const MOST_ROWS = 25;
const MOST_DEPTH = 6;
const MOST_TEXT = 200;
/** A page's figures handed over at most, as JSON text: well inside what a Convex argument and a saved answer may hold. */
export const MOST_PAGE_DATA_CHARS = 120_000;
/** Fields that are the page's own plumbing, never a figure or a name a reader sees. */
const PLUMBING = /^(_id|_creationTime|siteId|companyId|companyWebsiteId|websiteId|holdId|userId|threadId|runId|iconUrl|icon|href|link|links|seen|rule|sees|ok)$/;
/** A field kept as a fraction a screen shows as a percentage: a click rate, a share, a rate, a change. */
const FRACTION = /(rate|share|ctr|change)$/i;

/**
 * The page's answer cut to what it shows first: lists to their first rows, long words shortened, plumbing dropped, and
 * a rate kept as a fraction (0.034) turned into the percentage the page shows (3.4), so the writer reads it right.
 */
export function trimPageData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.length > MOST_TEXT ? `${value.slice(0, MOST_TEXT)}…` : value;
  if (typeof value === "boolean") return value;
  if (depth >= MOST_DEPTH) return null;
  if (Array.isArray(value)) return value.slice(0, MOST_ROWS).map((item) => trimPageData(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [name, inner] of Object.entries(value as Record<string, unknown>)) {
      if (PLUMBING.test(name) || inner === undefined || inner === null || name.startsWith("$")) continue;
      if (typeof inner === "number" && FRACTION.test(name) && !/percent$/i.test(name) && Math.abs(inner) <= 1) {
        out[`${name}Percent`] = Math.round(inner * 1000) / 10;
        continue;
      }
      const kept = trimPageData(inner, depth + 1);
      if (kept !== null) out[name] = kept;
    }
    return out;
  }
  return null;
}

/** The page's answer trimmed and held to its size: rows dropped from the end of the longest lists until it fits. */
export function pageDataFor(value: unknown): unknown {
  let trimmed = trimPageData(value);
  for (let rows = MOST_ROWS; rows > 2 && JSON.stringify(trimmed ?? null).length > MOST_PAGE_DATA_CHARS; rows = Math.floor(rows / 2)) {
    trimmed = cutLists(trimmed, rows);
  }
  return JSON.stringify(trimmed ?? null).length > MOST_PAGE_DATA_CHARS ? null : trimmed;
}

function cutLists(value: unknown, rows: number): unknown {
  if (Array.isArray(value)) return value.slice(0, rows).map((item) => cutLists(item, rows));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, inner]) => [name, cutLists(inner, rows)]));
  return value;
}

/** The page's figures as facts the writer names by key, and the page as it reads it, keys beside each number. */
export function pageFacts(screen: string, data: unknown, at: { from?: string; to?: string; country?: string; currency?: string | null } = {}): { shown: unknown; facts: Fact[] } {
  const entry = seesScreenFor(screen);
  if (!entry || data === null || data === undefined) return { shown: null, facts: [] };
  return keyedRead(data, "page", { source: sourceOfSection(entry.section), ...at });
}

/** Figures the chat is told at most: the page's first ones, as the page opens. */
const MOST_FIGURE_LINES = 60;

/**
 * The page's figures as lines for Ask Hakken, when a conversation starts from the eye's panel: "keywords · door
 * handles · clicks: 840". The page's own, as it showed them, so "why did this fall?" is answered about these.
 */
export function pageFigureLines(screen: string, data: unknown): string[] {
  const { facts } = pageFacts(screen, data);
  const shown = (value: number, unit: Fact["unit"]) => `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: unit === "count" ? 0 : 2 }).format(value)}${unit === "percent" ? "%" : ""}`;
  return facts.slice(0, MOST_FIGURE_LINES).map((fact) => `${fact.label.replace(/^page · /, "")}: ${shown(fact.value, fact.unit)}`);
}
