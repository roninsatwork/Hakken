import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { ExternalUrlCell, PageLinkCell, RecordLinkCell } from "./SiteCells";

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/**
 * Keywords and page addresses cut short with "…" on one line, the whole of
 * each on hover, rather than wrapped onto a second line (Anthony, 2026-09-26).
 */
describe("the Sites cells that cut words short", () => {
  it("cuts a keyword short, and keeps the whole of it for the pointer", () => {
    render(<RecordLinkCell cut href="/k">brand identity prism kapferer</RecordLinkCell>);

    const link = screen.getByRole("link", { name: "brand identity prism kapferer" });
    expect(link).toHaveClass("block", "truncate");
    expect(link).toHaveAttribute("title", "brand identity prism kapferer");
  });

  it("leaves a link that is not cut as it was", () => {
    render(<RecordLinkCell href="/k">ronins</RecordLinkCell>);

    const link = screen.getByRole("link", { name: "ronins" });
    expect(link).not.toHaveClass("truncate");
    expect(link).not.toHaveAttribute("title");
  });

  it("cuts a page and the page it was on, one line each", () => {
    render(<PageLinkCell href="/p" page="/hub/kapferer-brand-identity-prism/" was="/hub/old-address/" />);

    expect(screen.getByRole("link", { name: "/hub/kapferer-brand-identity-prism/" })).toHaveClass("truncate");
    expect(screen.getByText("sites.keywords.wasPage")).toHaveClass("truncate");
  });

  it("cuts a web address short when asked", () => {
    render(<ExternalUrlCell cut url="https://medium.com/@ronins/sustainable-web-design-building-for-the-future" />);

    const link = screen.getByRole("link");
    expect(link).toHaveClass("truncate");
    expect(link).not.toHaveClass("break-all");
    expect(link).toHaveAttribute("title", "https://medium.com/@ronins/sustainable-web-design-building-for-the-future");
  });
});
