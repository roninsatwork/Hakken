"use client";

import { Files } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ListTopBars } from "../../_components/AnalyticsChart";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus } from "../../_components/useAnalytics";

/**
 * All pages (§5; §11 board 6; §15 screen 8; §18.2 board 20): every page
 * viewed — its views, the people who saw it, the time engaged on it, the
 * conversions made on that page with their value beside them (§10, Q4) and
 * the change — opening on the most viewed: page views before money (GA26).
 * Under What Hakken sees. Each opens the same page screen.
 */
export default function AnalyticsAllPagesPage() {
  const t = useTranslations("googleAnalytics.allPages");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const currency = status?.connection?.currency ?? null;
  return (
    <AnalyticsListScreen
      header={{ icon: <Files className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={(answer) => (
        <>
          <AnalyticsSees screen="allPages" seen={answer?.seen} currency={currency} />
          <ListTopBars list="page" sort="views" bars="allPages" />
        </>
      )}
      list="page"
      noun="pages"
      opening="views"
      searchPlaceholder={t("findPage")}
      rowHref={(row) => (row.key.startsWith("~") ? hrefFor("landing-pages/page", { key: row.key }) : null)}
      emptyLabel={t("empty")}
    />
  );
}
