"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { Meter } from "@/src/ui/components/screens/Meter";
import { StatusLabel, type StatusIconName } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TableFilterSelect } from "@/src/ui/components/screens/TableControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useNow } from "@/src/hooks/useNow";
import { formatTime } from "@/src/lib/dates";

/**
 * Collection pipeline's **Collecting now**: every collection and Search Console
 * download going, or finished today, and what each is doing — the drawing
 * approved 2026-10-05 (docs/plans/active/collection-progress-plan.md; Anthony:
 * "I don't see what it's working on, just waiting").
 *
 * A hook rather than a component: the page draws the table itself, under its
 * own header, as every list screen does (`check:screen-kit`).
 */

type Progress = FunctionReturnType<typeof api.seoCollectionProgress.listCollectionsNow>;
type NowRow = Progress["rows"][number];
type Show = "IN_PROGRESS" | "FINISHED_TODAY" | "EVERYTHING";

const MINUTE_MS = 60_000;

/** "16 min", "2 h 5 min". */
function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const time = (at: number) => formatTime(at, { options: { hour: "2-digit", minute: "2-digit" } });
const number = (value: number) => value.toLocaleString("en-GB");

/** How each state reads: its tone, and the named icon when the tone's own does not say it. */
const LOOK: Record<NowRow["state"] | "DONE_EMPTY", { tone: StatusTone; icon?: StatusIconName }> = {
  WRITING: { tone: "info", icon: "working" },
  SENDING: { tone: "info", icon: "working" },
  WAITING_TO_SEND: { tone: "info", icon: "waiting" },
  ANSWERS: { tone: "info", icon: "waiting" },
  CLOSING: { tone: "info", icon: "working" },
  DOWNLOADING: { tone: "info", icon: "working" },
  DONE: { tone: "success" },
  DONE_EMPTY: { tone: "info" },
  NEEDS_YOU: { tone: "warning" },
  STOPPED: { tone: "warning" },
};

