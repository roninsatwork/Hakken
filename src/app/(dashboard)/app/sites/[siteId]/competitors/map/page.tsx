"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Map as MapIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteScatterChart, type SiteScatterGroup } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const ROLES = ["YOU", "RIVAL", "FOUND"] as const;
type Role = (typeof ROLES)[number];
const ROLE_TONES: Record<Role, StatusTone> = { YOU: "info", RIVAL: "warning", FOUND: "neutral" };

/**
 * Market map: every website in this one's market by how many searches it
 * ranks for and the traffic those bring — the site, its competitors, and the
 * sites DataForSEO found ranking for the same searches. Each group has its own
 * shape as well as colour, so the map reads without colour.
 */
export default function SiteMarketMapPage() {
  const t = useTranslations("sites.marketMap");
  const tk = useTranslations("sites.organic.kinds");
  const siteId = useSiteId();
  const site = useSite();
  const rows = useQuery(api.siteCompetitors.marketMap, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [role, setRole] = useSiteParam<Role | "">("who", "", ROLES);
  const [everything, setEverything] = useSiteParam<"" | "1">("all", "", ["1"]);
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  // A competitor the company tracks opens its comparison; this site and the
  // websites only found have nothing more than their row.
  const rivalHref = (row: { role: string; host: string }): string | null => {
    if (row.role !== "RIVAL") return null;
    const hold = site?.holds.find((entry) => entry.host === row.host);
    return hold ? recordHref({ kind: "rival", rivalId: hold.siteId }) : null;
  };

  // The market is the site, its competitors and the found sites judged to be
  // competitors (or not judged yet). Directories, publishers and the like —
  // Wikipedia outranks everyone — join only when asked for.
  const inMarket = (row: NonNullable<typeof rows>[number]) =>
    row.role !== "FOUND" || everything === "1" || row.kind === null || row.kind === "COMPETITOR";
  const lower = term.toLowerCase();
  const matching = rows?.filter((row) => inMarket(row) && (!lower || row.host.toLowerCase().includes(lower)) && (!role || row.role === role))
    .sort((left, right) => (right.traffic ?? -1) - (left.traffic ?? -1));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  const plotted = (rows ?? []).filter((row) => inMarket(row) && row.keywords !== null && row.traffic !== null);
  const shapes: Record<Role, SiteScatterGroup["shape"]> = { YOU: "star", RIVAL: "diamond", FOUND: "circle" };
  const colours: Record<Role, string> = { YOU: SITE_SERIES_COLOURS[0], RIVAL: SITE_SERIES_COLOURS[1], FOUND: SITE_SERIES_COLOURS[5] };
  const groups: SiteScatterGroup[] = ROLES.map((entry) => ({
    key: entry,
    name: t(`roles.${entry}`),
    colour: colours[entry],
    shape: shapes[entry],
    points: plotted.filter((row) => row.role === entry).map((row) => ({ x: row.keywords!, y: row.traffic!, label: row.host })),
  })).filter((group) => group.points.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MapIcon className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-market-map`}
        controls={
          <Checkbox
            label={t("showEverything")}
            checked={everything === "1"}
            onChange={(next) => setEverything(next ? "1" : "")}
          />
        }
        csv={() => toCsv(
          [t("columns.website"), t("columns.role"), t("columns.keywords"), t("columns.traffic"), t("columns.shared")],
          plotted.map((row) => [row.host, t(`roles.${row.role}`), row.keywords, row.traffic, row.sharedKeywords]),
        )}
        enoughData={plotted.length > 0}
      >
        <SiteScatterChart groups={groups} xLabel={t("axes.keywords")} yLabel={t("axes.traffic")} />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => `${row.role}:${row.host}`}
        onRowClick={(row) => { const href = rivalHref(row); if (href) router.push(href); }}
        rowClickable={(row) => rivalHref(row) !== null}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("roleFilter")} value={role} onChange={(value) => setRole(value as Role | "")}>
            <option value="">{t("anyRole")}</option>
            {ROLES.map((entry) => <option key={entry} value={entry}>{t(`roles.${entry}`)}</option>)}
          </Select>
            <ListDownload fileName={`${site?.host ?? "site"}-market`} rows={matching} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.role"), value: (row) => t(`roles.${row.role}`) }, { header: t("columns.keywords"), value: (row) => row.keywords }, { header: t("columns.traffic"), value: (row) => row.traffic }, { header: t("columns.shared"), value: (row) => row.sharedKeywords }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />
          </>
        }
        empty={{ icon: <MapIcon className="h-8 w-8 text-muted/30" />, label: term || role ? t("noMatch") : t("empty") }}
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
          {
            key: "website",
            header: t("columns.website"),
            cell: (row) => {
              const href = rivalHref(row);
              const className = `text-[13px] ${row.role === "YOU" ? "font-medium text-foreground" : "text-foreground"}`;
              return href ? <RecordLinkCell href={href} className={className}>{row.host}</RecordLinkCell> : <span className={className}>{row.host}</span>;
            },
          },
          { key: "role", header: t("columns.role"), cell: (row) => <StatusPill tone={ROLE_TONES[row.role]}>{t(`roles.${row.role}`)}</StatusPill> },
          {
            key: "kind",
            header: t("columns.kind"),
            cell: (row) => (row.role === "FOUND" && row.kind ? <span className="text-[12px] text-secondary">{tk(row.kind)}</span> : <span className="text-muted">–</span>),
          },
          { key: "keywords", header: t("columns.keywords"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.keywords)}</span> },
          { key: "traffic", header: t("columns.traffic"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.traffic)}</span> },
          { key: "shared", header: t("columns.shared"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.sharedKeywords)}</span> },
        ]}
      />
    </div>
  );
}
