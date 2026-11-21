import type { SeesScreen } from "../screens";

/**
 * The client Dashboard in the eye's screen list (`screens.ts`; docs/plans/active/dashboard-way-1-plan-2026-11-21.md, "The
 * eye"). Its writer is handed the page's four numbers as `dashboard.dashboardFigures` reads them: visits and what was bought
 * or done from Google Analytics, clicks and times shown from Search Console, each added up over the company's own websites,
 * with the span before. A source switched off for the company hands nothing, and the writer never speaks of it.
 */
export const DASHBOARD_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  "dashboard.home": {
    writer: "INSIGHTS_ANALYST",
    about: "the Dashboard: the business's day at a glance. Visits and sales (or events) from Google Analytics, clicks and times shown from Search Console, for the dates chosen, against the span before, added up over the company's own websites",
    parts: [
      "the four numbers: visits, then Bought (a shop's sales) or Events (the events a business that wants enquiries counts), clicks from Google and times shown on Google, each against the span before, with its days as a small line",
    ],
    never: [
      "money: what anything was worth or earned. A sale is counted, never valued, and goes by the box's name: sales, or events",
      "Bing, Microsoft Clarity or the Visibility estimates: each has its own section further down the page, and its own pages",
      "a source missing from the figures: it is switched off for this company, so it isn't on the page",
      "the Reading room's stories or Google's updates: they're written for everyone, not from this business's figures",
      "a click from Google as a sale: a click is a visit to the website, nothing more",
    ],
  },
};
