import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlatformMoneyPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/MoneyViewScreen", () => ({
  MoneyViewScreen: ({ companyId }: { companyId?: string }) => (
    <div data-testid="money-view">{companyId ? "company" : "platform"}</div>
  ),
}));

describe("PlatformMoneyPage", () => {
  // The AI section's frame draws the menu down the left (wiki-sonae-catch-up-plan-2026-11-21.md, S0), so the screen
  // is the platform's totals and nothing else.
  it("shows the platform's money view", () => {
    render(<PlatformMoneyPage />);

    expect(screen.getByTestId("money-view")).toHaveTextContent("platform");
  });
});