export function useCollectingNow() {
  const t = useTranslations("admin.seoCollection.now");
  const tCollection = useTranslations("admin.seoCollection");
  const now = useNow(15_000);
  const [show, setShow] = useState<Show>("IN_PROGRESS");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const progress = useQuery(api.seoCollectionProgress.listCollectionsNow, { show });

  const operation = (id: string) => tCollection(`operation.${id}`);
  const searched = (progress?.rows ?? []).filter((row) => {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return true;
    return [row.companyName, row.host ?? "", ...row.outGroups.flatMap((group) => group.hosts)].join(" ").toLowerCase().includes(wanted);
  });
  const pages = Math.max(1, Math.ceil(searched.length / TABLE_PAGE_SIZE));
  const shown = searched.slice((Math.min(page, pages) - 1) * TABLE_PAGE_SIZE, Math.min(page, pages) * TABLE_PAGE_SIZE);

  const stateKey = (row: NowRow) => (row.kind === "SEARCH_CONSOLE" && row.state === "DONE" && row.days?.known && row.days.rows === 0 ? "DONE_EMPTY" : row.state);
  const stateWords = (row: NowRow) => {
    const key = stateKey(row);
    if (key === "DONE") return t("state.DONE", { time: time(row.finishedAt ?? row.startedAt) });
    return t(`state.${key}`);
  };

  const doingLine = (row: NowRow): string => {
    if (row.needsYou) return row.needsYou;
    if (row.stopped) return row.stopped;
    if (row.kind === "SEARCH_CONSOLE") {
      if (stateKey(row) === "DONE_EMPTY") return t("doing.googleEmpty");
      return row.days?.latest ?? "";
    }
    switch (row.state) {
      case "WRITING":
        return t("doing.writing");
      case "SENDING":
        return row.sending ? (row.sending.host ? t("doing.sending", { host: row.sending.host, operation: operation(row.sending.operationId) }) : operation(row.sending.operationId)) : "";
      case "WAITING_TO_SEND":
        return t("doing.waitingToSend");
      case "ANSWERS": {
        const group = row.outGroups[0];
        if (!group) return "";
        const values = { count: group.count, duration: duration(now - group.since), operation: operation(group.operationId), hosts: group.hosts.join(", ") };
        return group.hosts.length > 0 ? t("doing.out", values) : t("doing.outNoHosts", values);
      }
      case "CLOSING":
        return t("doing.closing");
      default:
        return row.reused > 0 ? t("doing.reused", { count: number(row.reused) }) : "";
    }
  };

  const leftLines = (row: NowRow): [string, string] => {
    if (row.finishedAt !== null) return [t("left.finished"), ""];
    if (row.state === "NEEDS_YOU") return [t("left.waitsForYou"), t("left.nothingLost")];
    if (row.kind === "SEARCH_CONSOLE") {
      const days = row.days;
      if (!days || days.done === 0 || days.done >= days.total) return [t("left.downloadingSoon"), ""];
      const minutes = Math.round(((now - row.startedAt) / days.done) * (days.total - days.done) / MINUTE_MS);
      return [minutes < 1 ? t("left.downloadingSoon") : t("left.downloading", { minutes }), ""];
    }
    if (row.state === "WRITING") return [t("left.writing"), ""];
    if (row.state === "CLOSING") return [t("left.closing"), ""];
    const slowest = row.outGroups[0];
    const usually = slowest?.typicalMs ? t("left.usually", { duration: duration(slowest.typicalMs) }) : t("left.usuallyUnknown");
    if (row.sendSecondsLeft !== null) {
      const minutes = Math.round(row.sendSecondsLeft / 60);
      return [minutes < 1 ? t("left.sendSoon") : t("left.send", { minutes }), t("left.thenOut", { typical: usually })];
    }
    return [usually, slowest ? t("left.givesUp", { time: time(slowest.givesUpAt) }) : ""];
  };

  const countsLine = (row: NowRow): string => {
    const more = row.countsCut ? "+" : "";
    if (row.kind === "SEARCH_CONSOLE" && row.days) {
      const rows = t("count.rows", { count: number(row.days.rows) });
      return row.days.total > 0 ? [t("count.days", { done: row.days.done, total: row.days.total }), rows].join(" · ") : rows;
    }
    return [
      t("count.back", { back: number(row.back), planned: number(row.planned) }),
      row.out > 0 ? t("count.out", { count: `${number(row.out)}${more}` }) : null,
      row.toSend > 0 ? t("count.toSend", { count: `${number(row.toSend)}${more}` }) : null,
      row.failed > 0 ? t("count.failed", { count: number(row.failed) }) : null,
    ].filter(Boolean).join(" · ");
  };

  const whenLine = (row: NowRow) => {
    const how = t(`how.${row.how}`);
    if (row.finishedAt !== null) return t("ran", { how, start: time(row.startedAt), end: time(row.finishedAt) });
    return row.startedBy ? t("startedBy", { how, time: time(row.startedAt), name: row.startedBy }) : t("started", { how, time: time(row.startedAt) });
  };

  const steps = (row: NowRow): ReactNode => {
    const items: Array<{ at: string; tone: StatusTone; icon?: StatusIconName; words: string; line: string }> = [];
    const done = (at: string, words: string, line: string) => items.push({ at, tone: "success", words, line });
    const current = (words: string, line: string, icon: StatusIconName = "working") => items.push({ at: t("steps.now"), tone: "info", icon, words, line });
    const later = (at: string, words: string, line: string) => items.push({ at, tone: "neutral", words, line });
    if (row.kind === "SEARCH_CONSOLE") {
      const days = row.days ?? { done: 0, total: 0, rows: 0, latest: null, known: false };
      const words = days.total > 0 ? t("steps.downloaded", { done: days.done, total: days.total }) : t("count.rows", { count: number(days.rows) });
      const line = t("steps.downloadedLine", { rows: number(days.rows) });
      if (row.finishedAt !== null) done(time(row.finishedAt), words, line);
      else current(words, line);
    } else {
      const sent = row.planned - row.toSend;
      done(time(row.startedAt), t("steps.written"), t("steps.writtenLine", { count: row.planned, reused: number(row.reused) }));
      if (row.toSend > 0) {
        if (row.state === "NEEDS_YOU") items.push({ at: t("steps.now"), tone: "warning", words: t("steps.sending", { sent: number(sent), planned: number(row.planned) }), line: row.needsYou ?? "" });
        else current(t("steps.sending", { sent: number(sent), planned: number(row.planned) }), t("steps.sendingLine"));
        later(t("steps.next"), t("steps.answers"), "");
      } else {
        done("", t("steps.sent"), t("steps.sendingLine"));
        if (row.out > 0) current(t("steps.answers"), t("steps.answersLine", { back: number(row.back), out: number(row.out) }), "waiting");
        else done("", t("steps.answers"), t("steps.answersLine", { back: number(row.back), out: 0 }));
      }
      if (row.finishedAt !== null) done(time(row.finishedAt), t("steps.closed"), t("steps.closesLine"));
      else later(t("steps.then"), t("steps.closes"), t("steps.closesLine"));
    }
    return (
      <div className="flex flex-col gap-3">
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-4">
              <span className="w-[52px] shrink-0 font-mono text-[12px] tabular-nums text-secondary">{item.at}</span>
              <StatusLabel tone={item.tone} icon={item.icon}>{item.words}</StatusLabel>
              <span className="text-[12px] text-secondary">{item.line}</span>
            </li>
          ))}
        </ol>
        {row.cycleId ? (
          <a href={`/admin/websites/collection/${row.cycleId}`} className="inline-flex items-center gap-1.5 self-start text-[12px] font-medium text-secondary transition-colors hover:text-foreground">
            {t("steps.open")} →
          </a>
        ) : null}
      </div>
    );
  };

  const columns: DataTableColumn<NowRow>[] = [
    {
      key: "collection",
      header: t("columns.collection"),
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">
            {row.kind === "SEARCH_CONSOLE" ? t("searchConsole", { host: row.host ?? "" }) : row.companyName}
          </span>
          <span className="text-[12px] text-secondary">
            {row.kind === "SEARCH_CONSOLE" ? `${row.companyName} · ${whenLine(row)}` : whenLine(row)}
          </span>
        </div>
      ),
    },
    {
      key: "progress",
      header: t("columns.progress"),
      cell: (row) => (
        <div className="flex min-w-[140px] flex-col gap-2 pt-1">
          <Meter
            size="md"
            value={row.planned > 0 ? row.back / row.planned : row.finishedAt !== null ? 1 : 0}
            then={row.planned > 0 ? row.out / row.planned : 0}
          />
          <span className="font-mono text-[12px] tabular-nums text-secondary">{countsLine(row)}</span>
        </div>
      ),
    },
    {
      key: "doing",
      header: t("columns.doing"),
      cell: (row) => {
        const look = LOOK[stateKey(row)];
        return (
          <div className="flex flex-col gap-1">
            <StatusLabel tone={look.tone} icon={look.icon} wrap>{stateWords(row)}</StatusLabel>
            <span className="text-[12px] text-secondary">{doingLine(row)}</span>
          </div>
        );
      },
    },
    {
      key: "left",
      header: t("columns.left"),
      cell: (row) => {
        const [first, second] = leftLines(row);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-foreground">{first}</span>
            {second ? <span className="text-[12px] text-secondary">{second}</span> : null}
          </div>
        );
      },
    },
    {
      key: "cost",
      header: t("columns.cost"),
      align: "right",
      cell: (row) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-[13px] text-foreground">{row.costUsd === null ? t("cost.free") : `$${row.costUsd.toFixed(2)}`}</span>
          <span className="whitespace-nowrap text-[12px] text-secondary">{row.costUsd === null ? t("cost.freeLine") : t("cost.real")}</span>
        </div>
      ),
    },
    {
      key: "credits",
      header: t("columns.credits"),
      align: "right",
      cell: (row) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-[13px] text-foreground">{row.credits === null ? "–" : number(row.credits)}</span>
          <span className="whitespace-nowrap text-[12px] text-secondary">
            {row.credits === null ? t("credits.none") : row.creditsCounted ? t("credits.counted") : t("credits.counting")}
          </span>
        </div>
      ),
    },
  ];

  const showLabel = (value: Show) => t(`show.${value}`);
  const headline = progress?.headline;
  const headlineLook: { tone: StatusTone; icon?: StatusIconName } = !headline
    ? { tone: "neutral" }
    : headline.kind === "NEEDS_YOU"
      ? { tone: "warning" }
      : headline.kind === "IDLE"
        ? { tone: "neutral" }
        : { tone: "info", icon: "working" };
  const headlineLine = !headline
    ? ""
    : headline.kind === "NEEDS_YOU"
      ? (headline.needsYou ?? "")
      : headline.kind === "SENDING"
        ? t("line.SENDING", { company: headline.sendingFor ?? "", collections: headline.collections, downloads: headline.downloads })
        : t(`line.${headline.kind}`, { collections: headline.collections, downloads: headline.downloads });

  const emptyLabel = query ? t("noMatch") : show === "FINISHED_TODAY" ? t("emptyFinished") : t("empty");
  return {
    title: t("title"),
    headline: headline ? { ...headlineLook, words: t(`headline.${headline.kind}`), line: headlineLine } : null,
    table: {
      rows: progress === undefined ? undefined : shown,
      rowKey: (row: NowRow) => row.key,
      columns,
      rowDetail: { label: () => t("steps.label"), content: steps },
      search: { value: query, onChange: (next: string) => { setQuery(next); setPage(1); }, placeholder: t("searchPlaceholder") },
      filters: (
        <TableFilterSelect
          label={t("show.label")}
          options={(["IN_PROGRESS", "FINISHED_TODAY"] as const).map(showLabel)}
          value={show === "EVERYTHING" ? null : showLabel(show)}
          onChange={(next) => {
            setShow(next === showLabel("IN_PROGRESS") ? "IN_PROGRESS" : next === showLabel("FINISHED_TODAY") ? "FINISHED_TODAY" : "EVERYTHING");
            setPage(1);
          }}
          allLabel={showLabel("EVERYTHING")}
          filterPlaceholder={t("show.search")}
          noMatchesLabel={t("show.noMatches")}
        />
      ),
      empty: { icon: <Layers className="h-8 w-8 text-muted/30" />, label: emptyLabel },
      footer: {
        mode: "paged" as const,
        page: Math.min(page, pages),
        totalPages: pages,
        totalCount: searched.length,
        pageSize: TABLE_PAGE_SIZE,
        isLoading: progress === undefined,
        onPageChange: setPage,
        labels: { empty: emptyLabel },
      },
    },
  };
}
