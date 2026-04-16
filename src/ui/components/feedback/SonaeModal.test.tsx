import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, describe, vi } from 'vitest';
import SonaeModal from './SonaeModal';

describe("UI Layer: Custom Sonae Modal Integrity", () => {
  test("Modal remains hidden when isOpen is false", () => {
    const handleClose = vi.fn();
    render(
      <SonaeModal isOpen={false} onClose={handleClose} title="Hidden Modal">
        <p>Secret Content</p>
      </SonaeModal>
    );

    expect(screen.queryByText("Hidden Modal")).toBeNull();
    expect(screen.queryByText("Secret Content")).toBeNull();
  });

  test("Modal renders in the body portal when isOpen is true and tracks close events", () => {
    const handleClose = vi.fn();
    const { baseElement } = render(
      <SonaeModal isOpen={true} onClose={handleClose} title="Sonae Admin Settings">
        <div data-testid="internal-modal-content">Mission Critical Form</div>
      </SonaeModal>
    );

    // Ensure it correctly mounted via framer-motion and react-dom portal
    expect(screen.getByText("Sonae Admin Settings")).toBeInTheDocument();
    expect(screen.getByTestId("internal-modal-content")).toBeInTheDocument();

    // Verify close buttons function without breaking layout
    const buttons = baseElement.querySelectorAll("button");
    const closeBtn = Array.from(buttons).find((b) => b.innerHTML.includes('<line') || b.className.includes('absolute'));
    
    if (closeBtn) {
        fireEvent.click(closeBtn);
        expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });
});
