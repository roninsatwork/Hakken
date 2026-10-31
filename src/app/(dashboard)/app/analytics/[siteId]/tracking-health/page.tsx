"use client";

import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { formatDateTime } from "@/src/lib/dates";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { inCheckOrder, trackingHealthSees } from "@/convex/utils/sees/analytics";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { formatPercent } from "../../_components/analyticsFormat";
import { useHealthWords } from "../../_components/useHealthWords";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";

type Check = NonNullable<NonNullable<AnalyticsStatus["connection"]>["health"]>["checks"][number];
type Row = Check & { title: string; found: string; affects: string; rank: number };

/**
 * Tracking health (§6; docs/plans/active/ga-tracking-health-plan.md TH1,
 * option 1 of its canvas, "The checklist", chosen 2026-10-15): What Hakken
 * sees; four figures for what is wrong — the checks passing, the visits that
 * can't be credited, the conversions that never happen, the visits on other
 * addresses; then every check in one table, one line each, the failing ones
 * first. A check opens its own screen, with what it found, why it matters
 * and its fix as steps (`tracking-health/check`). Only the checks the weekly
 * run keeps on the connection are read: nothing is asked of Google.
 */
export default function AnalyticsTrackingHealthPage() {
  const t = useTranslations("googleAnalytics.health");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const checkedAt = status?.connection?.health?.checkedAt;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Activity className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={checkedAt ? t("descriptionChecked", { when: formatDateTime(checkedAt) }) : t("description")}
      />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <HealthBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

const SORTS: SiteSortColumns<Row, "check" | "status" | "affects"> = {
  check: { value: (row) => row.title, first: "asc" },
  // Those that need a look first, each part the costliest first (`inCheckOrder`).
  status: { value: (row) => row.rank, first: "asc" },
  affects: { value: (row) => row.affects, first: "asc" },
};

function HealthBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const words = useHealthWords(status);
  const { platformName } = useSystemSettings();
  const checks = status.connection?.health?.checks;
  const order = inCheckOrder(checks ?? []).map((check) => check.check);
  const rows: Row[] | undefined = checks?.map((check) => {
    const said = words(check);
    return {
      ...check,
      title: said.title,
      found: check.passing ? said.wrong : said.short,
      affects: t.has(`checks.${check.check}.affects`) ? t(`checks.${check.check}.affects`) : "",
      rank: (check.passing ? order.length : 0) + order.indexOf(check.check),
    };
  });
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "status", name: (row) => row.title });
  const pager = useSitePager(sorted, { isLoading: false });
  if (!checks) return <Notice>{t("notYet")}</Notice>;
  const failing = checks.filter((check) => !check.passing);
  const statusOf = (check: Check) => <StatusLabel tone={check.passing ? "success" : "warning"}>{check.passing ? t("passing") : t("needsLook")}</StatusLabel>;

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="trackingHealth" seen={trackingHealthSees({ checks })} currency={status.connection?.currency} data={status.connection?.health} />
      <HealthFigures checks={checks} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.check}
        onRowClick={(row) => router.push(hrefFor("tracking-health/check", { key: row.check }))}
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="checks"
            actions={sorted ? (
              <ListDownload
                label={t("table.download")}
                fileName={`${status.host}-tracking-health`}
                rows={sorted}
                columns={[
                  { header: t("table.check"), value: (row) => row.title },
                  { header: t("table.status"), value: (row) => (row.passing ? t("passing") : t("needsLook")) },
                  { header: t("table.found", { platformName }), value: (row) => row.found },
                  { header: t("table.affects"), value: (row) => row.affects },
                ]}
              />
            ) : undefined}
          >
            <span className="text-[12px] text-secondary">{t("table.bar")}</span>
          </TableBar>
        }
        sort={tableSort}
        empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: t("notYet") }}
        footer={pager.footer}
        columns={[
          { key: "check", header: t("table.check"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[13px] text-foreground">{row.title}</span> },
          { key: "status", header: t("table.status"), sortable: true, cell: statusOf },
          { key: "found", header: t("table.found", { platformName }), cell: (row) => <span className="text-[12.5px] text-secondary">{row.found}</span> },
          { key: "affects", header: t("table.affects"), sortable: true, cell: (row) => <TagLabel>{row.affects}</TagLabel> },
        ]}
      />
      {failing.length > 0 ? <p className="text-[12px] text-muted">{t("toldOnce", { platformName })}</p> : null}
    </div>
  );
}

/**
 * What is wrong, in four figures (TH1): the checks passing; the visits with
 * no channel or landing page; the conversions that never happen; the visits
 * recorded on other addresses. A check that passes reads none.
 */
function HealthFigures({ checks }: { checks: readonly Check[] }) {
  const t = useTranslations("googleAnalytics.health.figures");
  const { platformName } = useSystemSettings();
  const find = (id: string) => checks.find((check) => check.check === id) ?? null;
  const failing = checks.filter((check) => !check.passing).length;
  const unknown = find("TOO_MUCH_UNKNOWN");
  const never = find("NEVER_HAPPENS");
  const strangers = find("STRANGERS");
  const quiet = (words: string) => <span className="text-secondary">{words}</span>;
  return (
    <FigureRow columns={4}>
      <Figure
        label={t("passing")}
        value={t("passingValue", { passing: checks.length - failing, total: checks.length })}
        detail={failing > 0 ? <StatusLabel tone="warning">{t("needLook", { count: failing })}</StatusLabel> : <StatusLabel tone="success">{t("allPass")}</StatusLabel>}
      />
      <Figure label={t("unknown", { platformName })} value={unknown?.share === undefined ? "–" : formatPercent(unknown.share)} detail={quiet(t("unknownLine"))} />
      <Figure
        label={t("never")}
        value={never ? formatNumber(never.passing ? 0 : (never.names ?? []).length) : "–"}
        detail={quiet(never && !never.passing ? t("neverLine", { days: never.count ?? 90 }) : t("neverNone"))}
      />
      <Figure
        label={t("strangers")}
        value={strangers ? formatNumber(strangers.passing ? 0 : strangers.count ?? 0) : "–"}
        detail={quiet(strangers && !strangers.passing ? t("strangersLine") : t("strangersNone"))}
      />
    </FigureRow>
  );
}
