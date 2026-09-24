"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { Globe2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const BREAKDOWNS = ["countries", "tlds", "platforms", "linkTypes", "attributes"] as const;
type Breakdown = (typeof BREAKDOWNS)[number];

/** Groups drawn on the chart; the table lists them all. */
const CHARTED = 12;

/**
 * Where links come from: the newest backlinks summary's links by country,
 * domain ending, kind of site, kind of link and link attribute — one
 * breakdown at a time, chosen from a picker that stays in the address.
 */
export default function SiteLinkSourcesPage() {
  const t = useTranslations("sites.linkSources");
  const tc = useTranslations("sites.common");
  const locale = useLocale();
  const siteId = useSiteId();
  const site = useSite();
  const profile = useQuery(api.siteLinks.linkProfile, { siteId });
  const [breakdown, setBreakdown] = useSiteParam<Breakdown>("by", "countries", BREAKDOWNS);
  const [search, setSearch, term] = useSiteSearch();
  const [page, setPage] = useState(1);

  const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([locale], { type: "region" }) : null;
  const nameOf = (key: string) => {
    if (key === "(none)" || key === "") return t("unknown");
    if (breakdown === "countries" && key === "WW") return t("worldwide");
    if (breakdown === "countries" && /^[A-Z]{2}$/.test(key)) {
      try {
        return regions?.of(key) ?? key;
      } catch {
        return key;
      }
    }
    if (breakdown === "tlds") return `.${key}`;
    return key.replace(/[_-]/g, " ");
  };

  const groups = profile ? profile[breakdown] : [];
  const total = groups.reduce((sum, row) => sum + row.count, 0);
  const lower = term.toLowerCase();
  const matching = profile === undefined ? undefined : groups.filter((row) => !lower || nameOf(row.key).toLowerCase().includes(lower) || row.key.toLowerCase().includes(lower));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const charted = groups.slice(0, CHARTED);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Globe2 className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      {profile === null ? (
        <p className="rounded-2xl border border-border-dim bg-card/40 px-5 py-10 text-center text-[13px] text-secondary">{t("empty")}</p>
      ) : (
        <>
          <SiteChartCard
        dated={false}
            title={t(`breakdowns.${breakdown}`)}
            hint={t("chartHint", { day: formatDay(profile?.day) })}
            controls={
              <div className="max-w-xs">
                <Select aria-label={t("breakdownLabel")} value={breakdown} onChange={(value) => { setBreakdown(value as Breakdown); setPage(1); }}>
                  {BREAKDOWNS.map((entry) => <option key={entry} value={entry}>{t(`breakdowns.${entry}`)}</option>)}
                </Select>
              </div>
            }
            exportName={`${site?.host ?? "site"}-links-${breakdown}`}
            csv={() => toCsv([t("columns.group"), t("columns.links"), t("columns.share")], groups.map((row) => [nameOf(row.key), row.count, total ? (row.count / total).toFixed(4) : null]))}
            enoughData={charted.length > 0}
          >
            <SiteBarChart
              horizontal
              height={Math.max(160, charted.length * 28)}
              data={charted.map((row) => ({ label: nameOf(row.key), links: row.count }))}
              series={[{ key: "links", name: t("columns.links"), colour: SITE_SERIES_COLOURS[1] }]}
            />
          </SiteChartCard>

          <DataTable
            rows={shown}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[480px]"
            search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: t("searchPlaceholder") }}
    filters={<ListDownload fileName={`${site?.host ?? "site"}-links-${breakdown}`} rows={matching} columns={[{ header: t("columns.group"), value: (row) => nameOf(row.key) }, { header: t("columns.links"), value: (row) => row.count }, { header: t("columns.share"), value: (row) => (total ? ((row.count / total) * 100).toFixed(1) : null) }]} />}
            empty={{ icon: <Globe2 className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
            footer={{
              mode: "paged",
              page,
              totalPages,
              totalCount: matching?.length ?? 0,
              pageSize: TABLE_PAGE_SIZE,
              isLoading: profile === undefined,
              onPageChange: setPage,
            }}
            columns={[
              { key: "group", header: t("columns.group"), cell: (row) => <span className="text-[13px] text-foreground">{nameOf(row.key)}</span> },
              { key: "links", header: t("columns.links"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.count)}</span> },
              {
                key: "share",
                header: t("columns.share"),
                align: "right",
                cell: (row) => <span className="font-mono text-[12px] text-secondary">{total ? `${((row.count / total) * 100).toFixed(1)}%` : "–"}</span>,
              },
              { key: "checked", header: tc("lastChecked"), cell: () => <CheckedCell day={profile?.day ?? null} /> },
            ]}
          />
        </>
      )}
    </div>
  );
}
