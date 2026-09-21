import React from "react";
import { act, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import HakkenModal from "./HakkenModal";

// Cached per tag, and that matters: handing back a fresh component on every
// property access gives React a new element *type* each render, so it
// unmounts and remounts the whole dialog — losing focus and hiding exactly
// the class of bug these tests exist to catch. The real `motion.div` is one
// stable identity.
const motionComponents = new Map<string, React.ElementType>();

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const cached = motionComponents.get(tag);
        if (cached) return cached;
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
          ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children),
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        motionComponents.set(tag, MotionComponent);
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
describe("HakkenModal accessibility", () => {
  it("announces itself as a dialog and names itself by its title", () => {
    render(
      <HakkenModal isOpen onClose={vi.fn()} title="Confirm deletion">
        <button type="button">Erase</button>
      </HakkenModal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Named by its own heading rather than left anonymous.
    expect(dialog).toHaveAccessibleName("Confirm deletion");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <HakkenModal isOpen onClose={onClose} title="Confirm deletion">
        <button type="button">Erase</button>
      </HakkenModal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the dialog rather than letting it walk into the page behind", () => {
    render(
      <HakkenModal isOpen onClose={vi.fn()} title="Confirm deletion">
        <button type="button">Cancel</button>
        <button type="button">Erase</button>
      </HakkenModal>,
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
      <HakkenModal isOpen onClose={vi.fn()} title="Confirm deletion">
        <p>Body</p>
      </HakkenModal>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders nothing at all when closed", () => {
    render(
      <HakkenModal isOpen={false} onClose={vi.fn()} title="Confirm deletion">
        <p>Body</p>
      </HakkenModal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * The one-character bug (Anthony, 2026-08-20: *"I can only type one char at
 * a time into the two boxes"*).
 *
 * Nearly every screen passes an inline `onClose={() => setOpen(false)}`, a
 * new function on every render. While that sat in the focus effect's
 * dependencies, each keystroke re-rendered the parent, tore the effect down
 * — restoring focus to whatever opened the dialog — and set it up again,
 * focusing the first field. Every modal form in the app took one character
 * and threw focus away.
 */
describe("HakkenModal keeps focus while a parent re-renders", () => {
  /**
   * Mirrors a real screen: a button opens the dialog, so the element focus
   * is restored *to* is a real control rather than the body. That detail is
   * the whole test — with the body as the return target, the bug is
   * invisible, because focusing the body is a no-op.
   */
  function TypingHarness() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [value, setValue] = React.useState("");
    return (
      <div>
        <button type="button" onClick={() => setIsOpen(true)}>
          Add company
        </button>
        <HakkenModal
          isOpen={isOpen}
          // Deliberately inline: a new identity on every render, exactly as
          // every real caller writes it.
          onClose={() => setIsOpen(false)}
          title="Add company"
        >
          <textarea
            aria-label="Directives"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </HakkenModal>
      </div>
    );
  }

  it("a whole word can be typed without focus being pulled away", async () => {
    render(<TypingHarness />);

    const opener = screen.getByRole("button", { name: "Add company" });
    opener.focus();
    fireEvent.click(opener);

    // Opening focuses the dialog's first control on a timer. Let that settle
    // first — the bug under test is about typing, not opening.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const field = screen.getByLabelText("Directives");
    field.focus();
    expect(field).toHaveFocus();

    for (const next of ["A", "Ac", "Acm", "Acme"]) {
      fireEvent.change(field, { target: { value: next } });
      // Before the fix this landed back on the button that opened the
      // dialog, so only the first character ever reached the field.
      expect(field).toHaveFocus();
    }

    expect(field).toHaveValue("Acme");
  });
});
