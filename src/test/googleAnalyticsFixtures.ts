/**
 * Sample Google Analytics answers for rendering whole screens — ronins.co.uk,
 * connected, three conversions counted — shared by the look tests
 * (docs/plans/active/google-analytics-plan.md §11). A screen's own test keeps
 * its own rows.
 */

const EVENTS = [
  { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: 250, lastThirtyDays: 14 },
  { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: 150, lastThirtyDays: 6 },
  { eventName: "click_email", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 3 },
  { eventName: "sign_up", counted: false, analyticsValue: 10, hakkenValue: null, lastThirtyDays: 5 },
  { eventName: "scroll", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 1032 },
];

export const CONNECTION = {
  status: "CONNECTED" as const,
  signingIn: false,
  googleAccount: "anthony@example.com",
  sharedWithSearchConsole: true,
  choices: [] as Array<{ property: string; displayName: string; accountName: string; stream: string | null; checked: boolean; addresses: string[]; others: string[] }>,
  property: "properties/312456789",
  propertyName: "Ronins",
  stream: "https://www.ronins.co.uk",
  addresses: ["www.ronins.co.uk"],
  otherAddresses: ["staging.ronins.co.uk", "localhost"],
  timeZone: "Europe/London",
  currency: "GBP",
  events: EVENTS as typeof EVENTS | null,
  connectedAt: Date.parse("2026-10-08T15:22:00Z"),
  disconnectedAt: null,
  newestDay: "2026-10-08",
  oldestDay: "2026-08-10",
  historyDone: true,
  clearing: false,
  lastCollectedAt: Date.parse("2026-10-09T03:10:00Z"),
  collecting: null,
  problem: null,
  attempt: null,
  health: {
    checkedAt: Date.parse("2026-10-09T03:10:00Z"),
    checks: [
      { check: "NOTHING_COUNTED" as const, passing: true },
      { check: "NO_VALUE" as const, passing: false, names: ["click_email"], count: 3 },
      { check: "TRACKING_STOPPED" as const, passing: true },
      { check: "SUDDEN_FALL" as const, passing: true },
      { check: "SELF_REFERRAL" as const, passing: true },
      { check: "PAYMENT_REFERRALS" as const, passing: true },
      { check: "TOO_MUCH_UNKNOWN" as const, passing: true, share: 0.01 },
      { check: "STRANGERS" as const, passing: false, names: ["staging.ronins.co.uk"], count: 61 },
    ],
  } as { checkedAt: number; checks: Array<{ check: string; passing: boolean; names?: string[]; count?: number; share?: number }> } | null,
};

export const STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "ronins.co.uk",
  iconUrl: null,
  ownSites: [{ siteId: "site_1", host: "ronins.co.uk" }],
  searchConsoleConnected: true,
  connection: CONNECTION as typeof CONNECTION | null,
};

/** A status at another stage of connecting. */
export function statusWith(change: Partial<typeof CONNECTION> | null) {
  return { ...STATUS, connection: change === null ? null : { ...CONNECTION, ...change } };
}

export const ROW = {
  key: "~0",
  label: "https://www.ronins.co.uk/ai-agency/",
  visits: 288,
  engagementRate: 0.615,
  timePerVisit: 84,
  views: 512,
  conversions: 3,
  conversionRate: 3 / 288,
  fewVisits: false,
  value: 55_000,
  purchases: 0,
  revenue: 0,
  change: 0.31,
  conversionsBefore: 1,
  valueBefore: 25_000,
};

export const CHANNEL = { ...ROW, key: "Organic Search", label: "Organic Search", visits: 1104, conversions: 11, value: 220_000, conversionRate: 11 / 1104 };

/** One server page of a list. */
export function list(rows: unknown[]) {
  return {
    rows, total: rows.length, page: 1, pages: 1, size: 25, cut: null,
    live: false, preparing: false, from: "2026-09-09", to: "2026-10-08", folded: false, thresholded: false, longer: false, groups: null,
  };
}

export function top(rows: unknown[]) {
  return { rows, total: rows.length, live: false, preparing: false, from: "2026-09-09", to: "2026-10-08", folded: false, thresholded: false, longer: false, groups: null };
}

export const FIGURES = { visits: 2412, engaged: 1289, conversions: 23, value: 440_000, purchases: 0, revenue: 0, unvalued: 3 };

export const OVERVIEW = {
  preparing: false,
  from: "2026-09-09",
  to: "2026-10-08",
  now: FIGURES,
  before: { ...FIGURES, visits: 2225, engaged: 1190, conversions: 19, value: 350_000 },
  changedMost: [{ kind: "landing" as const, key: "~0", label: "https://www.ronins.co.uk/ai-agency/", conversions: 2, value: 30_000 }],
  landingLive: false,
};

export const CHART = {
  points: Array.from({ length: 30 }, (_, index) => ({
    day: new Date(Date.UTC(2026, 8, 9 + index)).toISOString().slice(0, 10),
    visits: 80 + (index % 7) * 5, engaged: 40, conversions: index % 3 === 0 ? 1 : 0, value: index % 3 === 0 ? 25_000 : 0, events: [index % 3 === 0 ? 1 : 0, 0, 0],
  })),
  events: ["generate_lead", "click_tel", "click_email"],
};

export const CONVERSIONS = {
  preparing: false,
  from: "2026-09-09",
  to: "2026-10-08",
  visits: 2412,
  visitsBefore: 2225,
  kinds: [
    { eventName: "generate_lead", count: 14, countBefore: 11, each: 25_000, setIn: "HAKKEN" as const, value: 350_000, valueBefore: 275_000 },
    { eventName: "click_tel", count: 6, countBefore: 5, each: 15_000, setIn: "HAKKEN" as const, value: 90_000, valueBefore: 75_000 },
    { eventName: "click_email", count: 3, countBefore: 3, each: null, setIn: null, value: null, valueBefore: null },
  ],
  shop: null,
};

export const LANDING_PAGE = {
  address: "https://www.ronins.co.uk/ai-agency/",
  path: "/ai-agency/",
  group: "AI services",
  row: ROW,
  siteEngagementRate: 0.534,
  conversions: [
    { eventName: "generate_lead", count: 1, each: 25_000, value: 25_000 },
    { eventName: "click_tel", count: 2, each: 15_000, value: 30_000 },
    { eventName: "click_email", count: 0, each: null, value: null },
  ],
  live: false,
  points: CHART.points.map(({ events: _events, ...point }) => point),
  channels: [CHANNEL],
};
