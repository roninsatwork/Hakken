"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import {
  CHART_SERIES_AMBER,
  CHART_SERIES_BLUE,
  CHART_SERIES_EMERALD,
  CHART_SERIES_ORANGE,
  CHART_SERIES_ROSE,
  CHART_SERIES_SLATE,
  CHART_SERIES_TEAL,
  CHART_SERIES_VIOLET,
} from "@/src/ui/components/charts/chartPalette";
import { ListDownload } from "@/src/app/(dashboard)/app/sites/_components/SiteDownloads";
import { CostFigure, dollars } from "../../CostFigure";
import { RunStatus } from "../RunStatus";
import { sharePercent, useRunFormat } from "../runFormat";

/** The "where the money went" bar's order and colours, one per kind of spend. */
const CATEGORIES = [
  ["BACKLINKS", CHART_SERIES_ORANGE],
  ["SITE_AUDIT", CHART_SERIES_BLUE],
  ["KEYWORD_LISTS", CHART_SERIES_VIOLET],
  ["SUMMARIES", CHART_SERIES_EMERALD],
  ["COMPARISONS", CHART_SERIES_AMBER],
  ["SEARCHES", CHART_SERIES_TEAL],
  ["AI_ANSWERS", CHART_SERIES_ROSE],
  ["OTHER", CHART_SERIES_SLATE],
] as const;

/** Under a cent either way is no change. */
const NO_CHANGE_USD = 0.005;

type Change = { kind: "NONE" } | { kind: "NEW" } | { kind: "DELTA"; usd: number };

/**
 * One collection run in full: what it cost, where the money went, what was
 * bought and how often it repeats, each website with its limits and its price
 * per thousand keywords, the AI it led to, what the company will cost from
 * here, and the Collector runs that sent it — each line against the run
 * before. Anthony, 2026-09-24, on the report this reproduces: "it's really
 * good intel", and on the drawing of it: "This looks amazing".
 */
