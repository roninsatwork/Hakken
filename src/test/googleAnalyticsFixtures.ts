import type { Seen } from "@/convex/utils/hakkenSees";
import { conversionsSees, overviewSees } from "@/convex/utils/sees/analytics";

/**
 * Sample Google Analytics answers for rendering whole screens — acme-shop.test,
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
  status: "CONNECTED" as "CONNECTING" | "CHOOSING" | "COUNTING" | "CONNECTED" | "NEEDS_RECONNECT" | "DISCONNECTED",
  /** A shop: Products shows only for one (§18.6.6). */
  shop: false,
  signingIn: false,
  googleAccount: "anthony@example.com",
  sharedWithSearchConsole: true,
  choices: [] as Array<{ property: string; displayName: string; accountName: string; stream: string | null; checked: boolean; addresses: string[]; others: string[] }>,
  property: "properties/312456789",
  propertyName: "Acme",
  stream: "https://www.acme-shop.test",
  addresses: ["www.acme-shop.test"],
  otherAddresses: ["staging.acme-shop.test", "localhost"],
  /** The other addresses read for conversions (conversion-addresses-plan.md): none counting. */
  addressesRead: [] as Array<{
    host: string;
    kind: "SAME_DOMAIN" | "OTHER_DOMAIN" | "COPY";
    reached: boolean;
    events: Array<{ eventName: string; year: number; month: number }>;
    counted: boolean;
    hakken: boolean;
  }>,
  timeZone: "Europe/London",
  currency: "GBP",
  events: EVENTS as typeof EVENTS | null,
  copies: [] as Array<{ eventName: string; of: string }>,
  connectedAt: Date.parse("2026-10-08T15:22:00Z"),
  disconnectedAt: null,
  newestDay: "2026-10-08" as string | null,
  oldestDay: "2026-08-10",
  historyDone: true,
  clearing: false,
  lastCollectedAt: Date.parse("2026-10-09T03:10:00Z") as number | null,
  collecting: null,
  problem: null as "GOOGLE_BUSY" | "NO_ACCESS" | "REVOKED" | "UNREADABLE" | "NOT_CONFIGURED" | "NOT_OWNED" | null,
  problemDetail: null as string | null,
  readAgainAt: null as number | null,
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
      { check: "STRANGERS" as const, passing: false, names: ["staging.acme-shop.test"], count: 61 },
    ],
  } as { checkedAt: number; checks: Array<{ check: string; passing: boolean; names?: string[]; others?: string[]; count?: number; share?: number }> } | null,
  /** Visits on each of the property's addresses over the last 30 days (ga-tracking-health-plan.md TH2). */
  hostVisits: [{ host: "www.acme-shop.test", visits: 2_400 }, { host: "staging.acme-shop.test", visits: 61 }] as Array<{ host: string; visits: number }> | null,
  /** Listed events and sales on each address over the last 30 days (conversion-addresses-plan.md). */
  hostConversions: null as Array<{ host: string; conversions: number }> | null,
};

export const STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "acme-shop.test",
  iconUrl: null,
  ownSites: [{ siteId: "site_1", host: "acme-shop.test" }],
  searchConsoleConnected: true,
  /** Search Console's last 30 days: read only while the way to connect shows. */
  searchConsole: null as { clicks: number; impressions: number } | null,
  connection: CONNECTION as typeof CONNECTION | null,
};

/** A status at another stage of connecting. */
export function statusWith(change: Partial<typeof CONNECTION> | null) {
  return { ...STATUS, connection: change === null ? null : { ...CONNECTION, ...change } };
}

export const ROW = {
  key: "~0",
  label: "https://www.acme-shop.test/ai-agency/",
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
  viewsBefore: 431,
  conversionsBefore: 1,
  valueBefore: 25_000,
};

export const CHANNEL = { ...ROW, key: "Organic Search", label: "Organic Search", visits: 1104, conversions: 11, value: 220_000, conversionRate: 11 / 1104 };

