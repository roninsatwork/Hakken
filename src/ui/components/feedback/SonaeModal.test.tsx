import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SonaeModal from "./SonaeModal";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
          ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children),
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    },
  ),
}));

/**
 * This is the app's only modal — delete confirmations, the agent editor,
 * everything between — and it shipped with none of what a keyboard or a
 * screen reader needs. These tests are the reason it cannot regress: one
 * component, every screen.
 */
describe("SonaeModal accessibility", () => {
  it("announces itself as a dialog and names itself by its title", () => {
    render(
      <SonaeModal isOpen onClose={vi.fn()} title="Confirm deletion">
        <button type="button">Erase</button>
      </SonaeModal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Named by its own heading rather than left anonymous.
    expect(dialog).toHaveAccessibleName("Confirm deletion");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <SonaeModal isOpen onClose={onClose} title="Confirm deletion">
        <button type="button">Erase</button>
      </SonaeModal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the dialog rather than letting it walk into the page behind", () => {
    render(
      <SonaeModal isOpen onClose={vi.fn()} title="Confirm deletion">
        <button type="button">Cancel</button>
        <button type="button">Erase</button>
      </SonaeModal>,
    );

    const erase = screen.getByRole("button", { name: "Erase" });
    const close = screen.getByRole("button", { name: "Close" });

    // Forwards off the last control wraps to the first.
    erase.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    // Backwards off the first wraps to the last.
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(erase);
  });

  it("gives the close control a name instead of leaving it an unlabelled icon", () => {
    render(
      <SonaeModal isOpen onClose={vi.fn()} title="Confirm deletion">
        <p>Body</p>
      </SonaeModal>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders nothing at all when closed", () => {
    render(
      <SonaeModal isOpen={false} onClose={vi.fn()} title="Confirm deletion">
        <p>Body</p>
      </SonaeModal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
