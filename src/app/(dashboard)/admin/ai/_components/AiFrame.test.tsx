import { screen, within } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { usePathname, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiFrame } from "./AiFrame";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * The Artificial Intelligence section's frame (wiki-sonae-catch-up-plan-
 * 2026-11-21.md, S0): the section's title and its one rule, then the shared
 * side menu beside the screen. A record page leaves it out.
 */
describe("AiFrame", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/usage/costs");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
  });

  it("draws the section's title with its rule, then the menu beside the screen", () => {
    const { container } = render(<AiFrame><main>Running costs screen</main></AiFrame>);

    expect(screen.getByRole("heading", { name: "Artificial Intelligence" })).toBeInTheDocument();
    // One rule, the frame's: the screen inside wears its header without one.
    expect(container.querySelectorAll(".border-b.border-border-dim.pb-6")).toHaveLength(1);
    const menu = screen.getByRole("navigation", { name: "Artificial Intelligence pages" });
    expect(within(menu).getByRole("link", { name: "Running costs" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Wiki pages" })).toHaveAttribute("href", "/admin/ai/knowledge");
    expect(within(menu).getByRole("link", { name: "Wiki map" })).toHaveAttribute("href", "/admin/ai/knowledge/map");
    expect(screen.getByText("Running costs screen")).toBeInTheDocument();
  });

  it("opens the group of the page being read and lights its line", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/tool-servers");

    render(<AiFrame><main>Tool servers screen</main></AiFrame>);

    const menu = screen.getByRole("navigation", { name: "Artificial Intelligence pages" });
    expect(within(menu).getByRole("link", { name: "Tool servers" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Tools" })).toHaveAttribute("href", "/admin/ai/tools");
    // Groups not open at first stay folded until they are needed.
    expect(within(menu).queryByRole("link", { name: "Appearance" })).not.toBeInTheDocument();
  });

  it("lights the map's own line on the map", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/knowledge/map");

    render(<AiFrame><main>Map</main></AiFrame>);

    const menu = screen.getByRole("navigation", { name: "Artificial Intelligence pages" });
    expect(within(menu).getByRole("link", { name: "Wiki map" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Wiki pages" })).not.toHaveAttribute("aria-current");
  });

  it("lights the website chat's line the address names", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/widget");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("section=integration") as never);

    render(<AiFrame><main>Widget</main></AiFrame>);

    const menu = screen.getByRole("navigation", { name: "Artificial Intelligence pages" });
    expect(within(menu).getByRole("link", { name: "Integration" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Appearance" })).not.toHaveAttribute("aria-current");
  });

  it("leaves the frame out of a page about one record", () => {
    render(<AiFrame show={false}><main>One rule</main></AiFrame>);

    expect(screen.queryByRole("heading", { name: "Artificial Intelligence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByText("One rule")).toBeInTheDocument();
  });
});
