import { BING_OWN } from "./own/bing";
import { CLARITY_OWN } from "./own/clarity";
import { GOOGLE_ANALYTICS_OWN } from "./own/googleAnalytics";
import { INSIGHTS_OWN } from "./own/insights";
import { SEARCH_CONSOLE_OWN } from "./own/searchConsole";
import type { OwnFound, Row } from "./own/shared";
import { VISIBILITY_OWN } from "./own/visibility";

export type { OwnFound } from "./own/shared";

/**
 * A page's own findings (Anthony, 2026-11-03: "every page we touch needs its own finding i have asked this more than
 * once across all pages"): rules written for one screen's figures, as the Conversions screens have theirs
 * (`findings.ts`), one file a section (`own/<section>.ts`) so each section is built on its own
 * (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 5: "side by side"). Each rule reads the figures the page
 * hands its eye (`pageData.ts`), compares each with something, and picks the biggest things for whatever dates are
 * chosen. A page listed with `general: false` says only its own; with `general: true` it keeps the general rules'
 * (`pageFindings.ts`) beside them. No database here.
 */
export const OWN_FINDINGS: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  ...GOOGLE_ANALYTICS_OWN,
  ...SEARCH_CONSOLE_OWN,
  ...BING_OWN,
  ...CLARITY_OWN,
  ...INSIGHTS_OWN,
  ...VISIBILITY_OWN,
};
