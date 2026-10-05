"use client";

import { useState, type ReactNode } from "react";
import { ReceiptText } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { CreditKind } from "@/convex/creditKinds";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import type { ComponentProps } from "react";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { toCsv } from "../../sites/_components/siteFormat";
import { CREDIT_KIND_ORDER, useUsageWords, type UsageWords } from "./usageWords";

/**
 * A month's credits line by line, like a bank statement
 * (docs/plans/active/usage-credits-plan.md, boards Statement, ByWork and
 * ByWebsite): date, time, what it was, who, credits out — and on the
 * statement itself, credits in and the balance after, between the balance
 * the month opened with and the balance now.
 */

type Statement = NonNullable<FunctionReturnType<typeof api.creditUsage.usageStatement>>;
export type StatementLine = Statement["lines"][number];

type Row =
  | { kind: "line"; line: StatementLine; title: string; detail: string; user: string; how: string }
  | { kind: "opening" | "closing"; balance: number; at: number };

/** The filters a list offers, beside its search box. */
export type StatementFilter = "task" | "website" | "user";

const NOT_TIED = "none";

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
  lines,
  statement = false,
  opening,
  closing,
  filters,
  searchPlaceholder,
  fileName,
}: {
  lines: StatementLine[] | undefined;
  /** The statement itself: credits in, the balance after each line, and the month's opening and closing balances. */
  statement?: boolean;
  opening?: number;
  closing?: number;
  filters: StatementFilter[];
  searchPlaceholder: string;
  fileName: string;
}) {
  const words = useUsageWords();
  const { platformName } = useSystemSettings();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [task, setTask] = useState("");
  const [website, setWebsite] = useState("");
  const [user, setUser] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "when", direction: statement ? "asc" : "desc" });

  const described = lines?.map((line) => ({ kind: "line" as const, line, ...describe(line, words, platformName) }));

  const kinds = CREDIT_KIND_ORDER.filter((kind) => described?.some((row) => row.line.kind === kind));
  const hosts = [...new Set(described?.flatMap((row) => (row.line.website ? [row.line.website.host] : [])) ?? [])];
  const anyNotTied = described?.some((row) => row.line.entry === "charge" && !row.line.website) ?? false;
  const users = [...new Set(described?.map((row) => row.user) ?? [])].filter((name) => name !== "–");

  const filtered = described?.filter((row) =>
    (!task || row.line.kind === task)
    && (!website || (website === NOT_TIED ? !row.line.website && row.line.entry === "charge" : row.line.website?.host === website))
    && (!user || row.user === user)
    && matchesSearchTerm(search, [row.title, row.detail, row.user]));

  const sorted = filtered ? [...filtered].sort((a, b) => {
    const by = sort.key === "out" ? a.line.out - b.line.out : sort.key === "user" ? a.user.localeCompare(b.user) : a.line.at - b.line.at;
    return sort.direction === "asc" ? by || a.line.at - b.line.at : -by || b.line.at - a.line.at;
  }) : undefined;

  // The month's opening and closing balances, as a bank statement prints them:
  // only around the whole month, in date order.
  const whole = statement && !task && !website && !user && !search && sort.key === "when" && sort.direction === "asc";
  const rows: Row[] | undefined = sorted && sorted.length > 0 && whole && opening !== undefined && closing !== undefined
    ? [{ kind: "opening", balance: opening, at: sorted[0]?.line.at ?? 0 }, ...sorted, { kind: "closing", balance: closing, at: sorted[sorted.length - 1]?.line.at ?? 0 }]
    : sorted;
  const paged = paginateItems(rows ?? [], page);
  const lineRows = sorted ?? [];

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const download = () => {
    const headers = [words.t("statement.columns.date"), words.t("statement.columns.time"), words.t("statement.columns.description"), words.t("statement.columns.detail"), words.t("statement.columns.user"), words.t("statement.columns.out"), ...(statement ? [words.t("statement.columns.in"), words.t("statement.columns.balance")] : [])];
    saveTextFile(toCsv(headers, lineRows.map((row) => [
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
      sortable: true,
      cell: lineOnly((row) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap text-[13px] text-foreground">{row.user}</span>
          <span className="text-[12px] text-secondary">{row.how}</span>
        </span>
      )),
    },
    { key: "out", header: words.t("statement.columns.out"), align: "right", sortable: true, cell: lineOnly((row) => <span className="font-mono text-[13px] text-foreground">{row.line.out ? words.number(row.line.out) : ""}</span>) },
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
          {kinds.map((kind) => <option key={kind} value={kind}>{words.kind(kind)}</option>)}
        </Select>
      ) : null}
      {filters.includes("website") ? (
        <Select value={website} onChange={(next) => reset(() => setWebsite(next))} chip={{ label: words.t("filters.website"), choice: website ? (website === NOT_TIED ? words.t("websites.none") : website) : null }}>
          <option value="">{words.t("filters.everyWebsite")}</option>
          {hosts.map((host) => <option key={host} value={host}>{host}</option>)}
          {anyNotTied ? <option value={NOT_TIED}>{words.t("websites.none")}</option> : null}
        </Select>
      ) : null}
      {filters.includes("user") ? (
        <Select value={user} onChange={(next) => reset(() => setUser(next))} chip={{ label: words.t("filters.user"), choice: user || null }}>
          <option value="">{words.t("filters.everyUser")}</option>
          {users.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      ) : null}
    </>
  );

  const out = lineRows.reduce((sum, row) => sum + row.line.out, 0);
  const into = lineRows.reduce((sum, row) => sum + row.line.in, 0);
  const footer = {
    mode: "paged" as const,
    page: paged.page,
    totalPages: paged.totalPages,
    totalCount: paged.totalItems,
    pageSize: paged.pageSize,
    isLoading: lines === undefined,
    onPageChange: setPage,
  };

  const props: ComponentProps<typeof DataTable<Row>> = {
      rows: rows === undefined ? undefined : paged.items,
      rowKey: (row) => (row.kind === "line" ? row.line.id : row.kind),
      columns,
      rowClassName: (row) => (row.kind === "line" ? "" : "bg-foreground/[0.02]"),
      search: { value: search, onChange: (next) => reset(() => setSearch(next)), placeholder: searchPlaceholder },
      filters: chips,
      sort: { key: sort.key, direction: sort.direction, onSort: (key) => reset(() => setSort((before) => ({ key, direction: before.key === key ? (before.direction === "asc" ? "desc" : "asc") : key === "when" ? (statement ? "asc" : "desc") : "desc" }))) },
      empty: { icon: <ReceiptText className="h-8 w-8 text-muted/30" />, label: search || task || website || user ? words.t("statement.noMatch") : words.t("statement.empty") },
      cardHeader: (
        <TableBar
          footer={{ isLoading: lines === undefined, totalCount: lineRows.length }}
          noun="lines"
          actions={<DownloadButton label={words.t("download")} onClick={download} disabled={lineRows.length === 0} />}
        >
          <span className="text-[13px] text-secondary">{statement ? words.t("statement.totals", { out: words.number(out), in: words.number(into) }) : words.t("statement.used", { out: words.number(out) })}</span>
        </TableBar>
      ),
      footer,
  };
  return props;
}
