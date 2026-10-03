import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { TableBar } from "./TableBar";

// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" "),
  };
});

/**
 * The bar across the top of every Sites table (Anthony, 2026-09-26): the
 * list's exact total from its own footer, the download on the right, and on a
 * record's screen the table's title with the count beside it.
 */
describe("TableBar", () => {
  it("counts what the footer counts, in the table's own words", () => {
    render(<TableBar footer={{ isLoading: false, totalCount: 531 }} noun="linkingWebsites" actions={<button type="button">Download</button>} />);

    expect(screen.getByText("ui.tableBar.linkingWebsites 531")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("says nothing it cannot know while the list is on its way", () => {
    render(<TableBar footer={{ isLoading: true, totalCount: 0 }} noun="keywords" />);

    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText(/ui\.tableBar/)).not.toBeInTheDocument();
  });

  it("keeps a record table's title, with the count beside it, read out as it changes", () => {
    render(<TableBar footer={{ isLoading: false, totalCount: 12 }} noun="searches" title="Searches you both rank for" description="Their most valuable first." />);

    expect(screen.getByRole("heading", { name: "Searches you both rank for" })).toBeInTheDocument();
    expect(screen.getByText("Their most valuable first.")).toBeInTheDocument();
    expect(screen.getByText("ui.tableBar.searches 12")).toHaveAttribute("aria-live", "polite");
  });
});
