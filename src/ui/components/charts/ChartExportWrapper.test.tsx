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

  it("offers PNG, SVG and CSV when a screen opts in, and saves the numbers as CSV", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <ChartExportWrapper exportName="site-traffic" formats={["png", "svg", "csv"]} csv={() => "day,traffic\n2026-09-23,1937"} alwaysVisible>
        <section>Traffic chart</section>
      </ChartExportWrapper>
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["PNG", "SVG", "CSV"]);

    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toContain("text/csv");
    expect(html2canvas).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it("stamps a caption on the downloaded SVG and PNG, and never on the screen", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })));
    vi.mocked(html2canvas).mockResolvedValue({ toBlob } as unknown as HTMLCanvasElement);
    const caption = "ronins.co.uk · 24 Aug 2026 – 23 Sept 2026 · Daily · Hakken";

    render(
      <ChartExportWrapper exportName="site-traffic" formats={["png", "svg"]} svgTitle="Estimated traffic" caption={caption} alwaysVisible>
        <svg className="recharts-surface" width="400" height="200"><rect width="10" height="10" /></svg>
      </ChartExportWrapper>
    );
    expect(screen.queryByText(caption)).not.toBeInTheDocument();

    // The SVG carries the title and the caption.
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "SVG" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const svg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob);
    });
    expect(svg).toContain("Estimated traffic");
    expect(svg).toContain(caption);

    // The PNG's copy of the card gets the caption before it is drawn.
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(html2canvas).toHaveBeenCalled());
    const options = vi.mocked(html2canvas).mock.calls[0][1] as { onclone?: (copy: Document) => void };
    const copy = document.implementation.createHTMLDocument("copy");
    copy.body.innerHTML = '<div data-chart-export-root=""></div>';
    options.onclone?.(copy);
    expect(copy.body.textContent).toContain(caption);

    clickSpy.mockRestore();
  });

  it("saves the chart itself as SVG, not an icon above it, with its legend drawn in", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <ChartExportWrapper exportName="site-traffic" formats={["svg"]} alwaysVisible>
        {/* A picker's arrow above the chart is an SVG too. */}
        <svg className="picker-arrow" width="12" height="12"><path d="M0 0" data-mark="arrow" /></svg>
        <div className="recharts-wrapper">
          <svg className="recharts-surface" width="400" height="200"><rect width="10" height="10" data-mark="chart" /></svg>
          <div className="recharts-legend-wrapper">
            <ul>
              <li className="recharts-legend-item">
                <svg className="recharts-surface" width="14" height="14"><path stroke="#ff6600" d="M0 7h14" /></svg>
                <span className="recharts-legend-item-text">ronins.co.uk</span>
              </li>
              <li className="recharts-legend-item">
                <svg className="recharts-surface" width="14" height="14"><path fill="#3366ff" d="M0 0h14v14h-14z" /></svg>
                <span className="recharts-legend-item-text">lightflows.co.uk</span>
              </li>
            </ul>
          </div>
        </div>
      </ChartExportWrapper>
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "SVG" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const svg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob);
    });
    expect(svg).toContain('data-mark="chart"');
    expect(svg).not.toContain('data-mark="arrow"');
    expect(svg).toContain("ronins.co.uk");
    expect(svg).toContain("lightflows.co.uk");

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
