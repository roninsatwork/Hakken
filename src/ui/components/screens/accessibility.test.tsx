import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { BookOpen, Database, Settings, Trash2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { WriteButton } from "./AccessLevel";
import { CompactList } from "./CompactList";
import { ConfirmationModal } from "./ConfirmationModal";
import { CursorPaginationFooter } from "./CursorPagination";
import { DataTable } from "./DataTable";
import { DetailTabs } from "./DetailTabs";
import { Field, TextAreaField } from "./Field";
import {
  ModalField,
  ModalFormActions,
  ModalFormError,
  ModalTextAreaField,
} from "./ModalForm";
import { PageHeader, PagePrimaryAction } from "./PageHeader";
import { FeedbackPill, SaveAction, SaveError, SaveFeedback } from "./SaveControls";
import { Select } from "./Select";
import {
  FieldHint,
  FieldLabel,
  SegmentedChoice,
  SettingsCard,
  SettingSwitch,
} from "./SettingsCard";
import { InlineSearchInput, RowActions, RowIconButton } from "./Table";
import { TableFilterSelect, TableSearchInput } from "./TableControls";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/agents/agent-1"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

/**
 * The kit against axe, part by part.
 *
 * One table, one field, one modal — so one clean bill here covers every screen
 * that takes them whole, which since 2026-08-18 is all of them on the admin
 * side. A fault axe can name never has to be found one screen at a time again;
 * it is either here, once, or it is gone.
 *
 * Two of axe's rules are off, for jsdom reasons rather than product ones:
 *
 * - `color-contrast` needs a layout engine to know what colour a pixel ends up,
 *   and jsdom does not draw. Contrast is covered by the house rule instead —
 *   colour is never the only signal — which is asserted structurally below.
 * - `region` asks that page content sit inside landmarks. These are parts, not
 *   pages; the landmark is the page's job.
 */
async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });

  const said = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} — ${violation.nodes
        .map((node) => node.html)
        .join(", ")}`
  );
  expect(said).toEqual([]);
}

type Row = { id: string; name: string; role: string };
const rows: Row[] = [
  { id: "row_1", name: "Amara Okafor", role: "Reception" },
  { id: "row_2", name: "Jonas Weber", role: "Manager" },
];

const columns = [
  { key: "name", header: "Name", cell: (row: Row) => row.name },
  { key: "role", header: "Role", cell: (row: Row) => row.role },
  {
    key: "actions",
    header: " ",
    align: "right" as const,
    cell: (row: Row) => (
      <RowActions>
        <RowIconButton label={`Remove ${row.name}`} tone="danger" onClick={() => {}}>
          <Trash2 className="h-4 w-4" />
        </RowIconButton>
      </RowActions>
    ),
  },
];

describe("the kit passes axe", () => {
  it("the table, full: search, filters, rows, row buttons, numbered footer", async () => {
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody here yet" }}
        search={{ value: "", onChange: () => {}, placeholder: "Search the team" }}
        filters={
          <Select value="ALL" onChange={() => {}} aria-label="Filter by role">
            <option value="ALL">Every role</option>
          </Select>
        }
        columns={columns}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 3,
          totalCount: 41,
          pageSize: 15,
          isLoading: false,
          onPageChange: () => {},
        }}
      />
    );
    await expectNoViolations(container);
  });

  it("the table, loading", async () => {
    const { container } = render(
      <DataTable rows={undefined} rowKey={(row: Row) => row.id} columns={columns} empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody here yet" }} />
    );
    await expectNoViolations(container);
  });

  it("the table, empty", async () => {
    const { container } = render(
      <DataTable
        rows={[]}
        rowKey={(row: Row) => row.id}
        columns={columns}
        empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody here yet" }}
      />
    );
    await expectNoViolations(container);
  });

  it("the table, load-more footer", async () => {
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody here yet" }}
        footer={{
          mode: "loadMore",
          visibleCount: 2,
          canLoadMore: true,
          isLoading: false,
          onLoadMore: () => {},
        }}
      />
    );
    await expectNoViolations(container);
  });

  it("the table, cursor footer", async () => {
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        empty={{ icon: <BookOpen className="w-5 h-5" />, label: "Nobody here yet" }}
        footer={{
          mode: "cursor",
          page: 2,
          visibleCount: 2,
          canGoBack: true,
          canGoForward: false,
          isLoading: false,
          onStep: () => {},
        }}
      />
    );
    await expectNoViolations(container);
  });

  it("the fields, with hints and an error showing", async () => {
    const { container } = render(
      <form>
        <Field label="Company name" hint="As it appears on invoices" value="" onChange={() => {}} />
        <Field label="Contact email" error="This does not look like an email address" value="not-an-email" onChange={() => {}} />
        <TextAreaField label="Notes" value="" onChange={() => {}} />
      </form>
    );
    await expectNoViolations(container);
  });

  it("the modal form parts", async () => {
    const { container } = render(
      <form>
        <ModalField label="Name" hint="Required" value="" onChange={() => {}} />
        <ModalTextAreaField label="Description" value="" onChange={() => {}} />
        <ModalFormError>Something did not save</ModalFormError>
        <ModalFormActions cancelLabel="Cancel" submitLabel="Save" isSubmitting={false} onCancel={() => {}} />
      </form>
    );
    await expectNoViolations(container);
  });

  it("the confirmation modal, open, with a warning", async () => {
    const { baseElement } = render(
      <ConfirmationModal
        isOpen
        onClose={() => {}}
        title="Remove this person"
        cancelLabel="Cancel"
        confirmLabel="Remove"
        isSubmitting={false}
        onConfirm={() => {}}
        warning={{ title: "This cannot be undone", description: "Their sign-in stops working immediately." }}
      >
        <p>They will lose access to this workspace.</p>
      </ConfirmationModal>
    );
    await expectNoViolations(baseElement as HTMLElement);
  });

  it("the page header with its action", async () => {
    const { container } = render(
      <PageHeader
        icon={<Database className="w-6 h-6" />}
        title="Companies"
        description="Every company on the platform"
        action={<PagePrimaryAction icon={<Settings className="w-4 h-4" />}>Add a company</PagePrimaryAction>}
      />
    );
    await expectNoViolations(container);
  });

  it("the detail tabs", async () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
    const { container } = render(
      <DetailTabs
        rootHref="/admin/agents/agent-1"
        tabs={[
          { label: "Dashboard", href: "/admin/agents/agent-1", icon: Database },
          { label: "Settings", href: "/admin/agents/agent-1/settings", icon: Settings },
        ]}
      />
    );
    await expectNoViolations(container);
  });

  it("the compact list", async () => {
    const { container } = render(
      <CompactList
        rows={rows}
        rowKey={(row) => row.id}
        empty="Nothing here"
        columns={[
          { key: "name", header: "Name", cell: (row: Row) => row.name },
          { key: "role", header: "Role", cell: (row: Row) => row.role },
        ]}
      />
    );
    await expectNoViolations(container);
  });

  it("the settings card and its controls", async () => {
    const { container } = render(
      <SettingsCard title="Voice">
        <FieldLabel htmlFor="greeting">Greeting</FieldLabel>
        <input id="greeting" value="" onChange={() => {}} />
        <FieldHint>Said once when a call starts</FieldHint>
        <SegmentedChoice
          label="Tone"
          value="warm"
          options={[
            { value: "warm", label: "Warm" },
            { value: "neutral", label: "Neutral" },
            { value: "brisk", label: "Brisk" },
          ]}
          onChange={() => {}}
        />
        <SettingSwitch
          label="Answer out of hours"
          description="Calls outside opening times still get picked up."
          checked
          onChange={() => {}}
        />
      </SettingsCard>
    );
    await expectNoViolations(container);
  });

  it("the table controls and inline search", async () => {
    const { container } = render(
      <div>
        <TableSearchInput value="" onChange={() => {}} placeholder="Search calls" clearLabel="Clear search" />
        <TableFilterSelect
          label="Company"
          options={["Comax", "Ronins"]}
          value={null}
          onChange={() => {}}
          allLabel="All companies"
          filterPlaceholder="Type to filter"
          noMatchesLabel="No companies match"
        />
        <InlineSearchInput value="" onChange={() => {}} placeholder="Find a page" aria-label="Find a page" />
      </div>
    );
    await expectNoViolations(container);
  });

  it("the save controls in every state", async () => {
    const { container } = render(
      <div>
        <SaveAction label="Save changes" savingLabel="Saving…" isSaving={false} />
        <SaveError>The server said no</SaveError>
        <SaveFeedback
          status="success"
          successTitle="Saved"
          successMessage="Your changes are live."
          errorTitle="Not saved"
          errorMessage="Try again."
        />
        <FeedbackPill tone="success">Saved</FeedbackPill>
        <WriteButton onClick={() => {}}>Approve</WriteButton>
      </div>
    );
    await expectNoViolations(container);
  });

  it("the older cursor footer, until its two callers move over", async () => {
    const { container } = render(
      <CursorPaginationFooter
        pageIndex={1}
        rowsOnPage={15}
        isDone={false}
        isLoading={false}
        onPrevious={() => {}}
        onNext={() => {}}
        labels={{ page: (page) => `Page ${page}`, showing: (count) => `${count} rows` }}
      />
    );
    await expectNoViolations(container);
  });

  // The proof the harness works: hand axe the exact fault this kit exists to
  // prevent and it must say so. If this test ever passes with the assertion
  // inverted, the twelve above are asserting nothing.
  it("catches a deliberately unlabelled field, so a clean bill means something", async () => {
    const { container } = render(<input type="text" />);

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });

    expect(results.violations.map((violation) => violation.id)).toContain("label");
  });
});
