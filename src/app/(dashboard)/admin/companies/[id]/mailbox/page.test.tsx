import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CompanyMailboxPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/work/CompanyMailboxScreen", () => ({
  CompanyMailboxScreen: ({ companyId }: { companyId: string }) => (
    <div data-testid="company-mailbox-screen">{companyId}</div>
  ),
}));

describe("CompanyMailboxPage", () => {
  it("forwards the route company id to the unchanged client screen", async () => {
    render(
      await CompanyMailboxPage({
        params: Promise.resolve({ id: "company_1" }),
      })
    );

    expect(screen.getByTestId("company-mailbox-screen")).toHaveTextContent("company_1");
  });
});
