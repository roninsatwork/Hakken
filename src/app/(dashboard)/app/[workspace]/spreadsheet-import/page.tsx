"use client";

import { Suspense, useState } from "react";
import { useQuery } from "convex/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Table2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { api } from "@/convex/_generated/api";
import {
  CursorPaginationFooter,
  useCursorPagination,
} from "../_components/CursorPagination";
import { TableFilterSelect, TableSearchInput } from "../_components/TableControls";

/**
 * The four imported worksheets, behind one screen with a secondary tab bar.
 *
 * One tab per source worksheet and one column per source column: what the
 * spreadsheet holds is what the table shows, in the same order, with nothing
 * merged into a shared cell. The sales table leads with the source row number
 * and reads in file order, so a line here can be found in the spreadsheet —
 * sorting by value instead meant nothing on screen could be matched against
 * the file. It is consequently wider than the viewport and scrolls sideways,
 * which is the honest trade for not hiding fields.
 *
 * Each tab is its own paginated query and only the visible one runs, so
 * opening this page costs one page of one table rather than four. Nothing is
 * filtered or sorted in the browser.
 */

const PAGE_SIZE = 25;

const TABS = ["sales", "categories", "interest", "frequency"] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return value !== null && TABS.includes(value as Tab);
}

/**
 * `useSearchParams` forces this subtree out of static rendering, and Next
 * requires the boundary to be explicit rather than inferred.
 */
export default function SalesDataPage() {
  return (
    <Suspense fallback={<Header />}>
      <SalesDataTables />
    </Suspense>
  );
}

