import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import ToolsPage from "./page";

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
    installation: null as { _id: string } | null,
  },
  {
    key: "http-rest",
    name: "Call an API",
    description: "Lets an agent call another system over the web.",
    installation: { _id: "connector_1" } as { _id: string } | null,
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
    vi.mocked(useQuery).mockImplementation(() => marketplaceFixture as ReturnType<typeof useQuery>);
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

    expect(screen.getByRole("heading", { name: "Tools" })).toBeInTheDocument();
    expect(screen.getByText("Lets an agent search the documents you have uploaded.")).toBeInTheDocument();
    expect(screen.getByText("Searches your approved documents.")).toBeInTheDocument();
  });

  it("offers Add for a tool not set up, and Set up for one already added", () => {
    render(<ToolsPage />);

    expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up" }))
      .toHaveAttribute("href", "/admin/ai/tools/connectors/connector_1");
  });

  it("adds a built-in tool when asked", async () => {
    render(<ToolsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Add/ }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({ key: "sonae-knowledge" });
    });
  });

  it("says who can use each tool and how far it reaches, in words", () => {
    render(<ToolsPage />);

    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("Reads only")).toBeInTheDocument();
  });

  it("asks before removing a tool", async () => {
    render(<ToolsPage />);

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

    expect(screen.getAllByText("No tools yet").length).toBeGreaterThan(0);
  });

  it("shows a loading state while the first page arrives", () => {
    paginationStatus = "LoadingFirstPage";
    render(<ToolsPage />);

    expect(screen.queryByText("Searches your approved documents.")).not.toBeInTheDocument();
  });
});
