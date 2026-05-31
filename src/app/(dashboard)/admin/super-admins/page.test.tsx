import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { HTMLAttributes, ReactNode } from "react";
import ManageSuperAdminsPage from "./page";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";

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
  let mockLoadMore: ReturnType<typeof vi.fn>;
  let useQueryCallCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMore = vi.fn();
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

  it("shows 'Load More' button when status is CanLoadMore and triggers loadMore", () => {
    render(<ManageSuperAdminsPage />);
    
    const loadMoreButton = screen.getByText("Load More Administrators");
    expect(loadMoreButton).toBeInTheDocument();
    
    fireEvent.click(loadMoreButton);
    expect(mockLoadMore).toHaveBeenCalledWith(15);
  });

  it("hides 'Load More' button when status is Exhausted", () => {
    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results: mockPaginatedUsers,
      status: "Exhausted",
      isLoading: false,
      loadMore: mockLoadMore,
    }));

    render(<ManageSuperAdminsPage />);
    
    expect(screen.queryByText("Load More Administrators")).not.toBeInTheDocument();
  });
});