function SalesDataTables() {
  const t = useTranslations("salesData");
  const router = useRouter();
  const searchParams = useSearchParams();
  // The workspace segment is whatever the user arrived on, so the tab links
  // stay on the same URL rather than rewriting it to a canonical spelling
  // mid-session. The layout has already checked it names this workspace.
  const params = useParams<{ workspace: string }>();
  const workspace = params?.workspace ?? "";

  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(requestedTab) ? requestedTab : "sales");

  const overview = useQuery(api.salesData.getSectionOverview);

  // Search and the filters narrow a server query, so they are arguments to it
  // rather than state the table reads. They also belong to the table being
  // looked at: switching tabs clears them, because carrying "brackets" from
  // the sales rows onto the frequency table filters a set of columns that
  // never held it and reads as an empty table.
  const [search, setSearch] = useState("");
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [productCategory, setProductCategory] = useState<string | null>(null);
  const [productType, setProductType] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);

  // Customer type is shared by the sales, categories and interest tabs rather
  // than held three times: the selection is cleared on every tab change, so
  // there is never a second tab's value to preserve.
  const clearFilters = () => {
    setCustomerType(null);
    setAccountName(null);
    setGroupName(null);
    setProductCategory(null);
    setProductType(null);
    setFrequency(null);
  };

  // A cursor belongs to one query against one dataset. Carrying one across a
  // tab change, a new import, or a change of search or filter asks the server
  // to resume from a position that no longer exists — page 4 of the unfiltered
  // rows is not page 4 of the filtered ones. Keying the pagination drops the
  // position in the same render the query changes, rather than an effect
  // afterwards: the effect ran too late to stop that render's query going out
  // with the previous table's cursor. The queries also recover server-side,
  // but not going wrong in the first place is better than being rescued.
  const currentImportId = overview?.currentImport?._id ?? null;
  const pagination = useCursorPagination(
    JSON.stringify([
      tab,
      currentImportId,
      search,
      customerType,
      accountName,
      groupName,
      productCategory,
      productType,
      frequency,
    ])
  );

  const selectTab = (next: Tab) => {
    setTab(next);
    setSearch("");
    clearFilters();
    router.replace(`/app/${workspace}/spreadsheet-import?tab=${next}`, { scroll: false });
  };

  const paginationOpts = { numItems: PAGE_SIZE, cursor: pagination.cursor };

  // Omitted rather than sent empty: the arguments are part of a query's
  // identity to Convex, and `{ search: "" }` is a different subscription from
  // one with no search at all, for the same rows.
  const searchArg = search ? { search } : {};

  // One options query per screen, not per table: only the visible tab's
  // dropdowns are ever filled, so the other worksheets are never scanned.
  const salesOptions = useQuery(
    api.salesData.listSalesFilterOptions,
    tab === "sales" ? {} : "skip"
  );
  const tableOptions = useQuery(
    api.salesData.listTableFilterOptions,
    tab === "sales" ? "skip" : { table: tab }
  );

  const sales = useQuery(
    api.salesData.listSalesRows,
    tab === "sales"
      ? {
          paginationOpts,
          ...searchArg,
          ...(customerType ? { customerType } : {}),
          ...(accountName ? { accountName } : {}),
          ...(groupName ? { groupName } : {}),
        }
      : "skip"
  );
  const categories = useQuery(
    api.salesData.listCategoryLinks,
    tab === "categories"
      ? { paginationOpts, ...searchArg, ...(customerType ? { customerType } : {}) }
      : "skip"
  );
  const interest = useQuery(
    api.salesData.listAreasOfInterest,
    tab === "interest"
      ? { paginationOpts, ...searchArg, ...(customerType ? { customerType } : {}) }
      : "skip"
  );
  const frequencies = useQuery(
    api.salesData.listFrequencies,
    tab === "frequency"
      ? {
          paginationOpts,
          ...searchArg,
          ...(productCategory ? { productCategory } : {}),
          ...(productType ? { productType } : {}),
          ...(frequency ? { frequency } : {}),
        }
      : "skip"
  );

  const result =
    tab === "sales"
      ? sales
      : tab === "categories"
        ? categories
        : tab === "interest"
          ? interest
          : frequencies;

  const isLoading = result === undefined;
  const periodLabels = overview?.currentImport?.periodLabels ?? [];

  // An empty table has two quite different causes, and saying "no data" to
  // someone who has just typed into the search box sends them to the importer
  // to fix a file that is fine.
  const hasFilters = Boolean(
    customerType || accountName || groupName || productCategory || productType || frequency
  );
  const isNarrowed = Boolean(search) || hasFilters;

  // Row number, nine text columns, one per period, then quantity and total.
  const columnCount = tab === "sales" ? 12 + periodLabels.length : 3;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Table2 className="w-6 h-6 text-brand" />
              {t("tablesTitle")}
            </h1>
            <p className="text-[13px] text-secondary mt-1">
              {overview?.currentImport
                ? t("tablesSubtitle", {
                    fileName: overview.currentImport.fileName,
                    rows: overview.currentImport.salesRowCount.toLocaleString(),
                  })
                : t("tablesSubtitleEmpty")}
            </p>
          </div>
        </div>

        {/* Secondary tabs — one per source worksheet */}
        <div className="flex items-center gap-1 p-1 bg-sidebar/40 border border-border-dim rounded-[12px] backdrop-blur-xl self-start flex-wrap">
          {TABS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => selectTab(candidate)}
              className={
                candidate === tab
                  ? "px-4 py-1.5 rounded-[9px] text-[13px] font-medium bg-foreground/10 border border-border-dim text-foreground"
                  : "px-4 py-1.5 rounded-[9px] text-[13px] text-secondary hover:text-foreground transition-colors"
              }
            >
              {t(`tab.${candidate}`)}
            </button>
          ))}
        </div>

        {/* Search always; the three dropdowns only where there is something
            to narrow by, which is the sales rows. */}
        {/* `relative z-30` rather than a z-index on the dropdown alone: the
            table card below sets `backdrop-blur`, which makes it a stacking
            context of its own, and a later sibling with one paints over an
            earlier sibling's absolutely positioned child however high that
            child's own z-index is. The control bar has to out-rank the card. */}
        <div className="relative z-30 flex flex-wrap items-center gap-3 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t(`searchPlaceholder.${tab}`)}
            clearLabel={t("clearSearch")}
          />

          {tab === "sales" && (
            <>
              <TableFilterSelect
                label={t("filter.customerType")}
                options={salesOptions?.customerTypes ?? []}
                value={customerType}
                onChange={setCustomerType}
                allLabel={t("filter.all")}
                filterPlaceholder={t("filter.narrow")}
                noMatchesLabel={t("filter.noMatches")}
              />
              <TableFilterSelect
                label={t("filter.account")}
                options={salesOptions?.accountNames ?? []}
                value={accountName}
                onChange={setAccountName}
                allLabel={t("filter.all")}
                filterPlaceholder={t("filter.narrow")}
                noMatchesLabel={t("filter.noMatches")}
              />
              <TableFilterSelect
                label={t("filter.group")}
                options={salesOptions?.groupNames ?? []}
                value={groupName}
                onChange={setGroupName}
                allLabel={t("filter.all")}
                filterPlaceholder={t("filter.narrow")}
                noMatchesLabel={t("filter.noMatches")}
              />
            </>
          )}

          {(tab === "categories" || tab === "interest") && (
            <TableFilterSelect
              label={t("filter.customerType")}
              options={tableOptions?.customerTypes ?? []}
              value={customerType}
              onChange={setCustomerType}
              allLabel={t("filter.all")}
              filterPlaceholder={t("filter.narrow")}
              noMatchesLabel={t("filter.noMatches")}
            />
          )}

          {tab === "frequency" && (
            <>
              <TableFilterSelect
                label={t("filter.productCategory")}
                options={tableOptions?.productCategories ?? []}
                value={productCategory}
                onChange={setProductCategory}
                allLabel={t("filter.all")}
                filterPlaceholder={t("filter.narrow")}
                noMatchesLabel={t("filter.noMatches")}
              />
              <TableFilterSelect
                label={t("filter.productType")}
                options={tableOptions?.productTypes ?? []}
                value={productType}
                onChange={setProductType}
                allLabel={t("filter.all")}
                filterPlaceholder={t("filter.narrow")}
                noMatchesLabel={t("filter.noMatches")}
              />
              <TableFilterSelect
                label={t("filter.frequency")}
                options={tableOptions?.frequencies ?? []}
                value={frequency}
                onChange={setFrequency}
                allLabel={t("filter.all")}
                filterPlaceholder={t("filter.narrow")}
                noMatchesLabel={t("filter.noMatches")}
              />
            </>
          )}

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 text-[13px] text-secondary hover:text-foreground transition-colors"
            >
              {t("filter.clear")}
            </button>
          )}
        </div>

        <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                  {tab === "sales" && (
                    <>
                      <Th>{t("column.sourceRow")}</Th>
                      <Th>{t("column.parentAccount")}</Th>
                      <Th>{t("column.group")}</Th>
                      <Th>{t("column.account")}</Th>
                      <Th>{t("column.customerType")}</Th>
                      <Th>{t("column.productCode")}</Th>
                      <Th>{t("column.uniqueId")}</Th>
                      <Th>{t("column.productDescription")}</Th>
                      <Th>{t("column.category")}</Th>
                      <Th>{t("column.productType")}</Th>
                      {periodLabels.map((label) => (
                        <Th key={label} align="right">
                          {label}
                        </Th>
                      ))}
                      <Th align="right">{t("column.quantity")}</Th>
                      <Th align="right">{t("column.total")}</Th>
                    </>
                  )}
                  {tab === "categories" && (
                    <>
                      <Th>{t("column.customerType")}</Th>
                      <Th>{t("column.category")}</Th>
                    </>
                  )}
                  {tab === "interest" && (
                    <>
                      <Th>{t("column.customerType")}</Th>
                      <Th>{t("column.productType")}</Th>
                    </>
                  )}
                  {tab === "frequency" && (
                    <>
                      <Th>{t("column.category")}</Th>
                      <Th>{t("column.productType")}</Th>
                      <Th>{t("column.frequency")}</Th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={columnCount} className="px-6 py-6 text-[13px] text-secondary">
                      {t("loading")}
                    </td>
                  </tr>
                ) : result.page.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="p-0 border-none">
                      <SonaeEmptyState
                        title={isNarrowed ? t("emptyTitleNarrowed") : t("emptyTitle")}
                        description={
                          isNarrowed
                            ? t("emptyDescriptionNarrowed")
                            : overview?.currentImport
                              ? t("emptyDescriptionImported")
                              : t("emptyDescriptionNoImport")
                        }
                      />
                    </td>
                  </tr>
                ) : tab === "sales" ? (
                  sales?.page.map((row) => (
                    <Tr key={row._id}>
                      <Td numeric>{row.sourceRow ?? "—"}</Td>
                      <Td>{row.parentAccount}</Td>
                      <Td>{row.groupName}</Td>
                      <Td strong>{row.accountName}</Td>
                      <Td>{row.customerType}</Td>
                      <Td>{row.productCode}</Td>
                      <Td>{row.uniqueId}</Td>
                      <Td strong>{row.productDescription}</Td>
                      <Td>{row.productCategory}</Td>
                      <Td>{row.productType}</Td>
                      {periodLabels.map((label, index) => (
                        <Td key={label} align="right" numeric>
                          {formatMoney(
                            [row.period1, row.period2, row.period3, row.period4, row.period5, row.period6][index]
                          )}
                        </Td>
                      ))}
                      <Td align="right" numeric>
                        {row.quantity ?? "—"}
                      </Td>
                      <Td align="right" numeric strong>
                        {formatMoney(row.totalRevenue)}
                      </Td>
                    </Tr>
                  ))
                ) : tab === "categories" ? (
                  categories?.page.map((row) => (
                    <Tr key={row._id}>
                      <Td strong>{row.customerType}</Td>
                      <Td>{row.category}</Td>
                    </Tr>
                  ))
                ) : tab === "interest" ? (
                  interest?.page.map((row) => (
                    <Tr key={row._id}>
                      <Td strong>{row.customerType}</Td>
                      <Td>{row.productType}</Td>
                    </Tr>
                  ))
                ) : (
                  frequencies?.page.map((row) => (
                    <Tr key={row._id}>
                      <Td strong>{row.productCategory}</Td>
                      <Td>{row.productType}</Td>
                      <Td>{row.frequency}</Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <CursorPaginationFooter
            pageIndex={pagination.pageIndex}
            rowsOnPage={result?.page.length ?? 0}
            isDone={result?.isDone ?? true}
            isLoading={isLoading}
            onPrevious={pagination.previous}
            onNext={() => {
              if (result && !result.isDone) pagination.next(result.continueCursor);
            }}
            labels={{
              page: (page) => t("pageNumber", { page }),
              showing: (count) => t("rowsShown", { count }),
            }}
          />
        </div>
      </div>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 font-medium whitespace-nowrap ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Tr({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-border-dim/50 hover:bg-foreground/[0.02]">{children}</tr>
  );
}

function Td({
  children,
  align = "left",
  numeric = false,
  strong = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  numeric?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={[
        "px-4 py-2.5 text-[13px] whitespace-nowrap",
        strong ? "text-foreground" : "text-secondary",
        align === "right" ? "text-right" : "",
        numeric ? "tabular-nums" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

/**
 * A blank month reads as a dash, not £0.00 — the source distinguishes them.
 *
 * Sterling because the figures are sterling: the currency belongs to the
 * imported file, not to the deployment, and the platform's own money fields
 * (`plans.priceGBP`) make the same assumption.
 */
function formatMoney(value: number | undefined) {
  if (value === undefined) return "—";
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  });
}
