import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import SystemSecurityPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      "security.redaction": "Redaction",
      "security.redactionSub": "Mask PII",
      "security.masterToggle": "Enable PII",
      "security.masterToggleSub": "Protect sensitive data",
      "security.maskEmails": "Mask emails",
      "security.maskCreditCards": "Mask cards",
      "security.maskNi": "Mask national IDs",
      "security.maskPhones": "Mask phones",
      "security.maskPhonesSub": "Hide numbers",
      save: "Save",
      saving: "Saving...",
      success: "Saved",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/src/app/(dashboard)/admin/_components/AdminAccessLevel", () => ({
  useCanWriteHere: () => true,
}));

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
    expect(screen.queryByText("Enable PII")).not.toBeInTheDocument();
  });

  it("saves the masking switches on its own, without touching platform settings", () => {
    vi.mocked(useQuery).mockReturnValue({ enabled: false });

    render(<SystemSecurityPage />);

    // The toggles are icon-only, so the label is the handle onto the button.
    const masterToggle = screen.getByText("Enable PII").closest("div")?.parentElement
      ?.querySelector("button") as HTMLButtonElement;
    fireEvent.click(masterToggle);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    return waitFor(() => {
      expect(updatePiiConfig).toHaveBeenCalledWith({
        configStr: expect.stringContaining('"enabled":true'),
      });
    });
  });

  it("no longer carries a second retention engine", () => {
    // Audit records were purged by this screen on one schedule and by the
    // retention screen on another, with neither able to see the other.
    vi.mocked(useQuery).mockReturnValue({ enabled: true });

    render(<SystemSecurityPage />);

    expect(screen.queryByText(/retention/i)).not.toBeInTheDocument();
  });
});
