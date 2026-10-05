import { act, cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import UsageOverviewPage from "./page";
import UsageByWorkPage from "./work/page";
import UsageByWebsitePage from "./websites/page";
import UsageComingUpPage from "./coming-up/page";
import UsageStatementPage from "./statement/page";

/**
 * Usage holds to the looks Anthony approved on the "Hakken Usage" canvas,
 * 2026-10-05 (docs/plans/active/usage-credits-plan.md; design-drift-plan D4):
 * each screen, rendered with sample rows in English, reads as the outline
 * saved beside its board in docs/plans/assets/usage-credits/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/usage", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "usage-credits";
const DAY = 86_400_000;
const OCT = Date.UTC(2026, 9, 1);
const own = { websiteId: "web_own" as Id<"websites">, host: "ronins.co.uk", relationship: "owned" as const, iconUrl: null };
const rival = { websiteId: "web_kota" as Id<"websites">, host: "kota.co.uk", relationship: "tracked" as const, iconUrl: null };

const SUMMARY: NonNullable<FunctionReturnType<typeof api.creditUsage.usageSummary>> = {
  month: "2026-10",
  startsAt: OCT,
  endsAt: Date.UTC(2026, 10, 1),
  days: 31,
  today: 20,
  plan: { granted: 1000, left: 457, endsAt: Date.UTC(2026, 10, 1) },
  bought: { left: 500, nextEndsAt: Date.UTC(2027, 9, 16), nextEndsLeft: 500 },
  owed: 0,
  used: 543,
  byDay: [49, 16, 4, 4, 117, 21, 9, 6, 9, 4, 4, 124, 9, 16, 4, 6, 4, 4, 124, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  previous: { month: "2026-09", granted: 1000, byDay: Array.from({ length: 30 }, () => 16) },
  kinds: [
    { kind: "aiAnswers", credits: 300, runs: 3 },
    { kind: "rankings", credits: 104, runs: 26 },
    { kind: "keywordResearch", credits: 90, runs: 18 },
    { kind: "siteAudit", credits: 25, runs: 1 },
    { kind: "assistant", credits: 14, runs: 14 },
    { kind: "backlinks", credits: 10, runs: 1 },
  ],
  websites: [
    { website: own, credits: 427, runs: 25, kinds: ["rankings", "aiAnswers", "siteAudit", "backlinks"] },
    { website: null, credits: 104, runs: 32, kinds: ["keywordResearch", "assistant"] },
    { website: rival, credits: 12, runs: 3, kinds: ["rankings"] },
  ],
  lines: [
    { kind: "aiAnswers", website: own, credits: 300, runs: 3, everyDays: 7 },
    { kind: "keywordResearch", website: null, credits: 90, runs: 18, everyDays: null },
    { kind: "rankings", website: own, credits: 80, runs: 20, everyDays: 1 },
    { kind: "siteAudit", website: own, credits: 25, runs: 1, everyDays: 30 },
    { kind: "assistant", website: null, credits: 14, runs: 14, everyDays: null },
    { kind: "rankings", website: rival, credits: 12, runs: 3, everyDays: 7 },
    { kind: "backlinks", website: own, credits: 10, runs: 1, everyDays: 30 },
  ],
  prices: [
    { kind: "rankings", credits: 4, per: 1000 },
    { kind: "aiAnswers", credits: 1, per: 1 },
    { kind: "keywordResearch", credits: 5, per: 1 },
    { kind: "siteAudit", credits: 1, per: 50 },
    { kind: "backlinks", credits: 10, per: 1000 },
    { kind: "assistant", credits: 1, per: 1 },
  ],
  forecast: { booked: 152, pace: 55, leftAtEnd: 250 },
};

const line = (id: string, at: number, extra: Partial<NonNullable<FunctionReturnType<typeof api.creditUsage.usageStatement>>["lines"][number]>) => ({
  id: id as never,
  at,
  entry: "charge" as const,
  kind: null,
  source: null,
  website: null,
  user: null,
  how: "scheduled" as const,
  units: 0,
  out: 0,
  in: 0,
  balance: null,
  detail: null,
  from: [{ source: "plan" as const, month: "2026-10", startsAt: OCT }],
  ...extra,
});

const STATEMENT: NonNullable<FunctionReturnType<typeof api.creditUsage.usageStatement>> = {
  month: "2026-10",
  opening: 37,
  closing: 957,
  cut: false,
  lines: [
    line("c1", OCT, { entry: "ended", source: "plan", how: "automatic", out: 37, balance: 0, from: [{ source: "plan", month: "2026-09", startsAt: Date.UTC(2026, 8, 1) }] }),
    line("c2", OCT, { entry: "grant", source: "plan", how: "automatic", in: 1000, balance: 1000, from: [] }),
    line("c3", OCT + 2 * 3_600_000, { kind: "siteAudit", website: own, user: "Anthony Basker", units: 1240, out: 25, balance: 975 }),
    line("c4", OCT + 6 * 3_600_000, { kind: "rankings", website: own, user: "Anthony Basker", units: 1000, out: 4, balance: 971 }),
    line("c5", OCT + 10 * 3_600_000, { kind: "keywordResearch", user: "Priya Shah", how: "byHand", units: 2, out: 10, balance: 961, detail: "“web design agency bradford”, “shopify web design”" }),
    line("c6", OCT + 15 * DAY, { entry: "grant", source: "topup", how: "bought", user: "Anthony Basker", in: 500, balance: 1461, from: [] }),
    line("c7", OCT + 19 * DAY, { kind: "assistant", user: "Anthony Basker", how: "byHand", units: 1, out: 1, balance: 957 }),
  ],
};

const COMING_UP: NonNullable<FunctionReturnType<typeof api.creditUsage.usageComingUp>> = {
  month: "2026-10",
  endsAt: Date.UTC(2026, 10, 1),
  nextMonth: "2026-11",
  planLeft: 457,
  nextMonthCredits: 1000,
  checks: [
    { kind: "rankings", website: own, everyDays: 1, nextAt: OCT + 20 * DAY + 6 * 3_600_000, each: 4, toMonthEnd: 44, nextMonth: 120, setUpBy: "Anthony Basker" },
    { kind: "rankings", website: rival, everyDays: 7, nextAt: OCT + 25 * DAY + 6 * 3_600_000, each: 4, toMonthEnd: 4, nextMonth: 20, setUpBy: "Priya Shah" },
    { kind: "aiAnswers", website: own, everyDays: 7, nextAt: OCT + 25 * DAY + 7 * 3_600_000, each: 100, toMonthEnd: 100, nextMonth: 500, setUpBy: "Anthony Basker" },
  ],
};

function at(pathname: string, search = "") {
  nav.pathname = pathname;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "creditUsage:usageSummary": SUMMARY,
    "creditUsage:usageStatement": STATEMENT,
    "creditUsage:usageComingUp": COMING_UP,
  }));
});
afterEach(cleanup);

/** The rows of the table under a section's title. */
const tableRows = (title: string) => within(screen.getByText(title).closest("section") as HTMLElement).getAllByRole("row").slice(1);

describe("Usage's approved looks", () => {
  it("Overview", async () => {
    at("/app/usage");
    const { container } = render(<UsageOverviewPage />);
    await screen.findByText("Credits by website");
    await expectApprovedLook(container, PLAN, "Main", "Usage → Overview");
  });

  it("By work", async () => {
    at("/app/usage/work", "kind=keywordResearch");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<UsageByWorkPage />));
    });
    await screen.findByText("Every keyword someone on your team looked up.");
    await expectApprovedLook(container, PLAN, "ByWork", "Usage → By work");
  });

  it("By website", async () => {
    at("/app/usage/websites", "website=web_own");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<UsageByWebsitePage />));
    });
    await screen.findAllByText("ronins.co.uk");
    await expectApprovedLook(container, PLAN, "ByWebsite", "Usage → By website");
  });

  it("Coming up", async () => {
    at("/app/usage/coming-up");
    const { container } = render(<UsageComingUpPage />);
    await screen.findByText("Scheduled checks");
    await expectApprovedLook(container, PLAN, "ComingUp", "Usage → Coming up");
  });

  it("Statement", async () => {
    at("/app/usage/statement");
    const { container } = render(<UsageStatementPage />);
    await screen.findByText("Opening balance", { selector: "span" });
    await expectApprovedLook(container, PLAN, "Statement", "Usage → Statement");
  });
});

describe("Usage's screens", () => {
  it("picking a website narrows what ran to it, and owned and tracked websites are told apart", async () => {
    at("/app/usage");
    render(<UsageOverviewPage />);
    await screen.findByText("Credits by website");
    expect(tableRows("Credits by website").map((row) => within(row).getAllByRole("cell")[1].textContent)).toEqual(["Owned", "Tracked", "–"]);
    expect(tableRows("What ran this month")).toHaveLength(7);
    fireEvent.click(within(tableRows("Credits by website")[1]).getByText("kota.co.uk"));
    expect(screen.getByText("What ran this month: kota.co.uk")).toBeTruthy();
    expect(tableRows("What ran this month: kota.co.uk")).toHaveLength(1);
  });

  it("the statement opens and closes on the month's balances, and says which batch paid", async () => {
    at("/app/usage/statement");
    render(<UsageStatementPage />);
    await screen.findByText("Opening balance", { selector: "span" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Opening balance")).toBeTruthy();
    expect(within(rows[1]).getByText("September’s plan credits ended")).toBeTruthy();
    expect(screen.getByText("ronins.co.uk · 1,240 pages · from October’s plan")).toBeTruthy();
  });
});
