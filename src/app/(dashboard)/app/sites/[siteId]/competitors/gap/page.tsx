"use client";

import { useTranslations } from "next-intl";
import { Puzzle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { GAP_KEYWORDS_PER_RIVAL } from "@/convex/utils/siteShapes";
import { CheckedCell, IntentPill } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
type Intent = (typeof INTENTS)[number];

/**
 * Content gap: searches the other websites in the group rank for and this one
 * does not, most searched first. Worked out for this company's hold when any
 * site in the group is filed, then searched, filtered and paged on the server.
 */
export default function SiteContentGapPage() {
  const t = useTranslations("sites.gap");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<Intent | "">("intent", "", INTENTS);
  const [rivalsText, setRivalsText] = useSiteParam<string>("rivals", "1");
  const minRivals = Math.max(1, Number(rivalsText) || 1);
  const table = useSitePagedTable(api.siteCompetitors.listContentGap, {
    siteId,
    ...(settled ? { search: settled } : {}),
    ...(intent ? { intent } : {}),
    ...(minRivals > 1 ? { minRivals } : {}),
  });
  const most = Math.max(1, site?.rivals.length ?? 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Puzzle className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={<span className="text-[12px] text-secondary">{t("ceiling", { count: formatNumber(GAP_KEYWORDS_PER_RIVAL) })}</span>}
      />
      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[900px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={tc("intentFilter")} value={intent} onChange={(value) => setIntent(value as Intent | "")}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select aria-label={t("rivalsFilter")} value={String(minRivals)} onChange={(value) => setRivalsText(value)}>
              <option value="1">{t("anyRivals")}</option>
              {Array.from({ length: most - 1 }, (_, index) => index + 2).map((count) => (
                <option key={count} value={count}>{t("atLeast", { count })}</option>
              ))}
            </Select>
            <TableDownload siteId={siteId} kind="gap" />
          </>
        }
        empty={{ icon: <Puzzle className="h-8 w-8 text-muted/30" />, label: settled || intent || minRivals > 1 ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: table.page,
          totalPages: table.totalPages,
          totalCount: table.loadedCount,
          pageSize: table.pageSize,
          isLoading: table.isBusy,
          onPageChange: table.goToPage,
        }}
        columns={[
          { key: "keyword", header: t("columns.keyword"), cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span> },
          { key: "intent", header: t("columns.intent"), cell: (row) => <IntentPill intent={row.intent} /> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.volume)}</span> },
          {
            key: "rivals",
            header: t("columns.rivals"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5 text-[12px] text-secondary">
                {row.rivals.map((rival) => <span key={rival.websiteId}>{rival.host} · <span className="font-mono">{rival.position}</span></span>)}
              </span>
            ),
          },
          { key: "best", header: t("columns.best"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{row.bestRivalPosition}</span> },
          { key: "checked", header: tc("lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
