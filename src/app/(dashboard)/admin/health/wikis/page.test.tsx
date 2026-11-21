import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import HealthWikisPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const wikis = [
  {
    companyId: "company_harbour",
    name: "Harbour Foods",
    state: "FAILED",
    lastFinishedAt: Date.UTC(2026, 10, 11, 2, 14),
    summary: "2 links fixed or added.",
    error: "The Wiki check-up agent is switched off on the Agents screen.",
  },
  {
    companyId: "company_northwind",
    name: "Northwind Freight",
    state: "OK",
    lastFinishedAt: Date.UTC(2026, 10, 11, 2, 11),
    summary: "9 documents read, 2 links fixed or added.",
    error: null,
  },
  { companyId: null, name: "Shared wiki", state: "NOT_YET", lastFinishedAt: null, summary: null, error: null },
];

/**
 * Health, Wiki check-ups (wiki-sonae-catch-up-plan-2026-11-21.md, S8): every
 * wiki's last nightly check-up in words, what it did or why it failed, and a
 * row that opens that wiki's Check-up.
 */
describe("Health, Wiki check-ups", () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useQuery).mockReturnValue(wikis as ReturnType<typeof useQuery>);
  });

  it("wears a top-level page's header", () => {
    render(<HealthWikisPage />);

    expect(screen.getByRole("heading", { name: "Wiki check-ups" })).toBeInTheDocument();
  });

  it("says each wiki's last check-up in words, with why it failed or what it did", () => {
    render(<HealthWikisPage />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("The Wiki check-up agent is switched off on the Agents screen.")).toBeInTheDocument();
    expect(screen.getByText("Checked")).toBeInTheDocument();
    expect(screen.getByText("9 documents read, 2 links fixed or added.")).toBeInTheDocument();
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("calls the platform's wiki by the name the app gives it", () => {
    render(<HealthWikisPage />);

    expect(screen.getByText("Platform Wiki")).toBeInTheDocument();
    expect(screen.queryByText("Shared wiki")).toBeNull();
  });

  it("opens a wiki's own Check-up from its row", () => {
    render(<HealthWikisPage />);

    expect(screen.getByRole("link", { name: "Harbour Foods" })).toHaveAttribute("href", "/admin/health/wikis/company_harbour");
    expect(screen.getByRole("link", { name: "Platform Wiki" })).toHaveAttribute("href", "/admin/health/wikis/platform");
    fireEvent.click(screen.getByText("Northwind Freight").closest("tr") as HTMLElement);
    expect(push).toHaveBeenCalledWith("/admin/health/wikis/company_northwind");
  });

  it("finds a wiki by its name", () => {
    render(<HealthWikisPage />);

    fireEvent.change(screen.getByPlaceholderText("Find a wiki"), { target: { value: "north" } });
    expect(screen.getByText("Northwind Freight")).toBeInTheDocument();
    expect(screen.queryByText("Harbour Foods")).toBeNull();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<HealthWikisPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockReturnValue(rows as ReturnType<typeof useQuery>);
      },
      sampleRows: wikis,
      sampleRowText: "Harbour Foods",
      emptyText: "No wikis yet.",
      searchPlaceholder: "Find a wiki",
    });
  });
});