/** One server page of a list, with the screen's What Hakken sees (none unless given) and a channel's own figures. */
export function list(rows: unknown[], { seen, figures, moves, ...rest }: { seen?: Seen; figures?: unknown; moves?: unknown; [field: string]: unknown } = {}) {
  return {
    rows, total: rows.length, page: 1, pages: 1, size: 25, cut: null,
    live: false, preparing: false, from: "2026-09-09", to: "2026-10-08", folded: false, thresholded: false, longer: false, groups: null,
    seen: seen ?? NO_BOX, figures: figures ?? null, untagged: null, moves: moves ?? null,
    ...rest,
  };
}

/** A box with nothing to say: the screen shows none. */
export const NO_BOX: Seen = { says: [], steps: [] };

export function top(rows: unknown[]) {
  return { rows, total: rows.length, live: false, preparing: false, from: "2026-09-09", to: "2026-10-08", folded: false, thresholded: false, longer: false, groups: null };
}

export const FIGURES = { visits: 2412, engaged: 1289, conversions: 23, value: 440_000, purchases: 0, revenue: 0, unvalued: 3 };

const OVERVIEW_FIGURES = {
  siteId: "site_1",
  preparing: false,
  from: "2026-09-09",
  to: "2026-10-08",
  now: { ...FIGURES, views: 6_120, people: 1_870, newPeople: 1_540, length: 2412 * 95 },
  before: { ...FIGURES, visits: 2225, engaged: 1190, conversions: 19, value: 350_000, views: 5_880, people: 1_710, newPeople: 1_420, length: 2225 * 92 },
  changedMost: [{ kind: "landing" as const, key: "~0", label: "https://www.acme-shop.test/ai-agency/", conversions: 2, value: 30_000, conversionsNow: 3 }],
  landingLive: false,
  counting: true,
  searchConsole: { clicks: 1_840, impressions: 212_000 } as { clicks: number; impressions: number } | null,
};

/** Overview's answer, its What Hakken sees worked out by its own rules. */
export const OVERVIEW = { ...OVERVIEW_FIGURES, seen: overviewSees(OVERVIEW_FIGURES) };

export const CHART = {
  points: Array.from({ length: 30 }, (_, index) => ({
    day: new Date(Date.UTC(2026, 8, 9 + index)).toISOString().slice(0, 10),
    visits: 80 + (index % 7) * 5, engaged: 40, views: 200 + (index % 7) * 9, conversions: index % 3 === 0 ? 1 : 0, events: [index % 3 === 0 ? 1 : 0, 0, 0],
  })),
  events: ["generate_lead", "click_tel", "click_email"],
};

/**
 * The 30 days before, laid over CHART's days (Conversions' "Visits needed for one conversion"): 70 visits a day, a
 * contact form every other day.
 */
export const DAYS_BEFORE = {
  held: true,
  shift: 30,
  points: CHART.points.map((point, index) => ({ day: point.day, visits: 70, conversions: index % 2 === 0 ? 1 : 0, events: [index % 2 === 0 ? 1 : 0, 0, 0] })),
  events: ["generate_lead", "click_tel", "click_email"],
};

