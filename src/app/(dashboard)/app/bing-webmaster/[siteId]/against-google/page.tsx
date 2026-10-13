"use client";

import { useQuery } from "convex/react";
import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { formatPosition } from "../../../search-console/_components/searchConsoleFormat";
import { BingSees, formatShare } from "../../_components/BingParts";
import { BingShareChart } from "../../_components/BingCharts";
import { BingListScreen } from "../../_components/BingListTable";
import { useBingHref, useBingSiteId, useBingStatus } from "../../_components/useBing";

/**
 * Bing against Google (bing-webmaster-plan.md §5, board 6, §4.4): What Hakken
 * sees; Bing's share of the website's search clicks and how many keywords each
 * engine ranks higher; the share week by week; and every keyword with both
 * engines' positions and clicks, and who ranks the website higher. Over the
 * last 90 days, Search Console's comparable period.
 */
export default function BingVersusPage() {
  const t = useTranslations("bingWebmaster.versus");
  const tf = useTranslations("bingWebmaster.figures");
  const tw = useTranslations("bingWebmaster.seen.versus");
  const tl = useTranslations("bingWebmaster.seen.links");
  const status = useBingStatus();
  const siteId = useBingSiteId();
  const hrefFor = useBingHref(siteId);
  const figures = useQuery(api.bingWebmasterReads.bingPerformance, status?.connection?.newestDay ? { siteId, days: 90 } : "skip");
  const bing = figures?.totals ?? null;
  const google = figures?.google ?? null;
  const share = bing && google && bing.clicks + google.clicks > 0 ? bing.clicks / (bing.clicks + google.clicks) : null;
  return (
    <BingListScreen
      header={{ icon: <ArrowLeftRight className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      kind="versus"
      head={(answer) => {
        const summary = answer?.summary;
        const gap = summary?.widestGoogle ?? null;
        return (
          <>
            {summary && bing ? (
              <BingSees
                says={[
                  google && tw("share", { share: formatShare(share), bing: formatNumber(bing.clicks), total: formatNumber(bing.clicks + google.clicks) }),
                  summary.onBoth > 0 && tw("both", { count: formatNumber(summary.onBoth), higher: formatNumber(summary.bingHigher) }),
                  gap && tw("gap", { keyword: gap.key, google: formatPosition(gap.googlePosition), bing: formatPosition(gap.position) }),
                ]}
                steps={gap ? [{ words: tw("step"), link: tl("keyword"), href: hrefFor("keywords/keyword", { ref: gap.ref }) }] : []}
              />
            ) : null}
            {summary ? (
              <FigureRow>
                <Figure
                  label={tf("share")}
                  value={formatShare(share)}
                  emphasis
                  detail={<span className="text-secondary">{bing && google ? tf("shareOf", { bing: formatNumber(bing.clicks), total: formatNumber(bing.clicks + google.clicks) }) : tf("noGoogle")}</span>}
                />
                <Figure label={t("bingHigher")} value={formatNumber(summary.bingHigher)} detail={<span className="text-secondary">{t("ofBoth", { count: formatNumber(summary.onBoth) })}</span>} />
                <Figure label={t("googleHigher")} value={formatNumber(summary.googleHigher)} detail={<span className="text-secondary">{t("ofBoth", { count: formatNumber(summary.onBoth) })}</span>} />
                <Figure label={t("onlyBing")} value={formatNumber(summary.onlyBing)} detail={<span className="text-secondary">{t("ofBing", { count: formatNumber(summary.rows) })}</span>} />
              </FigureRow>
            ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}
            {google ? <BingShareChart weeks={figures?.weeks ?? []} host={status?.host ?? ""} from={figures?.from ?? null} to={figures?.to ?? null} /> : null}
          </>
        );
      }}
    />
  );
}
