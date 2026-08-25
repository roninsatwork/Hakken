import React from "react";
import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import InviteUsersPage from "./page";

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/invites/InviteDispatchScreen", () => ({
  InviteDispatchScreen: ({
    companyId,
    role,
    roleSelector,
    previewCta,
  }: {
    companyId: string;
    role: string;
    roleSelector: React.ReactNode;
    previewCta: (label: string) => React.ReactNode;
  }) => (
    <div data-testid="invite-workflow" data-company-id={companyId} data-role={role}>
      {roleSelector}
      {previewCta("Preview invitation")}
    </div>
  ),
}));

describe("InviteUsersPage", () => {
  it("passes the route company into the unchanged user-role invitation workflow", async () => {
    const companyId = "company_1" as Id<"companies">;

    await act(async () => {
      render(<InviteUsersPage params={Promise.resolve({ id: companyId })} />);
    });

    const workflow = await screen.findByTestId("invite-workflow");
    expect(workflow).toHaveAttribute("data-company-id", companyId);
    expect(workflow).toHaveAttribute("data-role", "USER");
    expect(screen.getByRole("button", { name: "Preview invitation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "companyAdmin" }));
    expect(workflow).toHaveAttribute("data-role", "ADMIN");

    fireEvent.click(screen.getByRole("button", { name: "standardUser" }));
    expect(workflow).toHaveAttribute("data-role", "USER");
  });
});
