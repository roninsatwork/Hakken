"use client";

import { Suspense, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Users } from "lucide-react";
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
  const [missingDetailsOnly, setMissingDetailsOnly] = useState(false);
  const [record, setRecord] = useState<"CUSTOMERS" | "PROSPECTS" | "ALL">("CUSTOMERS");

  const pagination = useCursorPagination(
    JSON.stringify([search, customerType, groupName, missingDetailsOnly, record])
  );

  const counts = useQuery(api.salesDataCustomers.countCustomers);
  const filterOptions = useQuery(api.salesDataCustomers.listCustomerFilterOptions);
  const result = useQuery(api.salesDataCustomers.listCustomers, {
    paginationOpts: { numItems: PAGE_SIZE, cursor: pagination.cursor },
    ...(search ? { search } : {}),
    ...(customerType ? { customerType } : {}),
    ...(groupName ? { groupName } : {}),
    ...(missingDetailsOnly ? { missingDetailsOnly } : {}),
    record,
  });

  const isLoading = result === undefined;
  const hasFilters = Boolean(customerType || groupName || missingDetailsOnly)
    || record !== "CUSTOMERS";
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
              ? [
                  t("subtitle", { total: counts.total, withDetails: counts.withDetails }),
                  counts.prospects > 0 ? t("subtitleProspects", { count: counts.prospects }) : "",
                ]
                  .filter(Boolean)
                  .join(" ")
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
          <div className="flex items-center rounded-[12px] border border-border-dim overflow-hidden">
            {(["CUSTOMERS", "PROSPECTS", "ALL"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRecord(option)}
                className={`px-3 py-2 text-[13px] transition-colors ${
                  record === option
                    ? "bg-brand/10 text-brand"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {t(`filterRecord${option}`)}
                {option === "PROSPECTS" && counts && counts.prospects > 0 && (
                  <span className="ml-1.5 text-[11px] text-muted tabular-nums">
                    {counts.prospects}
                  </span>
                )}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setCustomerType(null);
                setGroupName(null);
                setMissingDetailsOnly(false);
                setRecord("CUSTOMERS");
              }}
              className="px-3 py-2 text-[13px] text-secondary hover:text-foreground transition-colors"
            >
              {t("filterClear")}
            </button>
          )}
        </div>

        {/*
          Narrowing the list and setting work going are two different intents,
          and they were sharing one bar. The two sweeps each report back in
          words — "Researching 44 customers" — which then sat inside the search
          row and pushed the filters onto a second line as soon as either was
          pressed. Anthony, 2026-08-02: *"you keep adding buttons into the
          search boxes."* Their own row, with room for what they say.
        */}
        <div className={`relative ${LAYER.PAGE_CHROME} flex flex-wrap items-center gap-3 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl`}>
          <button
            type="button"
            onClick={() => setMissingDetailsOnly((current) => !current)}
            className={`px-3 py-2 rounded-[12px] border text-[13px] transition-colors ${
              missingDetailsOnly
                ? "border-brand text-brand bg-brand/10"
                : "border-border-dim text-secondary hover:text-foreground"
            }`}
          >
            {t("filterMissingDetails")}
          </button>
          <ResearchSweepButton />
          <ProspectingSweepButton />
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
                  result.page.map((customer) => {
                    const isProspect = customer.record === "PROSPECT";
                    return (
                      <tr
                        key={customer.accountNameKey}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02]"
                      >
                        <Td>
                          {/* The mark sits before the name, not after it. A list
                              is scanned down its left edge, so a badge past the
                              name arrives after the reader has already decided
                              what they are looking at. */}
                          <span className="inline-flex items-center gap-2">
                            <span
                              aria-hidden
                              className={`w-1 h-4 rounded-full shrink-0 ${
                                isProspect ? "bg-brand" : "bg-transparent"
                              }`}
                            />
                            <Link
                              href={`/app/${workspace}/customers/${encodeURIComponent(customer.accountNameKey)}`}
                              className={`transition-colors hover:text-brand ${
                                // Quieter, because a prospect is money you might
                                // have rather than money you do.
                                isProspect ? "text-secondary" : "text-foreground"
                              }`}
                            >
                              {customer.accountName}
                            </Link>
                            {isProspect && (
                              <span className="px-1.5 py-0.5 rounded-[6px] bg-brand/10 text-[10px] uppercase tracking-wide text-brand">
                                {t("recordProspect")}
                              </span>
                            )}
                            {!customer.hasDetails && (
                              <span className="text-[11px] text-muted">{t("noDetails")}</span>
                            )}
                          </span>
                        </Td>
                        <Td>{customer.accountCode || "—"}</Td>
                        <Td>{customer.groupName}</Td>
                        <Td>{customer.customerType}</Td>
                        <Td>
                          {[customer.town, customer.postcode].filter(Boolean).join(", ") || "—"}
                        </Td>
                        <Td align="right" numeric>
                          {/* A dash, never £0.00. Zero reads as "a customer who
                              bought nothing", which is a different and worse
                              claim than "not a customer". */}
                          {isProspect ? "—" : formatMoney(customer.totalRevenue)}
                        </Td>
                      </tr>
                    );
                  })
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
              // Named for what is actually on screen: "19 customers" under a
              // list of prospects is a small lie that reads as a bug.
              showing: (count) =>
                record === "PROSPECTS"
                  ? t("rowsShownProspects", { count })
                  : t("rowsShown", { count }),
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

/**
 * Fill in what is missing, across every customer that still has gaps.
 *
 * One run per customer, started a few seconds apart rather than all at once:
 * thirty-nine runs fired together compete for the same budget and make the run
 * history unreadable. What it reports back is how many were queued, because
 * pressing a button that silently does nothing is worse than one that refuses.
 *
 * It costs money each time, which is why this is a button somebody presses and
 * not a nightly job.
 */
function ResearchSweepButton() {
  const t = useTranslations("salesData.customers");
  const startSweep = useMutation(api.salesDataResearch.startCustomerResearchSweep);
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onClick = async () => {
    setState("starting");
    setMessage(null);
    try {
      const result = await startSweep({});
      setState("started");
      setMessage(
        result.queued === 0
          ? t("sweepNothingToDo")
          : t("sweepQueued", { count: result.queued })
      );
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "starting"}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[12px] border border-border-dim text-[13px] text-secondary hover:text-foreground hover:border-border transition-colors disabled:opacity-60"
      >
        <Sparkles className="w-3.5 h-3.5 text-brand" />
        {state === "starting" ? t("sweepStarting") : t("sweepStart")}
      </button>
      {message && (
        <span className={`text-[12px] ${state === "error" ? "text-red-400" : "text-secondary"}`}>
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * Look through every group for sites the workspace does not supply.
 *
 * One run per group, four seconds apart. Groups already looked through are
 * skipped, so pressing it again picks up the ones that ran out of budget rather
 * than paying for the whole estate twice.
 */
function ProspectingSweepButton() {
  const t = useTranslations("salesData.customers");
  const startSweep = useMutation(api.salesDataResearch.startProspectingSweep);
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onClick = async () => {
    setState("starting");
    setMessage(null);
    try {
      const result = await startSweep({});
      setState("started");
      setMessage(
        result.queued === 0
          ? t("findSitesNothingToDo")
          : t("findSitesQueued", { count: result.queued })
      );
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "starting"}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[12px] border border-border-dim text-[13px] text-secondary hover:text-foreground hover:border-border transition-colors disabled:opacity-60"
      >
        <Sparkles className="w-3.5 h-3.5 text-brand" />
        {state === "starting" ? t("findSitesStarting") : t("findSites")}
      </button>
      {message && (
        <span className={`text-[12px] ${state === "error" ? "text-red-400" : "text-secondary"}`}>
          {message}
        </span>
      )}
    </div>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  });
}
