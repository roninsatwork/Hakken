"use client";

import { useState, type ReactNode } from "react";
import { ListTodo } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pathOf } from "@/convex/utils/hakkenTaskRules";
import { clockOf } from "@/convex/utils/hakkenTaskTiming";
import { byValue, type SortDirection, type SortValue } from "@/convex/utils/sortOrder";
import { RecordLinkCell } from "@/src/app/(dashboard)/app/sites/_components/SiteCells";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { formatDate } from "@/src/lib/dates";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { DataTable, type DataTableColumn, type PagedFooterSpec } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { matchesSearchTerm } from "@/src/ui/components/screens/pagination";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";

/**
 * The Hakken tasks screen (docs/plans/active/hakken-tasks-plan.md, item 1.5,
 * as drawn and signed off 2026-10-07 — boards MyTasks, DeleteTask and
 * CompanyJobs): what each watches, how its owner hears, when it next looks
 * and its state, with Pause or Resume and Delete — Delete asking first, and
 * offering a pause instead. One table for a person's own (Hakken tasks in
 * their menu) and a company's, everyone's, with who asked (Admin → Companies
 * → Hakken tasks): the second adds the Asked by column and its filter. The
 * header, the table and its yes-or-no, in that order; each page says only
 * what differs — its description, its icon and action, and its rule.
 */

export type HakkenTaskRow = FunctionReturnType<typeof api.hakkenTasks.listMine>[number] & { askedBy?: string | null };

type TaskId = Id<"hakkenTasks">;
type Showing = "all" | "ON" | "PAUSED" | "NEEDS_YOU";
type SortKey = "task" | "type" | "askedBy" | "nextCheck" | "state";

const STATE_ORDER: Record<HakkenTaskRow["state"], number> = { NEEDS_YOU: 0, ON: 1, PAUSED: 2, DELETED: 3 };

/** What a task keeps an eye on, in a sentence: its page, its website, or its own words. */
function watchedThing(row: HakkenTaskRow): string {
  if (row.target?.page) return pathOf(row.target.page);
  return row.target?.website ?? row.title;
}

/** Where its figures are: the Search Console screen it reads. */
function figuresHref(row: HakkenTaskRow): string | null {
  if (!row.target) return null;
  return `/app/search-console/${row.target.companyWebsiteId}${row.target.page ? "/pages" : ""}`;
}

/** "2026-10-05" as the tables write a date. */
const dayDate = (day: string) => formatDate(new Date(`${day}T12:00:00`));

/** An alert that told its owner on the newest day it judged: the rule is met now. */
const alertedNow = (row: HakkenTaskRow) => row.state === "ON" && Boolean(row.lastAlertedDay) && row.lastAlertedDay === row.lastJudgedDay;

