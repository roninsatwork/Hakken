import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvalDialogs } from "./EvalDialogs";

vi.mock("@/src/ui/components/feedback/SonaeModal", () => ({
  default: ({
    children,
    isOpen,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title: string;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
        <button type="button" onClick={onClose}>
          Close {title}
        </button>
      </div>
    ) : null,
}));

const batch = {
  body: "This will run 4 checks using 6 provider calls.",
  busy: false,
  cancelLabel: "Cancel batch",
  cappedMessage: "Only the first 4 checks will run.",
  confirmLabel: "Run evals",
  open: true,
  stayMessage: "You can stay on this page.",
  title: "Run these evals?",
};

const deletion = {
  body: "Delete Accuracy check?",
  busy: false,
  cancelLabel: "Keep eval",
  confirmLabel: "Delete eval",
  open: false,
  title: "Delete this eval?",
};

describe("EvalDialogs", () => {
  it("preserves batch confirmation copy and actions", () => {
    const onBatchClose = vi.fn();
    const onBatchConfirm = vi.fn(async () => undefined);

    render(
      <EvalDialogs
        batch={batch}
        deletion={deletion}
        onBatchClose={onBatchClose}
        onBatchConfirm={onBatchConfirm}
        onDeleteClose={vi.fn()}
        onDeleteConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: batch.title })).toBeInTheDocument();
    expect(screen.getByText(batch.body)).toBeInTheDocument();
    expect(screen.getByText(batch.stayMessage)).toBeInTheDocument();
    expect(screen.getByText(batch.cappedMessage)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: batch.cancelLabel }));
    fireEvent.click(screen.getByRole("button", { name: batch.confirmLabel }));
    expect(onBatchClose).toHaveBeenCalledTimes(1);
    expect(onBatchConfirm).toHaveBeenCalledTimes(1);
  });

  it("preserves delete confirmation copy and actions", () => {
    const onDeleteClose = vi.fn();
    const onDeleteConfirm = vi.fn(async () => undefined);

    render(
      <EvalDialogs
        batch={{ ...batch, open: false }}
        deletion={{ ...deletion, open: true }}
        onBatchClose={vi.fn()}
        onBatchConfirm={vi.fn()}
        onDeleteClose={onDeleteClose}
        onDeleteConfirm={onDeleteConfirm}
      />,
    );

    expect(screen.getByRole("dialog", { name: deletion.title })).toBeInTheDocument();
    expect(screen.getByText(deletion.body)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: deletion.cancelLabel }));
    fireEvent.click(screen.getByRole("button", { name: deletion.confirmLabel }));
    expect(onDeleteClose).toHaveBeenCalledTimes(1);
    expect(onDeleteConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables delete actions while deletion is running", () => {
    render(
      <EvalDialogs
        batch={{ ...batch, open: false }}
        deletion={{ ...deletion, busy: true, open: true }}
        onBatchClose={vi.fn()}
        onBatchConfirm={vi.fn()}
        onDeleteClose={vi.fn()}
        onDeleteConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: deletion.cancelLabel })).toBeDisabled();
    expect(screen.getByRole("button", { name: deletion.confirmLabel })).toBeDisabled();
  });
});
