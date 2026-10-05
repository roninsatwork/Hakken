"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { ReceiptText } from "lucide-react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreditKind } from "@/convex/creditKinds";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import useDebounce from "@/src/hooks/useDebounce";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { toCsv } from "../../sites/_components/siteFormat";
import { CREDIT_KIND_ORDER, useUsageWords, type UsageWords } from "./usageWords";

/**
 * A month's credits line by line, like a bank statement
 * (docs/plans/active/usage-credits-plan.md, boards Statement, ByWork and
 * ByWebsite): date, time, what it was, who, credits out — and on the
 * statement itself, credits in and the balance after, between the balance
 * the month opened with and the balance now.
 *
 * Read a page at a time from the server (finish-off-plan.md, item 10): a
 * month of any length, its filters and search applied there, its order by
 * date either way. The download reads every page in turn.
 */

export type StatementLine = FunctionReturnType<typeof api.creditUsage.usageStatement>["page"][number];
type StatementArgs = Omit<FunctionArgs<typeof api.creditUsage.usageStatement>, "paginationOpts">;

type Row =
  | { kind: "line"; line: StatementLine; title: string; detail: string; user: string; how: string }
  | { kind: "opening" | "closing"; balance: number; at: number };

/** The filters a list offers, beside its search box. */
export type StatementFilter = "task" | "website" | "user";

const NOT_TIED = "none";

/** Lines a download reads a page, and the most it reads: a month far past any company's. */
const DOWNLOAD_PAGE = 500;
const DOWNLOAD_MOST = 50_000;

/** A line in words: what it was, and the facts a reader would ask about it. */
function describe(line: StatementLine, words: UsageWords, platformName: string) {
  // Credits given back went to a batch; credits used came from one.
  const back = line.in > 0 && (line.entry === "refund" || line.entry === "recount");
  const fromWords = line.from.map((batch) => (batch.source === "plan" && batch.month
    ? words.t(back ? "statement.toPlan" : "statement.fromPlan", { month: words.monthName(batch.month) })
    : words.t(back ? "statement.toTopUp" : "statement.fromTopUp", { date: words.date(batch.startsAt) })));
  const parts: string[] = [];
  let title: string;
  if (line.entry === "grant") {
    const month = line.batch?.month ? words.monthName(line.batch.month) : "";
    title = line.source === "topup" ? words.t("statement.topUp") : words.t(line.reason === "raised" ? "statement.planRaised" : "statement.planGranted", { month });
    // A month's plan credits raised after they were given (finish-off-plan.md, item 3a): from what, to what.
    if (line.reason === "raised" && line.before !== null) parts.push(words.t("statement.raisedFrom", { before: words.number(line.before), after: words.number(line.before + line.in) }));
    // A batch ends at midnight starting its next day: the last moment before it is the day it ends on.
    if (line.source !== "topup" && line.batch) parts.push(words.t("statement.planEnds", { date: words.date(line.batch.endsAt - 1) }));
  } else if (line.entry === "ended") {
    const batch = line.batch ?? line.from[0];
    title = batch?.source === "topup"
      ? words.t("statement.topUpEnded", { date: words.date(batch.startsAt) })
      : words.t("statement.planEnded", { month: batch?.month ? words.monthName(batch.month) : "" });
    parts.push(words.t("statement.unused"));
  } else if (line.entry === "recount") {
    // A charge counted again from what came back (finish-off-plan.md, items 3 and 9): what it is now, and was.
    const kindName = line.kind ? words.kind(line.kind) : "";
    title = words.t("statement.recount", { kind: kindName });
    if (line.website) parts.push(line.website.host);
    if (line.detail) parts.push(line.detail);
    if (line.reason === "nothingBack" || (line.units === 0 && line.kind)) parts.push(words.t("statement.nothingBack"));
    else if (line.kind) parts.push(words.t("statement.recounted", { now: words.t(`units.${line.kind}`, { count: line.units }), before: words.number(line.before ?? 0) }));
  } else {
    const kindName = line.kind ? words.kind(line.kind) : "";
    title = line.entry === "refund" ? words.t("statement.refund", { kind: kindName }) : kindName;
    if (line.website) parts.push(line.website.host);
    if (line.detail) parts.push(line.detail);
    else if (line.kind) parts.push(words.t(`units.${line.kind}`, { count: line.units }));
    if (line.entry === "refund") parts.push(words.t("statement.givenBack"));
  }
  if (fromWords.length > 0 && line.entry !== "ended") parts.push(fromWords.join(words.t("statement.and")));
  const user = line.user ?? (line.how === "automatic" ? platformName : "–");
  return { title, detail: parts.join(" · "), user, how: words.t(`how.${line.how}`) };
}

/**
 * The statement table's props: the page draws the table itself, below its own
 * header, as every list screen does.
 */
