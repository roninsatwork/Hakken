import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { ScrollPages } from "./ScrollPages";

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/**
 * How far down people scroll each page, drawn as the pages (dashboard-way-1-plan-2026-11-21.md): each filled as far as
 * people scrolled, the whole website's average as a dashed line, each page opening its own screen.
 */
const pages = [
  { key: "/about-us/", label: "/about-us/", href: "/app/clarity/s/pages?page=%2Fabout-us%2F", visits: 36, scroll: 68.8, colour: "#14b8a6" },
  { key: "/ai-agency/", label: "/ai-agency/", visits: 135, scroll: 31.6, colour: "#f97316" },
];

describe("ScrollPages", () => {
  it("fills each page as far down as people scrolled, and says it", () => {
    const { container } = render(<ScrollPages pages={pages} average={33} visitsWord={(count) => `${count} visits`} averageWord="Your whole website, 33%" />);
    expect(screen.getByRole("img", { name: "/about-us/: 69%" })).toBeInTheDocument();
    expect(screen.getByText("32%")).toBeInTheDocument();
    const fills = [...container.querySelectorAll<HTMLElement>('[role="img"] > div:first-child')].map((fill) => fill.style.height);
    expect(fills).toEqual(["69%", "32%"]);
  });

  it("draws the website's average as a dashed line across every page", () => {
    render(<ScrollPages pages={pages} average={33} visitsWord={(count) => `${count} visits`} averageWord="Your whole website, 33%" />);
    const lines = screen.getAllByLabelText("Your whole website, 33%");
    expect(lines).toHaveLength(2);
    expect(lines[0].style.top).toBe("33%");
  });

  it("opens a page's own screen when it has one, and words its visits as the screen says", () => {
    render(<ScrollPages pages={pages} average={null} visitsWord={(count) => `${count} visits`} averageWord="" legend={[{ name: "Service", colour: "#f97316" }]} />);
    expect(screen.getByRole("link", { name: "/about-us/" })).toHaveAttribute("href", "/app/clarity/s/pages?page=%2Fabout-us%2F");
    expect(screen.getByText("135 visits")).toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.queryAllByLabelText(/whole website/)).toHaveLength(0);
  });
});
