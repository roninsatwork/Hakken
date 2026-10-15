import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import CompanySiteSchedulesPage from "./page";

/**
 * A website's Schedules holds to the look Anthony approved on the canvas
 * "Website schedules — what is collected", 2026-10-15 ("ok lets build this
 * please"; docs/plans/active/website-schedules-plan.md): each board, rendered
 * in English with sample rows, reads as the outline saved beside it in
 * docs/plans/assets/website-schedules/look/.
 */

const { nav } = vi.hoisted(() => ({ nav: { params: { id: "korda", companyWebsiteId: "kw1" } as Record<string, string> } }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/companies/korda/websites/site/kw1/schedules",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => nav.params,
}));

const PLAN = "website-schedules";
const MONTHLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "monthly", dayOfMonth: 1, timeLocal: "02:10", timezone: "Europe/Madrid" });
const WEEKLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "weekly", dayOfWeek: 1, timeLocal: "03:00", timezone: "Europe/London" });
const NIGHTLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "04:00", timezone: "Europe/London" });
const MORNING = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "04:50", timezone: "UTC" });

const free = (source: string, state: string, interval: string, at: number | null = null) => ({
  source, state, on: true, scheduled: true, intervalStr: interval, nextRunAt: at, lastCollectedAt: at,
});

/** Board 1: kordatacle.com as it is — Korda's switch off, its own monthly schedule, nothing free connected. */
const korda = {
  companyId: "korda",
  websiteId: "w_korda",
  companyName: "Korda",
  host: "kordatacle.com",
  owned: true,
  companyOn: false,
  companyIntervalStr: MONTHLY,
  rankings: { on: true, collecting: false, ownIntervalStr: MONTHLY, intervalStr: MONTHLY, nextRunAt: null, lastCollectedAt: Date.UTC(2026, 9, 1), pairedWith: null },
  sources: [
    free("SEARCH_CONSOLE", "NOT_CONNECTED", NIGHTLY),
    free("GOOGLE_ANALYTICS", "NOT_CONNECTED", NIGHTLY),
    free("BING", "NOT_CONNECTED", NIGHTLY),
    free("CLARITY", "NOT_CONNECTED", MORNING),
  ],
};

/** Board 2: ronins.co.uk with Search Console, Analytics and Clarity connected, following Ronins Agency weekly. */
const ronins = {
  ...korda,
  companyId: "ronins",
  websiteId: "w_ronins",
  companyName: "Ronins Agency",
  host: "ronins.co.uk",
  companyOn: true,
  companyIntervalStr: WEEKLY,
  rankings: { on: true, collecting: true, ownIntervalStr: null, intervalStr: WEEKLY, nextRunAt: Date.UTC(2026, 9, 19, 2), lastCollectedAt: Date.UTC(2026, 9, 12, 2), pairedWith: null },
  sources: [
    free("SEARCH_CONSOLE", "CONNECTED", NIGHTLY, Date.UTC(2026, 9, 16, 3)),
    free("GOOGLE_ANALYTICS", "CONNECTED", NIGHTLY, Date.UTC(2026, 9, 16, 3)),
    free("BING", "NOT_CONNECTED", NIGHTLY),
    free("CLARITY", "CONNECTED", MORNING, Date.UTC(2026, 9, 16, 4, 50)),
  ],
};

/** Board 3: a competitor Korda watches, paired with kordatacle.com. */
const rival = {
  ...korda,
  websiteId: "w_rival",
  host: "nashtackle.co.uk",
  owned: false,
  rankings: { ...korda.rankings, ownIntervalStr: null, pairedWith: { companyWebsiteId: "kw1", displayHost: "kordatacle.com" } },
  sources: [],
};

const answer = (data: unknown) => vi.mocked(useQuery).mockImplementation(answerQueries({
  "websiteSources:getWebsiteSources": data,
  "websiteAttachments:listCompanyOwnedWebsites": [{ companyWebsiteId: "kw1", displayHost: "kordatacle.com" }],
}));

describe("the approved look of a website's Schedules", () => {
  beforeEach(() => {
    nav.params = { id: "korda", companyWebsiteId: "kw1" };
  });

  it("Main — kordatacle.com, Korda's switch off", async () => {
    answer(korda);
    const { container } = render(<CompanySiteSchedulesPage />);
    await screen.findByText("When rankings and AI answers are collected");
    await expectApprovedLook(container, PLAN, "Main", "Admin → a company → Websites → a website → Schedules");
  });

  it("Connected — an own website with its free sources connected", async () => {
    nav.params = { id: "ronins", companyWebsiteId: "rw1" };
    answer(ronins);
    const { container } = render(<CompanySiteSchedulesPage />);
    await screen.findByText("When rankings and AI answers are collected");
    await expectApprovedLook(container, PLAN, "Connected", "Admin → a company → Websites → a website → Schedules");
  });

  it("Competitor — a competitor paired with one of the company's own websites", async () => {
    nav.params = { id: "korda", companyWebsiteId: "kc1" };
    answer(rival);
    const { container } = render(<CompanySiteSchedulesPage />);
    await screen.findByText("Watched against");
    await expectApprovedLook(container, PLAN, "Competitor", "Admin → a company → Websites → a competitor → Schedules");
  });
});
