import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html2canvas from "html2canvas";
import ChartExportWrapper from "./ChartExportWrapper";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("html2canvas", () => ({
  default: vi.fn(),
}));

describe("ChartExportWrapper", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:chart");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.clearAllMocks();
  });

  it("renders children and exports the wrapped chart as a dated png", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })));
    vi.mocked(html2canvas).mockResolvedValue({ toBlob } as unknown as HTMLCanvasElement);

    render(
      <ChartExportWrapper exportName="usage">
        <section>Cost chart</section>
      </ChartExportWrapper>
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(html2canvas).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        expect.objectContaining({ backgroundColor: "#0d0d0d", scale: 2, useCORS: true })
      );
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:chart");
    });

    expect(screen.getByText("Cost chart")).toBeInTheDocument();
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it("does not create a download when canvas encoding returns no blob", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.mocked(html2canvas).mockResolvedValue({
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement);

    render(
      <ChartExportWrapper exportName="empty">
        <section>Empty chart</section>
      </ChartExportWrapper>
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(html2canvas).toHaveBeenCalled());

    expect(clickSpy).not.toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});
