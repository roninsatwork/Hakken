"use client";

import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { CampaignsDailyChart, ListTopBars } from "../../_components/AnalyticsChart";
import { useAnalyticsStatus, usePeriod, periodWord } from "../../_components/useAnalytics";

/** The table's two lists: the campaigns, and the words their links carry. */
const VIEWS = ["campaign", "adKeyword"] as const;
type View = (typeof VIEWS)[number];

/**
 * Campaigns (GA28; §18.2 board 17): visits from links tagged for a campaign —
 * an email, an ad, a social post — and what they went on to do. What Hakken
 * sees, the visits from tagged links a day, visits by campaign as bars, and
 * one table switching between the campaigns (with where each link was) and
 * the words tagged links carry; the visits from no tagged link said beside it.
 */
export default function AnalyticsCampaignsPage() {
  const t = useTranslations("googleAnalytics.campaigns");
  const tf = useTranslations("googleAnalytics.filters");
  const currency = useAnalyticsStatus()?.connection?.currency ?? null;
  const [period] = usePeriod();
  const [view, setView] = useSiteParam<View>("view", "campaign", VIEWS);
  return (
    <AnalyticsListScreen
      header={{ icon: <Megaphone className="h-5 w-5 text-brand" />, title: t("title"), description: t("description", { before: tf(`before.${periodWord(period)}`) }) }}
      head={(answer) => (
        <>
          <AnalyticsSees screen="campaigns" seen={answer?.seen} currency={currency} />
          <CampaignsDailyChart />
          <ListTopBars list="campaign" sort="visits" bars="campaigns" />
        </>
      )}
      list={view}
      noun={view === "campaign" ? "campaigns" : "keywords"}
      searchPlaceholder={t(view === "campaign" ? "findCampaign" : "findKeyword")}
      filters={<SiteViewSwitch label={t("showing")} options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />}
      opening="visits"
      emptyLabel={t(view === "campaign" ? "empty" : "emptyKeywords")}
    />
  );
}
