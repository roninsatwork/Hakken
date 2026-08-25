import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CompanyCallsPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/work/CompanyCallsScreen", () => ({
  CompanyCallsScreen: ({ companyId }: { companyId: string }) => (
    <div data-testid="company-calls-screen">{companyId}</div>
  ),
}));

describe("CompanyCallsPage", () => {
  it("forwards the route company id to the unchanged client screen", async () => {
    render(
      await CompanyCallsPage({
        params: Promise.resolve({ id: "company_1" }),
      })
    );

    expect(screen.getByTestId("company-calls-screen")).toHaveTextContent("company_1");
  });
});
