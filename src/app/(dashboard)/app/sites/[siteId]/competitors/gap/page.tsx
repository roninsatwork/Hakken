"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Puzzle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { GAP_KEYWORDS_PER_RIVAL } from "@/convex/utils/siteShapes";
import { CUT_COLUMN, IntentPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
type Intent = (typeof INTENTS)[number];

/**
 * The columns that sort, over every gap (docs/plans/active/
 * sites-table-sorting-plan.md): the search A to Z, the most searched and the
 * most competitors ranking first, and the best of their positions from the top.
 */
const SORTS = { keyword: "asc", volume: "desc", rivals: "desc", best: "asc" } as const;

/**
 * Content gap: searches the other websites in the group rank for and this one
 * does not, most searched first unless a heading asks otherwise. Worked out for this company's hold when any
 * site in the group is filed, then searched, filtered and paged on the server.
 */
export default function SiteContentGapPage() {
  const router = useRouter();
  const t = useTranslations("sites.gap");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const recordHref = useSiteRecordHref(siteId);
  const site = useSite();
  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<Intent | "">("intent", "", INTENTS);
  const [rivalsText, setRivalsText] = useSiteParam<string>("rivals", "1");
  const minRivals = Math.max(1, Number(rivalsText) || 1);
  const order = useSiteSort(SORTS, "volume");
  const table = useSiteListPage(api.siteCompetitors.listContentGap, {
    siteId,
    ...(settled ? { search: settled } : {}),
    ...(intent ? { intent } : {}),
    ...(minRivals > 1 ? { minRivals } : {}),
    sort: order.key,
    direction: order.direction,
  }, [{ siteId, list: "gap" }]);
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
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: tc("intentFilter"), choice: intent ? tc(`intents.${intent}`) : null }} value={intent} onChange={(value) => setIntent(value as Intent | "")}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("rivalsFilter"), choice: minRivals > 1 ? t("atLeast", { count: minRivals }) : null }} value={String(minRivals)} onChange={(value) => setRivalsText(value)}>
              <option value="1">{t("anyRivals")}</option>
              {Array.from({ length: most - 1 }, (_, index) => index + 2).map((count) => (
                <option key={count} value={count}>{t("atLeast", { count })}</option>
              ))}
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={table.footer} noun="keywords" actions={<TableDownload siteId={siteId} kind="gap" sort={order.tableSort} />} />}
        empty={{ icon: <Puzzle className="h-8 w-8 text-muted/30" />, label: settled || intent || minRivals > 1 ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "keyword", header: t("columns.keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "intent", header: t("columns.intent"), cell: (row) => <IntentPill intent={row.intent} /> },
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.volume)}</span> },
          {
            key: "rivals",
            header: t("columns.rivals"),
            // By how many competitors rank for it.
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col gap-0.5 text-[12px] text-secondary">
                {row.rivals.map((rival) => <span key={rival.websiteId}>{rival.host} · <span className="font-mono">{rival.position}</span></span>)}
              </span>
            ),
          },
          { key: "best", header: t("columns.best"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{row.bestRivalPosition}</span> },
        ]}
      />
    </div>
  );
}
