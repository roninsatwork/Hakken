import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import ConnectorsDashboard from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
        >(({ children, initial: _initial, animate: _animate, exit: _exit, layoutId: _layoutId, transition: _transition, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
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

describe("ConnectorsDashboard", () => {
  const deleteTool = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(tools);
    vi.mocked(useMutation).mockReturnValue(deleteTool as unknown as ReturnType<typeof useMutation>);
  });

  it("renders connector links and filters by connector metadata", () => {
    render(<ConnectorsDashboard />);

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

    vi.mocked(useQuery).mockReturnValue(undefined);
    rerender(<ConnectorsDashboard />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);

    vi.mocked(useQuery).mockReturnValue([]);
    rerender(<ConnectorsDashboard />);
    expect(screen.getByText("No Connectors Enabled")).toBeInTheDocument();
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
