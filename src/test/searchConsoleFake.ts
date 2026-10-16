import { vi } from "vitest";

/**
 * Google's Search Console faked at the network, for the tests of connecting
 * and collecting a website's Search Console (docs/plans/active/search-console-plan.md
 * §3–§4): its sign-in, its properties, and its Search Analytics answers added
 * up from the figures a test holds — by day, search, page, country, device and
 * appearance, as Google adds them up. Nothing reaches Google. Moved here from
 * `convex/searchConsole.test.ts` on 2026-10-15 for the collection's kill tests
 * (`convex/collectionKills.test.ts`) to share.
 */

export const READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const ALL_SCOPES = `${READ_SCOPE} openid https://www.googleapis.com/auth/userinfo.email`;

export type Row = { key: string; clicks: number; impressions: number; position?: number };
/** What the fake Google holds: per property, kind of result and day, the totals and each split's rows. */
export type Pair = Row & { page: string };
/**
 * What the fake Google holds: per property, kind of result and day, the totals and each split's rows. The
 * pairs a search with its page; without them, each search goes to the home page.
 */
export type Figures = Record<string, Record<string, Record<string, { total: Row; query?: Row[]; pair?: Pair[]; page?: Row[]; country?: Row[]; device?: Row[]; searchAppearance?: Row[] }>>>;

export type Google = {
  account: string;
  scope: string;
  properties: { siteUrl: string; permissionLevel: string }[];
  figures: Figures;
  /** Answers instead of the figures, for a status Google gives to every ask. */
  analyticsStatus?: number;
  /** Google too busy for the asks this picks: a 429, as Google answers when it wants Hakken to wait. */
  busyWhen?: (ask: { startDate: string; dimensions: string[] }) => boolean;
  refreshStatus?: number;
  calls: { url: string; body: string }[];
};

export function fakeGoogle(overrides: Partial<Google> = {}): Google {
  const google: Google = {
    account: "owner@acme-shop.test",
    scope: ALL_SCOPES,
    properties: [{ siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteOwner" }],
    figures: {},
    calls: [],
    ...overrides,
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    google.calls.push({ url, body });
    if (url === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(body);
      if (form.get("grant_type") === "refresh_token") {
        if (google.refreshStatus) return new Response('{"error":"invalid_grant"}', { status: google.refreshStatus });
        return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
      }
      return Response.json({ access_token: "ya29.first", refresh_token: "1//refresh", expires_in: 3599, scope: google.scope });
    }
    if (url === "https://oauth2.googleapis.com/revoke") return new Response("{}", { status: 200 });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ email: google.account });
    if (url === "https://searchconsole.googleapis.com/webmasters/v3/sites") return Response.json({ siteEntry: google.properties });
    const analytics = /webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(url);
    if (analytics) {
      if (google.analyticsStatus) return new Response("refused", { status: google.analyticsStatus });
      const property = decodeURIComponent(analytics[1]);
      const ask = JSON.parse(body) as {
        startDate: string; endDate: string; type: string; dimensions: string[]; startRow: number;
        dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; expression: string }> }>;
      };
      // Only one search's or one page's rows, when asked for them (a country filter it does not split by).
      const only = (ask.dimensionFilterGroups ?? []).flatMap((group) => group.filters).filter((filter) => filter.dimension === "query" || filter.dimension === "page");
      if (google.busyWhen?.(ask)) return new Response("Too many requests", { status: 429 });
      const days = google.figures[property]?.[ask.type] ?? {};
      if (ask.startRow > 0) return Response.json({});
      const figures = (row: Row) => ({ clicks: row.clicks, impressions: row.impressions, ctr: row.clicks / row.impressions, position: row.position ?? 3.5 });
      if (ask.dimensions[0] === "date") {
        return Response.json({
          rows: Object.entries(days)
            .filter(([day]) => day >= ask.startDate && day <= ask.endDate)
            .map(([day, entry]) => ({ keys: [day], ...figures(entry.total) })),
        });
      }
      // Every day asked for added up, by its keys, as Google does: a day's ask, or the weeks the long lists ask for.
      const sums = new Map<string, { keys: string[]; clicks: number; impressions: number; positionSum: number }>();
      for (const [day, held] of Object.entries(days)) {
        if (day < ask.startDate || day > ask.endDate) continue;
        const rows = ask.dimensions.length === 2
          ? (held.pair ?? (held.query ?? []).map((row) => ({ ...row, page: "https://acme-shop.test/" }))).map((pair) => ({ keys: [pair.key, pair.page], row: pair }))
          : (held[ask.dimensions[0] as "query"] ?? []).map((row) => ({ keys: [row.key], row }));
        for (const { keys, row: one } of rows) {
          if (only.some((filter) => keys[ask.dimensions.indexOf(filter.dimension)] !== filter.expression)) continue;
          const { position } = figures(one);
          const sum = sums.get(keys.join("\u0000")) ?? { keys, clicks: 0, impressions: 0, positionSum: 0 };
          sum.clicks += one.clicks;
          sum.impressions += one.impressions;
          sum.positionSum += position * one.impressions;
          sums.set(keys.join("\u0000"), sum);
        }
      }
      return Response.json({
        rows: [...sums.values()].map((sum) => ({
          keys: sum.keys, clicks: sum.clicks, impressions: sum.impressions, ctr: sum.clicks / sum.impressions, position: sum.positionSum / sum.impressions,
        })),
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }));
  return google;
}

export const row = (key: string, clicks: number, impressions = clicks * 10): Row => ({ key, clicks, impressions });
