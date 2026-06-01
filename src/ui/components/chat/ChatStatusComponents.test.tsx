import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import ChatMessage from "./ChatMessage";
import SwarmStatusCard from "./SwarmStatusCard";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    swarmRuntime: { getSwarmLogs: "getSwarmLogs" },
    users: { getMe: "getMe" },
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

vi.mock("next/image", () => ({
  default: ({ unoptimized: _unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} />
  ),
}));

const baseMessage = {
  _id: "message1",
  _creationTime: 1,
  threadId: "thread1",
  createdAt: new Date("2026-06-01T09:30:00.000Z").getTime(),
} as Partial<Doc<"messages">>;

describe("chat status components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders assistant markdown messages with assistant styling", () => {
    useQueryMock.mockReturnValue(null);

    render(<ChatMessage message={{ ...baseMessage, role: "assistant", content: "**Done**" } as Doc<"messages">} />);

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("renders user messages with the current user image when available", () => {
    useQueryMock.mockReturnValue({ image: "/user.png", name: "Ada" });

    render(<ChatMessage message={{ ...baseMessage, role: "user", content: "Hello there" } as Doc<"messages">} />);

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByAltText("Ada")).toBeInTheDocument();
  });

  it("hides swarm status for loading or empty logs", () => {
    useQueryMock.mockReturnValue(undefined);
    const { container, rerender } = render(<SwarmStatusCard threadId={"thread1" as Id<"threads">} />);

    rerender(<SwarmStatusCard threadId={"thread1" as Id<"threads">} />);
    expect(container).toBeEmptyDOMElement();

    useQueryMock.mockReturnValue([]);
    rerender(<SwarmStatusCard threadId={"thread1" as Id<"threads">} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders swarm execution logs with every status state", () => {
    useQueryMock.mockReturnValue([
      { _id: "1", message: "Plan", status: "pending", isHeading: true },
      { _id: "2", message: "Running tool", status: "running" },
      { _id: "3", message: "Completed", status: "success" },
      { _id: "4", message: "Failed", status: "error" },
    ]);

    render(<SwarmStatusCard threadId={"thread1" as Id<"threads">} />);

    expect(screen.getByText("Autonomous Agent Execution")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Running tool")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
