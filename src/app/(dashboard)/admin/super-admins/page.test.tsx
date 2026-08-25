import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { HTMLAttributes, ReactNode } from "react";
import ManageSuperAdminsPage from "./page";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";

vi.mock("next/dynamic", async () => {
  const { SuperAdminDialogs } = await import("./SuperAdminDialogs");
  return { default: () => SuperAdminDialogs };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

// Mock framer-motion to bypass animations in JSDOM
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div>,
      tr: ({ children, ...props }: HTMLAttributes<HTMLTableRowElement> & { children?: ReactNode }) => <tr {...props}>{children}</tr>,
    },
  };
});

describe("ManageSuperAdminsPage", () => {
  type MockUser = {
    _id: string;
    role: "ADMIN" | "SUPER_ADMIN";
    name: string;
    email?: string;
  };

  type MockInvite = {
    _id: string;
    email: string;
    role: "SUPER_ADMIN";
  };

  const mockCurrentUser: MockUser = { _id: "admin1", role: "SUPER_ADMIN", name: "System Admin" };
  const mockPaginatedUsers: MockUser[] = [
    { _id: "user1", name: "John Doe", email: "john@example.com", role: "SUPER_ADMIN" },
    { _id: "user2", name: "Jane Smith", email: "jane@example.com", role: "SUPER_ADMIN" },
  ];
  const mockPendingInvites: MockInvite[] = [
    { _id: "inv1", email: "pending@example.com", role: "SUPER_ADMIN" },
  ];

  let currentMockUser: MockUser | undefined = mockCurrentUser;
  let currentMockInvites: MockInvite[] = mockPendingInvites;
  let mockLoadMore: ReturnType<typeof vi.fn<(numItems: number) => void>>;
  let useQueryCallCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMore = vi.fn<(numItems: number) => void>();
    currentMockUser = mockCurrentUser;
    currentMockInvites = mockPendingInvites;
    useQueryCallCount = 0;
    
    // Mock the global convex hooks
    vi.mocked(useQuery).mockImplementation(() => {
      useQueryCallCount++;
      if (useQueryCallCount % 2 === 1) return currentMockUser;
      return currentMockInvites;
    });

    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results: mockPaginatedUsers,
      status: "CanLoadMore",
      isLoading: false,
      loadMore: mockLoadMore,
    }));

    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useMutation>);
  });

  // The floor every table screen has to clear. If one of these fails, this
  // screen has stopped matching the rest of the app rather than stopped working.
  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<ManageSuperAdminsPage />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockImplementation(
          () =>
            ({
              results: (rows ?? []) as MockUser[],
              status: rows === undefined ? "LoadingFirstPage" : "CanLoadMore",
              isLoading: rows === undefined,
              loadMore: mockLoadMore,
            }) as unknown as ReturnType<typeof usePaginatedQuery>
        );
        currentMockInvites = rows === undefined || rows.length === 0 ? [] : mockPendingInvites;
      },
      sampleRows: mockPaginatedUsers,
      sampleRowText: "John Doe",
      emptyText: "No users or pending invitations found matching your search.",
      searchPlaceholder: "Search users by name or email...",
    });
  });

  it("renders unauthorized if user is not SUPER_ADMIN", () => {
    currentMockUser = { ...mockCurrentUser, role: "ADMIN" };
    render(<ManageSuperAdminsPage />);
    expect(screen.getByText("Unauthorized area.")).toBeInTheDocument();
  });

  it("renders loading state if currentUser is undefined", () => {
    currentMockUser = undefined;
    const { container } = render(<ManageSuperAdminsPage />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the table with users and pending invites", () => {
    render(<ManageSuperAdminsPage />);
    
    expect(screen.getByText("System Administrators")).toBeInTheDocument();
    
    // Check if mock users are rendered
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    
    // Check if pending invite is rendered
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending Invitation")).toBeInTheDocument();
  });

  it("filters users and invites via search input", () => {
    render(<ManageSuperAdminsPage />);
    
    const searchInput = screen.getByPlaceholderText("Search users by name or email...");
    
    // Both John and Jane should be present
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    
    // Type into search
    fireEvent.change(searchInput, { target: { value: "jane" } });
    
    // Only Jane should remain
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
    expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument(); // pending@ doesn't match jane
  });

  it("opens edit, delete, and revoke dialogs from their existing row actions", () => {
    render(<ManageSuperAdminsPage />);

    fireEvent.click(screen.getAllByLabelText("Edit administrator")[0]);
    expect(screen.getByRole("heading", { name: "Edit User" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getAllByLabelText("Delete administrator")[0]);
    expect(screen.getByRole("heading", { name: "Delete User" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByLabelText("Revoke invitation"));
    expect(screen.getByRole("heading", { name: "Revoke Access" })).toBeInTheDocument();
  });

  it("wears the house paginated footer, and fetches when the reader walks past what is loaded", () => {
    render(<ManageSuperAdminsPage />);

    // The server says there is more, so a further page exists to walk to.
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Showing 1-3 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));

    expect(mockLoadMore).toHaveBeenCalledWith(15);
  });

  it("offers no further page once the server has nothing left", () => {
    vi.mocked(usePaginatedQuery).mockImplementation(
      () =>
        ({
          results: mockPaginatedUsers,
          status: "Exhausted",
          isLoading: false,
          loadMore: mockLoadMore,
        }) as unknown as ReturnType<typeof usePaginatedQuery>
    );

    render(<ManageSuperAdminsPage />);

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Next").closest("button")).toBeDisabled();
  });
});