export default function CollectionRunPage() {
  const t = useTranslations("admin.collectionRuns");
  const tDetail = useTranslations("admin.collectionRuns.detail");
  const tOperation = useTranslations("admin.seoCollection.operation");
  const tDecision = useTranslations("decisions.catalogue");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const cycleId = params.cycleId as Id<"seoCollectionCycles">;
  const data = useQuery(api.seoRunReports.getRunReport, { cycleId });

  const back = { label: tDetail("back"), href: `/admin/companies/${companyId}/websites/runs` };
  const { count, when, clock } = useRunFormat();

  if (data === undefined) return null;
  if (data === null) {
    return (
      <div className="flex w-full flex-col gap-6 pb-12">
        <DetailHeader back={back} icon={<Receipt className="h-6 w-6 text-brand" />} title={tDetail("notFound")} />
      </div>
    );
  }

  const { report, previous } = data;
  const title = tDetail("title", { when: when(data.startedAt) });
  const websites = report ? report.bySite.filter((site) => site.websiteId).length : 0;
  const totalUsd = report ? report.costUsd + report.aiCostUsd : 0;
  const share = (costUsd: number) => sharePercent(costUsd, report?.costUsd ?? 0);

  const changeOf = (costUsd: number, before: number | undefined): Change => {
    if (!previous) return { kind: "NONE" };
    if (before === undefined) return { kind: "NEW" };
    return Math.abs(costUsd - before) < NO_CHANGE_USD ? { kind: "NONE" } : { kind: "DELTA", usd: costUsd - before };
  };
  const showChange = (change: Change): ReactNode => {
    if (change.kind === "NEW") return <span className="text-[12px] text-info">{tDetail("change.new")}</span>;
    if (change.kind === "NONE") return <span className="text-[12px] text-muted">{tDetail("change.none")}</span>;
    // Dearer is the thing to notice on a cost screen, so up reads as the warning.
    return change.usd > 0
      ? <span className="font-mono text-[12px] text-destructive">+{dollars(change.usd)}</span>
      : <span className="font-mono text-[12px] text-success">−{dollars(-change.usd)}</span>;
  };

  const description = !report || report.byCollectorRun.length === 0
    ? tDetail("descriptionUnsent", { company: data.companyName })
    : tDetail("description", {
      company: data.companyName,
      websites,
      runs: report.byCollectorRun.length,
      from: clock(report.byCollectorRun[0]?.startedAt ?? report.firstSentAt ?? data.startedAt),
      to: clock(report.lastSentAt ?? data.startedAt),
    });

  const header = (
    <DetailHeader
      back={back}
      icon={<Receipt className="h-6 w-6 text-brand" />}
      title={title}
      description={description}
      pills={report ? (
        <>
          <StatusPill tone="neutral">{tDetail("filed", { filed: count(report.filed), requests: count(report.requests) })}</StatusPill>
          <RunStatus
            totalUsd={totalUsd}
            previousTotalUsd={previous?.totalUsd ?? null}
            waiting={report.waiting}
            answering={report.answering}
            failed={report.failed}
            final={report.final}
          />
        </>
      ) : null}
      action={report ? (
        <ListDownload
          fileName={`${data.companyName}-run-${new Date(data.startedAt).toISOString().slice(0, 10)}`}
          rows={[
            ...report.byOperation.map((row) => ({ section: tDetail("bought.title"), name: tOperation(row.operationId), requests: row.requests, costUsd: row.costUsd })),
            ...report.bySite.map((row) => ({ section: tDetail("sites.title"), name: row.host || tDetail("sites.shared"), requests: row.requests, costUsd: row.costUsd })),
            ...report.ai.map((row) => ({ section: tDetail("ai.title"), name: row.decisionKey, requests: row.judgements, costUsd: row.costUsd })),
          ]}
          columns={[
            { header: "section", value: (row) => row.section },
            { header: "name", value: (row) => row.name },
            { header: "requests", value: (row) => row.requests },
            { header: "cost_usd", value: (row) => Math.round(row.costUsd * 10_000) / 10_000 },
          ]}
        />
      ) : null}
    />
  );

  if (!report) {
    return (
      <div className="flex w-full flex-col gap-6 pb-12">
        {header}
        <p className="text-[13px] text-secondary">{tDetail("notReady")}</p>
      </div>
    );
  }

  const operationInfo = new Map(data.operations.map((row) => [row.operationId, row]));
  const siteInfo = new Map(data.sites.map((row) => [row.websiteId as string, row]));
  const beforeByOperation = new Map((previous?.byOperation ?? []).map((row) => [row.operationId, row.costUsd]));
  const beforeBySite = new Map((previous?.bySite ?? []).map((row) => [row.websiteId ?? "", row.costUsd]));
  const copyKeyOf = new Map(data.decisions.map((row) => [row.decisionKey, row.copyKey]));

  const byCategory = new Map<string, number>();
  for (const row of report.byOperation) {
    const category = operationInfo.get(row.operationId)?.category ?? "OTHER";
    byCategory.set(category, (byCategory.get(category) ?? 0) + row.costUsd);
  }
  const bars = CATEGORIES.flatMap(([category, colour]) => {
    const costUsd = byCategory.get(category) ?? 0;
    return costUsd > 0 ? [{ category, colour, costUsd }] : [];
  });

  const repeatsOf = (operationId: string) => {
    const everyDays = operationInfo.get(operationId)?.everyDays ?? null;
    if (everyDays === 7) return tDetail("bought.weekly");
    if (everyDays === 30) return tDetail("bought.monthly");
    if (everyDays !== null) return tDetail("bought.everyDays", { days: everyDays });
    return data.cadence
      ? tDetail("bought.company", { company: data.companyName, cadence: t(`cadence.${data.cadence}`) })
      : tDetail("bought.companyOff", { company: data.companyName });
  };

  type OperationRow = (typeof report.byOperation)[number] & { total?: boolean };
  const operationRows: OperationRow[] = [
    ...report.byOperation,
    { operationId: "", requests: report.requests, costUsd: report.costUsd, answering: 0, total: true },
  ];
  type SiteRow = (typeof report.bySite)[number] & { total?: boolean };
  const siteRows: SiteRow[] = [
    ...report.bySite,
    { host: "", requests: report.requests, costUsd: report.costUsd, keywordListCostUsd: 0, keywords: 0, total: true },
  ];
  const strong = (row: { total?: boolean }, text: ReactNode) =>
    row.total ? <span className="font-semibold text-foreground">{text}</span> : text;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      {header}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CostFigure
          label={tDetail("figures.total")}
          value={dollars(totalUsd)}
          hint={tDetail("figures.totalHint", { data: dollars(report.costUsd), ai: dollars(report.aiCostUsd) })}
          emphasis
        />
        <CostFigure
          label={tDetail("figures.requests")}
          value={count(report.requests)}
          hint={tDetail("figures.requestsHint", { count: websites })}
        />
        <CostFigure
          label={tDetail("figures.held")}
          value={count(data.reused)}
          hint={tDetail("figures.heldHint")}
        />
        <CostFigure
          label={tDetail("figures.ai")}
          value={count(report.aiJudgements)}
          hint={tDetail("figures.aiHint", { cost: dollars(report.aiCostUsd) })}
        />
      </div>

      <SettingsCard title={tDetail("money.title")}>
        <p className="text-[12px] text-secondary">{tDetail("money.subtitle", { total: dollars(report.costUsd) })}</p>
        <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-[6px]" aria-hidden="true">
          {bars.map((bar) => (
            <div key={bar.category} style={{ width: `${(bar.costUsd / Math.max(report.costUsd, 0.000001)) * 100}%`, backgroundColor: bar.colour }} />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-secondary">
          {bars.map((bar) => (
            <li key={bar.category} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: bar.colour }} />
              {tDetail("money.legend", {
                name: tDetail(`money.categories.${bar.category}`),
                cost: dollars(bar.costUsd),
                share: share(bar.costUsd),
              })}
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard title={tDetail("bought.title")}>
        <CompactList
          rows={operationRows}
          rowKey={(row) => row.total ? "total" : row.operationId}
          empty={tDetail("sent.none")}
          minWidthClassName="min-w-[720px]"
          columns={[
            {
              key: "what",
              header: tDetail("bought.columns.what"),
              cell: (row) => row.total
                ? strong(row, tDetail("bought.total"))
                : (
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-foreground">{tOperation(row.operationId)}</span>
                    {row.answering > 0 ? <span className="text-[11px] text-info">{tDetail("bought.answering", { count: row.answering })}</span> : null}
                  </span>
                ),
            },
            { key: "requests", header: tDetail("bought.columns.requests"), align: "right", className: "font-mono", cell: (row) => strong(row, count(row.requests)) },
            { key: "cost", header: tDetail("bought.columns.cost"), align: "right", className: "font-mono", cell: (row) => strong(row, dollars(row.costUsd)) },
            {
              key: "change",
              header: tDetail("bought.columns.change"),
              align: "right",
              cell: (row) => row.total
                ? (previous ? showChange(changeOf(report.costUsd, previous.byOperation.reduce((sum, entry) => sum + entry.costUsd, 0))) : null)
                : showChange(changeOf(row.costUsd, beforeByOperation.get(row.operationId))),
            },
            { key: "share", header: tDetail("bought.columns.share"), align: "right", className: "font-mono text-secondary", cell: (row) => strong(row, `${row.total ? 100 : share(row.costUsd)}%`) },
            { key: "repeats", header: tDetail("bought.columns.repeats"), className: "text-secondary", cell: (row) => (row.total ? null : repeatsOf(row.operationId)) },
          ]}
        />
      </SettingsCard>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <SettingsCard title={tDetail("sites.title")}>
          <CompactList
            rows={siteRows}
            rowKey={(row) => (row.total ? "total" : row.websiteId ?? "shared")}
            empty={tDetail("sent.none")}
            minWidthClassName="min-w-[760px]"
            columns={[
              {
                key: "website",
                header: tDetail("sites.columns.website"),
                cell: (row) => {
                  if (row.total) return strong(row, tDetail("bought.total"));
                  if (!row.websiteId) return <span className="text-[12px] text-secondary">{tDetail("sites.shared")}</span>;
                  const info = siteInfo.get(row.websiteId);
                  return (
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] text-foreground">{row.host}</span>
                      {info ? (
                        <span className={`text-[11px] ${info.relationship === "OWNED" ? "text-info" : "text-muted"}`}>
                          {info.relationship === "OWNED" ? tDetail("sites.owned") : tDetail("sites.competitor")}
                        </span>
                      ) : null}
                    </span>
                  );
                },
              },
              {
                key: "keeps",
                header: tDetail("sites.columns.keeps"),
                className: "text-[12px] text-secondary",
                cell: (row) => {
                  const info = row.websiteId ? siteInfo.get(row.websiteId) : undefined;
                  return info ? tDetail("sites.keeps", { keywords: count(info.keywordsPerSite), links: count(info.backlinksPerSite) }) : null;
                },
              },
              { key: "requests", header: tDetail("sites.columns.requests"), align: "right", className: "font-mono", cell: (row) => strong(row, count(row.requests)) },
              { key: "keywords", header: tDetail("sites.columns.keywords"), align: "right", className: "font-mono text-secondary", cell: (row) => (row.total || !row.keywords ? null : count(row.keywords)) },
              {
                key: "perThousand",
                header: tDetail("sites.columns.perThousand"),
                align: "right",
                className: "font-mono text-secondary",
                cell: (row) => (!row.total && row.keywords > 0 ? dollars((row.keywordListCostUsd / row.keywords) * 1_000) : null),
              },
              { key: "cost", header: tDetail("sites.columns.cost"), align: "right", className: "font-mono", cell: (row) => strong(row, dollars(row.costUsd)) },
              {
                key: "change",
                header: tDetail("sites.columns.change"),
                align: "right",
                cell: (row) => (row.total ? null : showChange(changeOf(row.costUsd, beforeBySite.get(row.websiteId ?? "")))),
              },
              { key: "share", header: tDetail("sites.columns.share"), align: "right", className: "font-mono text-secondary", cell: (row) => strong(row, `${row.total ? 100 : share(row.costUsd)}%`) },
            ]}
          />
        </SettingsCard>

        <div className="flex flex-col gap-6">
          <SettingsCard title={tDetail("ai.title")}>
            <CompactList
              rows={report.ai}
              rowKey={(row) => row.decisionKey}
              empty={tDetail("ai.none")}
              columns={[
                {
                  key: "judged",
                  header: tDetail("ai.columns.judged"),
                  cell: (row) => {
                    const copyKey = copyKeyOf.get(row.decisionKey);
                    return <span className="text-[13px] text-foreground">{copyKey ? tDecision(`${copyKey}.name`) : row.decisionKey}</span>;
                  },
                },
                { key: "count", header: tDetail("ai.columns.count"), align: "right", className: "font-mono", cell: (row) => count(row.judgements) },
                { key: "cost", header: tDetail("ai.columns.cost"), align: "right", className: "font-mono", cell: (row) => dollars(row.costUsd) },
              ]}
            />
            {report.ai.length > 0 ? <p className="text-[12px] leading-relaxed text-muted">{tDetail("ai.note")}</p> : null}
          </SettingsCard>

          <SettingsCard title={tDetail("estimate.title", { company: data.companyName })}>
            {data.estimate ? (
              <>
                <p className="text-[12px] text-secondary">{tDetail("estimate.subtitle")}</p>
                <CompactList
                  rows={data.estimate.lines}
                  rowKey={(line) => line.every}
                  empty={null}
                  columns={[
                    { key: "every", cell: (line) => <span className="text-[13px] text-secondary">{tDetail(`estimate.every.${line.every}`)}</span> },
                    {
                      key: "value",
                      align: "right",
                      cell: (line) => (
                        <span className="text-[13px] text-foreground">
                          {tDetail("estimate.line", { cost: dollars(line.costUsd), perMonth: dollars(line.perMonthUsd) })}
                        </span>
                      ),
                    },
                  ]}
                />
                <div className="flex items-center justify-between border-t border-border-dim pt-3 text-[14px] font-semibold text-foreground">
                  <span>{tDetail("estimate.perMonth")}</span>
                  <span className="font-mono">{dollars(data.estimate.perMonthUsd)}</span>
                </div>
                <p className="text-[12px] text-muted">{tDetail("estimate.aiNote")}</p>
              </>
            ) : (
              <p className="text-[12px] text-secondary">{tDetail("estimate.off", { company: data.companyName })}</p>
            )}
          </SettingsCard>

          <SettingsCard title={tDetail("sent.title")}>
            <CompactList
              rows={report.byCollectorRun.map((run, index) => ({ ...run, number: index + 1 }))}
              rowKey={(run) => run.runId ?? `run-${run.number}`}
              empty={tDetail("sent.none")}
              columns={[
                { key: "run", header: tDetail("sent.columns.run"), cell: (run) => tDetail("sent.runName", { number: run.number }) },
                { key: "started", header: tDetail("sent.columns.started"), className: "text-[12px] text-secondary", cell: (run) => (run.startedAt ? when(run.startedAt) : null) },
                { key: "requests", header: tDetail("sent.columns.requests"), align: "right", className: "font-mono", cell: (run) => count(run.requests) },
                { key: "cost", header: tDetail("sent.columns.cost"), align: "right", className: "font-mono", cell: (run) => dollars(run.costUsd) },
                {
                  key: "stopped",
                  header: tDetail("sent.columns.stopped"),
                  className: "text-[12px] text-secondary",
                  cell: (run) => (run.stopped ? tDetail(`sent.stopped.${run.stopped}`) : tDetail("sent.unknown")),
                },
              ]}
            />
          </SettingsCard>
        </div>
      </div>

      <p className="text-[11px] text-muted">{tDetail("workedOut", { time: when(report.builtAt) })}</p>
    </div>
  );
}
