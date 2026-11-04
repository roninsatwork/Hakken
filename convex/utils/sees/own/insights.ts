import { enquiriesFindings, enquirySourceFindings, findingFindings, findingsFindings, funnelFindings, reportFindings, summaryFindings, thisWeekFindings } from "./insightsMonths";
import type { Finder } from "./insightsShared";
import { aiSearchFindings, cannibalisationFindings, cannibalisationGroupFindings, leaderboardsFindings, leagueFindings, measurementFindings, opportunitiesFindings, pagePlanFindings, pageReviewFindings, pageReviewsFindings, strategyFindings } from "./insightsWeek";

/**
 * Insights' pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9; Anthony,
 * 2026-11-03: "every page we touch needs its own finding … i have asked this more than once across all pages").
 *
 * Insights draws only on what the sections have downloaded (Anthony, 2026-10-29): every rule here reads the figures its
 * page hands the eye (`_components/insightsSees.ts` builds them, `pageData.ts` trims them), never anything else. Each
 * finding is set against something — the same months a year before where the page compares with them, else the months
 * just before; the whole website; another kind, source or rival — and the rules always pick the biggest things on the
 * page, whatever period is chosen: a bar only keeps out what is too small to trust. A page's names come in its reader's
 * words (`names`), never a code or an id; pages not sorted yet are Hakken's housekeeping and never a finding. No money:
 * Insights' figures are enquiries, visits and places. No database here.
 */
/** Insights' pages with their own rules, by the eye's key for them: each says only its own (`general: false`). */
export const INSIGHTS_OWN: Readonly<Record<string, Finder>> = {
  "insights.aiSearch": { general: false, find: aiSearchFindings },
  "insights.cannibalisation": { general: false, find: cannibalisationFindings },
  "insights.cannibalisationGroup": { general: false, find: cannibalisationGroupFindings },
  "insights.enquiries": { general: false, find: enquiriesFindings },
  "insights.enquiriesSource": { general: false, find: enquirySourceFindings },
  "insights.findings": { general: false, find: findingsFindings },
  "insights.finding": { general: false, find: findingFindings },
  "insights.funnel": { general: false, find: funnelFindings },
  "insights.leaderboards": { general: false, find: leaderboardsFindings },
  "insights.leaderboard": { general: false, find: leagueFindings },
  "insights.measurement": { general: false, find: measurementFindings },
  "insights.opportunities": { general: false, find: opportunitiesFindings },
  "insights.pagePlan": { general: false, find: pagePlanFindings },
  "insights.pageReviews": { general: false, find: pageReviewsFindings },
  "insights.pageReview": { general: false, find: pageReviewFindings },
  "insights.report": { general: false, find: reportFindings },
  "insights.yourMonth": { general: false, find: reportFindings },
  "insights.strategy": { general: false, find: strategyFindings },
  "insights.summary": { general: false, find: summaryFindings },
  "insights.thisWeek": { general: false, find: thisWeekFindings },
};
