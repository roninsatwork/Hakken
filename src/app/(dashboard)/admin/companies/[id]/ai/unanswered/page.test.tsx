import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CompanyUnansweredPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/UnansweredScreen", () => ({
  UnansweredScreen: ({
    companyId,
    feedWikiHref,
  }: {
    companyId: string;
    feedWikiHref: string;
  }) => (
    <div data-testid="company-unanswered-screen">
      {companyId}|{feedWikiHref}
    </div>
  ),
}));

describe("CompanyUnansweredPage", () => {
  it("forwards the route company id and unchanged wiki link", async () => {
    render(
      await CompanyUnansweredPage({
        params: Promise.resolve({ id: "company_1" }),
      }),
    );

    expect(screen.getByTestId("company-unanswered-screen")).toHaveTextContent(
      "company_1|/admin/companies/company_1/ai/pages",
    );
  });
});
