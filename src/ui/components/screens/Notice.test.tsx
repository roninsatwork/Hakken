import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it } from "vitest";

import { Notice } from "./Notice";

/** The explanation box (2026-10-03 clean-up): one part where three sections drew about five. */
describe("Notice", () => {
  it("says what is going on, read out as a status, with its own button", () => {
    render(<Notice action={<button type="button">Undo</button>}>Three searches were removed.</Notice>);

    expect(screen.getByRole("status")).toHaveTextContent("Three searches were removed.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("draws a warning in the warning colours, its icon saying so too", () => {
    render(<Notice tone="warning">Google has not finished adding up.</Notice>);

    expect(screen.getByRole("status")).toHaveClass("border-warning/30");
    expect(screen.getByRole("status").querySelector("svg")).toHaveClass("text-warning");
  });
});