const CONVERSION_KINDS = {
  preparing: false,
  from: "2026-09-09",
  to: "2026-10-08",
  visits: 2412,
  visitsBefore: 2225,
  kinds: [
    // Each kind's value is Ask Hakken's alone: no screen shows it (Anthony, 2026-11-03: "Take money off").
    { eventName: "generate_lead", count: 14, countBefore: 11, value: 350_000 as number | null },
    { eventName: "click_tel", count: 6, countBefore: 5, value: 90_000 as number | null },
    { eventName: "click_email", count: 3, countBefore: 3, value: null as number | null },
  ],
  shop: null,
  fired: [] as Array<{ eventName: string; count: number }>,
  /** How visits reached a conversion, by page classification (ga-conversions-visitors-plan.md CV3). */
  flow: {
    collecting: false,
    everyDevice: false,
    visits: 2412,
    channels: [
      { key: "Organic Search", visits: 1800, conversions: 12, more: 0 },
      { key: "Direct", visits: 400, conversions: 8, more: 0 },
      { key: "~more", visits: 212, conversions: 3, more: 4 },
    ],
    kinds: [
      { kind: "svc", name: "Services" as string | null, visits: 1400, conversions: 15, more: 0 },
      { kind: "NOT_SORTED", name: null as string | null, visits: 800, conversions: 8, more: 0 },
      { kind: "NO_PAGE", name: null as string | null, visits: 212, conversions: 0, more: 0 },
    ],
    endings: [
      { key: "generate_lead", counted: true, count: 14 },
      { key: "click_tel", counted: true, count: 6 },
      { key: "click_email", counted: true, count: 3 },
      { key: "~left", counted: false, count: 2389 },
    ],
    routes: [
      { from: "c:Organic Search", to: "k:svc", visits: 1200, conversions: 10, channels: ["c:Organic Search"] },
      { from: "c:Organic Search", to: "k:NOT_SORTED", visits: 600, conversions: 2, channels: ["c:Organic Search"] },
      { from: "c:Direct", to: "k:NOT_SORTED", visits: 200, conversions: 6, channels: ["c:Direct"] },
      { from: "c:Direct", to: "k:svc", visits: 200, conversions: 2, channels: ["c:Direct"] },
      { from: "c:~more", to: "k:NO_PAGE", visits: 212, conversions: 3, channels: ["c:~more"] },
      { from: "k:svc", to: "e:generate_lead", visits: 10, conversions: 10, channels: ["c:Organic Search", "c:Direct"] },
      { from: "k:NOT_SORTED", to: "e:click_tel", visits: 6, conversions: 6, channels: ["c:Direct"] },
      { from: "k:svc", to: "e:~left", visits: 1385, conversions: 0, channels: ["c:Organic Search", "c:Direct"] },
      { from: "k:NOT_SORTED", to: "e:~left", visits: 792, conversions: 0, channels: ["c:Organic Search", "c:Direct"] },
      { from: "k:NO_PAGE", to: "e:~left", visits: 212, conversions: 0, channels: ["c:~more"] },
    ],
    grid: {
      kinds: [{ kind: "svc", name: "Services" as string | null }, { kind: "NOT_SORTED", name: null as string | null }, { kind: "NO_PAGE", name: null as string | null }],
      rows: [
        { eventName: "generate_lead", counted: true, count: 14, cells: [10, 4, 0] },
        { eventName: "click_tel", counted: true, count: 6, cells: [0, 6, 0] },
        { eventName: "click_email", counted: true, count: 3, cells: [3, 0, 0] },
      ],
    },
  } as {
    collecting: boolean; everyDevice: boolean; visits: number;
    channels: Array<{ key: string; visits: number; conversions: number; more: number }>;
    kinds: Array<{ kind: string; name: string | null; visits: number; conversions: number; more: number }>;
    endings: Array<{ key: string; counted: boolean; count: number }>;
    routes: Array<{ from: string; to: string; visits: number; conversions: number; channels: string[] }>;
    grid: { kinds: Array<{ kind: string; name: string | null }>; rows: Array<{ eventName: string; counted: boolean; count: number; cells: number[] }> };
  } | null,
  /** What people did before converting, over 12 months (CV4). */
  before: {
    collecting: false,
    siteRate: 0.012 as number | null,
    few: 100,
    rows: [{ eventName: "scroll", did: 900, then: 30 }, { eventName: "file_download", did: 40, then: 3 }],
  } as { collecting: boolean; siteRate: number | null; few: number; rows: Array<{ eventName: string; did: number; then: number }> } | null,
};

/** Conversions' answer, its What Hakken sees worked out by its own rules. */
export const CONVERSIONS = { ...CONVERSION_KINDS, seen: conversionsSees(CONVERSION_KINDS) };

/** Conversions with nothing counted (§15 screen 16): the visits, and the key event the property records. */
const NOTHING_COUNTED_KINDS = { ...CONVERSION_KINDS, kinds: [], fired: [{ eventName: "sign_up", count: 5 }], flow: null, before: null };

