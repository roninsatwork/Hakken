import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DownloadButton } from "./DownloadButton";

/** The download button every table bar wears (2026-10-03 clean-up). */
describe("DownloadButton", () => {
  it("downloads when pressed", () => {
    const onClick = vi.fn();
    render(<DownloadButton label="Download all" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Download all" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("says what it is doing while the file is made, and cannot be pressed twice", () => {
    render(<DownloadButton label="Download all" busyLabel="Making the file…" busy onClick={() => undefined} />);

    expect(screen.getByRole("button", { name: "Making the file…" })).toBeDisabled();
  });
});