export function useStatementTable({
  base,
  statement = false,
  opening,
  closing,
  totals,
  filters,
  kinds,
  websites,
  people,
  searchPlaceholder,
  fileName,
}: {
  /** The month, and the kind or website a By work or By website page is showing; "skip" until it knows. */
  base: Pick<StatementArgs, "month" | "kind" | "website" | "chargesOnly"> | "skip";
  /** The statement itself: credits in, the balance after each line, and the month's opening and closing balances. */
  statement?: boolean;
  opening?: number;
  closing?: number;
  /** The words beside the count: the month's totals, from its figures. */
  totals: ReactNode;
  filters: StatementFilter[];
  /** What the filters offer: the month's kinds of work, its websites, and the company's people. */
  kinds: CreditKind[];
  websites: Array<{ key: string; host: string }>;
  people: Array<{ userId: Id<"users">; name: string }>;
  searchPlaceholder: string;
  fileName: string;
}) {
  const words = useUsageWords();
  const { platformName } = useSystemSettings();
  const convex = useConvex();
  const [search, setSearch] = useState("");
  const [task, setTask] = useState("");
  const [website, setWebsite] = useState("");
  const [user, setUser] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">(statement ? "asc" : "desc");
  const term = useDebounce(search.trim(), 300);

  const lower = term.toLowerCase();
  const args: StatementArgs | "skip" = base === "skip" ? "skip" : {
    ...base,
    ...(task ? { kind: task as CreditKind } : {}),
    ...(website ? { website } : {}),
    ...(user ? { userId: user as Id<"users"> } : {}),
    // The kinds of work whose names, in the reader's own words, the search matches.
    ...(lower ? { search: lower, searchKinds: CREDIT_KIND_ORDER.filter((kind) => words.kind(kind).toLowerCase().includes(lower)) } : {}),
    order: direction,
  };
  const pages = useServerPagedTable(api.creditUsage.usageStatement, args, TABLE_PAGE_SIZE, { fill: true });

  const described = (line: StatementLine) => ({ kind: "line" as const, line, ...describe(line, words, platformName) });
  const narrowed = Boolean(task || website || user || term);
  // The month's opening and closing balances, as a bank statement prints them:
  // only around the whole month, in date order — the first page opens, the last closes.
  const whole = statement && !narrowed && direction === "asc" && opening !== undefined && closing !== undefined;
  const lineRows: Row[] = pages.rows.map(described);
  const loading = base === "skip" || pages.isLoading;
  const rows: Row[] | undefined = loading ? undefined : [
    ...(whole && pages.page === 1 && lineRows.length > 0 ? [{ kind: "opening" as const, balance: opening, at: pages.rows[0]?.at ?? 0 }] : []),
    ...lineRows,
    ...(whole && !pages.hasMore && pages.page === pages.totalPages && lineRows.length > 0 ? [{ kind: "closing" as const, balance: closing, at: pages.rows.at(-1)?.at ?? 0 }] : []),
  ];

  const reset = (apply: () => void) => {
    apply();
    pages.goToPage(1);
  };

  const download = async () => {
    if (args === "skip") return;
    const all: StatementLine[] = [];
    let cursor: string | null = null;
    while (all.length < DOWNLOAD_MOST) {
      const page: FunctionReturnType<typeof api.creditUsage.usageStatement> = await convex.query(api.creditUsage.usageStatement, { ...args, paginationOpts: { cursor, numItems: DOWNLOAD_PAGE } });
      all.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const headers = [words.t("statement.columns.date"), words.t("statement.columns.time"), words.t("statement.columns.description"), words.t("statement.columns.detail"), words.t("statement.columns.user"), words.t("statement.columns.out"), ...(statement ? [words.t("statement.columns.in"), words.t("statement.columns.balance")] : [])];
    saveTextFile(toCsv(headers, all.map(described).map((row) => [
      words.date(row.line.at), words.time(row.line.at), row.title, row.detail, row.user, row.line.out || null,
      ...(statement ? [row.line.in || null, row.line.balance] : []),
    ])), `${fileName}.csv`);
  };

  const mono = "font-mono text-[12px] tabular-nums";
  const lineOnly = (render: (row: Extract<Row, { kind: "line" }>) => ReactNode, balanceRow?: (row: Extract<Row, { kind: "opening" | "closing" }>) => ReactNode) =>
    (row: Row) => (row.kind === "line" ? render(row) : balanceRow ? balanceRow(row) : null);

  const columns: DataTableColumn<Row>[] = [
    {
      key: "when",
      header: words.t("statement.columns.date"),
      sortable: true,
      cell: (row) => (row.kind === "line" ? <span className={`${mono} whitespace-nowrap text-foreground`}>{words.date(row.line.at)}</span> : null),
    },
    { key: "time", header: words.t("statement.columns.time"), cell: lineOnly((row) => <span className={`${mono} text-secondary`}>{words.time(row.line.at)}</span>) },
    {
      key: "description",
      header: words.t("statement.columns.description"),
      cell: lineOnly(
        (row) => (
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] text-foreground">{row.title}</span>
            {row.detail ? <span className="text-[12px] text-secondary [overflow-wrap:anywhere]">{row.detail}</span> : null}
          </span>
        ),
        (row) => <span className="text-[13px] font-medium text-foreground">{row.kind === "opening" ? words.t("statement.opening") : words.t("statement.closing")}</span>,
      ),
    },
    {
      key: "user",
      header: words.t("statement.columns.user"),
      cell: lineOnly((row) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap text-[13px] text-foreground">{row.user}</span>
          <span className="text-[12px] text-secondary">{row.how}</span>
        </span>
      )),
    },
    { key: "out", header: words.t("statement.columns.out"), align: "right", cell: lineOnly((row) => <span className="font-mono text-[13px] text-foreground">{row.line.out ? words.number(row.line.out) : ""}</span>) },
    ...(statement ? [
      { key: "in", header: words.t("statement.columns.in"), align: "right" as const, cell: lineOnly((row) => <span className="font-mono text-[13px] text-foreground">{row.line.in ? words.number(row.line.in) : ""}</span>) },
      {
        key: "balance",
        header: words.t("statement.columns.balance"),
        align: "right" as const,
        cell: lineOnly(
          (row) => <span className={`${mono} text-secondary`}>{row.line.balance === null ? "" : words.number(row.line.balance)}</span>,
          (row) => <span className="font-mono text-[13px] font-medium text-foreground">{words.number(row.balance)}</span>,
        ),
      },
    ] : []),
  ];

  const chips = (
    <>
      {filters.includes("task") ? (
        <Select value={task} onChange={(next) => reset(() => setTask(next))} chip={{ label: words.t("filters.task"), choice: task ? words.kind(task as CreditKind) : null }}>
          <option value="">{words.t("filters.everyTask")}</option>
          {CREDIT_KIND_ORDER.filter((kind) => kinds.includes(kind)).map((kind) => <option key={kind} value={kind}>{words.kind(kind)}</option>)}
        </Select>
      ) : null}
      {filters.includes("website") ? (
        <Select value={website} onChange={(next) => reset(() => setWebsite(next))} chip={{ label: words.t("filters.website"), choice: website ? websites.find((row) => row.key === website)?.host ?? words.t("websites.none") : null }}>
          <option value="">{words.t("filters.everyWebsite")}</option>
          {websites.map((row) => <option key={row.key} value={row.key}>{row.key === NOT_TIED ? words.t("websites.none") : row.host}</option>)}
        </Select>
      ) : null}
      {filters.includes("user") ? (
        <Select value={user} onChange={(next) => reset(() => setUser(next))} chip={{ label: words.t("filters.user"), choice: user ? people.find((person) => person.userId === user)?.name ?? null : null }}>
          <option value="">{words.t("filters.everyUser")}</option>
          {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
        </Select>
      ) : null}
    </>
  );

  const footer = {
    mode: "paged" as const,
    page: pages.page,
    totalPages: pages.totalPages,
    totalCount: pages.loadedCount,
    pageSize: TABLE_PAGE_SIZE,
    isLoading: loading || pages.isBusy,
    onPageChange: pages.goToPage,
  };

  const props: ComponentProps<typeof DataTable<Row>> = {
    rows,
    rowKey: (row) => (row.kind === "line" ? row.line.id : row.kind),
    columns,
    rowClassName: (row) => (row.kind === "line" ? "" : "bg-foreground/[0.02]"),
    search: { value: search, onChange: (next) => reset(() => setSearch(next)), placeholder: searchPlaceholder },
    filters: chips,
    // By date, either way; the statement itself oldest first.
    sort: { key: "when", direction, onSort: () => reset(() => setDirection((before) => (before === "asc" ? "desc" : "asc"))) },
    empty: { icon: <ReceiptText className="h-8 w-8 text-muted/30" />, label: narrowed ? words.t("statement.noMatch") : words.t("statement.empty") },
    cardHeader: (
      <TableBar
        footer={{ isLoading: loading, totalCount: pages.loadedCount }}
        noun="lines"
        actions={<DownloadButton label={words.t("download")} onClick={() => void download()} disabled={loading || pages.loadedCount === 0} />}
      >
        {pages.hasMore ? <span className="text-[13px] text-secondary">{words.t("statement.soFar")}</span> : null}
        <span className="text-[13px] text-secondary">{totals}</span>
      </TableBar>
    ),
    footer,
  };
  return props;
}
