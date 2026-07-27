import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompanyDashboardPage from "./page";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("CompanyDashboardPage", () => {
  /**
   * What was here was an AI usage report — tokens, quota, provider spend —
   * under the heading "Dashboard". It moved to the AI menu. This screen stays
   * the default route so opening a company still lands here, and is deliberately
   * empty until there is a company summary worth showing.
   */
  it("is the company landing screen, and says plainly that it is empty", () => {
    render(<CompanyDashboardPage />);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText("dashboardEmpty")).toBeInTheDocument();
    expect(screen.getByText("dashboardEmptyHint")).toBeInTheDocument();
  });

  it("no longer reports AI usage", () => {
    render(<CompanyDashboardPage />);

    expect(screen.queryByText(/Tokens Used/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Monthly Quota/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider Usage/i)).not.toBeInTheDocument();
  });
});
