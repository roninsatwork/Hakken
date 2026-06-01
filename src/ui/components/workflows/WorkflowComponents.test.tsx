import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenericNode } from "./GenericNode";
import { WorkflowSidebar } from "./WorkflowSidebar";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type }: { type: string }) => <span data-testid={`handle-${type}`} />,
  Position: { Left: "left", Right: "right" },
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

describe("workflow shared components", () => {
  it("renders trigger, mapped, configured, and unconfigured node states", () => {
    const { rerender } = render(<GenericNode type="triggerNode" data={{ label: "Manual Trigger" }} />);

    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getByText("trigger Module")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-target")).not.toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();

    rerender(<GenericNode type="actionNode" data={{ label: "API Call", _inputMapping: "{}" }} />);
    expect(screen.getByText("Data schema bound")).toBeInTheDocument();
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();

    rerender(<GenericNode type="databaseNode" data={{ label: "Write Lead" }} />);
    expect(screen.getByText("Unconfigured Database Node")).toBeInTheDocument();

    rerender(
      <GenericNode
        type="databaseNode"
        data={{ label: "Write Lead", _dbConfig: { operation: "UPDATE", tableName: "leads" } }}
      />
    );
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("UPDATE")).toBeInTheDocument();
    expect(screen.getByText("leads")).toBeInTheDocument();
    expect(screen.getByText("result")).toBeInTheDocument();
  });

  it("renders the node library, supports drag metadata, and closes", () => {
    const onClose = vi.fn();
    const setData = vi.fn();
    const dataTransfer = {
      effectAllowed: "",
      setData,
    };

    const { rerender } = render(<WorkflowSidebar isOpen={false} onClose={onClose} />);

    expect(screen.queryByText("Node Library")).not.toBeInTheDocument();

    rerender(<WorkflowSidebar isOpen onClose={onClose} />);

    fireEvent.dragStart(screen.getByText("API Action").closest("[draggable]") as HTMLElement, {
      dataTransfer,
    });
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Node Library")).toBeInTheDocument();
    expect(screen.getByText("Database Action")).toBeInTheDocument();
    expect(setData).toHaveBeenCalledWith("application/reactflow", "actionNode");
    expect(setData).toHaveBeenCalledWith("application/reactflow-label", "API Action");
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
