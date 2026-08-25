import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleErrorDialog } from "./ScheduleErrorDialog";

vi.mock("@/src/ui/components/feedback/SonaeModal", () => ({
  default: ({
    children,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

describe("ScheduleErrorDialog", () => {
  it("preserves the error message and dismiss action", () => {
    const onClose = vi.fn();

    render(
      <ScheduleErrorDialog
        dismissLabel="Dismiss"
        message="Choose a workflow before saving."
        onClose={onClose}
        title="Configuration error"
      />,
    );

    expect(screen.getByRole("dialog", { name: "Configuration error" })).toBeInTheDocument();
    expect(screen.getByText("Choose a workflow before saving.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
