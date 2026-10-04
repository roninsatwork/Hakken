import { STARTING_CONSOLE_LIMITS } from "@/src/test/searchConsoleLimits";

/**
 * Sample Search Console answers for rendering whole screens — the website
 * acme-shop.test, connected, sixteen months held, one row of each list.
 * Shared by the look tests (design-drift-plan D4); a screen's own test keeps
 * its own rows.
 */

export const STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "acme-shop.test",
  ownSites: [{ siteId: "site_1", host: "acme-shop.test" }],
  historyFrom: "2025-05-26",
  limits: STARTING_CONSOLE_LIMITS,
  connection: {
    status: "CONNECTED", signingIn: false, googleAccount: "owner@acme-shop.test", property: "sc-domain:acme-shop.test", permission: "siteOwner",
    choices: [], connectedAt: Date.parse("2026-09-27T10:00:00Z"), disconnectedAt: null, newestDay: "2026-09-26", oldestDay: "2025-05-26", countriesNewest: [],
    historyDone: true, clearing: false, lastCollectedAt: Date.parse("2026-09-27T10:02:00Z"), problem: null, attempt: null,
  },
};

export const ROW = {
  key: "ai agency", clicks: 44, impressions: 1564, ctr: 44 / 1564, position: 4.3, previousClicks: 38, change: 6, share: 0.4,
  band: "4-10", previousPosition: 3.5, positionChange: -0.8, count: 1, top: "https://acme-shop.test/ai-agency/", tracked: true,
  kind: null, volume: null, estimate: null, brand: false, usualCtr: null, expected: null, topShare: null, next: null, nextShare: null, verdict: null, gap: null,
};
export const PAGE_ROW = { ...ROW, key: "https://acme-shop.test/ai-agency/", top: "ai agency", count: 12 };
export const SUMMARY = {
  rows: 2, of: 2, clicks: 118, impressions: 7603, previousClicks: 99, position: 5.9, tracked: 2, gaining: 2, losing: 0, gained: 26, lost: 0,
  volume: 0, estimate: 0, expected: 0, high: 0, low: 0, pagesInvolved: null, pagesShown: null,
  bands: { "1-3": 0, "4-10": 2, "11-20": 0, "21-50": 0, "51+": 0 }, bandsBefore: null, brand: null, kinds: [],
};
export function list(rows: unknown[]) {
  return {
    rows, total: rows.length, page: 1, pages: 1, size: 25, cut: null, preparing: false, current: true, named: 69, listed: rows.length, comparable: true,
    live: false, from: "2026-08-28", to: "2026-09-26", summary: SUMMARY,
  };
}
export const TRACKING = { keywords: { count: 8, limit: 200 }, pages: { count: 6, limit: 100 } };

