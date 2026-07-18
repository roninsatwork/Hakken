import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DenseCaptureDeviceBenchmarkPage, { shareDeviceBenchmarkReport } from "./page";

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header>Header</header>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("DenseCaptureDeviceBenchmarkPage", () => {
  it("requires a local file and explicit consent before running", () => {
    render(<DenseCaptureDeviceBenchmarkPage />);

    const runButton = screen.getByRole("button", { name: "Run local device benchmark" });
    expect(runButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(runButton).toBeDisabled();

    const file = new File(["video"], "existing-recording.webm", { type: "video/webm" });
    fireEvent.change(screen.getByLabelText("Existing local recording"), {
      target: { files: [file] },
    });
    expect(runButton).toBeEnabled();
  });

  it("shares only the assembled JSON report file when the browser supports Web Share", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const report = {
      deviceClass: "ipad",
      physicalObservation: {
        note: "responsive",
        observedAt: "2026-07-18T14:00:00.000Z",
        outcome: "cool",
      },
    };

    await shareDeviceBenchmarkReport(report as never, { canShare, share } as never);

    expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.objectContaining({
        name: `sonae-dense-device-ipad-${Date.parse(report.physicalObservation.observedAt)}.json`,
        type: "application/json",
      })],
      text: expect.stringMatching(/No video is included/),
    }));
  });

  it("keeps download as the fallback when file sharing is unsupported", async () => {
    const report = {
      deviceClass: "ipad",
      physicalObservation: {
        note: "",
        observedAt: "2026-07-18T14:00:00.000Z",
        outcome: "cool",
      },
    };

    await expect(shareDeviceBenchmarkReport(report as never, {
      canShare: () => false,
      share: vi.fn(),
    } as never)).rejects.toThrow(/Use Download JSON report instead/);
  });

  it("states the local-only physical-device proof boundary", () => {
    render(<DenseCaptureDeviceBenchmarkPage />);

    expect(screen.getByText(/runs a sustained two-minute adaptive dense-capture soak/)).toBeInTheDocument();
    expect(screen.getByText(/never uploaded to Convex/)).toBeInTheDocument();
    expect(screen.getByText(/record whether the device stayed cool/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Physical device being tested" })).toHaveValue("ipad");
  });
});
