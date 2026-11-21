import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WikiConstellation } from "./WikiConstellation";
import { buildConstellation } from "./constellationGeometry";
import { runForceLayout } from "./wikiMapLayout";

/** The wiki as a constellation (Anthony, 2026-11-12: "Yes, build it"). */

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const constellation = buildConstellation(
  runForceLayout([
    { pageId: "p_a", kind: "POLICY", title: "Returns", subjectKey: "returns", links: ["PRODUCT:sofa"] },
    { pageId: "p_b", kind: "PRODUCT", title: "Sofa", subjectKey: "sofa", links: [] },
  ]),
  new Map([
    ["p_a", { usage: 3, learnedAt: 2 }],
    ["p_b", { usage: 0, learnedAt: 1 }],
  ]),
);

describe("WikiConstellation", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  it("names every colour in words, and says how big the map is", () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    const legend = screen.getByRole("list", { name: "aiPages.map.legend" });
    expect(legend.textContent).toContain("aiPages.kinds.POLICY");
    expect(legend.textContent).toContain("aiPages.kinds.PRODUCT");
    expect(legend.textContent).not.toContain("aiPages.kinds.GOAL");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe('aiPages.map.summary {"pages":2,"links":1}');
  });

  it("lists every page as a link, for a keyboard or a screen reader", () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    const list = screen.getByRole("list", { name: "aiPages.map.pagesList" });
    const hrefs = [...list.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(hrefs.sort()).toEqual(["/admin/ai/knowledge/p_a", "/admin/ai/knowledge/p_b"]);
  });

  it("offers Find a page, Watch it grow, turning and flying", () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    expect(screen.getByPlaceholderText("aiPages.map.find")).toBeTruthy();
    for (const name of ["aiPages.map.zoomIn", "aiPages.map.zoomOut", "aiPages.map.zoomReset"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    const turn = screen.getByRole("button", { name: "aiPages.map.turnStop" });
    fireEvent.click(turn);
    expect(screen.getByRole("button", { name: "aiPages.map.turnStart" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "aiPages.map.grow" }));
    expect((screen.getByRole("button", { name: "aiPages.map.growing" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("finding a page opens its card, with Open the page and Show only its neighbours", async () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    fireEvent.change(screen.getByPlaceholderText("aiPages.map.find"), { target: { value: "sofa" } });
    // The find box waits for typing to stop, as every search box does.
    const card = await screen.findByRole("complementary", { name: "aiPages.map.cardLabel" });
    expect(card.textContent).toContain("Sofa");
    expect(card.querySelector("a")?.getAttribute("href")).toBe("/admin/ai/knowledge/p_b");
    fireEvent.click(screen.getByRole("button", { name: "aiPages.map.onlyNeighbours" }));
    expect(screen.getByRole("button", { name: "aiPages.map.showEverything" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.map.close" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("leaves a plain scroll to the page, and flies only with Ctrl or ⌘ held", () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    const canvas = screen.getByRole("img");
    const plain = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    act(() => {
      canvas.dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);
    expect(screen.getByText("aiPages.map.scrollNudge")).toBeTruthy();

    const held = new WheelEvent("wheel", { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      canvas.dispatchEvent(held);
    });
    expect(held.defaultPrevented).toBe(true);
  });

  it("fills the window from beside + and −, and Esc brings it back", () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    const frame = () => screen.getByRole("img").parentElement!;
    expect(frame().getAttribute("data-filling")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.map.fillWindow" }));
    expect(frame().getAttribute("data-filling")).toBe("true");
    expect(frame().className).toContain("fixed");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(frame().getAttribute("data-filling")).toBeNull();
    expect(screen.getByRole("button", { name: "aiPages.map.fillWindow" })).toBeTruthy();
  });

  it("lists the pages a page is joined to in its card, and each one flies to that page", async () => {
    render(<WikiConstellation constellation={constellation} basePath="/admin/ai/knowledge" />);
    fireEvent.change(screen.getByPlaceholderText("aiPages.map.find"), { target: { value: "sofa" } });
    const card = await screen.findByRole("complementary", { name: "aiPages.map.cardLabel" });
    expect(card.textContent).toContain("aiPages.map.joinedHeading");
    fireEvent.click(screen.getByRole("button", { name: /Returns/ }));
    expect(screen.getByRole("heading", { name: "Returns" })).toBeTruthy();
  });
});
