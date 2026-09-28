import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import { CompanyFanOut } from "./CompanyFanOut";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }, "tracked=any"));

const fanOutRow = (query: string, everyRun: boolean, google: { position: number | null; day: string } | null) => ({
  key: `hold_1::q::${query}`, query, queryText: query, prompt: "What are the best carp fishing rods?",
  companyWebsiteId: "hold_1", host: "kordatackle.com", intent: "RESEARCHING", engines: ["claude"],
  timesSeen: 3, lastSeenDay: "2026-09-27", everyRun, google,
});

/**
 * AI searches: one list at both scopes (docs/plans/active/
 * websites-section-menu-plan.md) — for one website it drops the Website
 * column. What came back, read only: where the website came in each one's
 * newest Google check, and whether it is checked every run or was checked
 * once — ticking is on the prompt's own list (fan-out-opt-in-plan.md).
 */
describe("AI searches", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "companyAiLists:companyAiListCounts": { questions: 1, searches: 1, fanOut: 2, websites: [] },
      "companyAiLists:listCompanyFanOut": {
        data: [
          fanOutRow("best carp fishing rods", true, { position: 4, day: "2026-09-27" }),
          fanOutRow("top rated carp rods", false, { position: null, day: "2026-09-27" }),
          fanOutRow("carp rod pod", false, null),
        ],
        totalCount: 3, totalPages: 1,
        questions: [{ prompt: "What are the best carp fishing rods?", companyWebsiteId: "hold_1", host: "kordatackle.com" }],
        cut: false,
      },
    }));
  });

  it("narrows to one website, without a website column", async () => {
    renderWithProviders(<CompanyFanOut companyWebsiteId={"hold_1" as never} host="kordatackle.com" />);

    expect(await screen.findByText("top rated carp rods")).toBeInTheDocument();
    const asked = vi.mocked(useQuery).mock.calls.find(([, args]) => (args as { page?: number })?.page === 1);
    expect(asked?.[1]).toMatchObject({ companyWebsiteId: "hold_1" });
    expect(screen.queryByText("admin.companyAiLists.fanOut.columns.website")).not.toBeInTheDocument();
  });

  it("says where the website came on Google and how often each is checked, and offers nothing to tick or untick", async () => {
    renderWithProviders(<CompanyFanOut companyWebsiteId={"hold_1" as never} host="kordatackle.com" />);

    expect(await screen.findByText("admin.companyAiLists.fanOut.position")).toBeInTheDocument();
    expect(screen.getByText("admin.companyAiLists.fanOut.notInTop")).toBeInTheDocument();
    expect(screen.getByText("admin.companyAiLists.fanOut.notCheckedYet")).toBeInTheDocument();
    expect(screen.getAllByText("admin.companyAiLists.fanOut.everyRun")).toHaveLength(1);
    expect(screen.getAllByText("admin.companyAiLists.fanOut.once")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /track|tick/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
