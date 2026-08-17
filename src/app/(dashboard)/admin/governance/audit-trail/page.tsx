"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import { Download, History } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  PaginationFooter,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

/**
 * Everything anyone changed, and when.
 *
 * This screen used to read the newest five hundred entries and page through
 * those, so its footer announced "of 500 entries" whatever had actually
 * happened, the search only searched that window, and nothing older could be
 * reached at all. Anthony, 2026-08-06: *"its not much of an audit trail at the
 * moment."*
 *
 * Now it pages the trail itself. There is no total, on purpose: counting every
 * matching row to print a figure would read the whole table on every page turn,
 * and a confident wrong number is worse on this screen than no number.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const PERIODS = [7, 30, 90, 0] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function AuditTrailPage() {
  const t = useTranslations("admin.governance.auditTrail");
  const router = useRouter();
  const convex = useConvex();

  const [days, setDays] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("");
  const [actorId, setActorId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [truncatedAt, setTruncatedAt] = useState<number | null>(null);

  /**
   * Fixed when the range changes, not on every render.
   *
   * Computed inline, `Date.now()` moved a millisecond each time React drew the
   * component, so the query's arguments were never twice the same and the
   * paginated read restarted forever — the table sat on its loading spinner
   * with the data one round trip away the whole time.
   */
  const from = useMemo(
    () => (days === 0 ? undefined : Date.now() - days * DAY_MS),
    [days],
  );

  /** The filters, in the one shape both the screen and the export take. */
  const filters = useMemo(
    () => ({
      from,
      search: search.trim() || undefined,
      actionType: actionType || undefined,
      actorId: (actorId || undefined) as Id<"users"> | undefined,
      companyId: (companyId || undefined) as Id<"companies"> | undefined,
    }),
    [from, search, actionType, actorId, companyId],
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.auditLogs.getAuditPage,
    filters,
    { initialNumItems: TABLE_PAGE_SIZE },
  );

  /**
   * What the filters offer.
   *
   * People and workspaces come from their own tables, so the filter lists
   * everyone who could appear rather than everyone who happens to be on the
   * page being looked at — which is what it did, and which meant filtering to a
   * person was only possible once you had already found them.
   */
  const options = useQuery(api.auditLogs.getAuditFilterOptions, {});
  const actions = options?.actions ?? [];
  const people = options?.people ?? [];
  const workspaces = options?.workspaces ?? [];

  const loading = status === "LoadingFirstPage";

  /**
   * The section's ordinary Previous/Next control, over a trail read a page at a
   * time.
   *
   * The two do not fit together on their own: the database hands back pages
   * forwards only, by cursor, so there is nothing to step *back* to. What is
   * already loaded stays loaded, though — so the reader pages through that, and
   * stepping past the end fetches the next lot before showing it.
   *
   * The page count grows as the trail is walked rather than being known up
   * front. Printing a total would mean counting every matching row on every
   * page turn, and this screen has already been caught once announcing a
   * confident "of 500" it could not stand behind.
   */
  const loadedPages = Math.max(Math.ceil(results.length / TABLE_PAGE_SIZE), 1);
  const canLoadMore = status === "CanLoadMore";
  const totalPages = loadedPages + (canLoadMore ? 1 : 0);
  const start = (page - 1) * TABLE_PAGE_SIZE;
  const visible = results.slice(start, start + TABLE_PAGE_SIZE);

  const goToPage = (next: number) => {
    if (next > loadedPages && canLoadMore) loadMore(TABLE_PAGE_SIZE);
    setPage(Math.max(1, next));
  };

  // Narrowing the trail puts the reader back at the top of it.
  const narrow = <T,>(apply: () => T) => {
    setPage(1);
    return apply();
  };

  /**
   * The trail as a file somebody can keep.
   *
   * The first thing anyone asks a governance product for is the evidence in a
   * form they can hand on, and there was no way to produce one.
   *
   * Fetched on the click rather than held ready: the export reads far more than
   * the screen shows, and subscribing to it would pay that cost on every render
   * for a button most readers never press.
   */
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);

    try {
      const exported = await convex.mutation(api.auditLogs.getAuditExport, filters);

      const header = ["When", "Action", "Who", "What happened", "What it was done to", "Workspace"];
      const csv = [header, ...exported.rows.map((row) => [
        row.when,
        row.action,
        row.who,
        row.whatHappened,
        row.target,
        row.workspace,
      ])]
        // Quoted throughout, and inner quotes doubled. A change described as
        // `Purpose: "old" → "new"` would otherwise tear the row in half.
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
        .join("\n");

      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      // Said out loud rather than swallowed. An export that stopped early but
      // looks complete is a document somebody would sign their name to. Shown
      // on the page rather than in a browser dialog, which this platform does
      // not use and which a reader dismisses without reading.
      setTruncatedAt(exported.truncated ? exported.rows.length : null);
    } finally {
      setExporting(false);
    }
  };


  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<History className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      {/* One row. The search and the two things that narrow it are the same
          control in the reader's head, and stacking them spent a band of the
          page on what is really one line. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[240px] flex-1">
          <SearchBar value={search} onChange={(value) => narrow(() => setSearch(value))} placeholder={t("searchPlaceholder")} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="audit-period">
            {t("filters.periodLabel")}
          </label>
          <Select
            id="audit-period"
            value={days}
            onChange={(next) => narrow(() => setDays(Number(next)))}
            className="w-[150px]"
          >
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {period === 0 ? t("filters.allTime") : t("filters.period", { count: period })}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="audit-action">
            {t("filters.actionLabel")}
          </label>
          <Select
            id="audit-action"
            value={actionType}
            onChange={(next) => narrow(() => setActionType(next))}
            className="w-[200px]"
          >
            <option value="">{t("filters.allActions")}</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>

          <label className="sr-only" htmlFor="audit-person">
            {t("filters.personLabel")}
          </label>
          <Select
            id="audit-person"
            value={actorId}
            onChange={(next) => narrow(() => setActorId(String(next)))}
            className="w-[180px]"
          >
            <option value="">{t("filters.allPeople")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>

          {/* Offered only where there is more than one to choose between. A
              workspace administrator is already pinned to their own, and a
              list of one is a control that does nothing. */}
          {workspaces.length > 0 ? (
            <>
              <label className="sr-only" htmlFor="audit-workspace">
                {t("filters.workspaceLabel")}
              </label>
              <Select
                id="audit-workspace"
                value={companyId}
                onChange={(next) => narrow(() => setCompanyId(String(next)))}
                className="w-[180px]"
              >
                <option value="">{t("filters.allWorkspaces")}</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {search || actionType || actorId || companyId || days !== 30 ? (
            <button
              type="button"
              onClick={() =>
                narrow(() => {
                  setSearch("");
                  setActionType("");
                  setActorId("");
                  setCompanyId("");
                  setDays(30);
                })
              }
              className="h-[38px] rounded-[10px] px-3 text-[13px] text-secondary transition-colors hover:text-foreground"
            >
              {t("filters.clear")}
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border-dim px-3 text-[13px] text-secondary transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? t("export.working") : t("export.action")}
          </button>
        </div>
      </div>

      {truncatedAt !== null ? (
        <p className="rounded-[12px] border border-brand/40 bg-brand/5 px-4 py-3 text-[13px] text-foreground">
          {t("export.truncated", { count: truncatedAt })}
        </p>
      ) : null}

      <TableShell
        minWidthClassName="min-w-[1180px]"
        footer={
          <PaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={results.length}
            pageSize={TABLE_PAGE_SIZE}
            isLoading={status === "LoadingMore" || loading}
            onPageChange={goToPage}
            labels={{
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              empty: t("empty"),
              // No "of M" in either label. There is no honest total without
              // counting every matching row on every page turn.
              page: (current) => t("pagination.page", { page: current }),
              showing: (from, to) => t("showing", { from, to }),
            }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.action")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.who")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.change")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.target")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.workspace")}</TableHeaderCell>
            <TableHeaderCell align="right">{t("columns.when")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {loading ? (
            <TableLoadingRow colSpan={6} />
          ) : visible.length === 0 ? (
            /* An empty trail shows nothing. This table used to invent four
               entries when it had none — including a user deletion for a
               "TOS Violation" against an account that never existed. */
            <TableEmptyRow
              colSpan={6}
              icon={<History className="w-5 h-5" />}
              label={t("empty")}
            />
          ) : (
            visible.map((log) => (
              <tr
                key={log._id}
                onClick={() => router.push(`/admin/governance/audit-trail/${log._id}`)}
                className="group cursor-pointer border-b border-border-dim/50 last:border-0 transition-colors hover:bg-foreground/[0.02]"
              >
                <td className="px-4 py-3">
                  <span className="rounded-[4px] border border-border-dim bg-foreground/5 px-2 py-1 font-mono text-[10px] tracking-widest text-foreground/80">
                    {log.actionType}
                  </span>
                </td>
                {/* Held on one line. Now that the change column carries a
                    sentence rather than two words, the name is what the table
                    chooses to wrap, and a column of broken names makes the
                    whole trail look like it is struggling. */}
                <td className="px-4 py-3 text-[12px] text-secondary whitespace-nowrap">{log.actorName}</td>
                <td className="px-4 py-3 text-[12px]">
                  {log.change ? (
                    <span className="text-foreground">{log.change}</span>
                  ) : (
                    /* The entry holds the action and genuinely nothing else.
                       Rare now that this column reads whatever the record does
                       hold rather than only before-and-after values, and still
                       the honest limit of what such an entry knows. */
                    <span className="text-muted">{t("noChangeRecorded")}</span>
                  )}
                </td>
                {/* What it was done to, by name where the record still exists.
                    Answering "what happened to this agent" meant opening rows
                    one at a time, and an identifier is not an answer. */}
                <td className="px-4 py-3 text-[12px] text-secondary">
                  {log.targetName ?? (
                    /* Two different silences, and they are not the same fact.
                       An entry with no target at all had nothing done to it;
                       one carrying an identifier that resolves to no name is
                       pointing at something deleted, or at a marker like
                       "USER_SESSION" that was never a record. The identifier
                       itself stays in the export, where it is evidence, and off
                       the screen, where it is noise. */
                    <span className="text-muted">
                      {log.entityId ? t("targetNotNamed") : t("noTarget")}
                    </span>
                  )}
                </td>
                {/* Which client this belonged to. Without it there was no way
                    to tell one workspace's activity from another's. */}
                <td className="px-4 py-3 text-[12px] text-secondary whitespace-nowrap">
                  {log.companyName ?? <span className="text-muted">{t("noWorkspace")}</span>}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-secondary whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
