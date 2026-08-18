import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookOpen, Database, Settings } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { ConfirmationModal } from "./ConfirmationModal";
import { DataTable } from "./DataTable";
import { DetailLayout } from "./DetailLayout";
import { DetailTabs } from "./DetailTabs";
import { PageHeader } from "./PageHeader";
import { CursorFooter, LoadMoreFooter, PaginationFooter } from "./Table";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/agents/agent-1"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

/**
 * What "works on a phone" means for each shared part, pinned structurally.
 *
 * jsdom does not lay pages out, so these assert the arrangement that produces
 * the behaviour rather than measuring it: the class that lets a table scroll
 * sideways, the pair that stacks a footer, the fixed placement that frees the
 * tab row to scroll. Admin screens are designed at desktop width and stay that
 * way — this floor is about the parts staying *usable* when the window is
 * narrow, not about redesigning any screen for one.
 */

type Row = { id: string; name: string };
const rows: Row[] = [{ id: "row_1", name: "Amara Okafor" }];
const columns = [{ key: "name", header: "Name", cell: (row: Row) => row.name }];

const footerLabels = {} as never;

describe("the kit at phone width", () => {
  it("the table scrolls sideways instead of crushing its columns", () => {
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody yet" }}
      />
    );

    const scroller = container.querySelector(".overflow-x-auto");
    expect(scroller?.querySelector("table")?.className).toContain("min-w-");
  });

  it("the search row wraps rather than squeezing the box", () => {
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody yet" }}
        search={{ value: "", onChange: () => {}, placeholder: "Search" }}
        filters={<button type="button">Filter</button>}
      />
    );

    const box = screen.getByPlaceholderText("Search");
    const row = box.closest(".flex-wrap");
    expect(row, "the control row should be allowed to wrap").not.toBe(null);
    expect(row?.querySelector(".flex-1")?.className).toContain("min-w-");
  });

  it("all three footers stack their count above their buttons", () => {
    const { container } = render(
      <div>
        <PaginationFooter page={1} totalPages={2} totalCount={20} pageSize={15} isLoading={false} onPageChange={() => {}} labels={footerLabels} />
        <LoadMoreFooter visibleCount={15} canLoadMore isLoading={false} onLoadMore={() => {}} labels={footerLabels} />
        <CursorFooter page={1} visibleCount={15} canGoBack={false} canGoForward isLoading={false} onStep={() => {}} labels={footerLabels} />
      </div>
    );

    const bars = Array.from(container.children[0]!.children);
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.className).toContain("flex-col");
      expect(bar.className).toContain("sm:flex-row");
    }
  });

  it("the page header stacks its action under the title", () => {
    const { container } = render(
      <PageHeader title="Companies" description="Everyone on the platform" action={<button type="button">Add</button>} />
    );

    expect(container.firstElementChild?.className).toContain("flex-col");
    expect(container.firstElementChild?.className).toContain("sm:flex-row");
  });

  it("the detail header stacks its actions under the title", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    const { container } = render(
      <DetailLayout
        title="Front desk agent"
        rootHref="/admin/agents/agent-1"
        tabs={[{ label: "Dashboard", href: "/admin/agents/agent-1", icon: Database }]}
        actions={<button type="button">Save</button>}
      >
        <p>Body</p>
      </DetailLayout>
    );

    const header = container.querySelector("header");
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
  });

  it("the tab row scrolls even when a tab carries a menu", () => {
    // The row used to switch to overflow-visible whenever any tab had a menu,
    // so the menu would not be clipped — and a row that cannot scroll runs off
    // the right-hand edge of a phone with the far tabs unreachable. The menu is
    // fixed to the viewport now, so the row never has to choose.
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    const { container } = render(
      <DetailTabs
        rootHref="/admin/agents/agent-1"
        tabs={[
          { label: "Dashboard", href: "/admin/agents/agent-1", icon: Database },
          {
            label: "Settings",
            href: "/admin/agents/agent-1/settings",
            icon: Settings,
            dropdownItems: [
              { label: "Engine", href: "/admin/agents/agent-1/settings", icon: Settings },
            ],
          },
        ]}
      />
    );

    expect(container.firstElementChild?.className).toContain("overflow-x-auto");

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(screen.getByRole("menu").className).toContain("fixed");
  });

  it("the modal loosens its side padding only above phone width", () => {
    const { baseElement } = render(
      <ConfirmationModal
        isOpen
        onClose={() => {}}
        title="Remove this person"
        cancelLabel="Cancel"
        confirmLabel="Remove"
        isSubmitting={false}
        onConfirm={() => {}}
      >
        <p>They will lose access.</p>
      </ConfirmationModal>
    );

    const padded = Array.from((baseElement as HTMLElement).querySelectorAll('[class*="sm:px-10"]'));
    expect(padded.length).toBeGreaterThanOrEqual(2);
    for (const element of padded) {
      expect(element.className).toContain("px-6");
    }
  });
});
