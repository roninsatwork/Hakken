import React from "react";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import InviteSuperAdminsPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

vi.mock("@/src/app/(dashboard)/admin/_features/invites/InviteDispatchScreen", () => ({
  InviteDispatchScreen: ({
    role,
    roleSelector,
    previewCta,
  }: {
    role: string;
    roleSelector: React.ReactNode;
    previewCta: (label: string) => React.ReactNode;
  }) => (
    <div data-testid="invite-workflow">
      <span>{role}</span>
      {roleSelector}
      {previewCta("Preview invitation")}
    </div>
  ),
}));

describe("InviteSuperAdminsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing loading state while identity is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<InviteSuperAdminsPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-workflow")).not.toBeInTheDocument();
  });

  it("does not load the invitation workflow for a non-super-admin", () => {
    vi.mocked(useQuery).mockReturnValue({ role: "ADMIN" } as ReturnType<typeof useQuery>);

    const { container } = render(<InviteSuperAdminsPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-workflow")).not.toBeInTheDocument();
  });

  it("loads the same fixed-role invitation controls for a super admin", async () => {
    vi.mocked(useQuery).mockReturnValue({ role: "SUPER_ADMIN" } as ReturnType<typeof useQuery>);

    render(<InviteSuperAdminsPage />);

    expect(await screen.findByTestId("invite-workflow")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "What they will be" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "System Super Admin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview invitation" })).toBeInTheDocument();
  });
});
