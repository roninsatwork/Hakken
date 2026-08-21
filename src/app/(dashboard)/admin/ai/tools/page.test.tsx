import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import ToolsPage from "./page";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));


vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const tools = [
  {
    _id: "tool_1",
    name: "Knowledge Search",
    description: "Searches your approved documents.",
    handlerMapping: "knowledge.search",
    requiredRole: "ADMIN",
    sideEffectLevel: "READ",
    isActive: true,
  },
];

const marketplace = [
  {
    key: "sonae-knowledge",
    name: "Knowledge search",
    description: "Lets an agent search the documents you have uploaded.",
    category: "KNOWLEDGE",
    installation: null as { _id: string } | null,
  },
  {
    key: "http-rest",
    name: "Call an API",
    description: "Lets an agent call another system over the web.",
    category: "KNOWLEDGE",
    installation: { _id: "connector_1", isActive: true } as { _id: string } | null,
  },
];

describe("ToolsPage", () => {
  const mutationMock = vi.fn();
  const loadMore = vi.fn();
  let marketplaceFixture: unknown;
  let toolsFixture: typeof tools;
  let paginationStatus: string;

  beforeEach(() => {
    vi.clearAllMocks();
    marketplaceFixture = marketplace;
    toolsFixture = tools;
    paginationStatus = "CanLoadMore";
    // The screen asks two questions: what connections exist, and how many
    // abilities sit in each shelf group.
    vi.mocked(useQuery).mockImplementation(((_reference: unknown, args?: unknown) => {
      // The shelf door is the one called with an arguments object; the
      // connector list takes none.
      return (args !== undefined
        ? { counts: { KNOWLEDGE: 1 }, total: 1, isCapped: false }
        : marketplaceFixture) as ReturnType<typeof useQuery>;
    }) as unknown as typeof useQuery);
    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results: toolsFixture,
      status: paginationStatus,
      loadMore,
      isLoading: false,
    }) as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  /**
   * Nothing in the product linked to this screen, so the one place that decides
   * what an agent can actually do had never been opened. It is in the menu now,
   * and this is what it has to show when someone finally arrives.
   */
  it("lists the built-in tools and the tools already set up", () => {
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    expect(screen.getByRole("heading", { name: "Tools" })).toBeInTheDocument();
    expect(screen.getByText("Lets an agent search the documents you have uploaded.")).toBeInTheDocument();
    expect(screen.getByText("Searches your approved documents.")).toBeInTheDocument();
  });

  it("offers Add for a connection not yet added, and Settings for one already added", () => {
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" }))
      .toHaveAttribute("href", "/admin/ai/tools/connectors/connector_1");
  });

  it("adds a built-in tool when asked", async () => {
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    fireEvent.click(screen.getByRole("button", { name: /Add/ }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({ key: "sonae-knowledge" });
    });
  });

  it("says who can use each tool and how far it reaches, in words", () => {
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("Reads only")).toBeInTheDocument();
  });

  it("asks before removing a tool", async () => {
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    fireEvent.click(screen.getByRole("button", { name: "Remove Knowledge Search" }));
    expect(screen.getByText("Remove it?")).toBeInTheDocument();
    expect(mutationMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({ id: "tool_1" });
    });
  });

  it("shows an empty state rather than a bare table", () => {
    toolsFixture = [];
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    expect(screen.getAllByText("Nothing here yet. Add a connection above, or build your own tool.").length).toBeGreaterThan(0);
  });

  it("shows a loading state while the first page arrives", () => {
    paginationStatus = "LoadingFirstPage";
    render(<ToolsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Knowledge/ }));

    expect(screen.queryByText("Searches your approved documents.")).not.toBeInTheDocument();
  });
});
