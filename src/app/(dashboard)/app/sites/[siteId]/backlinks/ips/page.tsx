"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Server } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { LinkStatusPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

/**
 * The columns that sort, over every address (docs/plans/active/
 * sites-table-sorting-plan.md): the address in number order (9.x before
 * 10.x), and the most linking websites and most links first.
 */
const SORTS = { ip: "asc", domains: "desc", backlinks: "desc" } as const;

/**
 * Referring IPs: the servers links come from and the networks they sit in.
 * The networks with most linking websites are counted when the list is filed,
 * so the chart reads a handful of rows; the servers are paged on the server.
 */
export default function SiteReferringIpsPage() {
  const t = useTranslations("sites.backlinksIps");
  const siteId = useSiteId();
  const listHref = useSiteListHref(siteId);
  const networkHref = (network: string) => listHref("backlinks/ips", { network });
  const site = useSite();
  const subnets = useQuery(api.siteLinkLists.topSubnets, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [subnet, setSubnet] = useSiteParam<string>("network", "");
  const order = useSiteSort(SORTS, "backlinks");
  const table = useSiteListPage(api.siteLinkLists.listReferringIps, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(subnet ? { subnet } : {}),
    sort: order.key,
    direction: order.direction,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Server className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-networks`}
        csv={() => toCsv([t("columns.subnet"), t("seriesDomains"), t("seriesIps")], (subnets ?? []).map((row) => [row.subnet, row.referringDomains, row.ips]))}
        enoughData={(subnets?.length ?? 0) > 0}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, (subnets?.length ?? 0) * 28)}
          data={(subnets ?? []).map((row) => ({ label: row.subnet, domains: row.referringDomains, ips: row.ips }))}
          series={[
            { key: "domains", name: t("seriesDomains"), colour: SITE_SERIES_COLOURS[1] },
            { key: "ips", name: t("seriesIps"), colour: SITE_SERIES_COLOURS[5] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[640px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("subnetFilter"), choice: subnet || null }} value={subnet} onChange={(value) => setSubnet(value)}>
              <option value="">{t("anySubnet")}</option>
              {(subnets ?? []).map((row) => <option key={row.subnet} value={row.subnet}>{row.subnet}</option>)}
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={table.footer} noun="addresses" actions={<TableDownload siteId={siteId} kind="ips" sort={order.tableSort} />} />}
        empty={{ icon: <Server className="h-8 w-8 text-muted/30" />, label: term || subnet ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "ip", header: t("columns.ip"), sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.ip}</span> },
          {
            key: "subnet",
            header: t("columns.subnet"),
            // The network's other servers: this list, narrowed to it.
            cell: (row) => subnet === row.subnet
              ? <span className="font-mono text-[12px] text-secondary">{row.subnet}</span>
              : <RecordLinkCell href={networkHref(row.subnet)} className="font-mono text-[12px] text-info">{row.subnet}</RecordLinkCell>,
          },
          { key: "domains", header: t("columns.domains"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.referringDomains)}</span> },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.backlinks)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
        ]}
      />
    </div>
  );
}
