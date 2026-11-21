/**
 * What every Google Analytics screen's eye figures share, for the screens and for a chat app's question alike
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): money taken off, the whole website's figures a list's
 * rows are set beside, and a page's figures joined with its panels' own, as the eye joins them.
 */

/**
 * Money a Google Analytics read still carries for others (Ask Hakken's overview, Insights' reads), taken off before the
 * eye reads a page (decision 1, Anthony, 2026-11-03: "Take money off"): no finding, writer or chat on these screens ever
 * sees a value, a revenue or what anything was worth.
 */
const MONEY = new Set(["value", "valueBefore", "revenue", "revenueBefore", "worth", "worthBefore", "each", "averageOrder", "valuePerVisit", "unvalued", "currency"]);

export function withoutMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMoney);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !MONEY.has(key)).map(([key, inner]) => [key, withoutMoney(inner)]));
}

type Totals = { visits: number; views: number; conversions: number; engaged: number };

/**
 * The whole website's visits, views, conversions and engaged visits, now and the span before, from Overview's own read
 * (the same figures as its boxes), for a list page's rows to be set beside. Never money. Undefined without figures now.
 */
export function websiteForEye(overview: { now?: Totals | null; before?: Totals | null } | null | undefined) {
  const now = overview?.now;
  if (!now) return undefined;
  const before = overview?.before ?? null;
  return {
    visits: now.visits, visitsBefore: before?.visits ?? null,
    views: now.views, viewsBefore: before?.views ?? null,
    conversions: now.conversions, conversionsBefore: before?.conversions ?? null,
    engaged: now.engaged, engagedBefore: before?.engaged ?? null,
  };
}

/**
 * A page's figures as the eye reads them: what the page hands `AnalyticsSees`, money taken off, with its panels' own
 * figures (`useSeesPart`) beside them, as `withSeesParts` joins them on the screen. A panel with nothing yet (null) adds
 * nothing; a page that handed over nothing keeps nothing.
 */
export function eyeWithParts(data: unknown, parts: Record<string, unknown> = {}): unknown {
  if (data === undefined || data === null) return null;
  const page = withoutMoney(data);
  const held = Object.fromEntries(Object.entries(parts).filter(([, part]) => part !== undefined && part !== null));
  if (Object.keys(held).length === 0) return page;
  if (typeof page === "object" && !Array.isArray(page)) return { ...(page as Record<string, unknown>), ...held };
  return { page, ...held };
}
