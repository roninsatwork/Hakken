import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { ChangeBars } from "./ChangeBars";

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/** The pages behind the change (ga-channel-pages-plan.md CH6): two columns either side of a centre line. */
describe("ChangeBars", () => {
  const rows = [
    { key: "gain", label: "/blog/a/", detail: "0 → 90", change: 90, hover: "/blog/a/: 90 visits, 0 before", href: "/x" },
    { key: "loss", label: "/services/web/", detail: "150 → 0", change: -150, hover: "/services/web/: 0 visits, 150 before" },
  ];

  it("puts a gain's words left of the line and its bar right; a loss the other way round", () => {
    const { container } = render(<ChangeBars rows={rows} lostLabel="Lost visits" gainedLabel="Gained visits" />);
    const [gain, loss] = Array.from(container.querySelectorAll("[data-part='change-bars'] > div")).slice(1);
    expect(gain.firstElementChild).toHaveTextContent("/blog/a/");
    expect(gain.lastElementChild?.querySelector("[title]")).toHaveAttribute("title", "/blog/a/: 90 visits, 0 before");
    expect(loss.firstElementChild?.querySelector("[title]")).toHaveAttribute("title", "/services/web/: 0 visits, 150 before");
    expect(loss.lastElementChild).toHaveTextContent("/services/web/");
  });

  it("sizes each bar against the biggest move, and links a row that leads somewhere", () => {
    const { container } = render(<ChangeBars rows={rows} lostLabel="Lost visits" gainedLabel="Gained visits" />);
    const bars = Array.from(container.querySelectorAll<HTMLElement>("[title]"));
    expect(bars.map((bar) => bar.style.width)).toEqual(["60%", "100%"]);
    expect(screen.getByRole("link", { name: "/blog/a/" })).toHaveAttribute("href", "/x");
    expect(screen.getByText("◀ Lost visits")).toBeInTheDocument();
  });
});
