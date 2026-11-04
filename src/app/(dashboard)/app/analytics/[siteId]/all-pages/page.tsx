"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Files } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PAGE_MOVES, type PageMove } from "@/convex/utils/pageMoves";
import { viewsCountedDifferently } from "@/convex/utils/viewsCounted";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen, type ListPageAnswer } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { AllPagesBoxes, ClassificationSelect, PagesLinesCard, PagesMapCard, useClassificationChoice, type ClassificationChoice } from "../../_components/AllPagesParts";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsStatus, usePageHref } from "../../_components/useAnalytics";
import { useEyeNames, useWebsiteForEye } from "../../_components/useEyeFigures";
import { formatPerVisit, pathOf } from "../../_components/analyticsFormat";

const MOVES: readonly (PageMove | "all")[] = ["all", ...PAGE_MOVES];

/**
 * All pages, as Way 6 (docs/plans/active/all-pages-way-6-plan-2026-11-04.md; board "Way 6" on the canvas "Hakken — All
 * pages, some ways to do it"). What Hakken sees, four boxes of page views, a map of the pages most viewed or visited,
 * Views each day for the pages ticked in the table, then the table: every page on the website, viewed or not, with no
 * money. It opens with the shop's search, basket and account pages left out. Each page with views opens its own screen.
 */
export default function AnalyticsAllPagesPage() {
  const t = useTranslations("googleAnalytics.allPages");
  const tt = useTranslations("googleAnalytics.table");
  const status = useAnalyticsStatus();
  const pageHref = usePageHref();
  const currency = status?.connection?.currency ?? null;
  const [move, setMove] = useSiteParam<PageMove | "all">("move", "all", MOVES);
  const choice = useClassificationChoice();
  return (
    <AnalyticsListScreen
      header={{ icon: <Files className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={(answer, plotted, shown) => (
        <>
          <AllPagesSees answer={answer} currency={currency} choice={choice} />
          <ViewsCountedNotice />
          <AllPagesBoxes answer={shown} choice={choice} />
          <PagesMapCard choice={choice} answer={shown} />
          <PagesLinesCard pages={plotted} answer={shown} />
        </>
      )}
      list="page"
      move={move}
      plot
      group={choice.group}
      leaveOut={choice.leaveOut}
      filters={(answer) => (
        <>
          <ClassificationSelect choice={choice} />
          <Select
            aria-label={tt("moves.label")}
            value={move}
            onChange={(next) => setMove(next as PageMove | "all")}
            chip={{ label: tt("moves.label"), choice: tt(`moves.${move}`, { count: answer?.moves ? formatNumber(answer.moves[move]) : "…" }), changed: false }}
          >
            {MOVES.map((one) => <option key={one} value={one}>{tt(`moves.${one}`, { count: answer?.moves ? formatNumber(answer.moves[one]) : "…" })}</option>)}
          </Select>
        </>
      )}
      noun="pages"
      opening="views"
      searchPlaceholder={t("findPage")}
      rowHref={(row) => (row.key.startsWith("~") ? pageHref(row.key) : null)}
      emptyLabel={move === "all" ? t("empty") : t(`emptyMoves.${move}`)}
    />
  );
}

/**
 * Says when these dates' ups and downs may not be real (Anthony, 2026-11-04): on Last 3 months nearly every page of More
 * Handles looked like it fell, because its tag most likely sent extra page views until 3 September.
 */
function ViewsCountedNotice() {
  const t = useTranslations("googleAnalytics.allPages");
  const website = useWebsiteForEye();
  const counted = website ? viewsCountedDifferently(website) : null;
  if (!counted) return null;
  return <Notice tone="warning">{t("viewsCounted", { before: formatPerVisit(counted.pagesAVisitBefore), now: formatPerVisit(counted.pagesAVisit) })}</Notice>;
}

/** The pages the eye is handed from each end of the whole list: those that gained and lost most. */
const EYE_MOVERS = 10;

/**
 * The page's eye: the table's page as shown, the whole website's views (`website`), and from every page, as the server
 * sorts them, those that gained and lost most views and lost most conversions (`pagesGained`, `pagesLost`,
 * `pagesConversionsLost`), so its rules speak of the whole website, never only the page of the table on screen. These
 * always leave out the shop's search, basket and account pages, whatever the menus say: the eye speaks of those only
 * together (`shop`). `bands` and `concentration` come from the same read, for the same reason. Map and lines hand their own.
 */
function AllPagesSees({ answer, currency, choice }: { answer: ListPageAnswer | undefined; currency: string | null; choice: ClassificationChoice }) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const names = useEyeNames();
  const website = useWebsiteForEye();
  const pageHref = usePageHref();
  const hrefFor = useAnalyticsHref(args.siteId);
  const tm = useTranslations("googleAnalytics.menu");
  const ready = Boolean(status?.connection?.newestDay);
  const end = (sort: "viewsChange" | "conversionsChange", direction: "asc" | "desc") => ({ ...args, list: "page" as const, sort, direction, page: 1, rows: EYE_MOVERS, leaveOut: true });
  const gained = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? end("viewsChange", "desc") : "skip");
  const lost = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? end("viewsChange", "asc") : "skip");
  const conversionsLost = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? end("conversionsChange", "asc") : "skip");
  const kinds = choice.kinds;
  const data = useMemo(() => (answer ? {
    ...answer, names, ...(website ? { website } : {}),
    ...(gained ? { pagesGained: gained, bands: gained.bands, concentration: gained.concentration, shop: gained.shop } : {}),
    ...(lost ? { pagesLost: lost } : {}), ...(conversionsLost ? { pagesConversionsLost: conversionsLost } : {}),
    ...(kinds ? { classifications: kinds } : {}),
  } : answer), [answer, names, website, gained, lost, conversionsLost, kinds]);
  // Where "Do first" may send the reader: the pages that moved most, and where a page's move is looked into.
  const topGained = gained?.rows[0];
  const topLost = lost?.rows[0];
  const links = useMemo(() => [
    ...(topLost?.key.startsWith("~") ? [{ label: pathOf(topLost.label), href: pageHref(topLost.key) }] : []),
    ...(topGained?.key.startsWith("~") ? [{ label: pathOf(topGained.label), href: pageHref(topGained.key) }] : []),
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("trackingHealth"), href: hrefFor("tracking-health") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pageHref and hrefFor are new each draw; the rows and the dates decide.
  ], [topGained?.key, topGained?.label, topLost?.key, topLost?.label, tm, args.period, args.device, args.country]);
  return <AnalyticsSees screen="allPages" seen={answer?.seen} currency={currency} data={data} links={links} />;
}
