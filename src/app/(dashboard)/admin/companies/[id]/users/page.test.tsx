import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import CompanyUsersPage from "./page";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import * as nextNavigation from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useParams: vi.fn(() => ({
    id: "company123",
  })),
}));

// Mock framer-motion to bypass animations in JSDOM
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<any>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
    },
  };
});

describe("CompanyUsersPage", () => {
  const mockCurrentUser = { _id: "admin1", role: "SUPER_ADMIN", name: "System Admin" };
  const mockCompanies = [
    { _id: "company123", name: "Acme Corp" }
  ];
  const mockPaginatedUsers = [
    { _id: "user1", name: "Acme Employee", email: "employee@acme.com", role: "USER", companyId: "company123" },
  ];
  const mockPendingInvites = [
    { _id: "inv1", email: "pending@acme.com", role: "USER" },
  ];

  let currentMockUser: any;
  let currentMockCompanies: any;
  let currentMockInvites: any;
  let mockLoadMore: any;
  let useQueryCallCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMore = vi.fn();
    currentMockUser = mockCurrentUser;
    currentMockCompanies = mockCompanies;
    currentMockInvites = mockPendingInvites;
    useQueryCallCount = 0;
    
    // Mock the global convex hooks
    (useQuery as any).mockImplementation((queryFn: any) => {
      useQueryCallCount++;
      const mod = useQueryCallCount % 3;
      if (mod === 1) return currentMockUser;
      if (mod === 2) return currentMockCompanies;
      if (mod === 0) return currentMockInvites;
    });

    (usePaginatedQuery as any).mockImplementation(() => ({
      results: mockPaginatedUsers,
      status: "CanLoadMore",
      loadMore: mockLoadMore,
    }));

    (useMutation as any).mockReturnValue(vi.fn().mockResolvedValue({}));
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

  it("shows 'Load More' button when status is CanLoadMore and triggers loadMore", () => {
    render(<CompanyUsersPage />);
    
    const loadMoreButton = screen.getByText("Load More Users");
    expect(loadMoreButton).toBeInTheDocument();
    
    fireEvent.click(loadMoreButton);
    expect(mockLoadMore).toHaveBeenCalledWith(15);
  });

  it("hides 'Load More' button when status is Exhausted", () => {
    (usePaginatedQuery as any).mockImplementation(() => ({
      results: mockPaginatedUsers,
      status: "Exhausted",
      loadMore: mockLoadMore,
    }));

    render(<CompanyUsersPage />);
    
    expect(screen.queryByText("Load More Users")).not.toBeInTheDocument();
  });
});
