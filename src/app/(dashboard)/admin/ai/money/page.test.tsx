import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlatformMoneyPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/MoneyViewScreen", () => ({
  MoneyViewScreen: ({ showWorkspaceNav }: { showWorkspaceNav?: boolean }) => (
    <div data-testid="money-view">{showWorkspaceNav ? "workspace-navigation" : "no-navigation"}</div>
  ),
}));

describe("PlatformMoneyPage", () => {
  it("keeps the global money view and its workspace navigation", () => {
    render(<PlatformMoneyPage />);

    expect(screen.getByTestId("money-view")).toHaveTextContent("workspace-navigation");
  });
});
