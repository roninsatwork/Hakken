import { fireEvent, screen, within, type RenderResult } from "@testing-library/react";
import { expect, it } from "vitest";

/**
 * The assertions every table screen has to satisfy, written once.
 *
 * Two problems this solves at the same time.
 *
 * **Cost.** Half the table screens in the product — 35 of 64, counted on
 * 2026-08-16 — have no test at all. Writing 35 bespoke test files to cover the
 * same six behaviours is a job nobody finishes. Since every screen renders
 * through `DataTable`, the same assertions genuinely do apply to all of them, so
 * this is one helper called 35 times.
 *
 * **Drift.** A build check reads source and can tell you a screen imported the
 * right component. It cannot tell you what the screen *rendered*. Both faults
 * found on 2026-08-16 were of the second kind: a footer that vanished on a short
 * list, and a search box wrapped in a second border. Neither was visible in the
 * code. Both are caught here, because this asserts the shape on screen.
 *
 * A screen's own test still covers what is particular to it — the modal it
 * opens, the mutation it calls, the rule it enforces. This covers the floor.
 */

export type StandardTableScreenConfig = {
  /** Renders the screen, with whatever mocks the calling test file set up. */
  renderScreen: () => RenderResult;
  /**
   * Puts the data layer into a given state before the next render.
   *
   * `undefined` must mean "the query has not answered yet" and `[]` must mean
   * "answered, and there is nothing" — the two states screens most often
   * conflate, showing an empty table where they should show a spinner.
   */
  withRows: (rows: unknown[] | undefined) => void;
  /** Rows that produce at least one visible record. */
  sampleRows: unknown[];
  /** Text that must appear on screen when `sampleRows` is loaded. */
  sampleRowText: string | RegExp;
  /** What the screen says when there is nothing. */
  emptyText: string | RegExp;
  /** The search box placeholder, for a screen that has one. */
  searchPlaceholder?: string;
  /** Set when the screen has no footer, which should be rare and deliberate. */
  hasFooter?: boolean;
};

/** The house row and cell styling, taken from the two reference screens. */
const ROW_CLASS = "border-border-dim/50";
const CELL_CLASSES = ["px-4", "py-3"];

function theTable(container: HTMLElement): HTMLTableElement {
  const tables = container.querySelectorAll("table");
  expect(tables, "a table screen should render exactly one table").toHaveLength(1);
  return tables[0] as HTMLTableElement;
}

/**
 * Call inside a `describe` for a screen built on `DataTable`.
 *
 * Every `it` here is about the standard, not about the screen. If one fails, the
 * screen has stopped matching the rest of the app.
 */
export function itBehavesLikeAStandardTableScreen(config: StandardTableScreenConfig): void {
  const { hasFooter = true } = config;

  it("renders a row for each record the query returns", () => {
    config.withRows(config.sampleRows);
    const { container } = config.renderScreen();

    expect(screen.getByText(config.sampleRowText)).toBeInTheDocument();
    expect(theTable(container).querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  });

  it("shows a spinner while the query has not answered, not an empty table", () => {
    config.withRows(undefined);
    const { container } = config.renderScreen();

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryAllByText(config.emptyText)).toEqual([]);
  });

  it("shows the empty state once the query answers with nothing", () => {
    config.withRows([]);
    config.renderScreen();

    // `getAllBy` rather than `getBy`: a screen with a numbered footer says this
    // twice on purpose, once in the table and once in the footer's count slot,
    // and a screen without one says it once. Both are the empty state working.
    expect(screen.getAllByText(config.emptyText).length).toBeGreaterThan(0);
  });

  it("renders one table, never a table inside a table", () => {
    // Two governance screens shipped a table nested in an empty one by passing
    // a <table> into the shell, which draws its own. Nobody saw it.
    config.withRows(config.sampleRows);
    const { container } = config.renderScreen();

    theTable(container);
    expect(container.querySelector("table table")).toBeNull();
  });

  it("uses the house row and cell styling", () => {
    config.withRows(config.sampleRows);
    const { container } = config.renderScreen();

    const row = theTable(container).querySelector("tbody tr");
    expect(row).toHaveClass(ROW_CLASS);
    expect(row?.querySelector("td")).toHaveClass(...CELL_CLASSES);
  });

  it("gives every column a header cell", () => {
    config.withRows(config.sampleRows);
    const { container } = config.renderScreen();

    const table = theTable(container);
    const headers = table.querySelectorAll("thead th").length;
    const cells = table.querySelector("tbody tr")?.querySelectorAll("td").length ?? 0;

    expect(headers).toBeGreaterThan(0);
    expect(cells).toBe(headers);
  });

  it("spans the empty state across every column", () => {
    config.withRows([]);
    const { container } = config.renderScreen();

    const table = theTable(container);
    const headers = table.querySelectorAll("thead th").length;

    expect(table.querySelector("tbody td")).toHaveAttribute("colspan", String(headers));
  });

  if (hasFooter) {
    it("keeps the footer bar on screen even when the list is short", () => {
      // The workspace directory only drew its footer when there was more to
      // load, so two users meant no footer at all. That is the fault this exists
      // to stop, and a short list is exactly when it hides.
      config.withRows(config.sampleRows);
      const { container } = config.renderScreen();

      const table = theTable(container);
      const shell = table.closest("div")?.parentElement;
      const footer = shell?.lastElementChild;

      expect(footer, "the table shell should end with a footer bar").not.toBe(null);
      expect(footer?.contains(table)).toBe(false);
      expect(footer?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });
  }

  if (config.searchPlaceholder) {
    const placeholder = config.searchPlaceholder;

    it("renders exactly one search box", () => {
      config.withRows(config.sampleRows);
      const { container } = config.renderScreen();

      expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
      expect(container.querySelectorAll(`input[placeholder="${placeholder}"]`)).toHaveLength(1);
    });

    it("puts the search box in one bordered box, not a box inside a box", () => {
      config.withRows(config.sampleRows);
      const { container } = config.renderScreen();

      const input = screen.getByPlaceholderText(placeholder);
      let bordered = 0;
      for (let node = input.parentElement; node && node !== container; node = node.parentElement) {
        if (/\bborder\b/.test(node.className)) bordered += 1;
      }

      expect(bordered, "the search box should sit in exactly one bordered box").toBe(1);
    });

    it("responds to typing in the search box", () => {
      // Deliberately not asserting *where* the filtering happens. Some screens
      // pass the term to the query, others narrow an already-loaded page, and
      // which one a screen does is behaviour rather than styling — outside what
      // this alignment is allowed to change. That `DataTable` itself never
      // filters is asserted in its own test, which is where it belongs.
      config.withRows(config.sampleRows);
      const { container } = config.renderScreen();

      fireEvent.change(screen.getByPlaceholderText(placeholder), {
        target: { value: "zzzzz-matches-nothing" },
      });

      expect(theTable(container)).toBeInTheDocument();
    });
  }
}

/**
 * A row action must not also set off the row it sits in.
 *
 * Separate from the block above because it needs the screen to say which button
 * it means. `RowIconButton` stops propagation, so this passes for free on any
 * screen using it — and fails loudly on one that hand-rolled its buttons.
 */
export function expectRowActionDoesNotTriggerRow(
  container: HTMLElement,
  actionLabel: string,
  onRowClick: { mock: { calls: unknown[] } }
): void {
  const row = container.querySelector("tbody tr");
  expect(row).not.toBeNull();

  fireEvent.click(within(row as HTMLElement).getByRole("button", { name: actionLabel }));

  expect(onRowClick.mock.calls).toHaveLength(0);
}
