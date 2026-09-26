"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Scale } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Compared = { host: string; domainRank: number | null; backlinks: number | null; referringDomains: number | null };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * website A to Z, and the strongest, most links and most linking websites —
 * the order it opens on — first; this site sorted in with the rest, still
 * marked.
 */
const SORTS: SiteSortColumns<Compared, "website" | "rank" | "backlinks" | "domains"> = {
  website: { value: (row) => row.host, first: "asc" },
  rank: { value: (row) => row.domainRank, first: "desc" },
  backlinks: { value: (row) => row.backlinks, first: "desc" },
  domains: { value: (row) => row.referringDomains, first: "desc" },
};
const hostOf = (row: Compared) => row.host;

/**
 * Backlinks › Compared with rivals: the site's links beside the others in its
 * group, as each stood at its newest check.
 */
export default function SiteBacklinksComparedPage() {
  const t = useTranslations("sites.backlinksCompared");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const rows = useQuery(api.siteCharts.siteAndRivals, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const lower = settled.toLowerCase();
  const matches = wordStartMatcher(lower);
  const shown = rows?.filter((row) => !matches || matches(row.host));
  // Fifteen rows a page, like every table, however many rivals a group holds.
  const { rows: sorted, tableSort } = useSiteSortedList(shown, SORTS, { opening: "domains", name: hostOf });
  const paged = useSitePager(sorted ?? [], { isLoading: rows === undefined });
  const router = useRouter();
  const listHref = useSiteListHref(siteId);
  // Each competitor the company holds opens its own Backlinks summary.
  const theirsHref = (row: { host: string; isYou: boolean }): string | null => {
    if (row.isYou) return null;
    const hold = site?.holds.find((entry) => entry.host === row.host);
    return hold ? listHref("backlinks", {}, hold.siteId) : null;
  };
  const name = (row: { host: string; isYou: boolean }) => (row.isYou ? tc("you", { host: row.host }) : row.host);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Scale className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-links-compared`}
        csv={() => toCsv([t("columns.website"), t("columns.rank"), t("columns.backlinks"), t("columns.referringDomains")], (rows ?? []).map((row) => [row.host, row.domainRank, row.backlinks, row.referringDomains]))}
        enoughData={(rows ?? []).some((row) => row.referringDomains !== null)}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, (rows?.length ?? 0) * 44)}
          data={(rows ?? []).map((row) => ({ label: name(row), referringDomains: row.referringDomains }))}
          series={[{ key: "referringDomains", name: t("columns.referringDomains"), colour: SITE_SERIES_COLOURS[1] }]}
        />
      </SiteChartCard>

      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.websiteId}
        onRowClick={(row) => { const href = theirsHref(row); if (href) router.push(href); }}
        rowClickable={(row) => theirsHref(row) !== null}
        minWidthClassName="min-w-[640px]"
        search={{ value: search, onChange: setSearch, placeholder: tc("findWebsite") }}
        cardHeader={<SiteTableBar footer={paged.footer} noun="websites" actions={<ListDownload fileName={`${site?.host ?? "site"}-links-compared`} rows={sorted} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.rank"), value: (row) => row.domainRank }, { header: t("columns.backlinks"), value: (row) => row.backlinks }, { header: t("columns.referringDomains"), value: (row) => row.referringDomains }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Scale className="h-8 w-8 text-muted/30" />, label: lower ? tc("noWebsiteMatch") : t("empty") }}
        footer={paged.footer}
        sort={tableSort}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            sortable: true,
            cell: (row) => {
              const href = theirsHref(row);
              const className = `text-[13px] ${row.isYou ? "font-medium text-foreground" : "text-secondary"}`;
              return href ? <RecordLinkCell href={href} className={className}>{name(row)}</RecordLinkCell> : <span className={className}>{name(row)}</span>;
            },
          },
          { key: "rank", header: t("columns.rank"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.domainRank)}</span> },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.backlinks)}</span> },
          { key: "domains", header: t("columns.referringDomains"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.referringDomains)}</span> },
        ]}
      />
    </div>
  );
}
