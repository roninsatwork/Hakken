"use client";

import { Files } from "lucide-react";
import { useTranslations } from "next-intl";
import { PAGE_MOVES, type PageMove } from "@/convex/utils/pageMoves";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { PagesDailyChart } from "../../_components/AnalyticsChart";
import { useAnalyticsStatus, usePageHref } from "../../_components/useAnalytics";

const MOVES: readonly (PageMove | "all")[] = ["all", ...PAGE_MOVES];

/**
 * All pages (docs/plans/active/all-pages-rethink-plan.md; drawn on the canvas
 * "Hakken — All pages, rethought", 2026-10-13), laid out as Google Analytics
 * lays out Pages and screens: What Hakken sees, a short "Views a day" chart
 * of the website and the pages ticked in the table (five at most), then the
 * table — every page on the website, viewed or not, with no money: visits,
 * views and their change, dwell time, the conversions made there, their rate
 * and their change. Its filters, beside the search box, say how many pages
 * gained, dropped, stayed static or had no visits. Each page with views
 * opens its own screen (GA29).
 */
export default function AnalyticsAllPagesPage() {
  const t = useTranslations("googleAnalytics.allPages");
  const tt = useTranslations("googleAnalytics.table");
  const status = useAnalyticsStatus();
  const pageHref = usePageHref();
  const currency = status?.connection?.currency ?? null;
  const [move, setMove] = useSiteParam<PageMove | "all">("move", "all", MOVES);
  return (
    <AnalyticsListScreen
      header={{ icon: <Files className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={(answer, plotted) => (
        <>
          <AnalyticsSees screen="allPages" seen={answer?.seen} currency={currency} />
          <PagesDailyChart pages={plotted} />
        </>
      )}
      list="page"
      move={move}
      plot
      filters={(answer) => (
        <SegmentedChoice
          size="compact"
          label={tt("moves.label")}
          value={move}
          options={MOVES.map((one) => ({ value: one, label: tt(`moves.${one}`, { count: answer?.moves ? formatNumber(answer.moves[one]) : "…" }) }))}
          onChange={setMove}
        />
      )}
      noun="pages"
      opening="views"
      searchPlaceholder={t("findPage")}
      rowHref={(row) => (row.key.startsWith("~") ? pageHref(row.key) : null)}
      emptyLabel={move === "all" ? t("empty") : t(`emptyMoves.${move}`)}
    />
  );
}
