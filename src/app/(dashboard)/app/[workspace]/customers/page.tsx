"use client";

import { Suspense, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [record, setRecord] = useState<"CUSTOMERS" | "PROSPECTS" | "ALL">("CUSTOMERS");

  const pagination = useCursorPagination(
    JSON.stringify([search, customerType, groupName, record])
  );

  const counts = useQuery(api.salesDataCustomers.countCustomers);
  const filterOptions = useQuery(api.salesDataCustomers.listCustomerFilterOptions);
  const result = useQuery(api.salesDataCustomers.listCustomers, {
    paginationOpts: { numItems: PAGE_SIZE, cursor: pagination.cursor },
    ...(search ? { search } : {}),
    ...(customerType ? { customerType } : {}),
    ...(groupName ? { groupName } : {}),
    record,
  });

  const isLoading = result === undefined;
  const hasFilters = Boolean(customerType || groupName) || record !== "CUSTOMERS";
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
                setRecord("CUSTOMERS");
              }}
              className="px-3 py-2 text-[13px] text-secondary hover:text-foreground transition-colors"
            >
              {t("filterClear")}
            </button>
          )}
        </div>

        {/*
          The second row now holds the two ends of the demo and nothing else.
          Anthony, 2026-08-03: *"in the second box all we need is clear and an
          import spreadsheet button."* The missing-details filter and the two
          AI sweeps that used to sit here are gone.
        */}
        <div className={`relative ${LAYER.PAGE_CHROME} flex flex-wrap items-center gap-3 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl`}>
          <ClearDatabaseButton />
          <Link
            href={`/app/${workspace}/spreadsheet-import`}
            className="px-3 py-2 rounded-[12px] border border-border-dim text-[13px] text-secondary hover:text-foreground hover:border-border transition-colors"
          >
            {t("importSpreadsheet")}
          </Link>
        </div>

        <ResearchRow />

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
                        // The whole row is the link, not just the name — the
                        // name's own Link stays for middle-click and keyboards.
                        onClick={() =>
                          router.push(
                            `/app/${workspace}/customers/${encodeURIComponent(customer.accountNameKey)}`
                          )
                        }
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] cursor-pointer"
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
 * Empty the workspace, so the process can be shown from the beginning.
 *
 * A re-import replaces the workbook's rows but deliberately keeps the contact
 * details, the agent's findings and the prospects, because a customer importing
 * a fresh file every month would be furious to lose a year of typed-in work to
 * it. That rule makes a second demo unwatchable: everything is already filled
 * in, both sweeps report there is nothing to do, and the part worth seeing
 * never happens. This is the deliberate exception.
 *
 * It asks twice. Nothing it deletes can be recovered, and it sits one press
 * away from a list somebody is only reading.
 */
