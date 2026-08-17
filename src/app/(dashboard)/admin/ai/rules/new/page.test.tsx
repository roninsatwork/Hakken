import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation } from "convex/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import NewRulePage from "./page";

/**
 * Written before the screen moved onto the shared field, so that it pins what
 * the screen does today rather than agreeing with whatever it does afterwards.
 *
 * The boxes are found by their placeholder, not their label. Today's labels are
 * not tied to their inputs at all — that is the fault the shared field exists to
 * fix, so it is the one handle that cannot be used to hold the screen still
 * while it changes.
 */

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const NAME = "For example: Office address";
const TRIGGER = "For example: where are you based, what is your address";
const INSTRUCTION = "For example: Tell them our office is in London and offer to book a visit.";
const SUBMIT = "Create rule";

describe("NewRulePage", () => {
  const createRuleMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createRuleMock.mockResolvedValue("rule_new");
    vi.mocked(useMutation).mockReturnValue(createRuleMock as unknown as ReturnType<typeof useMutation>);
  });

  const fillIn = () => {
    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "  Geography Extraction  " } });
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "  where are you based  " } });
    fireEvent.change(screen.getByPlaceholderText(INSTRUCTION), {
      target: { value: "  Answer with the London office address.  " },
    });
  };

  it("creates the rule from what was typed, trimmed, at the chosen priority", async () => {
    renderWithProviders(<NewRulePage />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "HIGH" }));
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createRuleMock).toHaveBeenCalled());
    expect(createRuleMock.mock.calls[0][0]).toEqual({
      name: "Geography Extraction",
      trigger: "where are you based",
      instruction: "Answer with the London office address.",
      priority: "HIGH",
      isActive: true,
    });
  });

  it("creates a normal-priority rule when the tier is left alone", async () => {
    renderWithProviders(<NewRulePage />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createRuleMock).toHaveBeenCalled());
    expect(createRuleMock.mock.calls[0][0]).toMatchObject({ priority: "NORMAL" });
  });

  it("will not create a rule until all three boxes are filled", () => {
    renderWithProviders(<NewRulePage />);

    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "Geography Extraction" } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "where are you based" } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(INSTRUCTION), {
      target: { value: "Answer with the London office address." },
    });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  /**
   * True only since the screen moved onto the shared field. All three labels
   * were loose text before, so clicking one focused nothing and a screen reader
   * announced three unlabelled boxes.
   */
  it("gives every box a label that addresses it", () => {
    renderWithProviders(<NewRulePage />);

    expect(screen.getByLabelText("What to call this rule")).toBe(screen.getByPlaceholderText(NAME));
    expect(screen.getByLabelText("Words or phrases that set it off")).toBe(screen.getByPlaceholderText(TRIGGER));
    expect(screen.getByLabelText("The instruction, in your own words")).toBe(screen.getByPlaceholderText(INSTRUCTION));
  });

  /**
   * Two boxes both claimed the cursor before, so it landed in the second one.
   */
  it("starts the cursor in the first box", () => {
    renderWithProviders(<NewRulePage />);

    expect(screen.getByPlaceholderText(NAME)).toHaveFocus();
  });

  it("returns to the rules list once the rule is created", async () => {
    renderWithProviders(<NewRulePage />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/ai/rules"));
  });
});
