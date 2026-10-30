import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidePanel } from "./SidePanel";

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());

/** The reusable slide-out (2026-10-31): over any page, closed by Escape, its button or the page behind. */
describe("SidePanel", () => {
  it("draws nothing while closed, and over the page when open, with its title, body and foot", () => {
    const { rerender } = render(<SidePanel open={false} onClose={() => {}} title="Title">Body</SidePanel>);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<SidePanel open onClose={() => {}} title="Title" foot={<span>Foot</span>}>Body</SidePanel>);
    expect(screen.getByRole("dialog", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Foot")).toBeInTheDocument();
    // Drawn into the page's body, out of any bar's layer.
    expect(screen.getByRole("dialog").parentElement).toBe(document.body);
  });

  it("closes on Escape, its close button, and a click on the page behind", () => {
    const onClose = vi.fn();
    render(<SidePanel open onClose={onClose} title="Title">Body</SidePanel>);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "ui.sidePanel.close" }));
    fireEvent.mouseDown(document.querySelector("[data-part='side-panel-scrim']")!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
