import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/src/test/renderWithProviders";
import { LookedUpLine } from "./LookedUpLine";

/**
 * The quiet "Looked up" line under a reply (assistant-foundation-plan.md,
 * item 7, as drawn and approved 2026-10-06): plain words, each look-up a link
 * to the screen its figures came from.
 */
describe("the Looked up line", () => {
  it("names each look-up as a link to its screen, a second read of the same pages by its days", () => {
    renderWithProviders(
      <LookedUpLine
        lookups={[
          { kind: "websites", link: "/app/sites/site_1" },
          { kind: "searchConsole", website: "conterraops.com", days: 7, link: "/app/search-console/site_1" },
          { kind: "searchConsole", website: "conterraops.com", days: 30, link: "/app/search-console/site_1" },
          { kind: "aiMentions", website: "crisis24.com", link: "/app/sites/site_2/ai/mentions" },
        ]}
      />,
    );

    expect(screen.getByText("Looked up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your websites" })).toHaveAttribute("href", "/app/sites/site_1");
    expect(screen.getByRole("link", { name: "Search Console, conterraops.com, last 7 days" })).toHaveAttribute("href", "/app/search-console/site_1");
    expect(screen.getByRole("link", { name: "last 30 days" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI answers, crisis24.com" })).toHaveAttribute("href", "/app/sites/site_2/ai/mentions");
  });

  it("names a whole month read for a chart", () => {
    renderWithProviders(<LookedUpLine lookups={[{ kind: "searchConsole", website: "conterraops.com", month: "2026-09", link: "/app/search-console/site_1" }]} />);
    expect(screen.getByRole("link", { name: "Search Console, conterraops.com, September 2026" })).toBeInTheDocument();
  });

  it("says nothing for an answer that looked nothing up", () => {
    const { container } = renderWithProviders(<LookedUpLine lookups={[]} />);
    expect(container.textContent).not.toContain("Looked up");
  });
});
