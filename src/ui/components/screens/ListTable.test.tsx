import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { ListTable } from "./ListTable";

/** A list as every redone screen draws it (docs/plans/active/campaigns-new-page-plan-2026-11-05.md, step 7): its bar, its table and its pages, all in one. */
type Row = { name: string };
const footer = { mode: "paged" as const, page: 1, totalPages: 2, totalCount: 26, pageSize: 25, isLoading: false, onPageChange: () => undefined };
const columns = [{ key: "name", header: "Campaign", cell: (row: Row) => row.name }];
const table = { rows: [{ name: "Brand" }], columns, rowKey: (row: Row) => row.name, empty: { icon: null, label: "None." }, footer };

describe("ListTable", () => {
  it("draws the bar above the table, with its count, its words and its buttons, then the rows", () => {
    render(<ListTable<Row> {...table} noun="campaigns" summary="And 4,403 with no link." actions={<button>Download CSV</button>} />);
    expect(screen.getAllByText(/26 campaigns/).length).toBeGreaterThan(0);
    expect(screen.getByText(/And 4,403 with no link\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Brand")).toBeTruthy();
  });

  it("a table among others on its page says what it is", () => {
    render(<ListTable<Row> {...table} noun="campaigns" title="All of them" description="Every campaign." />);
    expect(screen.getByText("All of them")).toBeTruthy();
    expect(screen.getByText("Every campaign.")).toBeTruthy();
  });
});
