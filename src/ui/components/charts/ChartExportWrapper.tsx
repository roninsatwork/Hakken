"use client";

import React, { useRef, useState } from "react";
import { Download } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/src/ui/components/screens/Button";

type ExportFormat = "png" | "svg" | "csv";

interface ChartExportWrapperProps {
  children: React.ReactNode;
  exportName: string;
  className?: string;
  /**
   * The formats offered. Omitted, the wrapper behaves exactly as it always has:
   * one hover-revealed PNG button on a fixed background. The Sites screens turn
   * on all three (docs/plans/active/user-sites-plan.md, "Downloads", D16).
   */
  formats?: ExportFormat[];
  /** The numbers behind the chart, for the CSV download. */
  csv?: () => string;
  /** A line at the top of an SVG download, so the file stands on its own. */
  svgTitle?: string;
  /**
   * A small line stamped on every downloaded picture and never shown on
   * screen — for Sites, the site, the dates and step, and the product name —
   * so a chart dropped into a report explains itself (D16). Opt in.
   */
  caption?: string;
  /**
   * Draw the download in the theme's own card colour rather than the fixed
   * near-black or white, so a light download is a proper light chart. Opt in:
   * the admin charts keep the colours they were designed against.
   */
  themedBackground?: boolean;
  /** Show the button at all times, not only on hover — a phone cannot hover. */
  alwaysVisible?: boolean;
  /** What the download button is called for a screen reader and on screen. */
  downloadLabel?: string;
  formatLabels?: Partial<Record<ExportFormat, string>>;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** The theme's card colour as the browser resolved it, falling back to the old fixed pair. */
function backgroundFor(element: HTMLElement, themed: boolean, resolvedTheme: string | undefined): string {
  const fixed = resolvedTheme === "dark" ? "#0d0d0d" : "#ffffff";
  if (!themed) return fixed;
  const card = getComputedStyle(element).getPropertyValue("--color-card").trim();
  return card || fixed;
}

/** A colour as the browser resolved it, or as written when it resolved nothing. */
function paintOf(element: Element): string | null {
  const style = getComputedStyle(element);
  const painted = [style.stroke, style.fill, element.getAttribute("stroke"), element.getAttribute("fill")];
  return painted.find((value) => value && value !== "none" && value !== "transparent" && value !== "rgba(0, 0, 0, 0)") ?? null;
}

/**
 * The chart's legend as drawn on screen. The chart library draws its legend in
 * HTML beside the SVG, so an SVG file would otherwise tell its lines apart by
 * colour alone (D16: a downloaded chart carries its legend).
 */
function legendOf(container: HTMLElement): Array<{ name: string; colour: string }> {
  return Array.from(container.querySelectorAll(".recharts-legend-item")).flatMap((item) => {
    const name = item.querySelector(".recharts-legend-item-text")?.textContent?.trim();
    if (!name) return [];
    const colour = Array.from(item.querySelectorAll("svg *")).map(paintOf).find(Boolean) ?? getComputedStyle(item).color;
    return [{ name, colour }];
  });
}

/**
 * The chart's own drawing as a standalone SVG: colours that were inherited
 * (`currentColor`, CSS classes) are written onto each element, so the file
 * looks the same opened anywhere, on the theme's background — with the
 * legend drawn in under it. Only the opted-in charts offer SVG, so the admin
 * charts' downloads are untouched by any of this.
 */
function standaloneSvg(container: HTMLElement, background: string, title: string | undefined, caption: string | undefined): string | null {
  // The chart's drawing itself — not whatever icon comes first on the card
  // (a picker's arrow), nor a legend's swatch, which are SVGs too.
  const surface = container.querySelector(".recharts-wrapper > svg.recharts-surface")
    ?? container.querySelector("svg.recharts-surface")
    ?? container.querySelector("svg");
  if (!surface) return null;
  const clone = surface.cloneNode(true) as SVGSVGElement;
  const originals = surface.querySelectorAll("*");
  const copies = clone.querySelectorAll("*");
  originals.forEach((original, index) => {
    const copy = copies[index] as SVGElement | undefined;
    if (!copy) return;
    const style = getComputedStyle(original);
    for (const property of ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "font-size", "font-family"]) {
      const value = style.getPropertyValue(property);
      if (value) copy.style.setProperty(property, value);
    }
  });
  const width = surface.clientWidth || Number(surface.getAttribute("width")) || 800;
  const height = surface.clientHeight || Number(surface.getAttribute("height")) || 300;
  const top = (title ? 32 : 0) + (caption ? 18 : 0);
  // The legend in rows under the chart, wrapping at its width.
  const legend: Array<{ name: string; colour: string; x: number; row: number }> = [];
  let legendX = 12;
  let legendRow = 0;
  for (const entry of legendOf(container)) {
    const span = 14 + entry.name.length * 6.5 + 18;
    if (legendX > 12 && legendX + span > width - 12) {
      legendRow += 1;
      legendX = 12;
    }
    legend.push({ ...entry, x: legendX, row: legendRow });
    legendX += span;
  }
  const bottom = legend.length > 0 ? (legendRow + 1) * 18 + 10 : 0;
  const ns = "http://www.w3.org/2000/svg";
  const wrapper = document.createElementNS(ns, "svg");
  wrapper.setAttribute("xmlns", ns);
  wrapper.setAttribute("width", String(width));
  wrapper.setAttribute("height", String(height + top + bottom));
  wrapper.setAttribute("viewBox", `0 0 ${width} ${height + top + bottom}`);
  const backdrop = document.createElementNS(ns, "rect");
  backdrop.setAttribute("width", "100%");
  backdrop.setAttribute("height", "100%");
  backdrop.setAttribute("fill", background);
  wrapper.appendChild(backdrop);
  if (title) {
    const heading = document.createElementNS(ns, "text");
    heading.setAttribute("x", "12");
    heading.setAttribute("y", "22");
    heading.setAttribute("font-size", "14");
    heading.setAttribute("font-family", getComputedStyle(container).fontFamily);
    heading.setAttribute("fill", getComputedStyle(container).color);
    heading.textContent = title;
    wrapper.appendChild(heading);
  }
  if (caption) {
    const line = document.createElementNS(ns, "text");
    line.setAttribute("x", "12");
    line.setAttribute("y", String(title ? 42 : 16));
    line.setAttribute("font-size", "11");
    line.setAttribute("font-family", getComputedStyle(container).fontFamily);
    line.setAttribute("fill", getComputedStyle(container).color);
    line.setAttribute("fill-opacity", "0.65");
    line.textContent = caption;
    wrapper.appendChild(line);
  }
  clone.setAttribute("y", String(top));
  wrapper.appendChild(clone);
  for (const entry of legend) {
    const y = top + height + 8 + entry.row * 18;
    const swatch = document.createElementNS(ns, "rect");
    swatch.setAttribute("x", String(entry.x));
    swatch.setAttribute("y", String(y));
    swatch.setAttribute("width", "10");
    swatch.setAttribute("height", "10");
    swatch.setAttribute("rx", "2");
    swatch.setAttribute("fill", entry.colour);
    wrapper.appendChild(swatch);
    const name = document.createElementNS(ns, "text");
    name.setAttribute("x", String(entry.x + 14));
    name.setAttribute("y", String(y + 9));
    name.setAttribute("font-size", "11");
    name.setAttribute("font-family", getComputedStyle(container).fontFamily);
    name.setAttribute("fill", getComputedStyle(container).color);
    name.textContent = entry.name;
    wrapper.appendChild(name);
  }
  return new XMLSerializer().serializeToString(wrapper);
}

