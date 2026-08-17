import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FeedbackPill,
  SaveAction,
  SaveError,
  SaveFeedback,
} from "./SaveControls";

describe("SaveAction", () => {
  it("renders the save label and forwards click handling", () => {
    const onClick = vi.fn();

    render(
      <SaveAction
        isSaving={false}
        label="Save settings"
        savingLabel="Saving..."
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders success feedback and disabled saving state", () => {
    render(
      <SaveAction
        isSaving
        label="Save"
        savingLabel="Saving..."
        successLabel="Synchronized"
        showSuccess
      />
    );

    expect(screen.getByText("Synchronized")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("can submit a parent form", () => {
    render(
      <form>
        <SaveAction isSaving={false} label="Save" savingLabel="Saving..." type="submit" />
      </form>
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });
});

describe("SaveError", () => {
  it("renders only when an error is present", () => {
    const { rerender } = render(<SaveError />);

    expect(document.querySelector(".text-red-400")).not.toBeInTheDocument();

    rerender(<SaveError>Save failed</SaveError>);

    expect(screen.getByText("Save failed")).toHaveClass("text-red-400");
  });
});

describe("SaveFeedback", () => {
  it("renders success feedback", () => {
    render(
      <SaveFeedback
        status="success"
        successTitle="Saved"
        successMessage="Everything is synchronized."
        errorTitle="Failed"
        errorMessage="Save failed"
      />
    );

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Everything is synchronized.")).toBeInTheDocument();
  });

  it("renders error feedback", () => {
    render(
      <SaveFeedback
        status="error"
        successTitle="Saved"
        successMessage="Everything is synchronized."
        errorTitle="Failed"
        errorMessage="Save failed"
      />
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("renders nothing when idle", () => {
    render(
      <SaveFeedback
        status="idle"
        successTitle="Saved"
        successMessage="Everything is synchronized."
        errorTitle="Failed"
        errorMessage="Save failed"
      />
    );

    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });
});

describe("FeedbackPill", () => {
  it("renders compact success and error feedback", () => {
    const { rerender } = render(<FeedbackPill tone="success">Sent</FeedbackPill>);

    expect(screen.getByText("Sent").parentElement).toHaveClass("text-[#10b981]");

    rerender(<FeedbackPill tone="error">Send failed</FeedbackPill>);

    expect(screen.getByText("Send failed")).toHaveClass("leading-snug");
  });
});
