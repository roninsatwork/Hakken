import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import ConnectorsDashboard from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      count: `${values?.count ?? 0} starter connectors`,
      install: "Install",
      installing: "Installing...",
      manage: "Manage",
      sync: "Sync",
      test: "Test",
      testing: "Testing...",
      title: "Connector Marketplace",
      subtitle: "Install governed connector definitions.",
      untested: "UNTESTED",
      "availability.unavailable": "NOT AVAILABLE",
      "availability.partial": `${values?.available ?? 0} OF ${values?.total ?? 0} AVAILABLE`,
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
        const MotionComponent = React.forwardRef<
          HTMLElement,
          React.HTMLAttributes<HTMLElement> & { initial?: unknown; animate?: unknown; exit?: unknown; layoutId?: unknown; transition?: unknown }
        >(({ children, ...props }, ref) => {
          const domProps = { ...props };
          delete domProps.initial;
          delete domProps.animate;
          delete domProps.exit;
          delete domProps.layoutId;
          delete domProps.transition;
          return React.createElement(tag, { ...domProps, ref }, children);
        });
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

const tools = [
  {
    _id: "tool_1",
    name: "Calendar Connector",
    description: "Book meetings",
    handlerMapping: "calendar.book",
    requiredRole: "ADMIN",
  },
  {
    _id: "tool_2",
    name: "CRM Lookup",
    description: "Find account records",
    handlerMapping: "crm.lookup",
    requiredRole: "SUPER_ADMIN",
  },
];

const marketplace = [
  {
    key: "sonae-knowledge",
    name: "Sonae Knowledge",
    description: "Search approved tenant knowledge.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    requiredScopes: ["knowledge:read"],
    requiredSecretRefs: [],
    toolDefinitions: [],
    installation: {
      _id: "connector_1",
      installStatus: "INSTALLED",
      testStatus: "SUCCESS",
    },
    executableToolCount: 1,
    totalToolCount: 1,
    availability: "AVAILABLE",
  },
  {
    key: "slack",
    name: "Slack",
    description: "Send Slack messages.",
    category: "CUSTOM",
    authMode: "OAUTH",
    requiredScopes: ["chat:write"],
    requiredSecretRefs: [],
    toolDefinitions: [],
    installation: null,
    executableToolCount: 0,
    totalToolCount: 1,
    availability: "UNAVAILABLE",
  },
  {
    key: "jira",
    name: "Jira",
    description: "Search and comment on issues.",
    category: "CUSTOM",
    authMode: "OAUTH",
    requiredScopes: ["read:jira-work"],
    requiredSecretRefs: [],
    toolDefinitions: [],
    installation: null,
    executableToolCount: 1,
    totalToolCount: 2,
    availability: "PARTIAL",
  },
];

describe("ConnectorsDashboard", () => {
  const deleteTool = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockImplementation((_queryFn: unknown, args: unknown) => {
      const searchTerm = typeof args === "object" && args && "searchTerm" in args ? String(args.searchTerm || "") : "";

      return {
        results: searchTerm ? tools.filter((tool) => tool.name.toLowerCase().includes(searchTerm.toLowerCase())) : tools,
        status: "Exhausted",
        loadMore: vi.fn(),
      } as unknown as ReturnType<typeof usePaginatedQuery>;
    });
    vi.mocked(useQuery).mockReturnValue(marketplace as unknown as ReturnType<typeof useQuery>);
    vi.mocked(useMutation).mockReturnValue(deleteTool as unknown as ReturnType<typeof useMutation>);
  });

  it("renders connector links and filters by connector metadata", () => {
    render(<ConnectorsDashboard />);

    expect(screen.getByText("Connector Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Sonae Knowledge")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage/i })).toHaveAttribute("href", "/admin/ai/tools/connectors/connector_1");
    expect(screen.getByRole("link", { name: /Add custom connector/i })).toHaveAttribute("href", "/admin/ai/tools/mcp/new");
    expect(screen.getByRole("link", { name: /Add Sonae Action/i })).toHaveAttribute("href", "/admin/ai/tools/new");
    expect(screen.getByRole("link", { name: /Calendar Connector/i })).toHaveAttribute("href", "/admin/ai/tools/tool_1");

    fireEvent.change(screen.getByPlaceholderText("Search connectors by name or description..."), {
      target: { value: "crm" },
    });

    expect(screen.getByText("CRM Lookup")).toBeInTheDocument();
    expect(screen.queryByText("Calendar Connector")).not.toBeInTheDocument();
  });

  it("renders loading and empty states", () => {
    const { container, rerender } = render(<ConnectorsDashboard />);

    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    rerender(<ConnectorsDashboard />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);

    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    rerender(<ConnectorsDashboard />);
    expect(screen.getAllByText("No Connectors Enabled").length).toBeGreaterThan(0);
  });

  it("requires confirmation before deleting a connector", async () => {
    deleteTool.mockResolvedValue(undefined);
    render(<ConnectorsDashboard />);

    fireEvent.click(screen.getAllByTitle("Disconnect Tool")[0]);
    fireEvent.click(screen.getByText("Disconnect?").parentElement?.querySelectorAll("button")[1] as HTMLButtonElement);

    await waitFor(() => {
      expect(deleteTool).toHaveBeenCalledWith({ id: "tool_1" });
    });
  });
});

describe("connector availability badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockReturnValue(marketplace as unknown as ReturnType<typeof useQuery>);
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  it("marks a connector with no working implementation", () => {
    // 21 connectors were presented identically while 2 could execute. An admin
    // could install one, assign it to an agent, and only find out it did nothing
    // by reading a run log afterwards.
    render(<ConnectorsDashboard />);

    expect(screen.getByTestId("connector-availability-slack")).toHaveTextContent("NOT AVAILABLE");
  });

  it("says how much of a partly-built connector works", () => {
    render(<ConnectorsDashboard />);

    expect(screen.getByTestId("connector-availability-jira")).toHaveTextContent("1 OF 2 AVAILABLE");
  });

  it("leaves a fully working connector unbadged", () => {
    // The badge has to mean something, so it must not appear on everything.
    render(<ConnectorsDashboard />);

    expect(screen.queryByTestId("connector-availability-sonae-knowledge")).not.toBeInTheDocument();
  });
});