export default function ChartExportWrapper({
  children,
  exportName,
  className = "",
  formats,
  csv,
  svgTitle,
  caption,
  themedBackground = false,
  alwaysVisible = false,
  downloadLabel,
  formatLabels,
}: ChartExportWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const filename = (extension: string) => `${exportName}-${new Date().toISOString().split("T")[0]}.${extension}`;

  const handleExport = async (format: ExportFormat = "png") => {
    const container = chartRef.current;
    if (!container) return;
    // Determine the exact physical background color to render against to prevent transparent PNGs washing out text
    const bgColor = backgroundFor(container, themedBackground, resolvedTheme);

    if (format === "csv") {
      if (csv) saveBlob(new Blob([csv()], { type: "text/csv;charset=utf-8" }), filename("csv"));
      return;
    }
    if (format === "svg") {
      const svg = standaloneSvg(container, bgColor, svgTitle, caption);
      if (svg) saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename("svg"));
      return;
    }

    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: bgColor,
      // The download control is not part of the picture.
      ignoreElements: (element) => element.hasAttribute("data-chart-export-control"),
      // The caption is part of the picture only: added to the copy being drawn.
      ...(caption ? {
        onclone: (copy: Document) => {
          const root = copy.querySelector("[data-chart-export-root]");
          if (!root) return;
          const line = copy.createElement("div");
          line.textContent = caption;
          line.setAttribute("style", "margin-top:12px;font-size:11px;opacity:0.65;");
          root.appendChild(line);
        },
      } : {}),
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      saveBlob(blob, filename("png"));
    }, "image/png");
  };

  // The original single button, unchanged for every chart that has not opted in.
  if (!formats) {
    return (
      <div ref={chartRef} className={`group relative ${className}`}>
        {children}
        {/* Raw on purpose: a theme-conditional glass chip revealed by hovering
            the chart — nothing like the kit's `icon` recipe. */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleExport();
          }}
          className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-[#0000000d] dark:bg-[#ffffff0d] backdrop-blur-md border border-[#0000001a] dark:border-[#ffffff1a] shadow-lg opacity-0 outline-none hover:bg-[#0000001a] dark:hover:bg-[#ffffff1a] hover:text-brand transition-all duration-300 group-hover:opacity-100 flex items-center justify-center cursor-pointer text-muted"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const offered = formats.filter((format) => format !== "csv" || Boolean(csv));
  return (
    <div ref={chartRef} data-chart-export-root="" className={`group relative ${className}`}>
      {children}
      <div
        data-chart-export-control=""
        className={`absolute top-4 right-4 flex flex-col items-end gap-1 ${alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
      >
        <Button
          variant="quiet"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={downloadLabel ?? "Download"}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px]"
        >
          <Download className="h-3.5 w-3.5" />
          {downloadLabel ?? "Download"}
        </Button>
        {menuOpen ? (
          <div role="menu" className="flex flex-col overflow-hidden rounded-lg border border-border-dim bg-card shadow-lg">
            {offered.map((format) => (
              <Button
                key={format}
                role="menuitem"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(false);
                  void handleExport(format);
                }}
                className="rounded-none px-3 py-1.5 text-left text-[12px]"
              >
                {formatLabels?.[format] ?? format.toUpperCase()}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
