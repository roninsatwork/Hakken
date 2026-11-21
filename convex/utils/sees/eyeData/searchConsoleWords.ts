import { NOT_SORTED_KIND } from "../../pageKinds";
import { PAGE_TYPES } from "../../siteShapes";
import type { ServerWords } from "../serverWords";

/**
 * The words every Search Console screen hands its eye beside its figures (`SearchConsoleSees`), built in one place for
 * the screens and for a chat app's question (`chatAppEyes/searchConsole.ts`), so the two can't call a span two names
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The screen passes the reader's words (`useTranslations`),
 * the server the English ones (`englishWords`).
 */

/** A screen's translator as the words reader the figures functions take: next-intl's is the same shape, typed by its keys. */
export const wordsReader = (t: unknown): ServerWords => t as ServerWords;

/**
 * A span's name where it has one: a whole calendar month by its name, "October", with its year when it isn't this year's;
 * null for any other span, which the screen words by its period instead. As `useSpanName` names it.
 */
export function spanNameOf(span: { from: string; to: string } | null, locale: string, year: number = new Date().getUTCFullYear()): string | null {
  if (!span?.from || !span.to || !span.from.endsWith("-01")) return null;
  const last = new Date(Date.UTC(Number(span.from.slice(0, 4)), Number(span.from.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (span.to !== last) return null;
  const name = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month: "long", timeZone: "UTC" }).format(new Date(`${span.from}T00:00:00Z`));
  return Number(span.from.slice(0, 4)) === year ? name : `${name} ${span.from.slice(0, 4)}`;
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * The words `SearchConsoleSees` adds to every screen's figures: the dates and the span before by their names where they
 * have one ("October", "September"), else what the period is set against ("The month before"), and the names the
 * section's rules say things by.
 */
export function searchConsoleSeesWords(input: {
  /** `searchConsole.sees`. */
  sees: ServerWords;
  /** What the period is set against, as the date menu says it: "the month before". */
  before: string;
  nowName: string | null;
  beforeName: string | null;
}): Record<string, string> {
  const { sees } = input;
  return {
    before: input.beforeName ?? capital(input.before),
    ...(input.nowName ? { now: input.nowName } : {}),
    website: sees("website"),
    clicks: sees("clicks"),
    shown: sees("shown"),
    weekends: sees("weekends"),
    weekdays: sees("weekdays"),
    recent: sees("recent"),
    earlier: sees("earlier"),
    before7: sees("week7Before"),
    // The newest days, weeks or months of a chart against those before them, by the chart's step.
    "recent.7": sees("recentSteps.day"),
    "recent.4": sees("recentSteps.week"),
    "recent.3": sees("recentSteps.month"),
    "earlier.7": sees("earlierSteps.day"),
    "earlier.4": sees("earlierSteps.week"),
    "earlier.3": sees("earlierSteps.month"),
    "average.7": sees("averageSteps.day"),
    "average.4": sees("averageSteps.week"),
    "average.3": sees("averageSteps.month"),
  };
}

/** How a screen writes a count, a place to one decimal, a short day ("29 Oct") and a month ("October 2026"). */
export type SearchConsoleFormats = {
  number: (value: number) => string;
  oneDecimal: (value: number) => string;
  shortDay: (day: string) => string;
  month: (month: string) => string;
};

/** The screens' own formats in English (`siteFormat.ts`, `searchConsoleFormat.ts`: en-GB), for figures built on the server. */
export const ENGLISH_FORMATS: SearchConsoleFormats = {
  number: (value) => Math.round(value).toLocaleString("en-GB"),
  oneDecimal: (value) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10),
  shortDay: (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
  month: (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
};

/** The language a screen names countries in, in English: as `readerLanguage` says it. */
export const ENGLISH_LANGUAGE = "en-GB";

/** Google's name for a kind of rich result, in words: "REVIEW_SNIPPET" reads "Review snippet". Rich results and Performance name them so. */
export function appearanceName(key: string, known: (key: string) => string | null): string {
  return known(key) ?? key.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/**
 * A page's kind in words, as `usePageKinds` labels it once the website's classifications are in: a classification's own
 * name, Not sorted, or Hakken's page type. `common` is `sites.common`.
 */
export function pageKindLabel(choices: ReadonlyArray<{ id: string; name: string }> | null | undefined, common: ServerWords): (kind: string | null | undefined) => string {
  const byId = new Map((choices ?? []).map((choice) => [choice.id, choice.name]));
  return (kind) => {
    if (!kind) return "–";
    if (kind === NOT_SORTED_KIND) return common("notSorted");
    const name = byId.get(kind);
    if (name) return name;
    if ((PAGE_TYPES as readonly string[]).includes(kind)) return common(`pageTypes.${kind}`);
    // A classification the list doesn't know yet: still on its way (undefined while a screen loads it), or just removed.
    return choices === undefined ? "…" : "–";
  };
}

/** A screen's figures with the words beside them, as the eye is handed them: anything but a record as it is. */
export function withSeesWords(data: unknown, words: Record<string, string>): unknown {
  return data && typeof data === "object" && !Array.isArray(data) ? { ...(data as Record<string, unknown>), words } : data;
}
