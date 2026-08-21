import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import {
  CursorFooter,
  PaginationFooter,
  RowActions,
  RowIconButton,
  InlineSearchInput,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "./Table";

describe("PaginationFooter", () => {
  it("clamps stale page values after result counts change", () => {
    const onPageChange = vi.fn();

    render(
      <PaginationFooter
        page={5}
        totalPages={2}
        totalCount={20}
        pageSize={15}
        isLoading={false}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Showing 16-20 of 20")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Previous"));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});

describe("CursorFooter", () => {
  const base = {
    page: 2,
    visibleCount: 15,
    canGoBack: true,
    canGoForward: true,
    isLoading: false,
    onStep: vi.fn(),
  };

  it("says which page it is on, since there is no last page to count towards", () => {
    render(<CursorFooter {...base} />);

    expect(screen.getByText("Showing 15 · page 2")).toBeInTheDocument();
  });

  // The hand-drawn footer this replaced said "Loading jobs…" here, under a table
  // that was already showing a spinner.
  it("says nothing at all while the query is still out", () => {
    render(<CursorFooter {...base} visibleCount={0} isLoading />);

    expect(screen.queryByText("No entries found")).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("says the list is empty once the query answers with nothing", () => {
    render(<CursorFooter {...base} visibleCount={0} labels={{ empty: "No jobs to show" }} />);

    expect(screen.getByText("No jobs to show")).toBeInTheDocument();
  });

  it("steps back and forward", () => {
    const onStep = vi.fn();
    render(<CursorFooter {...base} onStep={onStep} />);

    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));

    expect(onStep).toHaveBeenNthCalledWith(1, "back");
    expect(onStep).toHaveBeenNthCalledWith(2, "forward");
  });

  it("will not step past either end, or while the query is out", () => {
    const { rerender } = render(<CursorFooter {...base} canGoBack={false} canGoForward={false} />);
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();

    rerender(<CursorFooter {...base} isLoading />);
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });
});

describe("SearchBar", () => {
  it("emits search changes through the shared callback", () => {
    const onChange = vi.fn();

    render(<SearchBar value="" onChange={onChange} placeholder="Search records" />);

    fireEvent.change(screen.getByPlaceholderText("Search records"), { target: { value: "acme" } });

    expect(onChange).toHaveBeenCalledWith("acme");
  });

  /**
   * Found on the plans screen and the wiki on 2026-08-17, and it was the same
   * box both times, because it is this one. The icon beside it is a picture and
   * the placeholder goes as soon as anyone types, so without a name the search
   * box on every screen built from this bar announced itself as nothing.
   */
  it("names the search box, so it is not announced as an unlabelled input", () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Search records" />);

    expect(screen.getByLabelText("Search records")).toBe(screen.getByPlaceholderText("Search records"));
  });
});

/**
 * The one arrangement the kit could not say. `SearchBar` draws its own card,
 * which is right above a table and wrong inside a palette, a picker's dropdown
 * or a panel that already has a border — four screens hand-wrote a borderless
 * input rather than put a box inside a box, and were the last that could not
 * move onto the kit at all.
 */
describe("InlineSearchInput", () => {
  it("emits search changes through the shared callback", () => {
    const onChange = vi.fn();

    render(<InlineSearchInput value="" onChange={onChange} placeholder="Search workflows" />);

    fireEvent.change(screen.getByPlaceholderText("Search workflows"), { target: { value: "nightly" } });

    expect(onChange).toHaveBeenCalledWith("nightly");
  });

  it("names the box, since the icon is a picture and the placeholder goes when typing starts", () => {
    render(<InlineSearchInput value="" onChange={vi.fn()} placeholder="Search workflows" />);

    expect(screen.getByLabelText("Search workflows")).toBe(screen.getByPlaceholderText("Search workflows"));
  });

  /**
   * The whole point: it must not draw a border of its own, or the screens that
   * needed it end up with the box-in-a-box they were avoiding.
   */
  it("draws no card of its own, so it can sit inside someone else's border", () => {
    render(<InlineSearchInput value="" onChange={vi.fn()} placeholder="Search workflows" />);

    const box = screen.getByPlaceholderText("Search workflows");
    expect(box.className).toContain("border-none");
    expect(box.className).toContain("bg-transparent");
  });
});

describe("Admin table rows", () => {
  it("renders shared loading and empty states inside a table", () => {
    render(
      <table>
        <tbody>
          <TableLoadingRow colSpan={3} />
          <TableEmptyRow colSpan={3} icon={<span aria-hidden="true">Icon</span>} label="Nothing here" />
        </tbody>
      </table>
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders shared header cells with alignment", () => {
    render(
      <table>
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell align="right">Actions</TableHeaderCell>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toHaveClass("text-right");
  });

  /**
   * The variant is the reason six detail-page tables could come onto the kit
   * without changing on screen. The test that matters is that a cell takes its
   * look from its row: passing the variant per cell was the alternative, and a
   * header whose cells disagree with their row is a near-miss nobody catches.
   */
  it("gives the filled header strip to a row that asks for it, and to its cells", () => {
    const { container } = render(
      <table>
        <thead>
          <TableHeaderRow variant="strip">
            <TableHeaderCell>Device</TableHeaderCell>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(container.querySelector("tr")).toHaveClass("bg-sidebar/20");
    expect(screen.getByText("Device")).toHaveClass("px-5", "tracking-widest");
  });

  it("draws no card at all when asked for a bare shell", () => {
    // The option five screens were missing: a table already inside a panel.
    // If this starts drawing a border again, those screens get a card in a card.
    const { container } = render(
      <TableShell variant="bare">
        <tbody />
      </TableShell>
    );

    const shell = container.firstElementChild;
    expect(shell?.className).not.toMatch(/border|rounded/);
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("keeps the card on the default shell", () => {
    const { container } = render(
      <TableShell>
        <tbody />
      </TableShell>
    );

    expect(container.firstElementChild).toHaveClass("border", "rounded-[16px]");
  });

  it("leaves a row that asks for nothing on the plain header", () => {
    const { container } = render(
      <table>
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>Device</TableHeaderCell>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(container.querySelector("tr")).not.toHaveClass("bg-sidebar/20");
    expect(screen.getByText("Device")).toHaveClass("px-4");
  });

  it("renders shared row action buttons and stops row click propagation", () => {
    const onRowClick = vi.fn();
    const onActionClick = vi.fn();

    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <RowActions>
                <RowIconButton label="Delete item" tone="danger" onClick={onActionClick}>
                  X
                </RowIconButton>
              </RowActions>
            </td>
          </tr>
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));

    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
