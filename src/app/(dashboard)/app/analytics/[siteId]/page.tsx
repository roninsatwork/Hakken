"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { isShop } from "@/convex/utils/conversionSteps";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { ClassificationSelect, useClassificationChoice } from "../_components/AllPagesParts";
import { AnalyticsTable, type Column } from "../_components/AnalyticsListScreen";
import { AnalyticsGate } from "../_components/AnalyticsNotices";
import { AnalyticsSees } from "../_components/AnalyticsSees";
import { OverviewBandsCard, OverviewBoxes, OverviewDaysCard, OverviewSquaresCard, useOverviewEye, useOverviewReads, type OverviewReads } from "../_components/OverviewParts";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, usePageHref, type AnalyticsStatus } from "../_components/useAnalytics";

/**
 * Overview (docs/plans/active/overview-new-page-plan-2026-11-06.md; boards "The new page so far" and "For a service business"
 * on the canvas): What Hakken sees, four boxes, the website's figures each day, what happens to its visits as squares you can
 * count, who visits against who buys or gets in touch, then its top pages. A shop speaks of what's bought, and any other website
 * of its events. Each chart's menus answer from saved lists, so nothing is asked of Google.
 */
export default function AnalyticsOverviewPage() {
  const t = useTranslations("googleAnalytics.overview");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const args = useAnalyticsArgs();
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, args);
  const shop = isShop(status?.connection?.shop, overview?.now?.purchases, overview?.before?.purchases);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LayoutDashboard className="h-5 w-5 text-brand" />} title={t("title")} description={t(shop ? "descriptionShop" : "descriptionService")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <OverviewBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function OverviewBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.overview");
  const tt = useTranslations("googleAnalytics.table.columns");
  const reads = useOverviewReads(status);
  const pageHref = usePageHref();
  const choice = useClassificationChoice();
  const { shop } = reads;
  const columns = useMemo<readonly Column[]>(() => ["name", "visits", "visitsChange", "bounce", shop ? "bought" : "conversions"], [shop]);
  if (reads.overview?.preparing) return <Notice>{t("preparing")}</Notice>;
  return (
    <AnalyticsTable
      head={() => (
        <>
          <OverviewSees reads={reads} status={status} />
          <OverviewBoxes reads={reads} />
          <OverviewDaysCard reads={reads} status={status} />
          <OverviewSquaresCard reads={reads} status={status} />
          <OverviewBandsCard reads={reads} status={status} />
        </>
      )}
      list="landing"
      barTitle={t("pages.title")}
      barDescription={t(shop ? "pages.description" : "pages.descriptionService")}
      columnsShown={columns}
      headings={{ visits: <span title={t("pages.visitsTitle")}>{t("pages.visits")}</span>, conversions: tt("events"), bounce: <span title={t("pages.leftTitle")}>{t("pages.left")}</span> }}
      group={choice.group}
      leaveOut={choice.leaveOut}
      noun="pages"
      opening="visits"
      searchPlaceholder={t("pages.search")}
      rowHref={(row) => (row.key.startsWith("~") ? pageHref(row.key) : null)}
      filters={<ClassificationSelect choice={choice} />}
      emptyLabel={t("pages.empty")}
    />
  );
}

/** The page's eye, reading what the page draws. */
function OverviewSees({ reads, status }: { reads: OverviewReads; status: AnalyticsStatus }) {
  const data = useOverviewEye(reads, status);
  return <AnalyticsSees screen="overview" seen={reads.overview?.seen} currency={status.connection?.currency ?? null} data={data} />;
}
