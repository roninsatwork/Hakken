import { act, cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
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
  counting: 0,
  byDay: [49, 16, 4, 4, 117, 21, 9, 6, 9, 4, 4, 124, 9, 16, 4, 6, 4, 4, 124, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  previous: { month: "2026-09", granted: 1000, byDay: Array.from({ length: 30 }, () => 16) },
  kinds: [
    { kind: "aiAnswers", credits: 300, runs: 3, people: 0, counting: 0 },
    { kind: "rankings", credits: 104, runs: 26, people: 0, counting: 0 },
    { kind: "keywordResearch", credits: 90, runs: 18, people: 2, counting: 0 },
    { kind: "siteAudit", credits: 25, runs: 1, people: 0, counting: 0 },
    { kind: "assistant", credits: 14, runs: 14, people: 1, counting: 0 },
    { kind: "backlinks", credits: 10, runs: 1, people: 0, counting: 0 },
  ],
  websites: [
    { website: own, credits: 427, runs: 25, people: 0, counting: 0, kinds: ["rankings", "aiAnswers", "siteAudit", "backlinks"] },
    { website: null, credits: 104, runs: 32, people: 2, counting: 0, kinds: ["keywordResearch", "assistant"] },
    { website: rival, credits: 12, runs: 3, people: 0, counting: 0, kinds: ["rankings"] },
  ],
  lines: [
    { kind: "aiAnswers", website: own, credits: 300, runs: 3, counting: 0, everyDays: 7 },
    { kind: "keywordResearch", website: null, credits: 90, runs: 18, counting: 0, everyDays: null },
    { kind: "rankings", website: own, credits: 80, runs: 20, counting: 0, everyDays: 1 },
    { kind: "siteAudit", website: own, credits: 25, runs: 1, counting: 0, everyDays: 30 },
    { kind: "assistant", website: null, credits: 14, runs: 14, counting: 0, everyDays: null },
    { kind: "rankings", website: rival, credits: 12, runs: 3, counting: 0, everyDays: 7 },
    { kind: "backlinks", website: own, credits: 10, runs: 1, counting: 0, everyDays: 30 },
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

const line = (id: string, at: number, extra: Partial<FunctionReturnType<typeof api.creditUsage.usageStatement>["page"][number]>) => ({
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
  reason: null,
  before: null,
  counting: false,
  from: [{ source: "plan" as const, month: "2026-10", startsAt: OCT }],
  batch: null,
  ...extra,
});

/** The month's figures, as `usageStatementTotals` gives them. */
const TOTALS: NonNullable<FunctionReturnType<typeof api.creditUsage.usageStatementTotals>> = {
  month: "2026-10",
  opening: 37,
  closing: 957,
  planIn: 1000,
  otherIn: 500,
  used: 40,
  ended: 37,
  counting: 0,
  people: [{ userId: "user_anthony" as Id<"users">, name: "Anthony Basker" }, { userId: "user_priya" as Id<"users">, name: "Priya Shah" }],
};

/** The month's lines, as the statement's pages give them. */
const STATEMENT = {
  lines: [
    line("c1", OCT, { entry: "ended", source: "plan", how: "automatic", out: 37, balance: 0, from: [{ source: "plan", month: "2026-09", startsAt: Date.UTC(2026, 8, 1) }], batch: { source: "plan", month: "2026-09", startsAt: Date.UTC(2026, 8, 1), endsAt: OCT } }),
    line("c2", OCT, { entry: "grant", source: "plan", how: "automatic", in: 1000, balance: 1000, from: [], batch: { source: "plan", month: "2026-10", startsAt: OCT, endsAt: Date.UTC(2026, 10, 1) } }),
    line("c3", OCT + 2 * 3_600_000, { kind: "siteAudit", website: own, user: "Anthony Basker", units: 1240, out: 25, balance: 975 }),
    line("c4", OCT + 6 * 3_600_000, { kind: "rankings", website: own, user: "Anthony Basker", units: 1000, out: 4, balance: 971 }),
    line("c5", OCT + 10 * 3_600_000, { kind: "keywordResearch", user: "Priya Shah", how: "byHand", units: 2, out: 10, balance: 961, detail: "“web design agency bradford”, “shopify web design”" }),
    line("c6", OCT + 15 * DAY, { entry: "grant", source: "topup", how: "bought", user: "Anthony Basker", in: 500, balance: 1461, from: [], batch: { source: "topup", month: null, startsAt: OCT + 15 * DAY, endsAt: OCT + 380 * DAY } }),
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

/** The statement's pages: every line at once, and nothing more to read. */
function pagesOf(lines: typeof STATEMENT.lines) {
  vi.mocked(usePaginatedQuery).mockImplementation(((_query: unknown, args: unknown) => (args === "skip"
    ? { results: [], status: "LoadingFirstPage", isLoading: true, loadMore: vi.fn() }
    : { results: lines, status: "Exhausted", isLoading: false, loadMore: vi.fn() })) as never);
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "creditUsage:usageSummary": SUMMARY,
    "creditUsage:usageStatementTotals": TOTALS,
    "creditUsage:usageComingUp": COMING_UP,
  }));
  pagesOf(STATEMENT.lines);
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

  it("a collection under way shows what it has counted so far, as being counted, in the figures and the lines (finish-off-plan.md, item 4)", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "creditUsage:usageSummary": {
        ...SUMMARY,
        counting: 20,
        kinds: [...SUMMARY.kinds.filter((row) => row.kind !== "siteAudit"), { kind: "siteAudit", credits: 25, runs: 1, people: 0, counting: 20 }],
        websites: SUMMARY.websites.map((row) => (row.website?.websiteId === own.websiteId ? { ...row, counting: 20 } : row)),
        lines: SUMMARY.lines.map((row) => (row.kind === "siteAudit" ? { ...row, counting: 20 } : row)),
      },
      "creditUsage:usageStatementTotals": TOTALS,
    }));
    at("/app/usage");
    render(<UsageOverviewPage />);
    await screen.findByText("Credits by website");
    // Used counts it in, and says so; the plan's credits left take it off.
    expect(screen.getByText("563")).toBeTruthy();
    expect(screen.getByText("Includes 20 being counted")).toBeTruthy();
    expect(screen.getByText("437")).toBeTruthy();
    expect(screen.getByText("This month’s 563 credits, by kind of work, 20 of them still being counted.")).toBeTruthy();
    expect(screen.getAllByText("includes 20 being counted")).toHaveLength(2);
    // The site audit on ronins.co.uk: 25 charged and 20 still being counted.
    expect(within(tableRows("What ran this month").find((row) => within(row).queryByText("Site audit"))!).getByText("20 being counted")).toBeTruthy();
  });

  it("a run still being counted is a line of the statement, with what it has counted so far and no balance yet", async () => {
    pagesOf([...STATEMENT.lines, line("c8", OCT + 19 * DAY + 3_600_000, { kind: "siteAudit", website: own, user: "Anthony Basker", units: 340, out: 7, balance: null, from: [], counting: true })]);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "creditUsage:usageSummary": SUMMARY,
      "creditUsage:usageStatementTotals": { ...TOTALS, counting: 7 },
    }));
    at("/app/usage/statement");
    render(<UsageStatementPage />);
    expect(await screen.findByText("ronins.co.uk · being counted, 340 pages so far")).toBeTruthy();
    expect(screen.getByText("Every open batch, less anything owed; 7 more being counted")).toBeTruthy();
  });

  it("the statement reads a page at a time: more to come says so, and its filters and order are asked of the server", async () => {
    const loadMore = vi.fn();
    vi.mocked(usePaginatedQuery).mockImplementation((() => ({ results: STATEMENT.lines, status: "CanLoadMore", isLoading: false, loadMore })) as never);
    at("/app/usage/statement");
    render(<UsageStatementPage />);
    await screen.findByText("Opening balance", { selector: "span" });
    expect(screen.getByText("so far: more on the pages after")).toBeTruthy();
    // The month closes only on its last page.
    expect(screen.queryByText("Balance now", { selector: "span.font-medium" })).toBeNull();
    fireEvent.change(screen.getByLabelText("User"), { target: { value: "user_priya" } });
    expect(vi.mocked(usePaginatedQuery).mock.lastCall?.[1]).toMatchObject({ userId: "user_priya", order: "asc" });
    fireEvent.click(screen.getByRole("button", { name: /Date/ }));
    expect(vi.mocked(usePaginatedQuery).mock.lastCall?.[1]).toMatchObject({ order: "desc" });
  });

  it("a charge counted again from what came back says what it is now and was, and where its credits went back", async () => {
    pagesOf([...STATEMENT.lines, line("c8", OCT + 19 * DAY + 3_600_000, { entry: "recount", kind: "siteAudit", website: own, user: "Anthony Basker", how: "automatic", units: 1, before: 1000, in: 24, balance: 981, reason: "recounted" })]);
    at("/app/usage/statement");
    render(<UsageStatementPage />);
    expect(await screen.findByText("Counted again: Site audit")).toBeTruthy();
    expect(screen.getByText("ronins.co.uk · 1 page came back, not 1,000 · back to October’s plan")).toBeTruthy();
  });

  it("a month's plan credits raised after they were given say so, from what to what", async () => {
    const october = { source: "plan" as const, month: "2026-10", startsAt: OCT, endsAt: Date.UTC(2026, 10, 1) };
    pagesOf([...STATEMENT.lines, line("c8", OCT + 19 * DAY + 3_600_000, { entry: "grant", source: "plan", how: "automatic", in: 9000, balance: 9957, reason: "raised", before: 1000, from: [], batch: october })]);
    at("/app/usage/statement");
    render(<UsageStatementPage />);
    expect(await screen.findByText("October’s plan credits raised")).toBeTruthy();
    expect(screen.getByText(/^From 1,000 to 10,000 a month · End at midnight on/)).toBeTruthy();
  });
});
