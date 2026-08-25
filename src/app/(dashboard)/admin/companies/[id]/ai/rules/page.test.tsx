import { fireEvent, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import CompanyAiRulesPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

describe("CompanyAiRulesPage", () => {
  const deleteRule = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: [{ _id: "rule_1", priority: "HIGH", name: "Escalate risk", trigger: "risk", isActive: true }],
      totalCount: 1,
      totalPages: 1,
    } as unknown as ReturnType<typeof useQuery>);
    vi.mocked(useMutation).mockReturnValue(deleteRule as unknown as ReturnType<typeof useMutation>);
    deleteRule.mockResolvedValue(undefined);
  });

  it("loads the unchanged delete confirmation from the existing row action", async () => {
    render(<CompanyAiRulesPage />);

    fireEvent.click(screen.getByRole("button", { name: "admin.companyDetails.rules.delete" }));

    expect(await screen.findByText("admin.companyDetails.rules.deleteWarning")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "admin.companyDetails.rules.deleteConfirm" }));

    expect(deleteRule).toHaveBeenCalledWith({ id: "rule_1" });
  });
});
