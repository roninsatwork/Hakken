"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { formatPosition } from "../../../search-console/_components/searchConsoleFormat";
import { BingFigures, BingSees, useBingEyeNames } from "../../_components/BingParts";
import { eyeWords, listSeen, performanceSeen } from "../../_components/bingSeesData";
import { useWholeListLinks } from "../../_components/BingListTable";
import { BingClicksChart } from "../../_components/BingCharts";
import { BingListScreen } from "../../_components/BingListTable";
import { useBingHref, useBingSiteId, useBingStatus, useBingDates } from "../../_components/useBing";

/**
 * Keywords (bing-webmaster-plan.md §5, board 3): What Hakken sees; the four
 * figures against Google's; clicks and impressions each week; and every
 * keyword Bing showed the website for, with Google's position for the same
 * search beside Bing's, each opening its own screen.
 */
export default function BingKeywordsPage() {
  const t = useTranslations("bingWebmaster.keywords");
  const tc = useTranslations("bingWebmaster.chart");
  const tw = useTranslations("bingWebmaster.seen.keywords");
  const tl = useTranslations("bingWebmaster.seen.links");
  const status = useBingStatus();
  const siteId = useBingSiteId();
  const hrefFor = useBingHref(siteId);
  const { period } = useBingDates();
  const figures = useQuery(api.bingWebmasterReads.bingPerformance, status?.connection?.newestDay ? { siteId, period } : "skip");
  // The eye reads the whole list beside the table's page: what moved, the engines' gaps, the place bands (bingSeesData.ts).
  const whole = useQuery(api.bingWebmasterReads.bingListSeen, status?.connection?.newestWeek ? { siteId, list: "query", period } : "skip");
  const names = useBingEyeNames();
  const seenFigures = useMemo(() => performanceSeen(figures, names), [figures, names]);
  const words = useMemo(() => eyeWords(names), [names]);
  const links = useWholeListLinks(whole, "keywords/keyword");
  return (
    <BingListScreen
      header={{ icon: <Search className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      kind="keywords"
      head={(answer) => (
        <>
          {answer ? (
            <BingSees
              screen="keywords"
              data={listSeen(seenFigures, answer, whole, words)}
              links={links}
              says={[
                tw("says", { count: formatNumber(answer.summary.rows) }),
                answer.summary.top && (answer.summary.top.googlePosition !== null
                  ? tw("topGoogle", { keyword: answer.summary.top.key, clicks: formatNumber(answer.summary.top.clicks), position: formatPosition(answer.summary.top.position), google: formatPosition(answer.summary.top.googlePosition) })
                  : tw("top", { keyword: answer.summary.top.key, clicks: formatNumber(answer.summary.top.clicks), position: formatPosition(answer.summary.top.position) })),
                answer.summary.onlyBing > 0 && tw("onlyBing", { count: formatNumber(answer.summary.onlyBing) }),
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
