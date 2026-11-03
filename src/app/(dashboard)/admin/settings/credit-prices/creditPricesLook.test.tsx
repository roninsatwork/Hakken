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

type Line = FunctionReturnType<typeof api.creditPricesAdmin.creditPriceReport>["lines"][number];
// What one unit cost us is the server's to work out: this month's cost over its units, unless a line says otherwise.
const line = (kind: string, extra: Partial<Line>): Line => {
  const units = extra.units ?? 0;
  const thisMonth = units > 0 ? (extra.realCostUsd ?? 0) / units : null;
  return {
    kind: kind as never, credits: 1, per: 1, defaultCredits: 1, priceChangedAt: null, charged: 0, runs: 0, units: 0, realCostUsd: 0, reusedValueUsd: 0,
    costPerUnitUsd: thisMonth, costMonth: thisMonth === null ? null : "2026-10", suggested: null, ...extra,
  };
};

const REPORT: FunctionReturnType<typeof api.creditPricesAdmin.creditPriceReport> = {
  month: "2026-10",
  endsAt: Date.UTC(2026, 10, 1),
  settings: { creditCoversUsd: 0.05, planCredits: 10_000, marginPercent: 80 },
  lines: [
    // 2,000 keywords at $0.26: $0.00013 each, $0.00065 with an 80% margin kept, so 13 credits a thousand at 5 cents, against 4 in use.
    line("rankings", { credits: 4, per: 1000, defaultCredits: 4, charged: 8, runs: 2, units: 2000, realCostUsd: 0.26 }),
    line("aiAnswers", { charged: 300, runs: 3, units: 300, realCostUsd: 9.3 }),
    line("keywordResearch", { credits: 5, defaultCredits: 5, charged: 90, runs: 18, units: 18, realCostUsd: 3.78 }),
    line("siteAudit", { per: 50, charged: 25, runs: 1, units: 1240, realCostUsd: 1.55 }),
    // No links this month: the cost a unit is September's, half a cent a link.
    line("backlinks", { credits: 10, per: 1000, defaultCredits: 10, costPerUnitUsd: 0.0005, costMonth: "2026-09" }),
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
    fireEvent.click(within(rowOf("Rankings")).getByText("Use 13"));
    expect(within(rowOf("Rankings")).getByText("was 4 · not saved")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Save prices"));
    });
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      prices: expect.arrayContaining([{ kind: "rankings", credits: 13 }, { kind: "siteAudit", credits: 1 }]),
      creditCoversUsd: 0.05,
    }));
    // The margin was not touched, so it is not sent.
    expect(saveSpy.mock.calls[0][0]).not.toHaveProperty("marginPercent");
  });

  it("credits a month are changed in their own box and saved with the prices", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    const box = screen.getByLabelText("Credits a month") as HTMLInputElement;
    expect(box.value).toBe("10000");
    fireEvent.change(box, { target: { value: "12,000" } });
    expect(screen.getByText("Changes not saved")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Save prices"));
    });
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ planCredits: 12_000, creditCoversUsd: 0.05 }));
  });

  it("what a credit covers moves every suggestion at once", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    fireEvent.change(screen.getByLabelText("A credit covers, in US dollars of real cost"), { target: { value: "0.02" } });
    // $0.00065 a keyword with the margin kept is 32.5 credits a thousand at 2 cents: 33.
    expect(within(rowOf("Rankings")).getByText("Use 33")).toBeTruthy();
  });

  it("the margin moves every suggestion as it is typed, and is saved with the prices", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    const box = screen.getByLabelText("Margin") as HTMLInputElement;
    expect(box.value).toBe("80");
    fireEvent.change(box, { target: { value: "50%" } });
    // Half kept: $0.00026 a keyword, 5.2 credits a thousand, so 6.
    expect(within(rowOf("Rankings")).getByText("Use 6")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Save prices"));
    });
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ marginPercent: 50 }));
  });

  it("a margin past 95 says what to type and cannot be saved", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    fireEvent.change(screen.getByLabelText("Margin"), { target: { value: "120" } });
    expect(screen.getByText("Type a number from 0 to 95.")).toBeTruthy();
    expect((screen.getByText("Save prices").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows what a unit costs us beside the suggestion, and says when it is last month's", async () => {
    render(<CreditPricesPage />);
    await screen.findByText("Rankings");
    const links = rowOf("Backlinks");
    expect(within(links).getByText("$0.0005")).toBeTruthy();
    expect(within(links).getByText("In September 2026")).toBeTruthy();
    // $0.0025 a link with the margin kept: 50 credits a thousand, against 10 in use.
    expect(within(links).getByText("Use 50")).toBeTruthy();
    expect(within(rowOf("Rankings")).queryByText(/^In /)).toBeNull();
  });
});
