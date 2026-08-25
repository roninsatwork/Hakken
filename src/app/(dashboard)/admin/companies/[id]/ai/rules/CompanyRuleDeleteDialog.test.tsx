import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { CompanyRuleDeleteDialog } from "./CompanyRuleDeleteDialog";

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());

describe("CompanyRuleDeleteDialog", () => {
  it("preserves the warning, cancel action, and destructive confirmation", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <CompanyRuleDeleteDialog
        isOpen
        isDeleting={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("admin.companyDetails.rules.deleteBody")).toBeInTheDocument();
    expect(screen.getByText("admin.companyDetails.rules.deleteWarning")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "admin.companyDetails.rules.cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "admin.companyDetails.rules.deleteConfirm" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
