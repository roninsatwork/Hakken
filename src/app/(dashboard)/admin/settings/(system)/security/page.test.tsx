import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import SystemSecurityPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

/**
 * Rendered against the real catalogue rather than a stub of it.
 *
 * The stub this replaced named every key the screen asked for, which meant it
 * kept passing while the screen moved onto the standard table and asked for
 * five keys the stub had never heard of. Reading the shipped wording makes a
 * missing key a failing test rather than a silent fallback.
 */
describe("system security screen", () => {
  const updatePiiConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updatePiiConfig.mockResolvedValue(undefined);
    vi.mocked(useMutation).mockReturnValue(updatePiiConfig as unknown as ReturnType<typeof useMutation>);
  });

  it("waits for the stored config rather than rendering every switch as off", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<SystemSecurityPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Enable Data Masking Engine")).not.toBeInTheDocument();
  });

  it("saves the masking switches on its own, without touching platform settings", () => {
    vi.mocked(useQuery).mockReturnValue({ enabled: false });

    render(<SystemSecurityPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable Data Masking Engine" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    return waitFor(() => {
      expect(updatePiiConfig).toHaveBeenCalledWith({
        configStr: expect.stringContaining('"enabled":true'),
      });
    });
  });

  it("is the standard table: search above it, pagination footer under it", () => {
    vi.mocked(useQuery).mockReturnValue({ enabled: true });

    render(<SystemSecurityPage />);

    expect(screen.getByLabelText("Search masking switches...")).toBeInTheDocument();
    expect(screen.getByText("Showing 1-5 of 5")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Switch" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "What it does" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Switched on" })).toBeInTheDocument();
    // Five switches, engine first, each one row.
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  });

  it("searches the switches by name and by what they do", () => {
    vi.mocked(useQuery).mockReturnValue({ enabled: true });

    render(<SystemSecurityPage />);

    fireEvent.change(screen.getByLabelText("Search masking switches..."), {
      target: { value: "landline" },
    });

    // One row left, matched on its description rather than its name.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Mask Phone Numbers" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Mask Email Addresses" })).not.toBeInTheDocument();
  });

  it("refuses the four field switches while the engine is off", () => {
    vi.mocked(useQuery).mockReturnValue({ enabled: false });

    render(<SystemSecurityPage />);

    expect(screen.getByRole("checkbox", { name: "Enable Data Masking Engine" })).toBeEnabled();
    for (const name of [
      "Mask Email Addresses",
      "Mask Credit Card Numbers",
      "Mask National ID Numbers",
      "Mask Phone Numbers",
    ]) {
      expect(screen.getByRole("checkbox", { name })).toBeDisabled();
    }
  });

  it("no longer carries a second retention engine", () => {
    // Audit records were purged by this screen on one schedule and by the
    // retention screen on another, with neither able to see the other.
    vi.mocked(useQuery).mockReturnValue({ enabled: true });

    render(<SystemSecurityPage />);

    expect(screen.queryByText(/retention/i)).not.toBeInTheDocument();
  });
});
