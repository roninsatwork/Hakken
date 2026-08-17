import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { RetentionRulesSection } from "./RetentionRulesSection";

/**
 * Not on the shared table floor, and deliberately.
 *
 * The floor asks a screen to show a spinner while its rows are on the way and
 * an empty state when the answer is nothing. Neither applies here: the rows are
 * the fixed list of retention pipelines the product ships with, so there is
 * never a moment with no rows and never a query to wait for. What can be empty
 * is the *filtered* view, and that is what is asserted instead.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());

describe("RetentionRulesSection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // An answered config query is what takes the table past its spinner; the
    // rules themselves are a constant, so an empty config still lists them all.
    const { useQuery } = await import("convex/react");
    const { getFunctionName } = await import("convex/server");
    vi.mocked(useQuery).mockImplementation((...args) =>
      getFunctionName(args[0]) === "purges:getRunningPurges" ? [] : {});
  });

  it("lists the retention rules the product ships with", () => {
    const { container } = render(<RetentionRulesSection />);

    const tables = container.querySelectorAll("table");
    expect(tables).toHaveLength(1);
    expect(tables[0].querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  });

  it("uses the house row and cell measurements", () => {
    const { container } = render(<RetentionRulesSection />);

    const row = container.querySelector("tbody tr");
    expect(row).toHaveClass("border-border-dim/50");
    expect(row?.querySelector("td")).toHaveClass("px-4", "py-3");
  });

  it("says so when the search narrows every rule away", () => {
    const { container } = render(<RetentionRulesSection />);

    fireEvent.change(screen.getByPlaceholderText("admin.settings.purges.table.searchPlaceholder"), {
      target: { value: "zzzz-matches-nothing" },
    });

    expect(screen.getAllByText("admin.settings.purges.table.noMatches").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });
});
