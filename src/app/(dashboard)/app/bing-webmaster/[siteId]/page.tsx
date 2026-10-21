"use client";

import { useQuery } from "convex/react";
import { ChartLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatNumber } from "../../sites/_components/siteFormat";
import { BingGate } from "../_components/BingNotices";
import { BingFigures, BingSees, formatCtr, formatShare } from "../_components/BingParts";
import { BingClicksChart, BingShareChart, BingVersusChart } from "../_components/BingCharts";
import { useBingHref, useBingSiteId, useBingStatus, usePeriod, useStep, type BingStatus } from "../_components/useBing";

/**
 * Performance (bing-webmaster-plan.md §5, board 2): What Hakken sees; clicks,
 * impressions, click-through rate and Bing's share of the website's search
 * clicks, each beside Google's for the same days; the line on what Bing's
 * totals hold; clicks and impressions over time; Bing's share week by week;
 * and clicks each week, Bing against Google.
 */
export default function BingPerformancePage() {
  const t = useTranslations("bingWebmaster.performance");
  const status = useBingStatus();
  const siteId = useBingSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<ChartLine className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <BingGate status={status} siteId={siteId}>
          <PerformanceBody status={status} />
        </BingGate>
      ) : null}
    </div>
  );
}

function PerformanceBody({ status }: { status: BingStatus }) {
  const t = useTranslations("bingWebmaster.performance");
  const tw = useTranslations("bingWebmaster.seen.performance");
  const tl = useTranslations("bingWebmaster.seen.links");
  const siteId = useBingSiteId();
  const hrefFor = useBingHref(siteId);
  const [period] = usePeriod();
  const [step] = useStep(period);
  const figures = useQuery(api.bingWebmasterReads.bingPerformance, { siteId, period });
  const bing = figures?.totals ?? null;
  const google = figures?.google ?? null;
  const share = bing && google && bing.clicks + google.clicks > 0 ? bing.clicks / (bing.clicks + google.clicks) : null;

  return (
    <div className="flex flex-col gap-6">
      {bing ? (
        <BingSees
          says={[
            tw("says", { impressions: formatNumber(bing.impressions), clicks: formatNumber(bing.clicks) }),
            google && tw("share", { share: formatShare(share), google: formatNumber(google.clicks) }),
            google && bing.impressions > 0 && google.impressions > 0
              && tw("ctr", { bingCtr: formatCtr(bing.clicks / bing.impressions), googleCtr: formatCtr(google.clicks / google.impressions) }),
          ]}
          steps={google ? [{ words: tw("step"), link: tl("versus"), href: hrefFor("against-google") }] : []}
        />
      ) : null}
      <BingFigures bing={bing} google={google} />
      <p className="text-[12px] text-secondary">{t("note")}</p>
      <BingClicksChart days={figures?.days ?? []} step={step} host={status.host} from={figures?.from ?? null} to={figures?.to ?? null} />
      {google ? (
        <>
          <BingShareChart weeks={figures?.weeks ?? []} host={status.host} from={figures?.from ?? null} to={figures?.to ?? null} />
          <BingVersusChart weeks={figures?.weeks ?? []} host={status.host} from={figures?.from ?? null} to={figures?.to ?? null} />
        </>
      ) : null}
    </div>
  );
}
