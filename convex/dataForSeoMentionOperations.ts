import type { SeoOperation } from "./dataForSeoRegistry";

/**
 * Web mentions (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 6, D13, D20): pages across the web naming a website — DataForSEO's Content
 * Analysis search for its address and its name in quotes, $0.024 a call
 * plus a little a page (20 for $0.025, tried 2026-10-09), weekly — and the
 * websites linking to two of its rivals and not to it, from Backlinks' domain
 * intersection, $0.024 a pair (tried 2026-10-09), monthly. Bought while the
 * company has Web mentions on (D16).
 */
export const MENTIONS_OPERATION = "web_mentions";
export const LINK_GAP_OPERATION = "link_gap";
/** Mentions are read again each week; link gaps each month. */
export const MENTIONS_DAYS = 7;
export const LINK_GAP_DAYS = 30;
/** Websites read for a link gap: each pair of rivals shares its linking websites. */
export const LINK_GAP_ROWS = 100;

export const MENTION_OPERATIONS: readonly SeoOperation[] = [
  {
    id: MENTIONS_OPERATION,
    question: "Which pages across the web name this business?",
    family: "Content Analysis",
    mode: "LIVE",
    path: "/v3/content_analysis/search/live",
    costBand: "low",
    params: {
      keyword: { kind: "text", required: true, description: "The name or address, in quotes." },
      limit: { kind: "number", required: false, description: "How many pages to read.", default: 100 },
    },
  },
  {
    id: LINK_GAP_OPERATION,
    question: "Which websites link to both of these rivals and not to this website?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/domain_intersection/live",
    costBand: "low",
    params: {
      targets: { kind: "text", required: true, description: "The two rivals, as {\"1\": host, \"2\": host}." },
      exclude_targets: { kind: "text", required: false, description: "The website itself." },
      limit: { kind: "number", required: false, description: "How many linking websites to read.", default: LINK_GAP_ROWS },
    },
  },
];

export function isMentionOperation(operationId: string): boolean {
  return operationId === MENTIONS_OPERATION || operationId === LINK_GAP_OPERATION;
}

/** What one search for a website is sent: a name or address, in quotes, and how many pages. */
export function mentionsParams(phrase: string, limit: number): Record<string, unknown> {
  return { keyword: `"${phrase.replace(/"/g, "")}"`, limit };
}

/** The phrase a search was for, read back from what was sent. */
export function mentionPhraseAskedFor(params: Record<string, unknown>): string | null {
  return typeof params.keyword === "string" ? params.keyword.replace(/"/g, "").trim().toLowerCase() || null : null;
}

/** What one pair of rivals is sent: the two, less the website itself. */
export function linkGapParams(rivals: readonly [string, string], own: string): Record<string, unknown> {
  return { targets: { 1: rivals[0], 2: rivals[1] }, exclude_targets: [own], limit: LINK_GAP_ROWS };
}
