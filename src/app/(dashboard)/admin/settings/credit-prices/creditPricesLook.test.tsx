import { act, cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import CreditPricesPage from "./page";

/**
 * Admin → Settings → Credit prices holds to the look approved on the "Hakken
 * Usage" canvas, 2026-10-05 (board AdminCreditPrices of
 * docs/plans/active/usage-credits-plan.md), and its suggestions only become
 * prices when a super admin takes one and saves.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/settings/credit-prices",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const line = (kind: string, extra: Partial<FunctionReturnType<typeof api.creditPricesAdmin.creditPriceReport>["lines"][number]>) => ({
  kind: kind as never, credits: 1, per: 1, defaultCredits: 1, priceChangedAt: null, charged: 0, runs: 0, units: 0, realCostUsd: 0, reusedValueUsd: 0, ...extra,
});

const REPORT: FunctionReturnType<typeof api.creditPricesAdmin.creditPriceReport> = {
  month: "2026-10",
  endsAt: Date.UTC(2026, 10, 1),
  settings: { creditCoversUsd: 0.05, planCredits: 1000 },
  lines: [
    // 2,000 keywords at $0.26: 1.3 credits' cost a thousand, so 3 at 5 cents a credit, against 4 in use.
    line("rankings", { credits: 4, per: 1000, defaultCredits: 4, charged: 8, runs: 2, units: 2000, realCostUsd: 0.26 }),
    line("aiAnswers", { charged: 300, runs: 3, units: 300, realCostUsd: 9.3 }),
    line("keywordResearch", { credits: 5, defaultCredits: 5, charged: 90, runs: 18, units: 18, realCostUsd: 3.78 }),
    line("siteAudit", { per: 50, charged: 25, runs: 1, units: 1240, realCostUsd: 1.55 }),
    line("backlinks", { credits: 10, per: 1000, defaultCredits: 10 }),
    line("assistant", { charged: 14, runs: 14, units: 14, realCostUsd: 0.25 }),
  ],
};

let saveSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "creditPricesAdmin:creditPriceReport": REPORT }));
  saveSpy = vi.fn(async () => ({ changed: 1 }));
  vi.mocked(useMutation).mockImplementation((() => saveSpy) as never);
});
afterEach(cleanup);

const rowOf = (name: string) => screen.getAllByRole("row").find((row) => within(row).queryByText(name)) as HTMLElement;

describe("Credit prices", () => {
  it("holds to its approved look", async () => {
    const { container } = render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    await expectApprovedLook(container, "usage-credits", "AdminCreditPrices", "Admin → Settings → Credit prices");
  });

  it("says what each kind of work cost against its credits, and which prices fall short", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    // Site audit: $1.55 for 25 credits is 6.2 cents a credit, over the 5 a credit covers.
    expect(within(rowOf("Site audit")).getByText("6.2¢ · not covered")).toBeTruthy();
    expect(within(rowOf("Rankings")).getByText("3.3¢ · covered")).toBeTruthy();
    expect(within(rowOf("Backlinks")).getByText("Nothing yet")).toBeTruthy();
  });

  it("a suggestion becomes the price only when taken and saved", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    fireEvent.click(within(rowOf("Rankings")).getByText("Use 3"));
    expect(within(rowOf("Rankings")).getByText("was 4 · not saved")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Save prices"));
    });
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      prices: expect.arrayContaining([{ kind: "rankings", credits: 3 }, { kind: "siteAudit", credits: 1 }]),
      creditCoversUsd: 0.05,
    }));
  });

  it("what a credit covers moves every suggestion at once", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    fireEvent.change(screen.getByLabelText("A credit covers, in US dollars of real cost"), { target: { value: "0.02" } });
    // $0.00013 a keyword is 6.5 credits a thousand at 2 cents: 7.
    expect(within(rowOf("Rankings")).getByText("Use 7")).toBeTruthy();
  });
});
