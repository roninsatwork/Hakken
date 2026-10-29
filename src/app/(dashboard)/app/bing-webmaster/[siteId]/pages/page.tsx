"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { BingFigures, BingSees } from "../../_components/BingParts";
import { BingClicksChart } from "../../_components/BingCharts";
import { BingListScreen, pathOf } from "../../_components/BingListTable";
import { useBingHref, useBingSiteId, useBingStatus, useBingDates } from "../../_components/useBing";

/**
 * Pages (bing-webmaster-plan.md §5, board 5): What Hakken sees; the four
 * figures against Google's; clicks and impressions each week; and every page
 * Bing showed, with Google's clicks to the same page beside Bing's, each
 * opening its own screen (BW15).
 */
export default function BingPagesPage() {
  const t = useTranslations("bingWebmaster.pages");
  const tc = useTranslations("bingWebmaster.chart");
  const tw = useTranslations("bingWebmaster.seen.pages");
  const tl = useTranslations("bingWebmaster.seen.links");
  const status = useBingStatus();
  const siteId = useBingSiteId();
  const hrefFor = useBingHref(siteId);
  const { period } = useBingDates();
  const figures = useQuery(api.bingWebmasterReads.bingPerformance, status?.connection?.newestDay ? { siteId, period } : "skip");
  return (
    <BingListScreen
      header={{ icon: <FileText className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      kind="pages"
      head={(answer) => (
        <>
          {answer ? (
            <BingSees
              says={[
                tw("says", { count: formatNumber(answer.summary.rows) }),
                answer.summary.top && tw("top", { page: pathOf(answer.summary.top.key), clicks: formatNumber(answer.summary.top.clicks) }),
                answer.summary.moreOnBing > 0 && tw("more", { count: answer.summary.moreOnBing }),
              ]}
              steps={[{ words: tw("step"), link: tl("versus"), href: hrefFor("against-google") }]}
            />
          ) : null}
          <BingFigures bing={figures?.totals ?? null} google={figures?.google ?? null} />
          <BingClicksChart
            days={figures?.days ?? []}
            step="week"
            host={status?.host ?? ""}
            from={figures?.from ?? null}
            to={figures?.to ?? null}
            title={tc("weeklyTitle")}
            hint={tc("weeklyHint")}
          />
        </>
      )}
    />
  );
}
