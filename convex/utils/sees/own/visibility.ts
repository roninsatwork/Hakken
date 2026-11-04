import type { OwnFound, Row } from "./shared";
import { linksAndKeywords } from "./visibilityLinks";
import { VISIBILITY_MARKET_OWN } from "./visibilityMarket";

/**
 * Visibility's pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10), by the eye's key
 * for them: Backlinks and Keywords (`visibilityLinks.ts`) and the rest — Google results, Competitors, AI answers, Mentions
 * and reviews, the Overview, Paid and Site audit (`visibilityMarket.ts`), each half built on its own on 3 November 2026.
 */
export const VISIBILITY_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  ...linksAndKeywords(),
  ...VISIBILITY_MARKET_OWN,
};