function ClearDatabaseButton() {
  const t = useTranslations("salesData.customers");
  const clearDatabase = useAction(api.salesDataReset.resetSalesData);
  const [state, setState] = useState<"idle" | "confirming" | "clearing" | "cleared" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  const onConfirm = async () => {
    setState("clearing");
    setMessage(null);
    try {
      await clearDatabase({});
      setState("cleared");
      setMessage(t("clearDone"));
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  if (state === "confirming") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onConfirm()}
          className="px-3 py-2 rounded-[12px] border border-[#ef4444]/40 bg-[#ef4444]/10 text-[13px] text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
        >
          {t("clearConfirm")}
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="px-3 py-2 text-[13px] text-secondary hover:text-foreground transition-colors"
        >
          {t("clearCancel")}
        </button>
        <span className="text-[12px] text-muted">{t("clearWarning")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setState("confirming")}
        disabled={state === "clearing"}
        className="px-3 py-2 rounded-[12px] border border-border-dim text-[13px] text-secondary hover:text-foreground hover:border-border transition-colors disabled:opacity-60"
      >
        {state === "clearing" ? t("clearRunning") : t("clearStart")}
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
 * The agents' own row: two buttons, one per worker, and the progress bar.
 *
 * Anthony, 2026-08-03: a new row below the clear-database row, with the two
 * buttons that trigger the agents and the progress bar on that same row, so
 * the user sees it working. "Find new prospects" hunts the chains and files
 * what it finds; "Research the missing details" fills in customers and
 * prospects already on the books. One job runs at a time, so while either
 * works both buttons rest and the bar carries the story.
 */
function ResearchRow() {
  const t = useTranslations("salesData.customers");
  const startResearch = useMutation(api.salesDataResearchJobs.startResearchJob);
  const job = useQuery(api.salesDataResearchJobs.getResearchJob, {});
  const [message, setMessage] = useState<string | null>(null);
  const isRunning = job?.status === "RUNNING";

  // The finish deserves more than a quiet line: a job watched from this screen
  // announces its ending and waits for an OK. Anthony, 2026-08-03: "show a
  // modal to say complete with an OK button so we know something has
  // happened." Only a RUNNING → finished transition seen by this page opens
  // it, so an old finished job does not greet every visit with a modal.
  // The transition is caught during render, the React previous-render
  // pattern, because an effect doing it re-rendered twice.
  const [finishedNotice, setFinishedNotice] = useState<string | null>(null);
  const [sawRunning, setSawRunning] = useState(false);
  if (isRunning && !sawRunning) setSawRunning(true);
  if (!isRunning && sawRunning && job && job.status !== "RUNNING") {
    setSawRunning(false);
    setFinishedNotice(job.endedReason ?? t("researchWorking"));
  }

  const onPress = async (mode: "DETAILS" | "PROSPECTS") => {
    setMessage(null);
    try {
      const result = await startResearch({ mode });
      if (result.nothingToDo) setMessage(t("researchNothingToDo"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const finished = (job?.done ?? 0) + (job?.failed ?? 0);
  const percent = !job || job.total === 0 ? 0 : Math.round((finished / job.total) * 100);

  return (
    <>
    {finishedNotice && (
      <div className={`fixed inset-0 ${LAYER.OVERLAY} flex items-center justify-center bg-black/50 backdrop-blur-sm`}>
        <div className="w-[min(420px,90vw)] rounded-[16px] border border-border-dim bg-sidebar p-6 flex flex-col gap-4 shadow-xl">
          <h2 className="text-[16px] font-semibold text-foreground">{t("researchDoneTitle")}</h2>
          <p className="text-[13.5px] text-secondary leading-relaxed">{finishedNotice}</p>
          <button
            type="button"
            onClick={() => setFinishedNotice(null)}
            className="self-end px-4 py-2 rounded-[10px] border border-brand/40 bg-brand/10 text-[13px] text-brand hover:bg-brand/20 transition-colors"
          >
            {t("researchDoneOk")}
          </button>
        </div>
      </div>
    )}
    <div className={`relative ${LAYER.PAGE_CHROME} flex flex-wrap items-center gap-3 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl`}>
      <button
        type="button"
        onClick={() => void onPress("PROSPECTS")}
        disabled={isRunning}
        className="px-3 py-2 rounded-[12px] border border-brand/40 bg-brand/10 text-[13px] text-brand hover:bg-brand/20 transition-colors disabled:opacity-60"
      >
        {t("prospectsStart")}
      </button>
      <button
        type="button"
        onClick={() => void onPress("DETAILS")}
        disabled={isRunning}
        className="px-3 py-2 rounded-[12px] border border-brand/40 bg-brand/10 text-[13px] text-brand hover:bg-brand/20 transition-colors disabled:opacity-60"
      >
        {t("researchStart")}
      </button>

      <div className="flex-1 min-w-[220px] flex flex-col gap-1.5 px-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {/* A job that finished says so, in the job's own closing words, until
              the next press — finishing silently read as never finishing.
              Anthony, 2026-08-03: "did the agent complete? I never got a
              message." */}
          <span className={`text-[12.5px] ${isRunning ? "text-foreground" : "text-muted"}`}>
            {isRunning
              ? job?.workingOn
                ? t("researchWorkingOn", { name: job.workingOn.label })
                : t("researchWorking")
              : message
                ?? (job?.endedReason
                  ? t("researchFinished", { reason: job.endedReason })
                  : t("researchIdle"))}
          </span>
          {isRunning && (
            <span className="text-[12px] text-secondary tabular-nums">
              {t("researchProgress", { done: finished, total: job?.total ?? 0 })}
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${isRunning ? percent : 0}%` }}
          />
        </div>
      </div>
    </div>
    <RegisterCoverageRow />
    </>
  );
}

/**
 * Each care group's holdings, counted against the official register.
 *
 * The referee's verdict, not the agent's own account of itself: after every
 * prospect hunt the platform reads the CQC register and compares. Anthony,
 * 2026-08-04: *"if we keep shortcutting this then we fail"* — a chain that
 * looks finished but is short on the register says so here, with the missing
 * homes named. Absent until the first hunt completes, so the screen carries no
 * empty box before there is anything to say.
 */
function RegisterCoverageRow() {
  const t = useTranslations("salesData.customers");
  const coverage = useQuery(api.salesDataRegisterCoverage.listChainCoverage, {});
  if (!coverage || coverage.length === 0) return null;

  const describe = (row: (typeof coverage)[number]) => {
    // A gap the check could file became a prospect, and the line says so;
    // "missing" is reserved for what still needs a person.
    const filedNote =
      row.filedFromRegister > 0 ? t("coverageFiled", { count: row.filedFromRegister }) : "";
    if (row.status === "COVERED") {
      return (
        t("coverageCovered", {
          accountedFor: row.accountedFor ?? 0,
          registerCount: row.registerCount ?? 0,
        }) + filedNote
      );
    }
    if (row.status === "GAPS") {
      return (
        t("coverageGaps", {
          accountedFor: row.accountedFor ?? 0,
          registerCount: row.registerCount ?? 0,
          missing: row.missing.map((site) => site.name).join(", "),
        }) + filedNote
      );
    }
    if (row.status === "PROVIDER_NOT_FOUND") return t("coverageProviderNotFound");
    if (row.status === "CHECK_FAILED") return t("coverageCheckFailed", { error: row.error ?? "" });
    return t("coverageNotConfigured");
  };

  const tone = (status: (typeof coverage)[number]["status"]) =>
    status === "COVERED"
      ? "text-emerald-400"
      : status === "GAPS"
        ? "text-amber-400"
        : "text-muted";

  return (
    <div className={`relative ${LAYER.PAGE_CHROME} flex flex-col gap-1.5 bg-sidebar/40 border border-border-dim rounded-[16px] p-3 backdrop-blur-xl`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-foreground">{t("coverageTitle")}</span>
        <span className="text-[12px] text-muted">{t("coverageHint")}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {coverage.map((row) => (
          <li key={row.groupNameKey} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
            <span className="text-secondary">{row.groupName}</span>
            <span className={tone(row.status)}>{describe(row)}</span>
          </li>
        ))}
      </ul>
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
