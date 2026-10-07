"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarClock, Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { UsageWebsiteName } from "../_components/UsageParts";
import { useUsageWords } from "../_components/usageWords";

/**
 * Usage → Coming up (docs/plans/active/usage-credits-plan.md, board
 * ComingUp): what the company's schedules will use — to the end of this
 * month and in the next — worked out from how each scheduled check has run.
 */

type ComingUp = NonNullable<FunctionReturnType<typeof api.creditUsage.usageComingUp>>;
type Check = ComingUp["checks"][number];

export default function UsageComingUpPage() {
  const words = useUsageWords();
  const data = useQuery(api.creditUsage.usageComingUp, {});
  const [search, setSearch] = useState("");
  const [website, setWebsite] = useState("");
  const [often, setOften] = useState("");
  const [page, setPage] = useState(1);

  const checks = data?.checks;
  const oftenOf = (check: Check) => words.often(check.everyDays);
  const hosts = [...new Set(checks?.flatMap((check) => (check.website ? [check.website.host] : [])) ?? [])];
  const oftens = [...new Set(checks?.map(oftenOf) ?? [])];
  const rows = checks?.filter((check) =>
    (!website || check.website?.host === website)
    && (!often || oftenOf(check) === often)
    && matchesSearchTerm(search, [words.kind(check.kind), check.title, check.website?.host, check.setUpBy]));
  const paged = paginateItems(rows ?? [], page);

  const booked = checks?.reduce((sum, check) => sum + check.toMonthEnd, 0) ?? 0;
  const bookedNext = checks?.reduce((sum, check) => sum + check.nextMonth, 0) ?? 0;
  const websitesCount = new Set(checks?.flatMap((check) => (check.website ? [check.website.websiteId] : [])) ?? []).size;
  const lastDay = data ? data.endsAt - 1 : 0;
  const shownThisMonth = rows?.reduce((sum, check) => sum + check.toMonthEnd, 0) ?? 0;
  const shownNextMonth = rows?.reduce((sum, check) => sum + check.nextMonth, 0) ?? 0;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<Gauge className="h-6 w-6 text-brand" />} title={words.t("comingUp.title")} description={words.t("comingUp.description")} />
        <Notice>{words.t("comingUp.notice")}</Notice>
        {data === null ? <Notice>{words.t("noCompany")}</Notice> : (
          <>
            <FigureRow>
              <Figure label={words.t("comingUp.figures.booked", { date: data ? words.date(lastDay) : "" })} value={data ? words.number(booked) : "…"} detail={data ? words.t("comingUp.figures.bookedDetail", { left: words.number(data.planLeft) }) : null} />
              <Figure
                label={words.t("comingUp.figures.next", { month: data ? words.month(data.nextMonth) : "", plan: words.number(data?.nextMonthCredits ?? 0) })}
                value={data ? words.number(bookedNext) : "…"}
                detail={data ? <Meter value={data.nextMonthCredits ? bookedNext / data.nextMonthCredits : null} size="md" /> : null}
              />
              <Figure emphasis label={words.t("comingUp.figures.free", { month: data ? words.monthName(data.nextMonth) : "" })} value={data ? words.number(Math.max(0, data.nextMonthCredits - bookedNext)) : "…"} detail={words.t("comingUp.figures.freeDetail")} />
              <Figure label={words.t("comingUp.figures.checks")} value={checks ? words.number(checks.length) : "…"} detail={words.t("comingUp.figures.checksDetail", { count: websitesCount })} />
            </FigureRow>

            <DataTable
              rows={rows === undefined ? undefined : paged.items}
              rowKey={(check) => check.taskId ?? `${check.kind}:${check.website?.websiteId ?? "none"}`}
              search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: words.t("comingUp.search") }}
              filters={(
                <>
                  <Select value={website} onChange={(next) => { setWebsite(next); setPage(1); }} chip={{ label: words.t("filters.website"), choice: website || null }}>
                    <option value="">{words.t("filters.everyWebsite")}</option>
                    {hosts.map((host) => <option key={host} value={host}>{host}</option>)}
                  </Select>
                  <Select value={often} onChange={(next) => { setOften(next); setPage(1); }} chip={{ label: words.t("lines.often"), choice: often || null }}>
                    <option value="">{words.t("lines.everyOften")}</option>
                    {oftens.map((word) => <option key={word} value={word}>{word}</option>)}
                  </Select>
                </>
              )}
              empty={{ icon: <CalendarClock className="h-8 w-8 text-muted/30" />, label: search || website || often ? words.t("comingUp.noMatch") : words.t("comingUp.empty") }}
              cardHeader={(
                <TableBar
                  footer={{ isLoading: data === undefined, totalCount: rows?.length ?? 0 }}
                  noun="checks"
                  actions={<ListDownload fileName="usage-coming-up" rows={rows} columns={[
                    { header: words.t("comingUp.columns.next"), value: (check) => `${words.date(check.nextAt)} ${words.time(check.nextAt)}` },
                    { header: words.t("comingUp.columns.task"), value: (check) => check.title ?? words.kind(check.kind) },
                    { header: words.t("comingUp.columns.website"), value: (check) => check.website?.host ?? words.t("websites.none") },
                    { header: words.t("comingUp.columns.often"), value: oftenOf },
                    { header: words.t("comingUp.columns.setUpBy"), value: (check) => check.setUpBy ?? "" },
                    { header: words.t("comingUp.columns.each"), value: (check) => check.each },
                    { header: words.t("comingUp.columns.thisMonth"), value: (check) => check.toMonthEnd },
                    { header: words.t("comingUp.columns.nextMonth"), value: (check) => check.nextMonth },
                  ]} />}
                >
                  <span className="text-[13px] text-secondary">{words.t("comingUp.totals", { thisMonth: words.number(shownThisMonth), nextMonth: words.number(shownNextMonth) })}</span>
                </TableBar>
              )}
              footer={{ mode: "paged", page: paged.page, totalPages: paged.totalPages, totalCount: paged.totalItems, pageSize: paged.pageSize, isLoading: data === undefined, onPageChange: setPage }}
              columns={[
                {
                  key: "next",
                  header: words.t("comingUp.columns.next"),
                  cell: (check) => (
                    <span className="flex flex-col font-mono text-[12px] tabular-nums">
                      <span className="whitespace-nowrap text-foreground">{words.date(check.nextAt)}</span>
                      <span className="text-secondary">{words.time(check.nextAt)}</span>
                    </span>
                  ),
                },
                {
                  key: "task",
                  header: words.t("comingUp.columns.task"),
                  // A Hakken task by its title, with its kind beneath (hakken-tasks-plan.md, across all of it).
                  cell: (check) => check.title ? (
                    <span className="flex flex-col">
                      <span className="text-[13px] text-foreground">{check.title}</span>
                      <span className="text-[11px] text-secondary">{words.kind(check.kind)}</span>
                    </span>
                  ) : <span className="text-[13px] text-foreground">{words.kind(check.kind)}</span>,
                },
                { key: "website", header: words.t("comingUp.columns.website"), cell: (check) => <UsageWebsiteName website={check.website} words={words} /> },
                { key: "often", header: words.t("comingUp.columns.often"), cell: (check) => <TagLabel>{oftenOf(check)}</TagLabel> },
                { key: "setUpBy", header: words.t("comingUp.columns.setUpBy"), cell: (check) => <span className="whitespace-nowrap text-[13px] text-foreground">{check.setUpBy ?? "–"}</span> },
                { key: "each", header: words.t("comingUp.columns.each"), align: "right", cell: (check) => <span className="font-mono text-[12px] tabular-nums text-secondary">{words.number(check.each)}</span> },
                { key: "thisMonth", header: words.t("comingUp.columns.thisMonth"), align: "right", cell: (check) => <span className="font-mono text-[13px] text-foreground">{check.toMonthEnd ? words.number(check.toMonthEnd) : "–"}</span> },
                { key: "nextMonth", header: words.t("comingUp.columns.nextMonth"), align: "right", cell: (check) => <span className="font-mono text-[13px] text-foreground">{words.number(check.nextMonth)}</span> },
              ]}
            />
          </>
        )}
      </div>
    </>
  );
}