export function HakkenTasksScreen({
  description,
  icon = null,
  action: headerAction,
  divider = false,
  rows,
  scope,
  forCompany = false,
  pause,
  resume,
  remove,
}: {
  description: string;
  icon?: ReactNode;
  /** "Add a task", on a person's own. */
  action?: ReactNode;
  /** A top-level page's rule; a tab inside a section draws none. */
  divider?: boolean;
  rows: HakkenTaskRow[] | undefined;
  /** The `useAdminAction` scope its buttons share. */
  scope: string;
  /** A company's, everyone's: who asked, and no link to the owner's own screens. */
  forCompany?: boolean;
  /** The changes, each run through the screen's action runner, which reports a failure. */
  pause: (args: { taskId: TaskId }) => Promise<unknown>;
  resume: (args: { taskId: TaskId }) => Promise<unknown>;
  remove: (args: { taskId: TaskId }) => Promise<unknown>;
}) {
  const t = useTranslations("hakkenTasks");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const canWrite = useCanWriteHere();
  const action = useAdminAction({ scope });
  const removal = useAdminAction({ scope: `${scope}-delete` });

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [showing, setShowing] = useState<Showing>("all");
  const [askedBy, setAskedBy] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "nextCheck", direction: "asc" });
  const [deleting, setDeleting] = useState<HakkenTaskRow | null>(null);

  const kindWord = (row: HakkenTaskRow) => t(`kinds.${row.kind}`);
  const askerOf = (row: HakkenTaskRow) => row.askedBy ?? t("company.whoLeft");
  const hearWords = (row: HakkenTaskRow) => {
    const ways = [
      row.channels.bell ? t("hear.bell", { platformName }) : null,
      row.channels.email ? t("hear.email") : null,
      row.channels.telegram ? t("hear.telegram") : null,
    ].filter((way): way is string => Boolean(way));
    const listed = new Intl.ListFormat(locale === "en" ? "en-GB" : locale, { type: "conjunction" }).format(ways);
    const time = locale.startsWith("en") ? clockOf(row.timeOfDay) : row.timeOfDay;
    const channels = listed.charAt(0).toUpperCase() + listed.slice(1);
    // A weekly report says its day: "Hakken and email, Mondays 9am" (item 4.1).
    return row.report
      ? t("hear.weekly", { channels, weekday: t(`weekdaysPlural.${row.report.weekday}` as "weekdaysPlural.1"), time })
      : t("hear.at", { channels, time });
  };

  const all = rows ?? [];
  const kinds = [...new Set(all.map((row) => row.kind))];
  const people = [...new Set(all.map(askerOf))].sort((a, b) => a.localeCompare(b));

  const sortValue: Record<SortKey, (row: HakkenTaskRow) => SortValue> = {
    task: (row) => row.title.toLowerCase(),
    type: kindWord,
    askedBy: askerOf,
    nextCheck: (row) => (row.state === "ON" ? row.nextCheckAt : undefined),
    state: (row) => STATE_ORDER[row.state],
  };
  const shown = all
    .filter((row) => !kind || row.kind === kind)
    .filter((row) => showing === "all" || row.state === showing)
    .filter((row) => !forCompany || !askedBy || askerOf(row) === askedBy)
    .filter((row) => matchesSearchTerm(search, [row.title, forCompany ? askerOf(row) : null, row.target?.website, row.target?.page]))
    .sort(byValue(sortValue[sort.key], (row) => row.title, sort.direction));

  const paged = usePagedRows(shown, {
    canLoadMore: false,
    loadMore: () => undefined,
    resetKey: [search, kind, showing, askedBy, sort.key, sort.direction].join("|"),
  });
  const footer: PagedFooterSpec = {
    mode: "paged",
    page: paged.page,
    totalPages: paged.totalPages,
    totalCount: shown.length,
    pageSize: paged.pageSize,
    isLoading: rows === undefined,
    onPageChange: paged.goToPage,
  };

  const busy = action.isBusy();
  const run = (work: () => Promise<unknown>) => void action.run(work, { fallbackMessage: t("actions.failed") });
  const confirmDelete = async () => {
    if (!deleting) return;
    const outcome = await removal.run(() => remove({ taskId: deleting.taskId }), { suppressErrorToast: true, fallbackMessage: t("actions.failed") });
    if (outcome.ok) setDeleting(null);
  };

  const stateCell = (row: HakkenTaskRow): ReactNode => {
    if (alertedNow(row)) return <StatusLabel tone="warning">{t("states.alertSent", { date: dayDate(row.lastAlertedDay!) })}</StatusLabel>;
    if (row.state === "ON") return <StatusLabel tone="success">{t("states.ON")}</StatusLabel>;
    if (row.state === "NEEDS_YOU") return <StatusLabel tone="warning">{t("states.NEEDS_YOU")}</StatusLabel>;
    return <StatusLabel tone="neutral">{t("states.PAUSED")}</StatusLabel>;
  };

  const columns: DataTableColumn<HakkenTaskRow>[] = [
    {
      key: "task",
      header: t("columns.task"),
      sortable: true,
      cell: (row) => {
        const href = forCompany ? null : figuresHref(row);
        return href ? <RecordLinkCell href={href}>{row.title}</RecordLinkCell> : <span className="text-[13px] text-foreground">{row.title}</span>;
      },
    },
    { key: "type", header: t("columns.type"), sortable: true, cell: (row) => <TagLabel>{kindWord(row)}</TagLabel> },
    ...(forCompany
      ? [{ key: "askedBy", header: t("columns.askedBy"), sortable: true, cell: (row: HakkenTaskRow) => <span className="text-[13px] text-secondary">{askerOf(row)}</span> }]
      : []),
    { key: "hear", header: t("columns.hear"), cell: (row) => <span className="text-[13px] text-secondary">{hearWords(row)}</span> },
    {
      key: "nextCheck",
      header: t("columns.nextCheck"),
      sortable: true,
      cell: (row) =>
        row.state === "ON" && row.nextCheckAt !== undefined ? (
          <span className="font-mono text-[12px] tabular-nums text-secondary">{formatDate(row.nextCheckAt)}</span>
        ) : (
          <NoFigure />
        ),
    },
    { key: "state", header: t("columns.state"), sortable: true, cell: stateCell },
    {
      key: "actions",
      hiddenHeader: t("columns.actions"),
      align: "right",
      cell: (row) =>
        canWrite ? (
          <div className="flex items-center justify-end gap-2">
            {row.state === "ON" ? (
              <Button variant="quiet" className="text-[12px]" disabled={busy} onClick={() => run(() => pause({ taskId: row.taskId }))}>{t("actions.pause")}</Button>
            ) : (
              <Button variant="quiet" className="text-[12px]" disabled={busy} onClick={() => run(() => resume({ taskId: row.taskId }))}>{t("actions.resume")}</Button>
            )}
            <Button variant="quiet" className="text-[12px]" disabled={busy} onClick={() => { removal.clearError(); setDeleting(row); }}>{t("actions.delete")}</Button>
          </div>
        ) : null,
    },
  ];

  const kindChoice = kind ? t(`kinds.${kind as HakkenTaskRow["kind"]}`) : null;
  const showingWords: Record<Showing, string> = { all: t("filters.active"), ON: t("filters.on"), PAUSED: t("filters.paused"), NEEDS_YOU: t("filters.needsYou") };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader divider={divider} icon={icon} title={t("title", { platformName })} description={description} action={headerAction} />
      <div className="flex w-full flex-col gap-5">
        <DataTable
          rows={rows === undefined ? undefined : paged.pageRows}
          columns={columns}
          rowKey={(row) => row.taskId}
          search={{ value: search, onChange: setSearch, placeholder: t("search") }}
          filters={
            <>
              <Select value={kind} onChange={setKind} aria-label={t("filters.type")} chip={{ label: t("filters.type"), choice: kindChoice }}>
                <option value="">{t("filters.everyType")}</option>
                {kinds.map((each) => <option key={each} value={each}>{t(`kinds.${each}`)}</option>)}
              </Select>
              <Select value={showing} onChange={(next) => setShowing(next as Showing)} aria-label={t("filters.showing")} chip={{ label: t("filters.showing"), choice: showingWords[showing] }}>
                {(Object.keys(showingWords) as Showing[]).map((each) => <option key={each} value={each}>{showingWords[each]}</option>)}
              </Select>
              {forCompany ? (
                <Select value={askedBy} onChange={setAskedBy} aria-label={t("filters.askedBy")} chip={{ label: t("filters.askedBy"), choice: askedBy || null }}>
                  <option value="">{t("filters.anyone")}</option>
                  {people.map((person) => <option key={person} value={person}>{person}</option>)}
                </Select>
              ) : null}
            </>
          }
          cardHeader={<TableBar footer={footer} noun="tasks" />}
          sort={{
            key: sort.key,
            direction: sort.direction,
            onSort: (key) => setSort((now) => ({ key: key as SortKey, direction: now.key === key && now.direction === "asc" ? "desc" : "asc" })),
          }}
          empty={{ icon: <ListTodo className="h-6 w-6 text-muted" />, label: all.length === 0 ? t("empty", { platformName }) : t("emptyFiltered") }}
          footer={footer}
        />
      </div>

      <ConfirmationModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("deleteConfirm.title")}
        size="sm"
        cancelLabel={t("deleteConfirm.keep")}
        confirmLabel={t("deleteConfirm.confirm")}
        isSubmitting={removal.isBusy()}
        onConfirm={() => void confirmDelete()}
        error={removal.error}
      >
        {deleting ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] leading-relaxed text-secondary">
              {forCompany && deleting.askedBy
                ? t("deleteConfirm.bodyFor", { platformName, what: watchedThing(deleting), person: deleting.askedBy })
                : t("deleteConfirm.body", { platformName, what: watchedThing(deleting) })}
            </p>
            <p className="text-[13px] text-foreground">{t("deleteConfirm.pauseInstead", { platformName })}</p>
          </div>
        ) : null}
      </ConfirmationModal>
    </div>
  );
}
