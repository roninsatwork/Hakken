"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { PieChart } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { toCsv } from "../../../_components/siteFormat";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePagedRows } from "../../../_components/useSitePagedTable";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

/**
 * Share of voice: how often each engine names this site against the others in
 * its group (D7 — tracked websites only, and the page says so). A website's
 * share on an engine is its mentions over everyone's in the group.
 */
export default function SiteShareOfVoicePage() {
  const t = useTranslations("sites.aiShare");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const engineLabel = useEngineLabel();
  const engines = useQuery(api.siteAi.shareOfVoice, { siteId });

  const sites = engines?.[0]?.sites ?? [];
  const [search, setSearch, settled] = useSiteSearch();
  const lower = settled.toLowerCase();
  const shownSites = sites.filter((entry) => !lower || entry.host.toLowerCase().includes(lower));
  // Fifteen rows a page, like every table, however many rivals a group holds.
  const paged = useSitePagedRows(shownSites, lower);
  const router = useRouter();
  const listHref = useSiteListHref(siteId);
  // Each of the company's own websites opens its Mentions: how the engines
  // treat it on these same questions. A website it does not hold has no page.
  const mentionsHref = (host: string): string | null => {
    const hold = site?.holds.find((entry) => entry.host === host);
    return hold ? listHref("ai/mentions", {}, hold.siteId) : null;
  };
  const share = (engine: NonNullable<typeof engines>[number], websiteId: string) => {
    const everyone = engine.sites.reduce((sum, entry) => sum + entry.named, 0);
    const mine = engine.sites.find((entry) => entry.websiteId === websiteId)?.named ?? 0;
    return everyone === 0 ? 0 : Math.round((mine / everyone) * 100);
  };
  const overall = (websiteId: string) => {
    const everyone = (engines ?? []).reduce((sum, engine) => sum + engine.sites.reduce((inner, entry) => inner + entry.named, 0), 0);
    const mine = (engines ?? []).reduce((sum, engine) => sum + (engine.sites.find((entry) => entry.websiteId === websiteId)?.named ?? 0), 0);
    return everyone === 0 ? 0 : Math.round((mine / everyone) * 100);
  };
  const nameOf = (entry: { host: string; isYou: boolean }) => (entry.isYou ? tc("you", { host: entry.host }) : entry.host);

  const chartRows = (engines ?? []).map((engine) => ({
    label: engineLabel(engine.engine),
    ...Object.fromEntries(engine.sites.map((entry) => [entry.host, share(engine, entry.websiteId)])),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<PieChart className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("note")}</p>

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-share-of-voice`}
        csv={() => toCsv(["engine", ...sites.map((entry) => entry.host)], (engines ?? []).map((engine) => [engineLabel(engine.engine), ...engine.sites.map((entry) => share(engine, entry.websiteId))]))}
        enoughData={(engines?.length ?? 0) > 0}
      >
        <SiteBarChart
          data={chartRows}
          series={sites.map((entry, index) => ({ key: entry.host, name: nameOf(entry), colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={engines === undefined ? undefined : paged.pageRows}
        rowKey={(row) => row.websiteId}
        onRowClick={(row) => { const href = mentionsHref(row.host); if (href) router.push(href); }}
        rowClickable={(row) => mentionsHref(row.host) !== null}
        minWidthClassName="min-w-[640px]"
        search={{ value: search, onChange: setSearch, placeholder: tc("findWebsite") }}
filters={<ListDownload fileName={`${site?.host ?? "site"}-share-of-voice`} rows={shownSites} columns={[{ header: t("columns.website"), value: (row) => row.host }, ...(engines ?? []).map((engine) => ({ header: engineLabel(engine.engine), value: (row: (typeof sites)[number]) => share(engine, row.websiteId) })), { header: t("columns.all"), value: (row) => overall(row.websiteId) }]} />}
        empty={{ icon: <PieChart className="h-8 w-8 text-muted/30" />, label: lower ? tc("noWebsiteMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.loadedCount,
          pageSize: paged.pageSize,
          isLoading: engines === undefined,
          onPageChange: paged.goToPage,
        }}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            cell: (row) => {
              const href = mentionsHref(row.host);
              const className = `text-[13px] ${row.isYou ? "font-medium text-foreground" : "text-secondary"}`;
              return href ? <RecordLinkCell href={href} className={className}>{nameOf(row)}</RecordLinkCell> : <span className={className}>{nameOf(row)}</span>;
            },
          },
          ...(engines ?? []).map((engine) => ({
            key: engine.engine,
            header: engineLabel(engine.engine),
            align: "right" as const,
            cell: (row: (typeof sites)[number]) => (
              <span className="font-mono text-[12px]" title={t("namedOf", { named: engine.sites.find((entry) => entry.websiteId === row.websiteId)?.named ?? 0, asked: engine.asked })}>
                {t("share", { share: share(engine, row.websiteId) })}
              </span>
            ),
          })),
          { key: "all", header: t("columns.all"), align: "right", cell: (row) => <span className="font-mono text-[12px] font-medium">{t("share", { share: overall(row.websiteId) })}</span> },
        ]}
      />
    </div>
  );
}
