import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import ChatMessage from "./ChatMessage";
import SwarmStatusCard from "./SwarmStatusCard";
import { STREAM_STALLED_MESSAGE } from "@/convex/streamingService";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: () => vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    swarmRuntime: { getSwarmLogs: "getSwarmLogs" },
    users: { getMe: "getMe" },
    messageFeedback: {
      getMineForThread: "getMineForThread",
      upsertForMessage: "upsertForMessage",
    },
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
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
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

  describe("streamed replies", () => {
    it("shows a caret while the reply is still being written", () => {
      useQueryMock.mockReturnValue(null);

      render(
        <ChatMessage
          message={{
            ...baseMessage,
            role: "assistant",
            content: "Refunds are process",
            isStreaming: true,
            streamStartedAt: Date.now(),
          } as Doc<"messages">}
        />
      );

      expect(screen.getByLabelText("Still writing")).toBeInTheDocument();
      // A timestamp beside a half-written reply reads as though it is finished.
      expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
    });

    it("shows no caret once the reply is finished", () => {
      useQueryMock.mockReturnValue(null);

      render(
        <ChatMessage
          message={{
            ...baseMessage,
            role: "assistant",
            content: "Refunds are processed within 14 days.",
            isStreaming: false,
            streamStartedAt: Date.now(),
          } as Doc<"messages">}
        />
      );

      expect(screen.queryByLabelText("Still writing")).not.toBeInTheDocument();
    });

    it("says so when a reply was abandoned rather than blinking forever", async () => {
      // A run killed outright cannot mark its own reply finished, so without
      // this the reader watches a caret against an answer never coming.
      useQueryMock.mockReturnValue(null);

      render(
        <ChatMessage
          message={{
            ...baseMessage,
            role: "assistant",
            content: "Refunds are process",
            isStreaming: true,
            streamStartedAt: Date.now() - (11 * 60 * 1000),
          } as Doc<"messages">}
        />
      );

      // Staleness is resolved on a tick rather than during render, so the
      // caret is briefly present before the component settles.
      await waitFor(() => {
        expect(screen.getByText(STREAM_STALLED_MESSAGE)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText("Still writing")).not.toBeInTheDocument();
    });
  });
});
