"use client";

import { Suspense, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { api } from "@/convex/_generated/api";
import { CursorPaginationFooter, useCursorPagination } from "../_components/CursorPagination";
import { TableFilterSelect, TableSearchInput } from "../_components/TableControls";
import { LAYER } from "@/src/ui/lib/layers";

/**
 * The customer list.
 *
 * One row per account in the current import, in chain order then account name,
 * so a group reads as a group. Everything here is narrowed on the server: the
 * page holds twenty-five rows, and filtering those would search a window rather
 * than the workspace.
 *
 * Customers come from the spreadsheet; the contact details beside them are
 * typed in and live separately, so a row with nothing filled in is normal
 * rather than broken — it is marked, not hidden.
 */

const PAGE_SIZE = 25;

export default function CustomersPage() {
  return (
    <Suspense fallback={<Header />}>
      <CustomerList />
    </Suspense>
  );
}

function CustomerList() {
  const t = useTranslations("salesData.customers");
  const params = useParams<{ workspace: string }>();
  const workspace = params?.workspace ?? "";

  const [search, setSearch] = useState("");
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  const pagination = useCursorPagination(
    JSON.stringify([search, customerType, groupName])
  );

  const counts = useQuery(api.salesDataCustomers.countCustomers);
  const filterOptions = useQuery(api.salesDataCustomers.listCustomerFilterOptions);
  const result = useQuery(api.salesDataCustomers.listCustomers, {
    paginationOpts: { numItems: PAGE_SIZE, cursor: pagination.cursor },
    ...(search ? { search } : {}),
    ...(customerType ? { customerType } : {}),
    ...(groupName ? { groupName } : {}),
  });

  const isLoading = result === undefined;
  const hasFilters = Boolean(customerType || groupName);
  const isNarrowed = Boolean(search) || hasFilters;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            {counts
              ? t("subtitle", { total: counts.total, withDetails: counts.withDetails })
              : t("subtitleLoading")}
          </p>
        </div>

        <div className={`relative ${LAYER.PAGE_CHROME} flex flex-wrap items-center gap-3 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl`}>
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            clearLabel={t("clearSearch")}
          />
          <TableFilterSelect
            label={t("filterType")}
            options={filterOptions?.customerTypes ?? []}
            value={customerType}
            onChange={setCustomerType}
            allLabel={t("filterAll")}
            filterPlaceholder={t("filterNarrow")}
            noMatchesLabel={t("filterNoMatches")}
          />
          <TableFilterSelect
            label={t("filterGroup")}
            options={filterOptions?.groupNames ?? []}
            value={groupName}
            onChange={setGroupName}
            allLabel={t("filterAll")}
            filterPlaceholder={t("filterNarrow")}
            noMatchesLabel={t("filterNoMatches")}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setCustomerType(null);
                setGroupName(null);
              }}
              className="px-3 py-2 text-[13px] text-secondary hover:text-foreground transition-colors"
            >
              {t("filterClear")}
            </button>
          )}
        </div>

        <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead>
                <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                  <Th>{t("columnName")}</Th>
                  <Th>{t("columnCode")}</Th>
                  <Th>{t("columnGroup")}</Th>
                  <Th>{t("columnType")}</Th>
                  <Th>{t("columnLocation")}</Th>
                  <Th align="right">{t("columnSpend")}</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-[13px] text-secondary">
                      {t("loading")}
                    </td>
                  </tr>
                ) : result.page.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0 border-none">
                      <SonaeEmptyState
                        title={isNarrowed ? t("emptyNarrowedTitle") : t("emptyTitle")}
                        description={
                          isNarrowed ? t("emptyNarrowedDescription") : t("emptyDescription")
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  result.page.map((customer) => (
                    <tr
                      key={customer.accountNameKey}
                      className="border-b border-border-dim/50 hover:bg-foreground/[0.02]"
                    >
                      <Td>
                        <Link
                          href={`/app/${workspace}/customers/${encodeURIComponent(customer.accountNameKey)}`}
                          className="text-foreground hover:text-brand transition-colors"
                        >
                          {customer.accountName}
                        </Link>
                        {!customer.hasDetails && (
                          <span className="ml-2 text-[11px] text-muted">{t("noDetails")}</span>
                        )}
                      </Td>
                      <Td>{customer.accountCode || "—"}</Td>
                      <Td>{customer.groupName}</Td>
                      <Td>{customer.customerType}</Td>
                      <Td>
                        {[customer.town, customer.postcode].filter(Boolean).join(", ") || "—"}
                      </Td>
                      <Td align="right" numeric>
                        {formatMoney(customer.totalRevenue)}
                      </Td>
                    </tr>
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

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-3 font-medium whitespace-nowrap ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  numeric = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  numeric?: boolean;
}) {
  return (
    <td
      className={[
        "px-4 py-2.5 text-[13px] whitespace-nowrap text-secondary",
        align === "right" ? "text-right" : "",
        numeric ? "tabular-nums" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  });
}
