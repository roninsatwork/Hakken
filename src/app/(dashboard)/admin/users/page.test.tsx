import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import ManageUsersPage from "./page";

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ unoptimized: _unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const labels: Record<string, string> = {
      "actions.delete": "Delete",
      "buttons.cancel": "Cancel",
      "buttons.delete": "Delete",
      "buttons.revoke": "Revoke",
      "buttons.sendInvite": "Send Invite",
      "buttons.updateUser": "Update User",
      deleting: "Deleting...",
      description: "Manage identities",
      invite: "Invite User",
      "modal.avatar": "Avatar",
      "modal.avatarHint": "Optional image",
      "modal.avatarPlaceholder": "Avatar URL",
      "modal.deleteConfirm": `Delete ${values?.name ?? ""}`,
      "modal.deleteTitle": "Delete User",
      "modal.editDesc": "Edit user",
      "modal.editTitle": "Edit User",
      "modal.email": "Email",
      "modal.emailPlaceholder": "Email address",
      "modal.fullName": "Full Name",
      "modal.inviteDesc": "Invite user",
      "modal.inviteTitle": "Invite User",
      "modal.namePlaceholder": "Full name",
      "modal.revokeConfirm": `Revoke ${values?.email ?? ""}`,
      "modal.revokeTitle": "Revoke Invite",
      "modal.role": "Role",
      "modal.workspace": "Workspace",
      "roles.admin": "Admin",
      "roles.superAdmin": "Super Admin",
      "roles.user": "User",
      saving: "Saving...",
      searchPlaceholder: "Search users by name or email...",
      "table.actions": "Actions",
      "table.awaiting": "Awaiting",
      "table.joined": "Joined",
      "table.na": "N/A",
      "table.noMatches": "No users",
      "table.pending": "Pending",
      "table.role": "Role",
      "table.sonaeGlobal": "Sonae Global",
      "table.systemLevel": "System Level",
      "table.user": "User",
      "table.workspace": "Workspace",
      title: "Users",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

const users = [
  { _id: "user_1", name: "Ada Lovelace", email: "ada@example.com", role: "ADMIN", companyId: "company_1", createdAt: Date.UTC(2026, 5, 1) },
  { _id: "user_2", name: "Grace Hopper", email: "grace@example.com", role: "USER", companyId: "company_2", createdAt: Date.UTC(2026, 5, 2) },
];
const invites = [{ _id: "invite_1", email: "pending@example.com", role: "USER", companyId: "company_1", invitedAt: Date.UTC(2026, 5, 3) }];
const companies = [{ _id: "company_1", name: "Acme" }, { _id: "company_2", name: "Beta" }];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("ManageUsersPage", () => {
  const loadMore = vi.fn();
  const addUser = vi.fn();
  const updateUser = vi.fn();
  const deleteUser = vi.fn();
  const revokeInvite = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getMe")) return { _id: "me", role: "SUPER_ADMIN" };
      if (path.includes("getCompanies")) return companies;
      if (path.includes("getPendingInvites")) return invites;
      return [];
    });
    (usePaginatedQuery as unknown as HookMock).mockReturnValue({ results: users, status: "CanLoadMore", isLoading: false, loadMore });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("deleteUser")) return deleteUser as unknown as ReturnType<typeof useMutation>;
      if (path.includes("revokeInvite")) return revokeInvite as unknown as ReturnType<typeof useMutation>;
      if (path.includes("addUser")) return addUser as unknown as ReturnType<typeof useMutation>;
      return updateUser as unknown as ReturnType<typeof useMutation>;
    });
    addUser.mockResolvedValue(undefined);
    updateUser.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
    revokeInvite.mockResolvedValue(undefined);
  });

  it("renders users and invites, sends paginated search args, and loads more", () => {
    render(<ManageUsersPage />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(usePaginatedQuery).toHaveBeenLastCalledWith(expect.anything(), { searchTerm: "" }, { initialNumItems: 15 });

    fireEvent.change(screen.getByPlaceholderText("Search users by name or email..."), { target: { value: "grace" } });

    expect(usePaginatedQuery).toHaveBeenLastCalledWith(expect.anything(), { searchTerm: "grace" }, { initialNumItems: 15 });

    fireEvent.click(screen.getByRole("button", { name: "Load More Identities" }));
    expect(loadMore).toHaveBeenCalledWith(15);
  });

  it("edits users and handles delete/revoke confirmations", async () => {
    const { container } = render(<ManageUsersPage />);

    fireEvent.click(container.querySelector(".lucide-pen")?.closest("button") as HTMLButtonElement);
    fireEvent.change(screen.getByDisplayValue("Ada Lovelace"), { target: { value: "Ada Byron" } });
    fireEvent.click(screen.getByRole("button", { name: "Update User" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ id: "user_1", name: "Ada Byron" }));
    });

    fireEvent.click(container.querySelectorAll(".lucide-trash-2")[1].closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith({ id: "user_1" });
    });

    fireEvent.click(screen.getByTitle("Revoke"));
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(revokeInvite).toHaveBeenCalledWith({ id: "invite_1" });
    });
  });
});
