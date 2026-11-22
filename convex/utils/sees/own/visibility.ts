import type { OwnFound, Row } from "./shared";
import { VISIBILITY_BANDS_AND_PAGES_OWN } from "./visibilityBandsAndPages";
import { VISIBILITY_LINK_LISTS_OWN } from "./visibilityLinkLists";
import { linksAndKeywords } from "./visibilityLinks";
import { VISIBILITY_LOCAL_OWN } from "./visibilityLocal";
import { VISIBILITY_MARKET_OWN } from "./visibilityMarket";
import { VISIBILITY_RADAR_OWN } from "./visibilityRadar";

/**
 * Visibility's pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10), by the eye's key
 * for them: Backlinks and Keywords (`visibilityLinks.ts`) and the rest — Google results, Competitors, AI answers, Mentions
 * and reviews, the Overview, Paid and Site audit (`visibilityMarket.ts`), each half built on its own on 3 November 2026.
 * Sixteen more on 22 November 2026, whose eye had found nothing (visibility-16-eyes): Backlinks' lists and records
 * (`visibilityLinkLists.ts`), Local (`visibilityLocal.ts`), Brand radar's Sources, a source website and a question
 * (`visibilityRadar.ts`), and a square of Position bands and Your pages (`visibilityBandsAndPages.ts`).
 */
export const VISIBILITY_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  ...linksAndKeywords(),
  ...VISIBILITY_MARKET_OWN,
  ...VISIBILITY_LINK_LISTS_OWN,
  ...VISIBILITY_LOCAL_OWN,
  ...VISIBILITY_RADAR_OWN,
  ...VISIBILITY_BANDS_AND_PAGES_OWN,
};
