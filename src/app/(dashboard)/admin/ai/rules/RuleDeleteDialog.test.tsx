import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuleDeleteDialog } from "./RuleDeleteDialog";

vi.mock("@/src/ui/components/feedback/HakkenModal", () => ({
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

const labels = {
  abort: "Abort",
  confirm: "Delete rule",
  description: "This rule will be removed.",
  title: "Delete this rule?",
  warning: "This cannot be undone.",
};

describe("RuleDeleteDialog", () => {
  it("preserves the confirmation copy and actions", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => undefined);

    render(
      <RuleDeleteDialog
        isDeleting={false}
        labels={labels}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog", { name: labels.title })).toBeInTheDocument();
    expect(screen.getByText(labels.description)).toBeInTheDocument();
    expect(screen.getByText(labels.warning)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: labels.abort }));
    fireEvent.click(screen.getByRole("button", { name: labels.confirm }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables confirmation while deletion is running", () => {
    render(
      <RuleDeleteDialog
        isDeleting
        labels={labels}
        onClose={vi.fn()}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: labels.confirm })).toBeDisabled();
  });
});