/** Every event, as Conversions' table reads it (ga-conversions-visitors-plan.md CV5): the counted ones, a key event not, the rest. */
const EVENT_ROWS = [
  { eventName: "page_view", kind: "automatic" as const, counted: false, keyEvent: false, times: 2431, people: 671, visits: 808, timesBefore: 2210 },
  { eventName: "scroll", kind: "measured" as const, counted: false, keyEvent: false, times: 214, people: 160, visits: 180, timesBefore: 190 },
  { eventName: "generate_lead", kind: "conversion" as const, counted: true, keyEvent: true, times: 14, people: 14, visits: 14, timesBefore: 11 },
  { eventName: "sign_up", kind: "own" as const, counted: false, keyEvent: true, times: 5, people: 5, visits: 5, timesBefore: 4 },
];
export const EVENT_LIST = { preparing: false, live: false, rows: EVENT_ROWS, points: [], flags: { folded: false, thresholded: false, cut: false }, seen: { says: [], steps: [] } };
export const NOTHING_COUNTED = { ...NOTHING_COUNTED_KINDS, seen: conversionsSees(NOTHING_COUNTED_KINDS) };

export const LANDING_PAGE = {
  address: "https://www.acme-shop.test/ai-agency/",
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

/** The Conversions map (conversion-charts-plan.md): three page kinds across, three events down, both units, the span before held. */
export const CONVERSIONS_MAP = {
  collecting: false,
  everyDevice: false,
  bothUnits: true,
  hasBefore: true,
  columns: [
    { key: "service", name: "Service", visits: 1200, visitsBefore: 1100 },
    { key: "unsorted", name: null, visits: 900, visitsBefore: 950 },
    { key: "none", name: null, visits: 312, visitsBefore: 175 },
  ],
  rows: [
    { eventName: "generate_lead", counted: true, cells: [{ visits: 12, times: 12, visitsBefore: 9, timesBefore: 9 }, { visits: 2, times: 2, visitsBefore: 2, timesBefore: 2 }, { visits: 0, times: 0, visitsBefore: 0, timesBefore: 0 }] },
    { eventName: "click_tel", counted: true, cells: [{ visits: 5, times: 8, visitsBefore: 0, timesBefore: 0 }, { visits: 1, times: 1, visitsBefore: 1, timesBefore: 1 }, { visits: 0, times: 0, visitsBefore: 0, timesBefore: 0 }] },
    { eventName: "click_email", counted: true, cells: [{ visits: 3, times: 3, visitsBefore: 4, timesBefore: 4 }, { visits: 0, times: 0, visitsBefore: 0, timesBefore: 0 }, { visits: 0, times: 0, visitsBefore: 0, timesBefore: 0 }] },
  ],
};

/** The lines by kind: the contact form a day, a line for Organic Search and one for Direct. */
export const CONVERSIONS_LINES = {
  held: true,
  everyDevice: false,
  bothUnits: true,
  columns: [{ key: "Organic Search", name: "Organic Search" }, { key: "Direct", name: "Direct" }],
  points: CHART.points.map((point, index) => ({ day: point.day, cells: [{ visits: 50 + (index % 5), did: index % 3 === 0 ? 1 : 0, times: index % 3 === 0 ? 1 : 0 }, { visits: 20, did: 0, times: 0 }] })),
};

export const COUNTRY_CHOICES = { main: "gbr", ready: [] as string[] };

/** The pages behind a square: the contact form from Service pages, three pages, the most conversions first. */
export const CONVERSIONS_PAGES = {
  collecting: false,
  everyDevice: false,
  name: "Service",
  cut: false,
  visits: 1200,
  seen: {
    says: [{ code: "pages", a: 3, b: 12 }, { code: "topPage", text: "/cupboard-handles/", a: 7, b: 12 }],
    steps: [{ code: "seeBest", text: "/cupboard-handles/", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~1" } } }],
  },
  rows: [
    { page: "~1", address: "https://www.acme-shop.test/cupboard-handles/", title: "Cupboard handles", visits: 420, did: 7, times: 7 },
    { page: "~2", address: "https://www.acme-shop.test/door-handles/", title: "Door handles", visits: 310, did: 4, times: 5 },
    { page: "~3", address: "https://www.acme-shop.test/contact/", visits: 95, did: 1, times: 1 },
  ],
};
