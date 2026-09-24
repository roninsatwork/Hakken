"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const STANCES = ["RECOMMENDED", "NAMED", "WARNED_AGAINST", "NOT_NAMED"] as const;
type Stance = (typeof STANCES)[number];
const STANCE_TONES: Record<Stance | "NOT_ASKED", StatusTone> = {
  RECOMMENDED: "success",
  NAMED: "info",
  WARNED_AGAINST: "danger",
  NOT_NAMED: "neutral",
  NOT_ASKED: "neutral",
};

/**
 * Mentions (AI answers › Mentions): how each engine treats this site on each
 * question it is measured on, as of the newest answer, and how often it has
 * named it. The chart counts the answers that named it, per engine, over the
 * dates chosen. About this site only: who else an answer named is not listed.
 */
export default function SiteMentionsPage() {
  const t = useTranslations("sites.aiMentions");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const [engine, setEngine] = useSiteParam<string>("engine", "");
  const [stance, setStance] = useSiteParam<Stance | "">("stance", "", STANCES);
  const [page, setPage] = useState(1);

  const rows = useQuery(api.siteAi.listMentions, { siteId });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const points = (series?.[0]?.points ?? []).filter((point) => point.ai.length > 0);
  const engines = [...new Set(points.flatMap((point) => point.ai.map((entry) => entry.engine)))];

  const term = settled.toLowerCase();
  const matching = rows?.filter((row) =>
    (!term || row.prompt.toLowerCase().includes(term))
    && (!engine || row.engine === engine)
    && (!stance || row.lastStance === stance));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const allEngines = [...new Set((rows ?? []).map((row) => row.engine))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Sparkles className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-ai-mentions-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...engines.map(engineLabel)], points.map((point) => [point.day, ...engines.map((name) => point.ai.find((entry) => entry.engine === name)?.named ?? 0)]))}
        enoughData={points.length > 0}
      >
        <SiteLineChart
          sharedScale
          data={points.map((point) => ({
            label: formatShortDay(point.day),
            ...Object.fromEntries(engines.map((name) => [name, point.ai.find((entry) => entry.engine === name)?.named ?? 0])),
          }))}
          series={engines.map((name, index) => ({ key: name, name: engineLabel(name), colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => `${row.prompt}::${row.engine}`}
        minWidthClassName="min-w-[900px]"
        search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("engineFilter")} value={engine} onChange={(value) => { setEngine(value); setPage(1); }}>
              <option value="">{t("allEngines")}</option>
              {allEngines.map((entry) => <option key={entry} value={entry}>{engineLabel(entry)}</option>)}
            </Select>
            <Select aria-label={t("stanceFilter")} value={stance} onChange={(value) => { setStance(value as Stance | ""); setPage(1); }}>
              <option value="">{t("anyStance")}</option>
              {STANCES.map((entry) => <option key={entry} value={entry}>{t(`stances.${entry}`)}</option>)}
            </Select>
            <ListDownload fileName={`${site?.host ?? "site"}-ai-mentions`} rows={matching} columns={[{ header: t("columns.question"), value: (row) => row.prompt }, { header: t("columns.engine"), value: (row) => engineLabel(row.engine) }, { header: t("columns.latest"), value: (row) => t(`stances.${row.lastStance ?? "NOT_ASKED"}`) }, { header: t("columns.named"), value: (row) => row.named }, { header: t("columns.recommended"), value: (row) => row.recommended }, { header: t("columns.lastChecked"), value: (row) => row.lastAskedDay }]} />
          </>
        }
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || engine || stance ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: rows === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "question", header: t("columns.question"), cell: (row) => <span className="text-[13px] text-foreground">{row.prompt}</span> },
          { key: "engine", header: t("columns.engine"), cell: (row) => <span className="text-[12px] text-secondary">{engineLabel(row.engine)}</span> },
          {
            key: "latest",
            header: t("columns.latest"),
            cell: (row) => {
              const key = row.lastStance ?? "NOT_ASKED";
              return <StatusPill tone={STANCE_TONES[key]}>{t(`stances.${key}`)}</StatusPill>;
            },
          },
          { key: "named", header: t("columns.named"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{t("namedOf", { named: row.named, asked: row.asked })}</span> },
          { key: "recommended", header: t("columns.recommended"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.recommended}</span> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.lastAskedDay} /> },
        ]}
      />
    </div>
  );
}
