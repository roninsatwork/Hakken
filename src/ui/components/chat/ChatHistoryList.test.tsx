import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ChatHistoryList from "./ChatHistoryList";
import { useQuery, useMutation } from "convex/react";
import * as nextNavigation from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/app/assistant"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

describe("ChatHistoryList", () => {
  const mockThreads = [
    { _id: "thread1" as Id<"threads">, title: "First Conversation" },
    { _id: "thread2" as Id<"threads">, title: "Project Alpha" },
    { _id: "thread3" as Id<"threads">, title: "General Inquiry" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nextNavigation.usePathname).mockReturnValue("/app/assistant");
    
    // Mock convex useQuery to return our mock threads
    vi.mocked(useQuery).mockImplementation(() => {
      // Return threads array for the default case
      return mockThreads;
    });
    
    // Mock useMutation to return an empty async function
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useMutation>);
  });

  it("renders the history header and new conversation button", () => {
    render(<ChatHistoryList />);
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("New Conversation")).toBeInTheDocument(); // Tooltip text
  });

  it("renders the list of threads", () => {
    render(<ChatHistoryList />);
    expect(screen.getByText("First Conversation")).toBeInTheDocument();
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("General Inquiry")).toBeInTheDocument();
  });

  it("filters threads based on search query", () => {
    render(<ChatHistoryList />);
    
    // Verify all present initially
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    
    // Type into the search input
    const searchInput = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(searchInput, { target: { value: "alpha" } });
    
    // Verify only 'Project Alpha' remains
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.queryByText("First Conversation")).not.toBeInTheDocument();
    expect(screen.queryByText("General Inquiry")).not.toBeInTheDocument();
  });

  it("displays a loading state when threads are undefined", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    const { container } = render(<ChatHistoryList />);
    
    // Check for loader by class name or tag since it's an SVG
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("displays an empty state when threads array is empty", () => {
    vi.mocked(useQuery).mockReturnValue([]);
    render(<ChatHistoryList />);
    
    expect(screen.getByText("No previous conversations. Start exploring Sonae.")).toBeInTheDocument();
  });

  it("opens rename input when edit button is clicked", () => {
    render(<ChatHistoryList />);
    
    // Find rename buttons (there should be 3)
    const renameButtons = screen.getAllByTitle("Rename conversation");
    expect(renameButtons.length).toBe(3);
    
    // Click the first one
    fireEvent.click(renameButtons[0]);
    
    // The input should appear with the initial value
    const input = screen.getByDisplayValue("First Conversation");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus(); // autoFocus is true
  });
});
