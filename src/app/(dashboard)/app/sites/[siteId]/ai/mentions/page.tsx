"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CUT_COLUMN, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

const STANCES = ["RECOMMENDED", "NAMED", "WARNED_AGAINST", "NOT_NAMED"] as const;

type Mention = { prompt: string; named: number; recommended: number };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * question A to Z — the order it opens on, each question's engines in their
 * usual order, as the server sends them — and the most named and
 * recommended first.
 */
const SORTS: SiteSortColumns<Mention, "question" | "named" | "recommended"> = {
  question: { value: (row) => row.prompt, first: "asc" },
  named: { value: (row) => row.named, first: "desc" },
  recommended: { value: (row) => row.recommended, first: "desc" },
};
const promptOf = (row: Mention) => row.prompt;
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
  const router = useRouter();
  const listHref = useSiteListHref(siteId);
  // A question opens what that engine said to it, word for word.
  const answersHref = (row: { prompt: string; engine: string }) => listHref("ai/answers", { question: row.prompt, engine: row.engine });

  const rows = useQuery(api.siteAi.listMentions, { siteId });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const points = (series?.[0]?.points ?? []).filter((point) => point.ai.length > 0);
  const engines = [...new Set(points.flatMap((point) => point.ai.map((entry) => entry.engine)))];

  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) =>
    (!matches || matches(row.prompt))
    && (!engine || row.engine === engine)
    && (!stance || row.lastStance === stance));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "question", name: promptOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
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
        rows={pager.pageRows}
        rowKey={(row) => `${row.prompt}::${row.engine}`}
        onRowClick={(row) => router.push(answersHref(row))}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("engineFilter"), choice: engine ? engineLabel(engine) : null }} value={engine} onChange={setEngine}>
              <option value="">{t("allEngines")}</option>
              {allEngines.map((entry) => <option key={entry} value={entry}>{engineLabel(entry)}</option>)}
            </Select>
            <Select chip={{ label: t("stanceFilter"), choice: stance ? t(`stances.${stance}`) : null }} value={stance} onChange={(value) => setStance(value as Stance | "")}>
              <option value="">{t("anyStance")}</option>
              {STANCES.map((entry) => <option key={entry} value={entry}>{t(`stances.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="results" actions={<ListDownload fileName={`${site?.host ?? "site"}-ai-mentions`} rows={sorted} columns={[{ header: t("columns.question"), value: (row) => row.prompt }, { header: t("columns.engine"), value: (row) => engineLabel(row.engine) }, { header: t("columns.latest"), value: (row) => t(`stances.${row.lastStance ?? "NOT_ASKED"}`) }, { header: t("columns.named"), value: (row) => row.named }, { header: t("columns.recommended"), value: (row) => row.recommended }, { header: t("columns.lastChecked"), value: (row) => row.lastAskedDay }]} />} />}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || engine || stance ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "question", header: t("columns.question"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={answersHref(row)}>{row.prompt}</RecordLinkCell> },
          { key: "engine", header: t("columns.engine"), cell: (row) => <span className="text-[12px] text-secondary">{engineLabel(row.engine)}</span> },
          {
            key: "latest",
            header: t("columns.latest"),
            cell: (row) => {
              const key = row.lastStance ?? "NOT_ASKED";
              return <StatusPill tone={STANCE_TONES[key]}>{t(`stances.${key}`)}</StatusPill>;
            },
          },
          { key: "named", header: t("columns.named"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{t("namedOf", { named: row.named, asked: row.asked })}</span> },
          { key: "recommended", header: t("columns.recommended"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.recommended}</span> },
        ]}
      />
    </div>
  );
}
