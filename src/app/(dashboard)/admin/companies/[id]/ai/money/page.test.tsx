import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CompanyMoneyPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/MoneyViewScreen", () => ({
  MoneyViewScreen: ({ companyId }: { companyId: string }) => (
    <div data-testid="money-view">{companyId}</div>
  ),
}));

describe("CompanyMoneyPage", () => {
  it("passes the route company to the company-scoped money view", async () => {
    render(await CompanyMoneyPage({ params: Promise.resolve({ id: "company_123" }) }));

    expect(screen.getByTestId("money-view")).toHaveTextContent("company_123");
  });
});
