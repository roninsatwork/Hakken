"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

const KINDS = ["COMPETITOR", "DIRECTORY", "PUBLISHER", "SUPPLIER", "OTHER"] as const;
type Kind = (typeof KINDS)[number];

type Organic = { host: string; intersections: number; averagePosition: number | null; domainTraffic: number | null };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * website A to Z; the most shared keywords — the order it opens on; the best
 * average position from the top; the most traffic in all first.
 */
const SORTS: SiteSortColumns<Organic, "website" | "shared" | "position" | "domainTraffic"> = {
  website: { value: (row) => row.host, first: "asc" },
  shared: { value: (row) => row.intersections, first: "desc" },
  position: { value: (row) => row.averagePosition, first: "asc" },
  domainTraffic: { value: (row) => row.domainTraffic, first: "desc" },
};
const hostOf = (row: Organic) => row.host;

/**
 * Organic competitors: every website DataForSEO found ranking for the same
 * searches, most overlap first, with what kind of website each is. A few
 * hundred at most per site, so the list arrives whole and is narrowed in place.
 */
export default function SiteOrganicCompetitorsPage() {
  const t = useTranslations("sites.organic");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const rows = useQuery(api.siteCompetitors.listOrganicCompetitors, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<Kind | "">("kind", "", KINDS);
  const router = useRouter();
  const site = useSite();
  const recordHref = useSiteRecordHref(siteId);
  // Only a competitor the company tracks has its rankings collected, so only
  // those open a comparison; the others are everything we know in the row.
  const rivalHref = (host: string): string | null => {
    const hold = site?.holds.find((entry) => entry.host === host && entry.siteId !== site.siteId);
    return hold ? recordHref({ kind: "rival", rivalId: hold.siteId }) : null;
  };

  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) => (!matches || matches(row.host)) && (!kind || (row.kind ?? "OTHER") === kind));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "shared", name: hostOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Radar className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.host}
        onRowClick={(row) => { const href = rivalHref(row.host); if (href) router.push(href); }}
        rowClickable={(row) => rivalHref(row.host) !== null}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as Kind | "")}>
            <option value="">{t("anyKind")}</option>
            {KINDS.map((entry) => <option key={entry} value={entry}>{t(`kinds.${entry}`)}</option>)}
          </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="websites" actions={<ListDownload fileName={"organic-competitors"} rows={sorted} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind ?? "OTHER"}`) }, { header: t("columns.shared"), value: (row) => row.intersections }, { header: t("columns.position"), value: (row) => row.averagePosition }, { header: t("columns.traffic"), value: (row) => row.estimatedTraffic }, { header: t("columns.domainKeywords"), value: (row) => row.domainKeywords }, { header: t("columns.domainTraffic"), value: (row) => (row.domainTraffic === null ? null : Math.round(row.domainTraffic)) }, { header: tc("lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Radar className="h-8 w-8 text-muted/30" />, label: term || kind ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            sortable: true,
            cell: (row) => {
              const href = rivalHref(row.host);
              return href ? <RecordLinkCell href={href}>{row.host}</RecordLinkCell> : <span className="text-[13px] text-foreground">{row.host}</span>;
            },
          },
          {
            key: "kind",
            header: t("columns.kind"),
            cell: (row) => <StatusPill tone={row.kind === "COMPETITOR" ? "warning" : "neutral"}>{t(`kinds.${row.kind ?? "OTHER"}`)}</StatusPill>,
          },
          { key: "shared", header: t("columns.shared"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.intersections)}</span> },
          { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.averagePosition === null ? "–" : row.averagePosition.toFixed(1)}</span> },
          { key: "domainTraffic", header: t("columns.domainTraffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.domainTraffic)}</span> },
          { key: "tracked", header: t("columns.tracked"), cell: (row) => (row.tracked ? <StatusPill tone="success">{tc("yes")}</StatusPill> : <span className="text-muted">–</span>) },
        ]}
      />
    </div>
  );
}
