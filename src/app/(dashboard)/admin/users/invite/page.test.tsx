import React from "react";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import InviteUsersPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/invites/InviteDispatchScreen", () => ({
  InviteDispatchScreen: ({
    role,
    roleSelector,
    targetingExtra,
  }: {
    role: string;
    roleSelector: React.ReactNode;
    targetingExtra?: React.ReactNode;
  }) => (
    <div data-testid="invite-workflow">
      <span>{role}</span>
      {roleSelector}
      {targetingExtra}
    </div>
  ),
}));

describe("InviteUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing loading state while identity is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<InviteUsersPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-workflow")).not.toBeInTheDocument();
  });

  it("loads the unchanged role controls for an admin", async () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ role: "ADMIN" } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce(undefined);

    render(<InviteUsersPage />);

    expect(await screen.findByTestId("invite-workflow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standard user" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Administrator" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Workspace" })).not.toBeInTheDocument();
  });

  it("keeps company targeting for a super admin", async () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ role: "SUPER_ADMIN" } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce([{ _id: "company-1", name: "Acme" }] as ReturnType<typeof useQuery>);

    render(<InviteUsersPage />);

    expect(await screen.findByTestId("invite-workflow")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme" })).toBeInTheDocument();
  });
});
