import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import CompanyUsersPage from "./page";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { ReactNode, HTMLAttributes } from "react";

type MockQueryFunction = {
  _path?: string;
  name?: string;
};

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

type MockUser = {
  _id: string;
  name?: string;
  email?: string;
  role?: "USER" | "ADMIN" | "SUPER_ADMIN";
  companyId?: string;
};

type MockInvite = {
  _id: string;
  email: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
};

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useParams: vi.fn(() => ({
    id: "company123",
  })),
  usePathname: vi.fn(() => "/admin/companies/company123/directory/users"),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string, values?: Record<string, string | number>) => {
    // The shared table footer's own defaults (ui.table), which this screen
    // leans on rather than supplying labels of its own.
    if (key === "pageOf") return `Page ${values?.page} of ${values?.totalPages}`;
    if (key === "showingRange") return `Showing ${values?.start}-${values?.end} of ${values?.total}`;
    if (key === "previous") return "Previous";
    if (key === "next") return "Next";
    if (key === "noEntries") return "No entries found";
    const translations: Record<string, string> = {
      addSystemAdmin: "Add System Admin",
      assignSystemAdmin: "Assign System Admin",
      attachExistingAdmin: "Attach an existing platform-level System Admin to this tenant workspace.",
      selectAdministrator: "Select Administrator",
      chooseAdmin: "Choose an admin...",
      assignToWorkspace: "Assign to Workspace",
      detachSystemAdmin: "Detach System Admin",
      detachConfirm: "Are you sure you want to detach...",
      detach: "Detach",
      detaching: "Detaching...",
      "table.empty": "No users found matching your query.",
      "table.loadMore": "Load more users",
      "table.loadingMore": "Loading users...",
      "table.showingLoaded": "Showing users",
    };
    return translations[key] || key;
  }),
}));

// Mock framer-motion to bypass animations in JSDOM
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
      tr: ({ children, ...props }: HTMLAttributes<HTMLTableRowElement>) => <tr {...props}>{children}</tr>,
    },
  };
});

describe("CompanyUsersPage", () => {
  const mockCurrentUser: MockUser = { _id: "admin1", role: "SUPER_ADMIN", name: "System Admin" };
  const mockCompanies = [
    { _id: "company123", name: "Acme Corp" }
  ];
  const mockPaginatedUsers: MockUser[] = [
    { _id: "user1", name: "Acme Employee", email: "employee@acme.com", role: "USER", companyId: "company123" },
  ];
  const mockPendingInvites: MockInvite[] = [
    { _id: "inv1", email: "pending@acme.com", role: "USER" },
  ];

  let currentMockUser: MockUser;
  let currentMockCompanies: { _id: string; name: string }[];
  let currentMockInvites: MockInvite[];
  let mockLoadMore: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mockLoadMore = vi.fn();
    currentMockUser = mockCurrentUser;
    currentMockCompanies = mockCompanies;
    currentMockInvites = mockPendingInvites;
    
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      let path = "";
      try {
        path = getFunctionName(queryFn as never);
      } catch {
        const maybeQuery = queryFn as MockQueryFunction;
        path = maybeQuery?._path || maybeQuery?.name || "";
      }
      if (typeof path === "string") {
        if (path.includes("getMe")) return currentMockUser;
        if (path.includes("getCompanies")) return currentMockCompanies;
        if (path.includes("getInvitesByCompany")) return currentMockInvites;
        if (path.includes("getUnassignedSuperAdmins")) return [];
      }
      return [];
    });

    (usePaginatedQuery as unknown as HookMock).mockImplementation(() => ({
      results: mockPaginatedUsers,
      status: "CanLoadMore",
      loadMore: mockLoadMore,
    }));

    (useMutation as unknown as HookMock).mockReturnValue(vi.fn().mockResolvedValue({}));
  });

  it("renders the table with users and pending invites for the specific company", () => {
    render(<CompanyUsersPage />);
    
    expect(screen.getByText("Workspace Directory")).toBeInTheDocument();
    
    // Check if mock users are rendered
    expect(screen.getByText("Acme Employee")).toBeInTheDocument();
    expect(screen.getByText("employee@acme.com")).toBeInTheDocument();
    
    // Check if pending invite is rendered
    expect(screen.getByText("pending@acme.com")).toBeInTheDocument();
  });

  it("filters users and invites via search input", () => {
    render(<CompanyUsersPage />);
    
    const searchInput = screen.getByPlaceholderText("Search users by name or email...");
    
    expect(screen.getByText("Acme Employee")).toBeInTheDocument();
    expect(screen.getByText("pending@acme.com")).toBeInTheDocument();
    
    // Type into search
    fireEvent.change(searchInput, { target: { value: "pending" } });
    
    // Only pending should remain
    expect(screen.getByText("pending@acme.com")).toBeInTheDocument();
    expect(screen.queryByText("Acme Employee")).not.toBeInTheDocument();
  });

  it("wears the house paginated footer, and fetches when the reader walks past what is loaded", () => {
    render(<CompanyUsersPage />);

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));

    expect(mockLoadMore).toHaveBeenCalledWith(15);
  });

  it("offers no further page once the server has nothing left", () => {
    (usePaginatedQuery as unknown as HookMock).mockImplementation(() => ({
      results: mockPaginatedUsers,
      status: "Exhausted",
      loadMore: mockLoadMore,
    }));

    render(<CompanyUsersPage />);

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Next").closest("button")).toBeDisabled();
  });

  it("does not render the old directory section selector inside the page", () => {
    render(<CompanyUsersPage />);

    const title = screen.getByRole("heading", { level: 1, name: "Workspace Directory" });
    const header = title.closest("header");

    expect(header).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Directory section/i })).not.toBeInTheDocument();
  });
});
